import { mapSubList } from './subscriptions';

describe('mapSubList', () => {
  it('maps the backend list+summary payload to the view model', () => {
    const view = mapSubList({
      subscriptions: [{ id: 's1', name: 'Netflix', emoji: '🎬', color: '#c97d8c', amount: 649, cycle: 'monthly', status: 'active', nextRenewalDate: '2026-05-10', firstSeenDate: '2025-01-01', priceHistory: null, accountId: 'a1', paymentMethod: 'card' }],
      summary: { monthlyBurn: 649, yearlyProjection: 7788, activeCount: 1, upcoming: [{ subId: 's1', nextRenewalDate: '2026-05-10', inDays: 9, amount: 649 }], flags: [] },
    });
    expect(view.monthlyBurn).toBe(649);
    expect(view.subscriptions[0].name).toBe('Netflix');
    expect(view.upcoming[0].inDays).toBe(9);
  });
});
