export interface EventTotals {
  planned: number;
  paid: number;
  projected: number;
  paidCount: number;
  count: number;
  remaining: number;
  over: boolean;
}

interface TotalsExpense {
  planned: number;
  actual: number;
  paid: boolean;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Mirrors the prototype's evTotals (MobileStore.jsx:106-113). */
export function computeEventTotals(
  expenses: TotalsExpense[],
  budget: number,
): EventTotals {
  const planned = expenses.reduce((s, e) => s + (e.planned || 0), 0);
  const paid = expenses.reduce((s, e) => s + (e.paid ? e.actual || 0 : 0), 0);
  const unpaidPlanned = expenses.reduce(
    (s, e) => s + (!e.paid ? e.planned || 0 : 0), 0,
  );
  const projected = paid + unpaidPlanned;
  return {
    planned: r2(planned),
    paid: r2(paid),
    projected: r2(projected),
    paidCount: expenses.filter((e) => e.paid).length,
    count: expenses.length,
    remaining: r2(budget - paid),
    over: projected > budget,
  };
}

export interface EventDayGroup {
  dayDate: string | null;
  planned: number;
  paid: number;
  count: number;
  paidCount: number;
}

interface DayGroupExpense {
  planned: number;
  actual: number;
  paid: boolean;
  dayDate: string | null;
}

/** Per-day rollups for a multi-day event; [] for single-day events. */
export function computeDayGroups(
  expenses: DayGroupExpense[],
  event: { multiDay: boolean },
): EventDayGroup[] {
  if (!event.multiDay) return [];
  const byDay = new Map<string | null, EventDayGroup>();
  for (const e of expenses) {
    const key = e.dayDate ?? null;
    let g = byDay.get(key);
    if (!g) {
      g = { dayDate: key, planned: 0, paid: 0, count: 0, paidCount: 0 };
      byDay.set(key, g);
    }
    g.planned += e.planned || 0;
    if (e.paid) {
      g.paid += e.actual || 0;
      g.paidCount += 1;
    }
    g.count += 1;
  }
  const groups = [...byDay.values()];
  groups.forEach((g) => {
    g.planned = r2(g.planned);
    g.paid = r2(g.paid);
  });
  // Non-null days ascending, then Unscheduled (null) last.
  return groups.sort((a, b) => {
    if (a.dayDate === null) return 1;
    if (b.dayDate === null) return -1;
    return a.dayDate < b.dayDate ? -1 : a.dayDate > b.dayDate ? 1 : 0;
  });
}
