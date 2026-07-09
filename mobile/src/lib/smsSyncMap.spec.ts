import { toSyncDetected, nonDuplicates, type ParsedSmsWire } from './smsSyncMap';

const base: ParsedSmsWire = {
  id: 'm1', raw: 'Rs.499 at SWIGGY', merchant: 'Swiggy', amount: null as unknown as number,
  type: 'expense', category: 'Food', account: 'HDFC •4521', bank: 'HDFC Bank', last4: '4521',
  confidence: 0.8, paymentMethod: 'card', accountId: 'acc-card', possibleDuplicate: false,
};

describe('toSyncDetected', () => {
  it('maps a card expense with resolved account + signed amount + given date', () => {
    const d = toSyncDetected({ ...base, amount: 499 }, '2026-06-13');
    expect(d.amount).toBe(-499);
    expect(d.accountId).toBe('acc-card');
    expect(d.paymentMethod).toBe('card');
    expect(d.time).toBe('2026-06-13');
    expect(d.cat).toBe('Food');
    expect(d.possibleDuplicate).toBe(false);
  });

  it('signs income positive and carries the duplicate flag', () => {
    const d = toSyncDetected({ ...base, amount: 50000, type: 'income', category: 'Income', possibleDuplicate: true }, '2026-06-01');
    expect(d.amount).toBe(50000);
    expect(d.possibleDuplicate).toBe(true);
  });

  it('falls back to defaults when fields are null', () => {
    const d = toSyncDetected({ ...base, amount: 10, merchant: null, bank: null, category: null, accountId: null, account: null }, '2026-06-13');
    expect(d.merchant).toBe('Transaction');
    expect(d.bank).toBe('Bank');
    expect(d.cat).toBe('Other');
    expect(d.accountId).toBeUndefined();
  });
});

describe('nonDuplicates', () => {
  it('drops possibleDuplicate rows', () => {
    const a = toSyncDetected({ ...base, amount: 1 }, '2026-06-13');
    const b = toSyncDetected({ ...base, id: 'm2', amount: 2, possibleDuplicate: true }, '2026-06-13');
    expect(nonDuplicates([a, b])).toEqual([a]);
  });
});
