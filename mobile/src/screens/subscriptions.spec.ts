import { formatInr, payTag, candidateToCreatePayload, filterByTab } from './subscriptions';

describe('subscription view helpers', () => {
  it('formats INR', () => {
    expect(formatInr(1499)).toBe('₹1,499');
  });
  it('maps payment method to a tag', () => {
    expect(payTag({ paymentMethod: 'card' }).icon).toBe('card');
    expect(payTag({ paymentMethod: 'upi' }).icon).toBe('upi');
  });
  it('builds a create payload from a candidate', () => {
    const c: any = { name: 'Netflix', merchantDescriptor: 'netflix.com', amount: 649, cycle: 'monthly', nextRenewalDate: '2026-05-10', firstSeenDate: '2025-01-01', emoji: '🎬', color: '#c97d8c', accountId: 'a1', paymentMethod: 'card', categoryId: 'cat', transactionIds: ['t1', 't2'], priceHistory: [{ amount: 499, since: '2025-01-01' }] };
    const p = candidateToCreatePayload(c, 2);
    expect(p.transactionIds).toEqual(['t1', 't2']);
    expect(p.reminderDays).toBe(2);
    expect(p.priceHistory).toEqual([{ amount: 499, since: '2025-01-01' }]);
  });
  it('filters by tab', () => {
    const subs: any = [{ id: '1', status: 'active' }, { id: '2', status: 'paused' }, { id: '3', status: 'cancelled' }];
    expect(filterByTab(subs, 'all').map((s: any) => s.id)).toEqual(['1', '2']); // excludes cancelled
    expect(filterByTab(subs, 'paused').map((s: any) => s.id)).toEqual(['2']);
  });
});
