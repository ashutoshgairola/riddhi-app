import { isLikelyDuplicateOfExisting } from './reverse-dedup';

describe('isLikelyDuplicateOfExisting', () => {
  it('true when an existing txn matches amount+direction+date-window', () => {
    const existing = [
      { id: 't', isoDate: '2026-06-12', amount: 499, direction: 'debit' as const, descriptor: 'X', importFingerprint: null },
    ];
    expect(
      isLikelyDuplicateOfExisting(
        { isoDate: '2026-06-13', amount: 499, direction: 'debit', descriptor: 'Swiggy', category: null },
        existing,
      ),
    ).toBe(true);
  });

  it('false when nothing matches', () => {
    expect(
      isLikelyDuplicateOfExisting(
        { isoDate: '2026-06-13', amount: 10, direction: 'debit', descriptor: 'x', category: null },
        [],
      ),
    ).toBe(false);
  });

  it('false when an existing txn is outside the date window', () => {
    const existing = [
      { id: 't', isoDate: '2026-06-01', amount: 499, direction: 'debit' as const, descriptor: 'X', importFingerprint: null },
    ];
    expect(
      isLikelyDuplicateOfExisting(
        { isoDate: '2026-06-13', amount: 499, direction: 'debit', descriptor: 'Swiggy', category: null },
        existing,
      ),
    ).toBe(false);
  });
});
