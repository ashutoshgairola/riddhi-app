import { computeEventTotals, computeDayGroups } from './events.totals';

const item = (planned: number, actual: number, paid: boolean) =>
  ({ planned, actual, paid }) as any;

const dayItem = (planned: number, actual: number, paid: boolean, dayDate: string | null) =>
  ({ planned, actual, paid, dayDate }) as any;

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

describe('computeDayGroups', () => {
  it('returns [] for single-day events', () => {
    expect(computeDayGroups([dayItem(100, 0, false, null)], { multiDay: false })).toEqual([]);
  });

  it('groups by day ascending with Unscheduled last, summing planned/paid', () => {
    const groups = computeDayGroups(
      [
        dayItem(2000, 2000, true, '2026-07-09'),
        dayItem(500, 0, false, '2026-07-08'),
        dayItem(8000, 7500, true, '2026-07-08'),
        dayItem(1500, 0, false, null),
      ],
      { multiDay: true },
    );
    expect(groups.map((g) => g.dayDate)).toEqual(['2026-07-08', '2026-07-09', null]);
    // 2026-07-08: planned 8500, paid 7500 (only the paid item's actual), 2 items, 1 paid
    expect(groups[0]).toEqual({ dayDate: '2026-07-08', planned: 8500, paid: 7500, count: 2, paidCount: 1 });
    expect(groups[1]).toEqual({ dayDate: '2026-07-09', planned: 2000, paid: 2000, count: 1, paidCount: 1 });
    expect(groups[2]).toEqual({ dayDate: null, planned: 1500, paid: 0, count: 1, paidCount: 0 });
  });

  it('omits the Unscheduled group when every expense has a day', () => {
    const groups = computeDayGroups([dayItem(100, 0, false, '2026-07-08')], { multiDay: true });
    expect(groups.map((g) => g.dayDate)).toEqual(['2026-07-08']);
  });
});
