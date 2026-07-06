import { computeEventTotals } from './events.totals';

const item = (planned: number, actual: number, paid: boolean) =>
  ({ planned, actual, paid }) as any;

describe('computeEventTotals', () => {
  it('sums planned, paid actuals, and projects unpaid at planned', () => {
    const t = computeEventTotals(
      [item(6000, 6000, true), item(2500, 2800, true), item(8000, 0, false)],
      25000,
    );
    expect(t.planned).toBe(16500);
    expect(t.paid).toBe(8800);
    expect(t.projected).toBe(16800); // 8800 paid + 8000 unpaid planned
    expect(t.paidCount).toBe(2);
    expect(t.count).toBe(3);
    expect(t.remaining).toBe(16200); // budget - paid
    expect(t.over).toBe(false);
  });

  it('flags over when projected exceeds budget', () => {
    const t = computeEventTotals([item(30000, 30000, true)], 25000);
    expect(t.over).toBe(true);
  });

  it('handles no expenses', () => {
    const t = computeEventTotals([], 10000);
    expect(t).toEqual({
      planned: 0, paid: 0, projected: 0, paidCount: 0, count: 0,
      remaining: 10000, over: false,
    });
  });
});
