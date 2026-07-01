/**
 * API types — Section 18 DTOs + screen view-model types.
 *
 * API/backend DTOs match the design doc Section 18 schema verbatim.
 * View-model types match the shapes the screens already use internally
 * (SwipeTx, RecentTx, etc.) so the adapter can produce identical objects.
 */

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
  | 'security_alert';

export interface ApiNotification {
  id: string;
  type: ApiNotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: string; // ISO date
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
}

/** Recent transaction view — matches RecentTx in Home.tsx */
export interface RecentTxView {
  icon: string;
  desc: string;
  cat: string;
  date: string; // display string e.g. "Today", "Yesterday", "Apr 23"
  amt: number; // signed
  type: 'exp' | 'inc';
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
}

/** Notification view — matches Notification in Notifications.tsx */
export type NotifViewType = 'budget' | 'goal' | 'tx' | 'report' | 'security';

export interface NotificationView {
  icon: string;
  title: string;
  body: string;
  time: string; // display string e.g. "2h ago"
  color: string;
  unread: boolean;
  type: NotifViewType;
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
