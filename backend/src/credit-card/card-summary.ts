export interface CardConfig {
  creditLimit: number;
  statementDay: number;
  graceDays: number;
  statementDate: string | null;
  statementBilled: number | null;
  statementMinDue: number | null;
  statementDueDate: string | null;
  statementRewards: number | null;
}

export interface CardTxn {
  amount: number; // positive magnitude
  date: string; // ISO (YYYY-MM-DD or full)
  type: 'expense' | 'transfer' | 'income';
  categoryId: string;
  isPaymentIn: boolean; // transfer whose destination is this card
}

export interface CategoryMeta { id: string; name: string; color: string | null }

/** A single row in the merged "Card transactions" ledger returned by
 * `CreditCardService.getSummary` — a swipe (debit, signed negative) or a
 * bill payment (credit, signed positive), newest first. */
export interface CardLedgerTxn {
  id: string;
  description: string;
  amount: number; // signed: swipe negative, payment positive
  date: string; // ISO
  categoryId: string;
  kind: 'swipe' | 'payment';
}

export interface CycleCategory { categoryId: string; label: string; value: number; color: string | null }

export interface CardSummary {
  outstanding: number; available: number; usedPct: number;
  unbilled: number; billed: number; minDue: number;
  dueDate: string; daysUntilDue: number; hasBill: boolean;
  rewardsThisCycle: number; lastStatementDate: string;
  cycleByCategory: CycleCategory[];
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const dayOnly = (s: string): string => s.slice(0, 10);

/** Most recent occurrence of `statementDay` on/before today (statementDay <= 28). */
export function lastStatementDate(statementDay: number, today: Date): Date {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const thisMonth = new Date(Date.UTC(y, m, statementDay));
  if (today.getUTCDate() >= statementDay) return thisMonth;
  return new Date(Date.UTC(y, m - 1, statementDay));
}

export function computeCardSummary(
  config: CardConfig,
  accountBalance: number,
  txns: CardTxn[],
  categories: Map<string, CategoryMeta>,
  today: Date,
): CardSummary {
  const lastStmt = lastStatementDate(config.statementDay, today);
  const lastStmtIso = iso(lastStmt);

  const outstanding = Math.max(0, -accountBalance);
  const available = config.creditLimit - outstanding;
  const usedPct = config.creditLimit > 0
    ? Math.min(100, Math.max(0, Math.round((outstanding / config.creditLimit) * 100)))
    : 0;

  const unbilledTxns = txns.filter((t) => t.type === 'expense' && dayOnly(t.date) >= lastStmtIso);
  const unbilled = unbilledTxns.reduce((s, t) => s + Math.abs(t.amount), 0);

  const byCat = new Map<string, number>();
  for (const t of unbilledTxns) byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + Math.abs(t.amount));
  const cycleByCategory: CycleCategory[] = [...byCat.entries()]
    .map(([categoryId, value]) => {
      const meta = categories.get(categoryId);
      return { categoryId, label: meta?.name ?? 'Other', value, color: meta?.color ?? null };
    })
    .sort((a, b) => b.value - a.value);

  const overrideCurrent = config.statementDate != null && dayOnly(config.statementDate) === lastStmtIso;

  let billed: number, minDue: number, dueDate: string;
  if (overrideCurrent) {
    const paidSince = txns
      .filter((t) => t.isPaymentIn && dayOnly(t.date) >= dayOnly(config.statementDate as string))
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    billed = Math.max(0, (config.statementBilled ?? 0) - paidSince);
    minDue = Math.min(config.statementMinDue ?? 0, billed);
    dueDate = dayOnly(config.statementDueDate ?? iso(new Date(lastStmt.getTime() + config.graceDays * 86400000)));
  } else {
    billed = Math.max(0, outstanding - unbilled);
    minDue = billed > 0 ? Math.max(Math.round(billed * 0.05), 100) : 0;
    dueDate = iso(new Date(lastStmt.getTime() + config.graceDays * 86400000));
  }

  const dueMs = new Date(dueDate + 'T00:00:00Z').getTime() - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const daysUntilDue = Math.round(dueMs / 86400000);

  return {
    outstanding, available, usedPct, unbilled, billed, minDue, dueDate,
    daysUntilDue, hasBill: billed > 0, rewardsThisCycle: config.statementRewards ?? 0,
    lastStatementDate: lastStmtIso, cycleByCategory,
  };
}
