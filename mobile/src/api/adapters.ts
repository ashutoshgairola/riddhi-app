/**
 * Adapters — pure functions mapping API DTOs → screen view-model types.
 *
 * Key mapping rules:
 *   - Transaction.type 'income' → TxView.type 'inc', amount stays positive
 *   - Transaction.type 'expense'|'transfer' → TxView.type 'exp', amount negated
 *   - Category color → cCol; category name → cat label
 *   - Notification type mapping: budget_alert→budget, goal_progress→goal,
 *     large_transaction→tx, monthly_report→report, security_alert→security
 */

import type {
  ApiTransaction,
  ApiCategory,
  ApiAccount,
  ApiBudget,
  ApiBudgetCategory,
  ApiGoal,
  ApiInvestment,
  ApiNotification,
  ApiReportOverview,
  ApiEvent,
  TxView,
  RecentTxView,
  AccountView,
  BudgetCategoryView,
  GoalView,
  HoldingView,
  CategoryView,
  NotificationView,
  NotifViewType,
  ReportOverviewView,
  EventView,
  EventDetailView,
  EventExpenseView,
} from './types';

import { deriveSource } from './paymentSource';

// ── Category color lookup ─────────────────────────────────────────────
// Canonical category colors matching the mock data palette.
const CATEGORY_COLORS: Record<string, string> = {
  Income: '#7faf93',
  'Food & Dining': '#c9a86a',
  Food: '#c9a86a',
  Housing: '#8197c4',
  Utilities: '#6fb3ad',
  Transport: '#9d8bd6',
  Entertainment: '#c97d8c',
  Shopping: '#c97d8c',
  Healthcare: '#ef4444',
  Investments: '#7faf93',
  Education: '#6fb3ad',
};

const DEFAULT_CAT_COLOR = '#8a8299';

function resolveCatColor(category?: ApiCategory): string {
  if (category?.color) return category.color;
  if (category?.name && CATEGORY_COLORS[category.name]) return CATEGORY_COLORS[category.name]!;
  return DEFAULT_CAT_COLOR;
}

// ── Transaction adapters ──────────────────────────────────────────────

/**
 * Maps an API transaction + optional category → TxView (SwipeTx-compatible).
 * Signs the amount: income → positive, expense/transfer → negative.
 */
export function toTxView(tx: ApiTransaction, category?: ApiCategory, account?: ApiAccount): TxView {
  const isIncome = tx.type === 'income';
  const signedAmount = isIncome ? tx.amount : -tx.amount;
  const catName = category?.name ?? tx.categoryId;
  const cCol = resolveCatColor(category);
  // Derive an emoji icon from category name (best-effort; screens set their own in mocks)
  const icon = categoryIcon(catName);
  return {
    id: tx.id,
    icon,
    desc: tx.description,
    cat: catName,
    cCol,
    date: tx.date,
    amount: signedAmount,
    type: isIncome ? 'inc' : 'exp',
    note: tx.notes,
    eventId: tx.eventId ?? null,
    source: deriveSource(tx.paymentMethod, account),
  };
}

/**
 * Maps an API transaction + optional category → RecentTxView (Home screen shape).
 * displayDate should be pre-computed by the caller (e.g. "Today", "Yesterday").
 */
export function toRecentTxView(
  tx: ApiTransaction,
  category?: ApiCategory,
  displayDate?: string,
  account?: ApiAccount,
): RecentTxView {
  const isIncome = tx.type === 'income';
  const signedAmount = isIncome ? tx.amount : -tx.amount;
  const catName = category?.name ?? tx.categoryId;
  const icon = categoryIcon(catName);
  return {
    icon,
    desc: tx.description,
    cat: catName,
    cCol: resolveCatColor(category),
    date: displayDate ?? tx.date,
    amt: signedAmount,
    type: isIncome ? 'inc' : 'exp',
    source: deriveSource(tx.paymentMethod, account),
  };
}

// ── Account adapter ───────────────────────────────────────────────────

/**
 * Maps an API account → AccountView.
 * Gradient defaults to a neutral dark pair; callers can override per institution.
 */
export function toAccountView(
  account: ApiAccount,
  gradient: [string, string] = ['#2b3f63', '#1b2942'],
  change = 0,
): AccountView {
  const initials = account.institutionName
    ? account.institutionName.charAt(0).toUpperCase()
    : account.name.charAt(0).toUpperCase();
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    // `bank` already carries the institution, so `sub` is the human-readable
    // account-type label (the mock's masked account number has no backend
    // equivalent). Screens render "{bank} · {sub}", e.g. "HDFC Bank · Savings".
    sub: prettyAccountType(account.type),
    bal: account.balance,
    gradient,
    logo: initials,
    bank: account.institutionName ?? account.name,
    change,
  };
}

/** Maps a raw account type to a display label (e.g. 'credit' → 'Credit card'). */
function prettyAccountType(type: string): string {
  const MAP: Record<string, string> = {
    checking: 'Checking',
    savings: 'Savings',
    credit: 'Credit card',
    investment: 'Investment',
    cash: 'Wallet',
    loan: 'Loan',
    other: 'Account',
  };
  return MAP[type] ?? 'Account';
}

// ── Budget adapter ────────────────────────────────────────────────────

export function toBudgetCategoryView(bc: ApiBudgetCategory): BudgetCategoryView {
  return {
    name: bc.name,
    icon: categoryIcon(bc.name),
    c: bc.color ?? (CATEGORY_COLORS[bc.name] ?? DEFAULT_CAT_COLOR),
    allocated: bc.allocated,
    spent: bc.spent,
    categoryIds: bc.categoryIds ?? [],
  };
}

export function toBudgetCategoryViews(budget: ApiBudget): BudgetCategoryView[] {
  return budget.categories.map(toBudgetCategoryView);
}

// ── Event adapter ─────────────────────────────────────────────────────

export function toEventView(e: ApiEvent): EventView {
  return {
    id: e.id, name: e.name, emoji: e.emoji, color: e.color, date: e.date,
    budget: e.budget, guests: e.guests, planned: e.planned, paid: e.paid,
    projected: e.projected, over: e.over, paidCount: e.paidCount,
    count: e.count, remaining: e.remaining,
  };
}

export function toEventDetailView(
  e: ApiEvent,
  catMap: Map<string, ApiCategory>,
): EventDetailView {
  const expenses: EventExpenseView[] = (e.expenses ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((x) => {
      const cat = catMap.get(x.categoryId);
      return {
        id: x.id,
        categoryId: x.categoryId,
        categoryName: cat?.name ?? 'Other',
        icon: cat?.icon ?? '🏷',
        color: cat?.color ?? '#8197c4',
        label: x.label,
        planned: x.planned,
        actual: x.actual,
        paid: x.paid,
      };
    });
  return { ...toEventView(e), expenses };
}

// ── Goal adapter ──────────────────────────────────────────────────────

export function toGoalView(goal: ApiGoal): GoalView {
  // Format targetDate ISO → display e.g. "Dec 2026"
  const d = new Date(goal.targetDate);
  const displayDate = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  return {
    name: goal.name,
    emoji: goalEmoji(goal.type),
    color: goal.color ?? '#7faf93',
    current: goal.currentAmount,
    target: goal.targetAmount,
    date: displayDate,
  };
}

// ── Investment adapter ────────────────────────────────────────────────

export function toHoldingView(inv: ApiInvestment): HoldingView {
  return {
    name: inv.name,
    sym: inv.ticker ?? inv.name.substring(0, 8).toUpperCase(),
    val: inv.currentValue,
    ret: inv.returnPercent,
    color: '#7faf93', // default; screens use per-asset colors set in mock
  };
}

// ── Category adapter ──────────────────────────────────────────────────

export function toCategoryView(
  cat: ApiCategory,
  txs = 0,
  total = 0,
  subs: string[] = [],
  isIncome = false,
): CategoryView {
  return {
    id: cat.id,
    name: cat.name,
    icon: cat.icon ?? categoryIcon(cat.name),
    color: cat.color ?? (CATEGORY_COLORS[cat.name] ?? DEFAULT_CAT_COLOR),
    txs,
    total,
    subs,
    isIncome,
  };
}

// ── Notification adapter ──────────────────────────────────────────────

const NOTIF_TYPE_MAP: Record<string, NotifViewType> = {
  budget_alert: 'budget',
  goal_progress: 'goal',
  large_transaction: 'tx',
  monthly_report: 'report',
  security_alert: 'security',
  munshi_suggestion: 'munshi',
};

const NOTIF_COLORS: Record<NotifViewType, string> = {
  budget: '#c97d8c',
  goal: '#7faf93',
  tx: '#c9a86a',
  report: '#8197c4',
  security: '#8a8299',
  munshi: '#9d8bd6',
};

const NOTIF_ICONS: Record<NotifViewType, string> = {
  budget: '⚠️',
  goal: '🎯',
  tx: '💰',
  report: '📊',
  security: '🔒',
  munshi: '🧮',
};

export function toNotificationView(n: ApiNotification): NotificationView {
  const type: NotifViewType = (NOTIF_TYPE_MAP[n.type] ?? 'tx') as NotifViewType;
  return {
    icon: NOTIF_ICONS[type],
    title: n.title,
    body: n.body,
    time: formatRelativeTime(n.createdAt),
    color: NOTIF_COLORS[type],
    unread: !n.read,
    type,
    data: n.data ?? null,
  };
}

// ── Report adapter ────────────────────────────────────────────────────

export function toReportOverviewView(r: ApiReportOverview): ReportOverviewView {
  return {
    netIncome: r.netIncome,
    savingsRate: r.savingsRate,
    totalIncome: r.totalIncome,
    totalExpenses: r.totalExpenses,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

function categoryIcon(name: string): string {
  const MAP: Record<string, string> = {
    Income: '💼',
    'Food & Dining': '🍽',
    Food: '🛒',
    Housing: '🏠',
    Utilities: '⚡',
    Transport: '🚇',
    Entertainment: '🎬',
    Shopping: '🛍',
    Healthcare: '💊',
    Investments: '📈',
    Education: '🎓',
  };
  return MAP[name] ?? '💳';
}

function goalEmoji(type: ApiGoal['type']): string {
  const MAP: Record<ApiGoal['type'], string> = {
    savings: '🐖',
    debt: '💳',
    retirement: '🏖',
    major_purchase: '🛒',
    other: '🎯',
  };
  return MAP[type];
}

function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return new Date(isoDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
