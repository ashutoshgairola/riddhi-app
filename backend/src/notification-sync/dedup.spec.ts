import { computeDedupKey } from './dedup';

describe('computeDedupKey', () => {
  it('is stable for the same package+text within the same minute', () => {
    const a = computeDedupKey('com.rapido', 'Your ride ₹159', 1_700_000_000_000);
    const b = computeDedupKey('com.rapido', 'Your ride ₹159', 1_700_000_020_000);
    expect(a).toBe(b);
  });

  it('differs across packages', () => {
    const a = computeDedupKey('com.rapido', 'x', 1_700_000_000_000);
    const b = computeDedupKey('com.uber', 'x', 1_700_000_000_000);
    expect(a).not.toBe(b);
  });

  it('differs across minute buckets', () => {
    const a = computeDedupKey('com.rapido', 'x', 1_700_000_000_000);
    const b = computeDedupKey('com.rapido', 'x', 1_700_000_120_000);
    expect(a).not.toBe(b);
  });
});
