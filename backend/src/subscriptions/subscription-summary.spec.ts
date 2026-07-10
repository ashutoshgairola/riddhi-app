import { computeSubscriptionSummary, SummarySub } from './subscription-summary';

const sub = (over: Partial<SummarySub>): SummarySub => ({
  id: 's1', name: 'Netflix', emoji: '🎬', color: '#c97d8c',
  amount: 649, cycle: 'monthly', nextRenewalDate: '2026-05-10',
  firstSeenDate: '2025-01-01', status: 'active', priceHistory: null,
  detailOpenedAt: null, accountId: 'a1',
  ...over,
});

describe('computeSubscriptionSummary', () => {
  const today = new Date('2026-05-01T00:00:00Z');

  it('sums monthly burn and yearly projection over active subs only', () => {
    const r = computeSubscriptionSummary(
      [sub({ amount: 649, cycle: 'monthly' }), sub({ id: 's2', amount: 1200, cycle: 'yearly' }), sub({ id: 's3', status: 'paused', amount: 999 })],
      today,
    );
    expect(r.monthlyBurn).toBe(649 + 100); // 1200/12
    expect(r.yearlyProjection).toBe(649 * 12 + 1200);
    expect(r.activeCount).toBe(2);
  });

  it('lists upcoming charges within the window, sorted by date', () => {
    const r = computeSubscriptionSummary(
      [sub({ id: 's2', nextRenewalDate: '2026-05-20' }), sub({ id: 's1', nextRenewalDate: '2026-05-05' }), sub({ id: 's3', nextRenewalDate: '2026-09-01' })],
      today,
    );
    expect(r.upcoming.map((u) => u.subId)).toEqual(['s1', 's2']);
    expect(r.upcoming[0].inDays).toBe(4);
  });

  it('flags a price hike', () => {
    const r = computeSubscriptionSummary(
      [sub({ priceHistory: [{ amount: 499, since: '2025-01-01' }, { amount: 649, since: '2026-02-01' }] })],
      today,
    );
    expect(r.flags.find((f) => f.kind === 'hike')).toMatchObject({ subId: 's1', from: 499, to: 649 });
  });

  it('flags a big annual renewing soon', () => {
    const r = computeSubscriptionSummary([sub({ cycle: 'yearly', amount: 1499, nextRenewalDate: '2026-05-08' })], today);
    expect(r.flags.some((f) => f.kind === 'renewal_soon')).toBe(true);
  });

  it('flags possibly-forgotten only when never-opened + old + costly', () => {
    const r = computeSubscriptionSummary(
      [sub({ cycle: 'yearly', amount: 1499, firstSeenDate: '2024-01-01', detailOpenedAt: null, nextRenewalDate: '2026-12-01' })],
      today,
    );
    expect(r.flags.some((f) => f.kind === 'forgotten')).toBe(true);

    const opened = computeSubscriptionSummary(
      [sub({ cycle: 'yearly', amount: 1499, firstSeenDate: '2024-01-01', detailOpenedAt: new Date('2026-01-01'), nextRenewalDate: '2026-12-01' })],
      today,
    );
    expect(opened.flags.some((f) => f.kind === 'forgotten')).toBe(false);
  });
});
