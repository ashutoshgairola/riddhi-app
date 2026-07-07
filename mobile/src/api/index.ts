/**
 * api — the app's single data layer, fully backed by the NestJS backend
 * (EXPO_PUBLIC_API_URL). Screens render api data via `useApiData`, always
 * passing an *empty* fallback (no mock datasets exist anymore) so an
 * unreachable backend degrades to honest empty states.
 *
 * Every mutation fires `bumpData()` (refresh.ts) so all mounted screens
 * refetch and reflect the change immediately.
 *
 * Screen-facing surface:
 *   transactions: list / recent / create / update / remove
 *   accounts:     list / create / update / remove
 *   budgets:      list / currentSummary / upsertCategory
 *   events:       list / get / create / update / remove / addExpense /
 *                 updateExpense / removeExpense
 *   goals:        list / create
 *   investments:  list / create
 *   categories:   list / create
 *   notifications:list / markAllRead
 *   reports:      overview / weekSpend / incomeVsExpense / categories /
 *                 netWorthTrend
 *   prefs:        get / update
 *   users:        updateProfile / deleteAccount
 */

import { apiClient, setAuthToken as _setAuthToken } from './client';
import { bumpData } from './refresh';
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
  toEventView,
  toEventDetailView,
} from './adapters';
import type {
  TxView,
  RecentTxView,
  AccountView,
  BudgetCategoryView,
  BudgetSummaryView,
  GoalView,
  HoldingView,
  CategoryView,
  CategorySliceView,
  IncomeExpenseSeriesView,
  NetWorthTrendView,
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
  ApiCategoryActivity,
  ApiPaginatedTransactions,
  ApiUserPreferences,
  ApiEvent,
  NewTxInput,
  UpdateTxInput,
  NewAccountInput,
  NewGoalInput,
  NewCategoryInput,
  NewHoldingInput,
  NewBudgetCategoryInput,
  PrefsPatch,
  ScannedReceipt,
  EventView,
  EventDetailView,
  NewEventInput,
  NewEventExpenseInput,
} from './types';

// ── Feature flag ──────────────────────────────────────────────────────
/** The app is backend-only now; Login still branches on this, so it
 * stays exported. */
export const USE_BACKEND = true;

/** Re-export so screens can call api.setAuthToken(token). */
export const setAuthToken = _setAuthToken;

export { authApi } from './auth';
export type { ApiUser, AuthResponse, AuthTokens, OnboardingPayload } from './auth';

// ── Helpers ───────────────────────────────────────────────────────────
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** "Today" / "Yesterday" / "23 Apr" for Home's recent list. */
function displayDate(iso: string): string {
  const today = new Date();
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
  if (iso === today.toISOString().slice(0, 10)) return 'Today';
  if (iso === yesterday.toISOString().slice(0, 10)) return 'Yesterday';
  const d = new Date(iso + 'T00:00:00');
  return `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}`;
}

function backendPeriodFrom(period: TxPeriod): string | null {
  if (period === 'all') return null;
  const days = period === 'week' ? 7 : period === 'month' ? 31 : 92;
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Reports endpoints accept '1m' | '3m' | '6m' | '1y' — map the UI's 'all'. */
function reportPeriod(period?: string): string {
  if (!period || period === 'all') return '1y';
  return period;
}

/** "2026-07" → "Jul" */
function shortMonth(yyyyMm: string): string {
  const d = new Date(yyyyMm + '-01T00:00:00');
  return d.toLocaleString('en', { month: 'short' });
}

async function fetchCategoryMap(): Promise<Map<string, ApiCategory>> {
  const cats = await apiClient.get<ApiCategory[]>('/categories');
  return new Map(cats.map((c) => [c.id, c]));
}

async function fetchAccountMap(): Promise<Map<string, ApiAccount>> {
  const accounts = await apiClient.get<ApiAccount[]>('/accounts');
  return new Map(accounts.map((a) => [a.id, a]));
}

/** Category name → id, creating the category if missing. */
async function resolveCategoryId(name: string): Promise<string> {
  const cats = await apiClient.get<ApiCategory[]>('/categories');
  const found = cats.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
  if (found) return found.id;
  const created = await apiClient.post<ApiCategory>('/categories', { name: name.trim() });
  return created.id;
}

/** `GET /transactions` returns `{items,...}`; tolerate bare arrays too. */
function txItems(raw: ApiPaginatedTransactions | ApiTransaction[]): ApiTransaction[] {
  return Array.isArray(raw) ? raw : raw.items;
}

// Account card gradients keyed by account type (design palette pairs).
const ACCOUNT_GRADIENTS: Record<string, [string, string]> = {
  savings: ['#2b3f63', '#1b2942'],
  checking: ['#2b3f63', '#1b2942'],
  credit: ['#5e3038', '#3a2026'],
  loan: ['#5e3038', '#3a2026'],
  investment: ['#2a5446', '#18342b'],
  cash: ['#235058', '#163138'],
  wallet: ['#235058', '#163138'],
  other: ['#3b3563', '#241f40'],
};

// Fallback palette for report slices whose category has no stored color.
const SLICE_COLORS = ['#8197c4', '#c9a86a', '#c97d8c', '#9d8bd6', '#6fb3ad', '#ef4444', '#7faf93'];

// Per-holding accent colors (investments have no stored color), assigned by
// list position so the portfolio isn't a wall of one green.
const HOLDING_COLORS = ['#7faf93', '#8197c4', '#c9a86a', '#9d8bd6', '#6fb3ad', '#c97d8c'];

const DEFAULT_PREFS: ApiUserPreferences = {
  currency: 'INR',
  dateFormat: 'DD MMM YYYY',
  language: 'en',
  hideBalances: false,
  biometricEnabled: true,
  notificationsEnabled: true,
  budgetAlertsEnabled: true,
  goalMilestonesEnabled: true,
  largeTxAlertsEnabled: true,
  munshiSuggestionsEnabled: true,
  monthlyReportEnabled: true,
  selectedBanks: [],
};

function pickPrefs(raw: Partial<ApiUserPreferences> | null | undefined): ApiUserPreferences {
  return { ...DEFAULT_PREFS, ...(raw ?? {}) };
}

// ── Transaction params ────────────────────────────────────────────────
export type TxPeriod = 'week' | 'month' | '3m' | 'all';

export interface TxListParams {
  filter?: 'all' | 'inc' | 'exp';
  period?: TxPeriod;
  limit?: number;
  accountId?: string;
  /** Restrict to a single transaction category (server-side). */
  categoryId?: string;
  /** Inclusive lower/upper date bounds (YYYY-MM-DD), server-side. Overrides
   * `period` when set — used to scope a category to a single budget month. */
  from?: string;
  to?: string;
  /** Free-text description match, resolved server-side across all history. */
  search?: string;
  /** Restrict to bank/UPI or credit-card transactions (server-side). */
  source?: 'bank' | 'card';
}

// Local YYYY-MM-DD (avoids the UTC shift that toISOString() causes in
// timezones ahead of UTC, which would push a 1st-of-month into the prior day).
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Current calendar month as YYYY-MM (local).
function currentMonthKey(): string {
  return ymd(new Date()).slice(0, 7);
}

// ── api object ────────────────────────────────────────────────────────
export const api = {
  transactions: {
    async list(params?: TxListParams): Promise<TxView[]> {
      const qs = new URLSearchParams();
      if (params?.filter === 'inc') qs.set('type', 'income');
      if (params?.filter === 'exp') qs.set('type', 'expense');
      // Explicit from/to (a scoped month) wins over the relative `period`.
      if (params?.from || params?.to) {
        if (params.from) qs.set('from', params.from);
        if (params.to) qs.set('to', params.to);
      } else if (params?.period) {
        const from = backendPeriodFrom(params.period);
        if (from) qs.set('from', from);
      }
      if (params?.categoryId) qs.set('categoryId', params.categoryId);
      if (params?.accountId) qs.set('accountId', params.accountId);
      if (params?.source) qs.set('source', params.source);
      if (params?.search?.trim()) qs.set('search', params.search.trim());
      qs.set('limit', String(params?.limit ?? 100));
      const raw = await apiClient.get<ApiPaginatedTransactions>(`/transactions?${qs.toString()}`);
      const [catMap, acctMap] = await Promise.all([fetchCategoryMap(), fetchAccountMap()]);
      return txItems(raw).map((tx) =>
        toTxView(tx, catMap.get(tx.categoryId), tx.accountId ? acctMap.get(tx.accountId) : undefined),
      );
    },

    async recent(): Promise<RecentTxView[]> {
      const raw = await apiClient.get<ApiPaginatedTransactions>('/transactions?limit=4');
      const [catMap, acctMap] = await Promise.all([fetchCategoryMap(), fetchAccountMap()]);
      return txItems(raw).map((tx) =>
        toRecentTxView(
          tx,
          catMap.get(tx.categoryId),
          displayDate(tx.date.slice(0, 10)),
          tx.accountId ? acctMap.get(tx.accountId) : undefined,
        ),
      );
    },

    async create(input: NewTxInput): Promise<TxView> {
      const categoryId = await resolveCategoryId(input.categoryName);
      const created = await apiClient.post<ApiTransaction>('/transactions', {
        date: input.date ?? todayIso(),
        description: input.desc,
        amount: Math.abs(input.amount),
        type: input.type === 'inc' ? 'income' : 'expense',
        categoryId,
        notes: input.note,
        ...(input.accountId ? { accountId: input.accountId } : {}),
        ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
      });
      bumpData();
      const [catMap, acctMap] = await Promise.all([fetchCategoryMap(), fetchAccountMap()]);
      return toTxView(
        created,
        catMap.get(created.categoryId),
        created.accountId ? acctMap.get(created.accountId) : undefined,
      );
    },

    async update(id: TxView['id'], patch: UpdateTxInput): Promise<void> {
      const body: Record<string, unknown> = {};
      if (patch.desc !== undefined) body['description'] = patch.desc;
      if (patch.date !== undefined) body['date'] = patch.date;
      if (patch.amount !== undefined) body['amount'] = Math.abs(patch.amount);
      if (patch.categoryName !== undefined) {
        body['categoryId'] = await resolveCategoryId(patch.categoryName);
      }
      if (patch.note !== undefined) body['notes'] = patch.note;
      await apiClient.patch(`/transactions/${id}`, body);
      bumpData();
    },

    async remove(id: TxView['id']): Promise<void> {
      await apiClient.delete(`/transactions/${id}`);
      bumpData();
    },
  },

  accounts: {
    async list(): Promise<AccountView[]> {
      const raw = await apiClient.get<ApiAccount[]>('/accounts');
      // Recent per-account movement (last 30 days) for the card's change chip.
      // Only transactions that carry an accountId contribute; accounts with no
      // recent activity report 0 and the UI hides the chip (no fake "↓ ₹0").
      // This enrichment is decorative — if it fails (e.g. a bad request), the
      // accounts must still render, so its failure is swallowed to change=0
      // rather than rejecting the whole list.
      const from = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const changeByAccount = new Map<string, number>();
      try {
        // limit is capped at 100 by the API (QueryTransactionsDto @Max(100)).
        const txRaw = await apiClient.get<ApiPaginatedTransactions>(
          `/transactions?from=${from}&limit=100`,
        );
        for (const tx of txItems(txRaw)) {
          if (!tx.accountId) continue;
          const delta = tx.type === 'income' ? tx.amount : -tx.amount;
          changeByAccount.set(tx.accountId, (changeByAccount.get(tx.accountId) ?? 0) + delta);
        }
      } catch {
        // Leave changeByAccount empty; every account reports change=0.
      }
      return raw.map((a) =>
        toAccountView(
          a,
          ACCOUNT_GRADIENTS[a.type] ?? ACCOUNT_GRADIENTS['other'],
          changeByAccount.get(a.id) ?? 0,
        ),
      );
    },

    async create(input: NewAccountInput): Promise<void> {
      await apiClient.post('/accounts', input);
      bumpData();
    },

    async update(
      id: AccountView['id'],
      patch: { name?: string; institutionName?: string },
    ): Promise<void> {
      await apiClient.patch(`/accounts/${id}`, patch);
      bumpData();
    },

    async remove(id: AccountView['id']): Promise<void> {
      await apiClient.delete(`/accounts/${id}`);
      bumpData();
    },
  },

  budgets: {
    /** Category views for a given month (defaults to the current month). */
    async list(month: string = currentMonthKey()): Promise<BudgetCategoryView[]> {
      const raw = await apiClient.get<ApiBudget[]>(`/budgets?month=${month}`);
      if (!raw.length) return [];
      return toBudgetCategoryViews(raw[0]!);
    },

    /** Ascending YYYY-MM keys for every month that has a budget. */
    async listMonths(): Promise<string[]> {
      const raw = await apiClient.get<ApiBudget[]>('/budgets');
      return raw
        .map((b) => b.startDate.slice(0, 7))
        .sort();
    },

    /** Current-month rollup for Home's hero; null when none exists. */
    async currentSummary(): Promise<BudgetSummaryView | null> {
      const raw = await apiClient.get<ApiBudget[]>(
        `/budgets?month=${currentMonthKey()}`,
      );
      if (!raw.length) return null;
      const budget = raw[0]!;
      const end = new Date(budget.endDate);
      const msLeft = end.getTime() - Date.now();
      return {
        monthLabel: new Date(budget.startDate).toLocaleString('en', { month: 'long' }),
        allocated: budget.totalAllocated,
        spent: budget.totalSpent,
        daysLeft: Math.max(1, Math.ceil(msLeft / (24 * 3600 * 1000))),
      };
    },

    /**
     * Adds (or re-allocates) one category budget in the CURRENT month,
     * creating the month's budget if none exists. Backend budget updates
     * replace `categories` wholesale, so existing rows are re-sent.
     */
    async upsertCategory(input: NewBudgetCategoryInput): Promise<void> {
      const month = currentMonthKey();
      const current = await apiClient.get<ApiBudget[]>(`/budgets?month=${month}`);
      const newCat = {
        name: input.name,
        allocated: input.allocated,
        // Link the matching transaction category — `spent` is computed from
        // transactions in these categories, so an empty list never tracks.
        categoryIds: [await resolveCategoryId(input.name)],
        icon: input.icon,
        color: input.color,
      };
      if (!current.length) {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        await apiClient.post('/budgets', {
          name: now.toLocaleString('en', { month: 'long', year: 'numeric' }),
          startDate: ymd(start),
          endDate: ymd(end),
          income: 0,
          categories: [newCat],
        });
      } else {
        const budget = current[0]!;
        const kept = budget.categories
          .filter((c) => c.name.toLowerCase() !== input.name.toLowerCase())
          .map((c) => ({
            name: c.name,
            allocated: c.allocated,
            categoryIds: c.categoryIds,
            icon: c.icon,
            color: c.color,
            rollover: c.rollover,
            notes: c.notes,
          }));
        await apiClient.patch(`/budgets/${budget.id}`, { categories: [...kept, newCat] });
      }
      bumpData();
    },

    /**
     * Drop one category line from the CURRENT month's budget (a no-op if the
     * month has no budget or the category isn't in it). Backend budget
     * updates replace `categories` wholesale, so the remaining rows are re-sent.
     */
    async removeCategory(name: string): Promise<void> {
      const month = currentMonthKey();
      const current = await apiClient.get<ApiBudget[]>(`/budgets?month=${month}`);
      if (!current.length) return;
      const budget = current[0]!;
      const kept = budget.categories
        .filter((c) => c.name.toLowerCase() !== name.toLowerCase())
        .map((c) => ({
          name: c.name,
          allocated: c.allocated,
          categoryIds: c.categoryIds,
          icon: c.icon,
          color: c.color,
          rollover: c.rollover,
          notes: c.notes,
        }));
      await apiClient.patch(`/budgets/${budget.id}`, { categories: kept });
      bumpData();
    },

    /**
     * Create the current month's budget by copying categories + allocations
     * from the most recent prior month (spent resets, computed live).
     * Returns false when there is no prior budget to copy.
     */
    async setupFromPrevious(): Promise<boolean> {
      const month = currentMonthKey();
      const all = await apiClient.get<ApiBudget[]>('/budgets'); // newest-first
      const prior = all.find((b) => b.startDate.slice(0, 7) < month);
      if (!prior) return false;

      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      await apiClient.post('/budgets', {
        name: now.toLocaleString('en', { month: 'long', year: 'numeric' }),
        startDate: ymd(start),
        endDate: ymd(end),
        income: prior.income,
        categories: prior.categories.map((c) => ({
          name: c.name,
          allocated: c.allocated,
          categoryIds: c.categoryIds,
          icon: c.icon,
          color: c.color,
          rollover: c.rollover,
          notes: c.notes,
        })),
      });
      bumpData();
      return true;
    },
  },

  events: {
    async list(): Promise<EventView[]> {
      const raw = await apiClient.get<ApiEvent[]>('/events');
      return raw.map(toEventView);
    },

    async get(id: string): Promise<EventDetailView> {
      const [raw, catMap] = await Promise.all([
        apiClient.get<ApiEvent>(`/events/${id}`),
        fetchCategoryMap(),
      ]);
      return toEventDetailView(raw, catMap);
    },

    async create(input: NewEventInput): Promise<EventView> {
      // Resolve each expense's category label -> id (creating if missing),
      // exactly as budgets/transactions do.
      const expenses = await Promise.all(
        input.expenses.map(async (x) => ({
          categoryId: await resolveCategoryId(x.categoryName),
          label: x.label,
          planned: x.planned,
          actual: x.actual ?? 0,
          paid: false, // create starts unticked; ticking is a later PATCH
          dayDate: x.dayDate ?? null,
        })),
      );
      const created = await apiClient.post<ApiEvent>('/events', {
        name: input.name, emoji: input.emoji, color: input.color,
        date: input.date, multiDay: input.multiDay ?? false, endDate: input.endDate,
        budget: input.budget, guests: input.guests ?? 0,
        expenses,
      });
      bumpData();
      return toEventView(created);
    },

    async update(id: string, patch: Partial<Pick<NewEventInput, 'name' | 'emoji' | 'color' | 'date' | 'multiDay' | 'endDate' | 'budget' | 'guests'>>): Promise<void> {
      await apiClient.patch(`/events/${id}`, patch);
      bumpData();
    },

    async remove(id: string): Promise<void> {
      await apiClient.delete(`/events/${id}`);
      bumpData();
    },

    async addExpense(id: string, input: NewEventExpenseInput): Promise<void> {
      await apiClient.post(`/events/${id}/expenses`, {
        categoryId: await resolveCategoryId(input.categoryName),
        label: input.label,
        planned: input.planned,
        actual: input.actual,
        paid: input.paid ?? false,
        dayDate: input.dayDate ?? null,
      });
      bumpData();
    },

    async updateExpense(
      id: string,
      expenseId: string,
      patch: { categoryName?: string; label?: string; planned?: number; actual?: number; paid?: boolean; dayDate?: string | null },
    ): Promise<void> {
      const body: Record<string, unknown> = {};
      if (patch.categoryName !== undefined) body['categoryId'] = await resolveCategoryId(patch.categoryName);
      if (patch.label !== undefined) body['label'] = patch.label;
      if (patch.planned !== undefined) body['planned'] = patch.planned;
      if (patch.actual !== undefined) body['actual'] = patch.actual;
      if (patch.paid !== undefined) body['paid'] = patch.paid;
      if (patch.dayDate !== undefined) body['dayDate'] = patch.dayDate;
      await apiClient.patch(`/events/${id}/expenses/${expenseId}`, body);
      bumpData();
    },

    async removeExpense(id: string, expenseId: string): Promise<void> {
      await apiClient.delete(`/events/${id}/expenses/${expenseId}`);
      bumpData();
    },
  },

  goals: {
    async list(): Promise<GoalView[]> {
      const raw = await apiClient.get<ApiGoal[]>('/goals');
      return raw.map(toGoalView);
    },

    async create(input: NewGoalInput): Promise<void> {
      await apiClient.post('/goals', {
        name: input.name,
        type: input.type,
        targetAmount: input.target,
        currentAmount: input.current ?? 0,
        startDate: todayIso(),
        targetDate: input.targetDate,
      });
      bumpData();
    },
  },

  investments: {
    async list(): Promise<HoldingView[]> {
      const raw = await apiClient.get<ApiInvestment[]>('/investments');
      return raw.map((inv, i) => ({
        ...toHoldingView(inv),
        color: HOLDING_COLORS[i % HOLDING_COLORS.length]!,
      }));
    },

    async create(input: NewHoldingInput): Promise<void> {
      const value = input.currentValue ?? input.invested;
      // Investments require an account (FK RESTRICT) — reuse the user's
      // investment account or create a portfolio account on first holding.
      const accounts = await apiClient.get<ApiAccount[]>('/accounts');
      let portfolio = accounts.find((a) => a.type === 'investment');
      if (!portfolio) {
        portfolio = await apiClient.post<ApiAccount>('/accounts', {
          name: 'Investment Portfolio',
          type: 'investment',
          balance: 0,
        });
      }
      await apiClient.post('/investments', {
        name: input.name,
        ticker: input.ticker,
        assetClass: input.kind === 'crypto' ? 'alternatives' : 'stocks',
        type:
          input.kind === 'stock'
            ? 'individual_stock'
            : input.kind === 'mutual_fund'
              ? 'mutual_fund'
              : 'crypto',
        shares: 1,
        purchasePrice: input.invested,
        currentPrice: value,
        purchaseDate: todayIso(),
        accountId: portfolio.id,
      });
      bumpData();
    },
  },

  reports: {
    async overview(period?: string): Promise<ReportOverviewView> {
      const raw = await apiClient.get<ApiReportOverview>(
        `/reports/overview?period=${reportPeriod(period)}`,
      );
      return toReportOverviewView(raw);
    },

    /**
     * This week's spend per weekday (Mon–Sun of the current week),
     * aggregated client-side from transactions — no dedicated endpoint.
     */
    async weekSpend(): Promise<WeekDataPoint[]> {
      const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const now = new Date();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      const from = monday.toISOString().slice(0, 10);
      const raw = await apiClient.get<ApiPaginatedTransactions>(
        `/transactions?type=expense&from=${from}&limit=100`,
      );
      const byDay = new Array(7).fill(0) as number[];
      for (const tx of txItems(raw)) {
        const d = new Date(tx.date);
        byDay[(d.getDay() + 6) % 7] += Math.abs(tx.amount);
      }
      return labels.map((d, i) => ({ d, v: byDay[i]! }));
    },

    async incomeVsExpense(period?: string): Promise<IncomeExpenseSeriesView> {
      const raw = await apiClient.get<{ month: string; income: number; expense: number }[]>(
        `/reports/income-vs-expense?period=${reportPeriod(period)}`,
      );
      return {
        labels: raw.map((r) => shortMonth(r.month)),
        income: raw.map((r) => r.income),
        expense: raw.map((r) => r.expense),
      };
    },

    async categories(period?: string): Promise<CategorySliceView[]> {
      const raw = await apiClient.get<
        { categoryId: string; name: string; color: string | null; value: number; sharePct: number }[]
      >(`/reports/categories?period=${reportPeriod(period)}`);
      return raw.map((r, i) => ({
        label: r.name,
        value: r.value,
        color: r.color ?? SLICE_COLORS[i % SLICE_COLORS.length]!,
        pct: Math.round(r.sharePct),
      }));
    },

    async netWorthTrend(period?: string): Promise<NetWorthTrendView> {
      const raw = await apiClient.get<{ month: string; netWorth: number }[]>(
        `/reports/net-worth-trend?period=${reportPeriod(period)}`,
      );
      const points = raw.map((r) => r.netWorth);
      const first = points[0] ?? 0;
      const last = points[points.length - 1] ?? 0;
      return {
        points,
        current: last,
        deltaPct: first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0,
      };
    },
  },

  notifications: {
    async list(): Promise<NotificationView[]> {
      const raw = await apiClient.get<ApiNotification[]>('/notifications');
      return raw.map(toNotificationView);
    },

    async markAllRead(): Promise<void> {
      await apiClient.post('/notifications/read-all', {});
      bumpData();
    },

    async registerDevice(expoPushToken: string, platform: 'ios' | 'android'): Promise<void> {
      await apiClient.post('/notifications/register-device', { expoPushToken, platform });
    },

    async unregisterDevice(expoPushToken: string): Promise<void> {
      await apiClient.post('/notifications/unregister-device', { expoPushToken });
    },
  },

  categories: {
    async list(): Promise<CategoryView[]> {
      const [raw, activity] = await Promise.all([
        apiClient.get<ApiCategory[]>('/categories'),
        // Best-effort: category counts/totals are enrichment — if the stats
        // endpoint is unavailable, still return the categories (0 activity).
        apiClient
          .get<ApiCategoryActivity[]>('/reports/category-activity')
          .catch(() => [] as ApiCategoryActivity[]),
      ]);
      const byId = new Map(activity.map((a) => [a.categoryId, a]));
      return raw.map((c) => {
        const a = byId.get(c.id);
        const isIncome = a ? a.incomeTotal > a.expenseTotal : false;
        // Show the dominant side's throughput as the category's total.
        const total = a ? (isIncome ? a.incomeTotal : a.expenseTotal) : 0;
        return toCategoryView(c, a?.count ?? 0, total, [], isIncome);
      });
    },

    async create(input: NewCategoryInput): Promise<void> {
      await apiClient.post('/categories', input);
      bumpData();
    },
  },

  prefs: {
    async get(): Promise<ApiUserPreferences> {
      const raw = await apiClient.get<Partial<ApiUserPreferences>>('/users/me/preferences');
      return pickPrefs(raw);
    },

    async update(patch: PrefsPatch): Promise<ApiUserPreferences> {
      const raw = await apiClient.patch<Partial<ApiUserPreferences>>(
        '/users/me/preferences',
        patch,
      );
      return pickPrefs(raw);
    },
  },

  receipts: {
    /** Extracts a transaction from a receipt image via the backend vision model. */
    async scan(
      imageBase64: string,
      mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' = 'image/jpeg',
    ): Promise<ScannedReceipt> {
      return apiClient.post<ScannedReceipt>('/receipts/scan', {
        image: imageBase64,
        mimeType,
      });
    },
  },

  users: {
    async updateProfile(patch: { name?: string }): Promise<void> {
      await apiClient.patch('/users/me', patch);
    },

    async deleteAccount(): Promise<void> {
      await apiClient.delete('/users/me');
    },
  },
};
