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
