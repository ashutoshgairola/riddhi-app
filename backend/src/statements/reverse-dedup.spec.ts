import { isLikelyDuplicateOfExisting, reverseDedupVerdict } from './reverse-dedup';

const existingOne = [
  { id: 't', isoDate: '2026-06-12', amount: 499, direction: 'debit' as const, descriptor: 'X', importFingerprint: null },
];
// two live candidates in-window for the same amount+direction → 'possible'
const existingTwo = [
  { id: 't1', isoDate: '2026-06-12', amount: 499, direction: 'debit' as const, descriptor: 'X', importFingerprint: null },
  { id: 't2', isoDate: '2026-06-13', amount: 499, direction: 'debit' as const, descriptor: 'Y', importFingerprint: null },
];
const candidate = { isoDate: '2026-06-13', amount: 499, direction: 'debit' as const, descriptor: 'Swiggy', category: null };

describe('reverseDedupVerdict', () => {
  it("returns 'duplicate' for a single in-window match", () => {
    expect(reverseDedupVerdict(candidate, existingOne)).toBe('duplicate');
  });
  it("returns 'possible' for 2+ in-window candidates", () => {
    expect(reverseDedupVerdict(candidate, existingTwo)).toBe('possible');
  });
  it("returns 'new' when nothing matches", () => {
    expect(reverseDedupVerdict(candidate, [])).toBe('new');
  });
});

describe('isLikelyDuplicateOfExisting', () => {
  it('true only on an exact duplicate (single match)', () => {
    expect(isLikelyDuplicateOfExisting(candidate, existingOne)).toBe(true);
  });
  it("false on 'possible' (2+ candidates) — no silent drop of a real 2nd charge", () => {
    expect(isLikelyDuplicateOfExisting(candidate, existingTwo)).toBe(false);
  });
  it('false when nothing matches', () => {
    expect(isLikelyDuplicateOfExisting(candidate, [])).toBe(false);
  });
  it('false when the only match is outside the ±3d window', () => {
    const far = [{ id: 't', isoDate: '2026-06-01', amount: 499, direction: 'debit' as const, descriptor: 'X', importFingerprint: null }];
    expect(isLikelyDuplicateOfExisting(candidate, far)).toBe(false);
  });
});
