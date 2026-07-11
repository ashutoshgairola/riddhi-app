import { mapSubList, upcomingSubRows, SubListView } from './subscriptions';

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

describe('upcomingSubRows', () => {
  const list: SubListView = {
    monthlyBurn: 0, yearlyProjection: 0, activeCount: 2, flags: [],
    upcoming: [
      { subId: 's1', nextRenewalDate: '2026-07-14', inDays: 3, amount: 649 },
      { subId: 's2', nextRenewalDate: '2026-07-20', inDays: 9, amount: 149 },
      { subId: 'gone', nextRenewalDate: '2026-07-25', inDays: 14, amount: 99 },
    ],
    subscriptions: [
      { id: 's1', name: 'Netflix', emoji: '🎬', color: '#c97d8c', amount: 649, cycle: 'monthly', status: 'active', nextRenewalDate: '2026-07-14', firstSeenDate: '2025-01-01', priceHistory: null, accountId: null, paymentMethod: null },
      { id: 's2', name: 'Spotify', emoji: '🎧', color: '#5fbf77', amount: 149, cycle: 'monthly', status: 'active', nextRenewalDate: '2026-07-20', firstSeenDate: '2025-01-01', priceHistory: null, accountId: null, paymentMethod: null },
    ],
  };

  it('joins upcoming items to their subscription and preserves order', () => {
    const rows = upcomingSubRows(list);
    expect(rows.map((r) => r.name)).toEqual(['Netflix', 'Spotify']);
    expect(rows[0]).toMatchObject({ subId: 's1', emoji: '🎬', color: '#c97d8c', amount: 649, inDays: 3 });
  });

  it('drops upcoming items whose subscription is missing', () => {
    const rows = upcomingSubRows(list);
    expect(rows.find((r) => r.subId === 'gone')).toBeUndefined();
  });

  it('caps the number of rows', () => {
    expect(upcomingSubRows(list, 1).map((r) => r.name)).toEqual(['Netflix']);
  });

  it('returns [] when nothing is upcoming', () => {
    expect(upcomingSubRows({ ...list, upcoming: [] })).toEqual([]);
  });
});
