// backend/src/subscriptions/detect-subscriptions.spec.ts
import { detectSubscriptions, normalizeDescriptor, DetectTxn } from './detect-subscriptions';

const tx = (over: Partial<DetectTxn>): DetectTxn => ({
  id: Math.random().toString(36).slice(2),
  date: '2026-01-01',
  description: 'NETFLIX.COM',
  amount: 649,
  categoryId: 'cat-ent',
  categoryName: 'Entertainment',
  accountId: 'acc-1',
  paymentMethod: 'card',
  isRecurring: false,
  ...over,
});

describe('normalizeDescriptor', () => {
  it('strips ref numbers/case/whitespace so variants collapse', () => {
    expect(normalizeDescriptor('NETFLIX.COM 12345')).toBe(normalizeDescriptor('netflix.com  billdesk'));
  });
});

describe('detectSubscriptions', () => {
  const today = new Date('2026-05-01T00:00:00Z');

  it('detects a monthly subscription from 3 regular charges', () => {
    const txns = [
      tx({ date: '2026-02-02', amount: 649 }),
      tx({ date: '2026-03-02', amount: 649 }),
      tx({ date: '2026-04-02', amount: 649 }),
    ];
    const [c] = detectSubscriptions(txns, new Set(), today);
    expect(c.cycle).toBe('monthly');
    expect(c.amount).toBe(649);
    expect(c.occurrences).toBe(3);
    expect(c.firstSeenDate).toBe('2026-02-02');
    expect(c.nextRenewalDate).toBe('2026-05-02');
    expect(c.transactionIds).toHaveLength(3);
  });

  it('keeps a yearly price hike as ONE stream (autopay renewal) and records the hike', () => {
    const txns = [
      tx({ description: 'AMAZON PRIME', amount: 999, date: '2024-09-14', paymentMethod: 'autopay' }),
      tx({ description: 'AMAZON PRIME', amount: 1499, date: '2025-09-14', paymentMethod: 'autopay' }),
    ];
    const [c] = detectSubscriptions(txns, new Set(), today);
    expect(c.cycle).toBe('yearly');
    expect(c.amount).toBe(1499);
    expect(c.priceHistory).toEqual([
      { amount: 999, since: '2024-09-14' },
      { amount: 1499, since: '2025-09-14' },
    ]);
  });

  it('splits an aggregator descriptor into per-service streams by cadence', () => {
    // Both billed as "GOOGLE PLAY" on the same account, both autopay:
    // Truecaller ₹99/yr and a ₹299/mo service. Must become TWO candidates.
    const txns = [
      tx({ description: 'GOOGLE PLAY', amount: 99, date: '2024-07-08', paymentMethod: 'autopay' }),
      tx({ description: 'GOOGLE PLAY', amount: 99, date: '2025-07-08', paymentMethod: 'autopay' }),
      tx({ description: 'GOOGLE PLAY', amount: 299, date: '2026-02-10', paymentMethod: 'autopay' }),
      tx({ description: 'GOOGLE PLAY', amount: 299, date: '2026-03-10', paymentMethod: 'autopay' }),
      tx({ description: 'GOOGLE PLAY', amount: 299, date: '2026-04-10', paymentMethod: 'autopay' }),
    ];
    const cands = detectSubscriptions(txns, new Set(), today);
    expect(cands).toHaveLength(2);
    expect(cands.find((c) => c.amount === 99)?.cycle).toBe('yearly');
    expect(cands.find((c) => c.amount === 299)?.cycle).toBe('monthly');
  });

  it('surfaces a single autopay mandate immediately as monthly (editable at confirm)', () => {
    const [c] = detectSubscriptions(
      [tx({ description: 'GOOGLE PLAY', amount: 99, date: '2026-04-08', paymentMethod: 'autopay' })],
      new Set(),
      today,
    );
    expect(c.cycle).toBe('monthly');
    expect(c.occurrences).toBe(1);
    expect(c.nextRenewalDate).toBe('2026-05-08');
  });

  it('does NOT detect from a single non-autopay charge', () => {
    expect(detectSubscriptions([tx({})], new Set(), today)).toHaveLength(0);
  });

  it('excludes descriptors already persisted/ignored', () => {
    const txns = [tx({ date: '2026-03-02' }), tx({ date: '2026-04-02' }), tx({ date: '2026-05-02' })];
    const seen = new Set([normalizeDescriptor('NETFLIX.COM')]);
    expect(detectSubscriptions(txns, seen, today)).toHaveLength(0);
  });

  it('rejects two coincidental same-merchant buys (no autopay, weak evidence)', () => {
    const txns = [
      tx({ description: 'AMAZON', amount: 200, date: '2026-03-02' }),
      tx({ description: 'AMAZON', amount: 120, date: '2026-04-02' }),
    ];
    expect(detectSubscriptions(txns, new Set(), today)).toHaveLength(0);
  });

  it('excludes income/investment categories (SIPs are not subscriptions)', () => {
    const txns = [
      tx({ description: 'SIP NIFTY', amount: 10000, date: '2026-02-15', categoryName: 'Investments', paymentMethod: 'autopay' }),
      tx({ description: 'SIP NIFTY', amount: 10000, date: '2026-03-15', categoryName: 'Investments', paymentMethod: 'autopay' }),
      tx({ description: 'SIP NIFTY', amount: 10000, date: '2026-04-15', categoryName: 'Investments', paymentMethod: 'autopay' }),
    ];
    expect(detectSubscriptions(txns, new Set(), today)).toHaveLength(0);
  });

  it('an autopay sub does not loosen a coincidental non-autopay pair in the same group', () => {
    const txns = [
      // real autopay monthly sub
      tx({ description: 'HDFC BILLPAY', amount: 500, date: '2026-01-05', paymentMethod: 'autopay' }),
      tx({ description: 'HDFC BILLPAY', amount: 500, date: '2026-02-05', paymentMethod: 'autopay' }),
      tx({ description: 'HDFC BILLPAY', amount: 500, date: '2026-03-05', paymentMethod: 'autopay' }),
      // two coincidental non-autopay buys, 34 days apart (monthly only under the widened boosted band)
      tx({ description: 'HDFC BILLPAY', amount: 1200, date: '2026-01-20', paymentMethod: 'card' }),
      tx({ description: 'HDFC BILLPAY', amount: 1150, date: '2026-02-23', paymentMethod: 'card' }),
    ];
    const cands = detectSubscriptions(txns, new Set(), today);
    expect(cands).toHaveLength(1);
    expect(cands[0].amount).toBe(500);
  });
});
