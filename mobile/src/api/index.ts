/**
 * api — mock-first client layer.
 *
 * USE_BACKEND = false (default): every method resolves immediately with the
 * same mock data the screens already render, keeping all screens working with
 * no changes. Set USE_BACKEND = true (in a later task) to route through the
 * live apiClient instead.
 *
 * Screen-facing API:
 *   api.transactions.list(params?)
 *   api.transactions.recent()
 *   api.accounts.list()
 *   api.budgets.list()
 *   api.goals.list()
 *   api.investments.list()
 *   api.reports.overview(period?)
 *   api.notifications.list()
 *   api.categories.list()
 */

import { apiClient, setAuthToken as _setAuthToken } from './client';
import {
  toTxView,
  toRecentTxView,
  toAccountView,
  toBudgetCategoryViews,
  toGoalView,
  toHoldingView,
  toCategoryView,
  toNotificationView,
  toReportOverviewView,
} from './adapters';
import type {
  TxView,
  RecentTxView,
  AccountView,
  BudgetCategoryView,
  GoalView,
  HoldingView,
  CategoryView,
  NotificationView,
  ReportOverviewView,
  WeekDataPoint,
  ApiTransaction,
  ApiCategory,
  ApiAccount,
  ApiBudget,
  ApiGoal,
  ApiInvestment,
  ApiNotification,
  ApiReportOverview,
} from './types';

// ── Feature flag ──────────────────────────────────────────────────────
/** When false (default) every api.* method returns mock data. */
export const USE_BACKEND = false;

/** Re-export so screens can call api.setAuthToken(token). */
export const setAuthToken = _setAuthToken;

// ── Canonical mock data ───────────────────────────────────────────────
// These mirror the inline consts in the screen files verbatim so that the
// api layer and screens are in sync even before screens are updated (Task 5.3).

const MOCK_TRANSACTIONS: TxView[] = [
  { id: 1, icon: '💼', desc: 'Salary — April 2026', cat: 'Income', cCol: '#7faf93', date: '2026-04-25', amount: 118000, type: 'inc' },
  { id: 3, icon: '🛒', desc: 'Swiggy Order', cat: 'Food & Dining', cCol: '#c9a86a', date: '2026-04-25', amount: -649, type: 'exp' },
  { id: 2, icon: '🏠', desc: 'Rent — April', cat: 'Housing', cCol: '#8197c4', date: '2026-04-24', amount: -28000, type: 'exp' },
  { id: 4, icon: '⚡', desc: 'BESCOM Electricity', cat: 'Utilities', cCol: '#6fb3ad', date: '2026-04-24', amount: -1840, type: 'exp' },
  { id: 5, icon: '🚇', desc: 'Metro Smart Card', cat: 'Transport', cCol: '#9d8bd6', date: '2026-04-23', amount: -500, type: 'exp' },
  { id: 6, icon: '📱', desc: 'Netflix', cat: 'Entertainment', cCol: '#c97d8c', date: '2026-04-22', amount: -649, type: 'exp' },
  { id: 7, icon: '🛍', desc: 'Myntra Shopping', cat: 'Shopping', cCol: '#c97d8c', date: '2026-04-21', amount: -3200, type: 'exp' },
  { id: 8, icon: '💊', desc: 'Apollo Pharmacy', cat: 'Healthcare', cCol: '#ef4444', date: '2026-04-19', amount: -820, type: 'exp' },
  { id: 9, icon: '📈', desc: 'SIP — Nifty 50 ETF', cat: 'Investments', cCol: '#7faf93', date: '2026-04-15', amount: -10000, type: 'exp' },
  { id: 13, icon: '💰', desc: 'Freelance Project', cat: 'Income', cCol: '#7faf93', date: '2026-04-08', amount: 35000, type: 'inc' },
  { id: 14, icon: '⛽', desc: 'BPCL Fuel', cat: 'Transport', cCol: '#9d8bd6', date: '2026-04-07', amount: -2400, type: 'exp' },
];

const MOCK_RECENT: RecentTxView[] = [
  { icon: '🛒', desc: 'Swiggy Order', cat: 'Food', date: 'Today', amt: -649, type: 'exp' },
  { icon: '💼', desc: 'Salary — April', cat: 'Income', date: 'Today', amt: 118000, type: 'inc' },
  { icon: '⚡', desc: 'BESCOM Bill', cat: 'Utilities', date: 'Yesterday', amt: -1840, type: 'exp' },
  { icon: '🚇', desc: 'Metro Card', cat: 'Transport', date: 'Apr 23', amt: -500, type: 'exp' },
];

const MOCK_WEEK: WeekDataPoint[] = [
  { d: 'Mon', v: 1200 },
  { d: 'Tue', v: 3400 },
  { d: 'Wed', v: 800 },
  { d: 'Thu', v: 2600 },
  { d: 'Fri', v: 1500 },
  { d: 'Sat', v: 4200 },
  { d: 'Sun', v: 1800 },
];

const MOCK_ACCOUNTS: AccountView[] = [
  { id: 1, name: 'HDFC Savings', type: 'savings', sub: '•••• 4521', bal: 824500, gradient: ['#2b3f63', '#1b2942'], logo: 'H', bank: 'HDFC Bank', change: 12400 },
  { id: 2, name: 'ICICI Credit', type: 'credit', sub: '•••• 8807', bal: -12340, gradient: ['#5e3038', '#3a2026'], logo: 'I', bank: 'ICICI Bank', change: -3200 },
  { id: 3, name: 'Zerodha', type: 'investment', sub: 'Investment', bal: 318000, gradient: ['#2a5446', '#18342b'], logo: 'Z', bank: 'Zerodha', change: 18200 },
  { id: 4, name: 'Paytm Wallet', type: 'wallet', sub: '+91 ••• 4321', bal: 4520, gradient: ['#235058', '#163138'], logo: 'P', bank: 'Paytm', change: -800 },
  { id: 5, name: 'Axis Salary', type: 'savings', sub: '•••• 2204', bal: 142000, gradient: ['#3b3563', '#241f40'], logo: 'A', bank: 'Axis Bank', change: 9500 },
  { id: 6, name: 'SBI Joint', type: 'savings', sub: '•••• 9912', bal: 68000, gradient: ['#4d3d26', '#2f2619'], logo: 'S', bank: 'SBI', change: -1100 },
];

const MOCK_BUDGET_CATEGORIES: BudgetCategoryView[] = [
  { name: 'Housing', icon: '🏠', c: '#8197c4', allocated: 30000, spent: 28000 },
  { name: 'Food & Dining', icon: '🍽', c: '#c9a86a', allocated: 15000, spent: 13200 },
  { name: 'Transport', icon: '🚇', c: '#9d8bd6', allocated: 8000, spent: 7400 },
  { name: 'Shopping', icon: '🛍', c: '#c97d8c', allocated: 10000, spent: 10820 },
  { name: 'Utilities', icon: '⚡', c: '#6fb3ad', allocated: 5000, spent: 2900 },
  { name: 'Healthcare', icon: '💊', c: '#ef4444', allocated: 4000, spent: 820 },
  { name: 'Entertainment', icon: '🎬', c: '#c97d8c', allocated: 3000, spent: 2498 },
];

const MOCK_GOALS: GoalView[] = [
  { name: 'Emergency Fund', emoji: '🐖', color: '#7faf93', current: 185000, target: 300000, date: 'Dec 2026' },
  { name: 'Goa Trip', emoji: '✈️', color: '#6fb3ad', current: 32000, target: 50000, date: 'Jun 2026' },
  { name: 'MacBook Pro', emoji: '💻', color: '#9d8bd6', current: 68000, target: 200000, date: 'Mar 2027' },
  { name: 'House Down Pay', emoji: '🏡', color: '#c9a86a', current: 120000, target: 1500000, date: 'Dec 2028' },
];

const MOCK_HOLDINGS: HoldingView[] = [
  { name: 'Nifty 50 ETF', sym: 'NIFTYBEES', val: 145000, ret: 12.8, color: '#7faf93' },
  { name: 'HDFC Bank', sym: 'HDFCBANK', val: 62000, ret: 7.4, color: '#8197c4' },
  { name: 'Tata Motors', sym: 'TATAMOTORS', val: 38000, ret: -3.2, color: '#c97d8c' },
  { name: 'Reliance', sym: 'RELIANCE', val: 48000, ret: 9.1, color: '#9d8bd6' },
  { name: 'Gold ETF', sym: 'GOLDBEES', val: 25000, ret: 5.6, color: '#c9a86a' },
];

const MOCK_CATEGORIES: CategoryView[] = [
  { id: 1, name: 'Housing', icon: '🏠', color: '#8197c4', txs: 24, total: 28000, subs: ['Rent', 'Maintenance'] },
  { id: 2, name: 'Food & Dining', icon: '🍽', color: '#c9a86a', txs: 48, total: 13200, subs: ['Groceries', 'Restaurants', 'Delivery'] },
  { id: 3, name: 'Transport', icon: '🚇', color: '#9d8bd6', txs: 18, total: 7400, subs: ['Metro', 'Cab', 'Fuel'] },
  { id: 4, name: 'Utilities', icon: '⚡', color: '#6fb3ad', txs: 8, total: 2900, subs: ['Electricity', 'Internet'] },
  { id: 5, name: 'Entertainment', icon: '🎬', color: '#c97d8c', txs: 12, total: 2498, subs: ['Subscriptions', 'Events'] },
  { id: 6, name: 'Healthcare', icon: '💊', color: '#ef4444', txs: 5, total: 820, subs: [] },
  { id: 7, name: 'Shopping', icon: '🛍', color: '#c97d8c', txs: 14, total: 10820, subs: [] },
  { id: 8, name: 'Education', icon: '🎓', color: '#6fb3ad', txs: 3, total: 5400, subs: [] },
  { id: 9, name: 'Income', icon: '💼', color: '#7faf93', txs: 6, total: 153000, subs: ['Salary', 'Freelance'] },
];

const MOCK_NOTIFICATIONS: NotificationView[] = [
  { icon: '⚠️', title: 'Shopping budget exceeded', body: '₹10,820 spent of ₹10,000 budget. 108% used.', time: '2h ago', color: '#c97d8c', unread: true, type: 'budget' },
  { icon: '🎯', title: 'Emergency Fund milestone', body: '60% complete — ₹1.85L saved so far!', time: '5h ago', color: '#7faf93', unread: true, type: 'goal' },
  { icon: '💰', title: 'Large transaction detected', body: '₹28,000 debited — Rent April 2026.', time: 'Yesterday', color: '#c9a86a', unread: true, type: 'tx' },
  { icon: '📊', title: 'March 2026 report ready', body: 'Net savings: ₹24,500. Tap to view.', time: '2 days ago', color: '#8197c4', unread: false, type: 'report' },
  { icon: '🔒', title: 'New login detected', body: 'Chrome · MacOS · Bengaluru, India.', time: '3 days ago', color: '#8a8299', unread: false, type: 'security' },
  { icon: '💸', title: 'SIP installment due', body: '₹10,000 — Nifty 50 ETF, 15 Apr.', time: '4 days ago', color: '#9d8bd6', unread: false, type: 'tx' },
  { icon: '📈', title: 'Portfolio up 12.4%', body: 'Best performer: HDFC Bank (+7.4%).', time: '5 days ago', color: '#7faf93', unread: false, type: 'report' },
];

const MOCK_REPORT_OVERVIEW: ReportOverviewView = {
  netIncome: 27000,
  savingsRate: 22.9,
  totalIncome: 153000,
  totalExpenses: 118000,
};

// ── Helper ────────────────────────────────────────────────────────────
function mockResolve<T>(data: T): Promise<T> {
  return Promise.resolve(data);
}

// ── Transaction params ────────────────────────────────────────────────
export interface TxListParams {
  filter?: 'all' | 'inc' | 'exp';
  period?: string;
  limit?: number;
}

// ── api object ────────────────────────────────────────────────────────
export const api = {
  transactions: {
    async list(params?: TxListParams): Promise<TxView[]> {
      if (!USE_BACKEND) {
        const data = params?.filter && params.filter !== 'all'
          ? MOCK_TRANSACTIONS.filter((tx) => tx.type === params.filter)
          : MOCK_TRANSACTIONS;
        return mockResolve(data);
      }
      const qs = params
        ? '?' + new URLSearchParams(params as Record<string, string>).toString()
        : '';
      const raw = await apiClient.get<ApiTransaction[]>(`/transactions${qs}`);
      const cats = await apiClient.get<ApiCategory[]>('/categories');
      const catMap = new Map(cats.map((c) => [c.id, c]));
      return raw.map((tx) => toTxView(tx, catMap.get(tx.categoryId)));
    },

    async recent(): Promise<RecentTxView[]> {
      if (!USE_BACKEND) return mockResolve(MOCK_RECENT);
      const raw = await apiClient.get<ApiTransaction[]>('/transactions?limit=4&sort=date_desc');
      const cats = await apiClient.get<ApiCategory[]>('/categories');
      const catMap = new Map(cats.map((c) => [c.id, c]));
      return raw.map((tx) => toRecentTxView(tx, catMap.get(tx.categoryId)));
    },
  },

  accounts: {
    async list(): Promise<AccountView[]> {
      if (!USE_BACKEND) return mockResolve(MOCK_ACCOUNTS);
      const raw = await apiClient.get<ApiAccount[]>('/accounts');
      return raw.map((a) => toAccountView(a));
    },
  },

  budgets: {
    async list(): Promise<BudgetCategoryView[]> {
      if (!USE_BACKEND) return mockResolve(MOCK_BUDGET_CATEGORIES);
      const raw = await apiClient.get<ApiBudget[]>('/budgets?current=true');
      if (!raw.length) return [];
      // Use the most recent budget's categories
      return toBudgetCategoryViews(raw[0]!);
    },
  },

  goals: {
    async list(): Promise<GoalView[]> {
      if (!USE_BACKEND) return mockResolve(MOCK_GOALS);
      const raw = await apiClient.get<ApiGoal[]>('/goals');
      return raw.map(toGoalView);
    },
  },

  investments: {
    async list(): Promise<HoldingView[]> {
      if (!USE_BACKEND) return mockResolve(MOCK_HOLDINGS);
      const raw = await apiClient.get<ApiInvestment[]>('/investments');
      return raw.map(toHoldingView);
    },
  },

  reports: {
    async overview(_period?: string): Promise<ReportOverviewView> {
      if (!USE_BACKEND) return mockResolve(MOCK_REPORT_OVERVIEW);
      const qs = _period ? `?period=${encodeURIComponent(_period)}` : '';
      const raw = await apiClient.get<ApiReportOverview>(`/reports/overview${qs}`);
      return toReportOverviewView(raw);
    },

    async weekSpend(): Promise<WeekDataPoint[]> {
      if (!USE_BACKEND) return mockResolve(MOCK_WEEK);
      return apiClient.get<WeekDataPoint[]>('/reports/week-spend');
    },
  },

  notifications: {
    async list(): Promise<NotificationView[]> {
      if (!USE_BACKEND) return mockResolve(MOCK_NOTIFICATIONS);
      const raw = await apiClient.get<ApiNotification[]>('/notifications');
      return raw.map(toNotificationView);
    },
  },

  categories: {
    async list(): Promise<CategoryView[]> {
      if (!USE_BACKEND) return mockResolve(MOCK_CATEGORIES);
      const raw = await apiClient.get<ApiCategory[]>('/categories');
      return raw.map((c) => toCategoryView(c));
    },
  },
};
