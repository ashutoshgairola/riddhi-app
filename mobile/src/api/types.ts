/**
 * API types — Section 18 DTOs + screen view-model types.
 *
 * API/backend DTOs match the design doc Section 18 schema verbatim.
 * View-model types match the shapes the screens already use internally
 * (SwipeTx, RecentTx, etc.) so the adapter can produce identical objects.
 */

import type { TxSource } from './paymentSource';

export type PaymentMethod = 'upi' | 'card' | 'netbanking' | 'autopay' | 'cash';

// ── API / backend DTOs ────────────────────────────────────────────────

export interface ApiTransaction {
  id: string;
  date: string; // ISO date
  description: string;
  amount: number; // always positive ₹
  type: 'income' | 'expense' | 'transfer';
  categoryId: string;
  accountId?: string;
  status: 'pending' | 'cleared' | 'reconciled' | 'void';
  notes?: string;
  tags: string[];
  attachments: string[];
  isRecurring: boolean;
  recurringDetails?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval: number;
    endDate?: string;
    nextDate?: string;
  };
  eventId?: string | null;
  paymentMethod?: PaymentMethod | null;
}

export interface ApiCategory {
  id: string;
  name: string;
  color?: string; // hex
  icon?: string; // Lucide icon name or emoji
  description?: string;
  parentId?: string;
}

export interface ApiAccount {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'credit' | 'investment' | 'cash' | 'loan' | 'other';
  balance: number; // ₹
  currency: string; // default "INR"
  institutionName?: string;
  institutionLogo?: string;
  isConnected: boolean;
  includeInNetWorth: boolean;
  color?: string; // hex
  lastUpdated: string; // ISO date
}

export interface ApiBudgetCategory {
  id: string;
  name: string;
  allocated: number; // ₹
  spent: number; // ₹, computed
  categoryIds: string[];
  color?: string;
  icon?: string;
  rollover: boolean;
  notes?: string;
}

export interface ApiBudget {
  id: string;
  name: string; // e.g. "April 2026"
  startDate: string; // ISO date
  endDate: string; // ISO date
  income: number; // ₹
  totalAllocated: number; // computed
  totalSpent: number; // computed
  categories: ApiBudgetCategory[];
}

export interface ApiGoal {
  id: string;
  name: string;
  type: 'savings' | 'debt' | 'retirement' | 'major_purchase' | 'other';
  targetAmount: number; // ₹
  currentAmount: number; // ₹
  startDate: string; // ISO date
  targetDate: string; // ISO date
  accountId?: string;
  priority: number; // 1 = highest
  status: 'active' | 'completed' | 'paused';
  contributionFrequency?: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  contributionAmount?: number; // ₹
  color?: string;
  notes?: string;
}

export interface ApiInvestment {
  id: string;
  name: string;
  ticker?: string;
  assetClass: 'stocks' | 'bonds' | 'cash' | 'alternatives' | 'real_estate' | 'other';
  type: 'individual_stock' | 'etf' | 'mutual_fund' | 'bond' | 'crypto' | 'options' | 'reit' | 'other';
  shares: number;
  purchasePrice: number; // ₹ per unit
  currentPrice: number; // ₹ per unit
  purchaseDate: string; // ISO date
  accountId: string;
  dividendYield?: number; // %
  sector?: string;
  region?: string;
  currency: string; // default "INR"
  notes?: string;
  // Computed by API
  currentValue: number;
  totalInvested: number;
  gainLoss: number;
  returnPercent: number;
}

export type ApiNotificationType =
  | 'budget_alert'
  | 'goal_progress'
  | 'large_transaction'
  | 'monthly_report'
  | 'security_alert'
  | 'munshi_suggestion';

export interface ApiNotification {
  id: string;
  type: ApiNotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: string; // ISO date
  /** Deep-link payload for tap handling (null for older rows). */
  data?: { screen: string; id?: string } | null;
}

export interface ApiReportOverview {
  netIncome: number;
  savingsRate: number; // %
  totalIncome: number;
  totalExpenses: number;
}

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  isFirstLogin: boolean;
}

export interface ApiEventExpense {
  id: string;
  categoryId: string;
  label: string;
  planned: number;
  actual: number;
  paid: boolean;
  transactionId: string | null;
  sortOrder: number;
  dayDate: string | null;
}

export interface ApiEvent {
  id: string;
  name: string;
  emoji: string;
  color: string;
  date: string | null;
  multiDay: boolean;
  endDate: string | null;
  budget: number;
  guests: number;
  planned: number;
  paid: number;
  projected: number;
  paidCount: number;
  count: number;
  remaining: number;
  over: boolean;
  expenses?: ApiEventExpense[];
  dayGroups?: EventDayGroup[];
}

// ── View-model types (shapes screens use) ────────────────────────────

/** Transaction view — matches SwipeTx in SwipeRow.tsx and MT_DATA shape */
export interface TxView {
  id: number | string;
  icon: string;
  desc: string;
  cat: string;
  cCol: string; // hex category color
  date: string; // ISO date
  amount: number; // signed: positive for income, negative for expense
  type: 'inc' | 'exp';
  note?: string; // free-text note stored on the transaction
  eventId?: string | null;
  source?: TxSource;
}

/** Recent transaction view — matches RecentTx in Home.tsx */
export interface RecentTxView {
  icon: string;
  desc: string;
  cat: string;
  cCol: string; // hex category color
  date: string; // display string e.g. "Today", "Yesterday", "Apr 23"
  amt: number; // signed
  type: 'exp' | 'inc';
  source?: TxSource;
}

/** Account view — matches Account in Accounts.tsx */
export interface AccountView {
  id: number | string;
  name: string;
  type: string;
  sub: string; // masked account number or sub-label
  bal: number; // signed balance
  gradient: [string, string]; // two hex stops
  logo: string; // initial(s)
  bank: string; // institution name
  change: number; // change amount
}

/** Budget category view — matches Budget in Budgets.tsx */
export interface BudgetCategoryView {
  name: string;
  icon: string;
  c: string; // hex color
  allocated: number;
  spent: number;
  /** Transaction-category ids this budget line tracks (for drill-down). */
  categoryIds: string[];
}

/** Goal view — matches Goal in Goals.tsx */
export interface GoalView {
  name: string;
  emoji: string;
  color: string;
  current: number;
  target: number;
  date: string; // display string e.g. "Dec 2026"
}

/** Investment holding view — matches Holding in Invest.tsx */
export interface HoldingView {
  name: string;
  sym: string;
  val: number;
  ret: number; // return %
  color: string;
}

/** Category view — matches Category in TxCategories.tsx */
export interface CategoryView {
  id: number | string;
  name: string;
  icon: string;
  color: string;
  txs: number;
  total: number;
  subs: string[];
  /** True when the category's transactions are predominantly income. */
  isIncome: boolean;
}

export interface EventDayGroup {
  dayDate: string | null;
  planned: number;
  paid: number;
  count: number;
  paidCount: number;
}

export interface EventExpenseView {
  id: string;
  categoryId: string;
  categoryName: string;
  icon: string;
  color: string;
  label: string;
  planned: number;
  actual: number;
  paid: boolean;
  dayDate: string | null;
}

export interface EventView {
  id: string;
  name: string;
  emoji: string;
  color: string;
  date: string | null;
  multiDay: boolean;
  endDate: string | null;
  budget: number;
  guests: number;
  planned: number;
  paid: number;
  projected: number;
  over: boolean;
  paidCount: number;
  count: number;
  remaining: number;
}

export interface EventDetailView extends EventView {
  expenses: EventExpenseView[];
  dayGroups: EventDayGroup[];
}

/** `GET /reports/category-activity` row — per-category all-time totals. */
export interface ApiCategoryActivity {
  categoryId: string;
  count: number;
  total: number;
  incomeTotal: number;
  expenseTotal: number;
}

/** Notification view — matches Notification in Notifications.tsx */
export type NotifViewType = 'budget' | 'goal' | 'tx' | 'report' | 'security' | 'munshi';

export interface NotificationView {
  icon: string;
  title: string;
  body: string;
  time: string; // display string e.g. "2h ago"
  color: string;
  unread: boolean;
  type: NotifViewType;
  /** Deep-link payload carried through from the API row. */
  data?: { screen: string; id?: string } | null;
}

/** Report overview view */
export interface ReportOverviewView {
  netIncome: number;
  savingsRate: number;
  totalIncome: number;
  totalExpenses: number;
}

/** Week spending chart data point — matches MH_WEEK shape in Home.tsx */
export interface WeekDataPoint {
  d: string; // day label e.g. "Mon"
  v: number; // spend value
}

// ── Mutation input types (view-level; adapters map to API DTOs) ───────

/** Backend `GET /transactions` returns a paginated envelope. */
export interface ApiPaginatedTransactions {
  items: ApiTransaction[];
  total: number;
  page: number;
  limit: number;
}

/** Result of scanning a receipt image (backend vision extraction). */
export interface ScannedReceipt {
  amount: number | null;
  merchant: string | null;
  date: string | null;
  type: 'income' | 'expense';
  category: string | null;
}

export interface NewTxInput {
  desc: string;
  /** Signed: positive = income, negative = expense. */
  amount: number;
  type: 'inc' | 'exp';
  categoryName: string;
  /** ISO date; defaults to today. */
  date?: string;
  note?: string;
  /** Source account this transaction belongs to. */
  accountId?: string;
  /** Payment rail; when omitted the backend derives it from the account. */
  paymentMethod?: PaymentMethod;
}

export interface UpdateTxInput {
  desc?: string;
  /** Signed, same convention as NewTxInput. */
  amount?: number;
  categoryName?: string;
  date?: string;
  note?: string;
}

export interface NewAccountInput {
  name: string;
  type: ApiAccount['type'];
  balance: number;
  institutionName?: string;
}

export interface NewGoalInput {
  name: string;
  type: 'savings' | 'debt';
  target: number;
  current?: number;
  /** ISO date. */
  targetDate: string;
}

export interface NewCategoryInput {
  name: string;
  icon?: string;
  color?: string;
}

export interface NewHoldingInput {
  name: string;
  ticker?: string;
  kind: 'stock' | 'mutual_fund' | 'crypto';
  /** Total amount invested (₹). */
  invested: number;
  /** Current value (₹); defaults to `invested`. */
  currentValue?: number;
}

export interface NewBudgetCategoryInput {
  name: string;
  allocated: number;
  icon?: string;
  color?: string;
}

export interface NewEventExpenseInput {
  categoryName: string;
  label: string;
  planned: number;
  actual?: number;
  paid?: boolean;
  dayDate?: string | null;
}

export interface NewEventInput {
  name: string;
  emoji: string;
  color: string;
  date?: string;
  multiDay?: boolean;
  endDate?: string;
  budget: number;
  guests?: number;
  expenses: NewEventExpenseInput[];
}

/** `GET/PATCH /users/me/preferences` (subset the app uses). */
export interface ApiUserPreferences {
  currency: string;
  dateFormat: string;
  language: string;
  hideBalances: boolean;
  biometricEnabled: boolean;
  notificationsEnabled: boolean;
  budgetAlertsEnabled: boolean;
  goalMilestonesEnabled: boolean;
  largeTxAlertsEnabled: boolean;
  munshiSuggestionsEnabled: boolean;
  monthlyReportEnabled: boolean;
  /** Bank names picked during onboarding — drives the Sync screen. */
  selectedBanks: string[];
}

export type PrefsPatch = Partial<Omit<ApiUserPreferences, 'selectedBanks'>>;

// ── Report view models ────────────────────────────────────────────────

/** Current-month budget rollup for Home's "safe to spend" hero. */
export interface BudgetSummaryView {
  monthLabel: string; // e.g. "July"
  allocated: number;
  spent: number;
  daysLeft: number; // ≥ 1
}

/** `GET /reports/income-vs-expense` mapped for MGroupedBars. */
export interface IncomeExpenseSeriesView {
  labels: string[]; // short month names
  income: number[];
  expense: number[];
}

/** One `GET /reports/categories` slice, mapped for MDonut / lists. */
export interface CategorySliceView {
  label: string;
  value: number;
  color: string;
  pct: number; // 0–100
}

/** `GET /reports/net-worth-trend` mapped for sparklines. */
export interface NetWorthTrendView {
  points: number[];
  current: number;
  /** % change first → last point (0 when not computable). */
  deltaPct: number;
}
