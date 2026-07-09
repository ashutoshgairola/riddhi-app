import { computeImportFingerprint, normalizeDescriptor } from './import-fingerprint';

describe('normalizeDescriptor', () => {
  it('lowercases, collapses whitespace, strips punctuation and trailing ref numbers', () => {
    expect(normalizeDescriptor('  SWIGGY*Order   #1234567 ')).toBe('swiggy order');
    expect(normalizeDescriptor('AMAZON.IN')).toBe('amazon in');
  });
});

describe('computeImportFingerprint', () => {
  it('is stable across cosmetic descriptor differences', () => {
    const a = computeImportFingerprint('acc1', 499, '2026-06-12', 'SWIGGY*Order #111');
    const b = computeImportFingerprint('acc1', 499, '2026-06-12', 'swiggy order  #999');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
  it('differs on account, amount, or date', () => {
    const base = computeImportFingerprint('acc1', 499, '2026-06-12', 'swiggy');
    expect(computeImportFingerprint('acc2', 499, '2026-06-12', 'swiggy')).not.toBe(base);
    expect(computeImportFingerprint('acc1', 500, '2026-06-12', 'swiggy')).not.toBe(base);
    expect(computeImportFingerprint('acc1', 499, '2026-06-13', 'swiggy')).not.toBe(base);
  });
});
