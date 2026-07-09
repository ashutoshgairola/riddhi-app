import { resolvePaymentSource } from './payment-source-resolver';
import { AccountType, PaymentMethod } from '../common/enums';

const acc = (id: string, institutionName: string | null, type: AccountType) => ({
  id,
  institutionName,
  type,
});

describe('resolvePaymentSource', () => {
  it('sets paymentMethod straight from rail', () => {
    const r = resolvePaymentSource('HDFC', 'card', []);
    expect(r.paymentMethod).toBe(PaymentMethod.CARD);
  });

  it('auto-fills accountId on a single institution match', () => {
    const accounts = [acc('a1', 'HDFC Bank', AccountType.SAVINGS)];
    const r = resolvePaymentSource('HDFC', 'upi', accounts);
    expect(r.accountId).toBe('a1');
    expect(r.paymentMethod).toBe(PaymentMethod.UPI);
  });

  it('upi debit auto-fills the bank account when the bank also has a credit card', () => {
    const accounts = [
      acc('a1', 'HDFC Bank', AccountType.SAVINGS),
      acc('a2', 'HDFC Bank', AccountType.CREDIT),
    ];
    const r = resolvePaymentSource('HDFC', 'upi', accounts);
    expect(r.accountId).toBe('a1'); // upi narrows to the bank account, uniquely a1
  });

  it('upi stays ambiguous with two bank accounts at one bank', () => {
    const accounts = [
      acc('a1', 'HDFC Bank', AccountType.SAVINGS),
      acc('a3', 'HDFC Bank', AccountType.SAVINGS),
    ];
    const r = resolvePaymentSource('HDFC', 'upi', accounts);
    expect(r.accountId).toBeNull();
  });

  it('narrows by account type implied by a card rail', () => {
    const accounts = [
      acc('a1', 'HDFC Bank', AccountType.SAVINGS),
      acc('a2', 'HDFC Bank', AccountType.CREDIT),
    ];
    const r = resolvePaymentSource('HDFC', 'card', accounts);
    expect(r.accountId).toBe('a2'); // only the credit account matches a card rail
  });

  it('netbanking narrows to the bank account', () => {
    const accounts = [
      acc('a1', 'HDFC Bank', AccountType.SAVINGS),
      acc('a2', 'HDFC Bank', AccountType.CREDIT),
    ];
    const r = resolvePaymentSource('HDFC', 'netbanking', accounts);
    expect(r.accountId).toBe('a1');
  });

  it('autopay does NOT narrow by type, so a mixed pair is ambiguous', () => {
    const accounts = [
      acc('a1', 'HDFC Bank', AccountType.SAVINGS),
      acc('a2', 'HDFC Bank', AccountType.CREDIT),
    ];
    const r = resolvePaymentSource('HDFC', 'autopay', accounts);
    expect(r.accountId).toBeNull();
    expect(r.paymentMethod).toBe(PaymentMethod.AUTOPAY);
  });

  it('autopay auto-fills when the bank has exactly one account', () => {
    const accounts = [acc('a2', 'HDFC Bank', AccountType.CREDIT)];
    const r = resolvePaymentSource('HDFC', 'autopay', accounts);
    expect(r.accountId).toBe('a2');
  });

  it('null institution → no account, upi default when rail null', () => {
    const r = resolvePaymentSource(null, null, []);
    expect(r.accountId).toBeNull();
    expect(r.paymentMethod).toBe(PaymentMethod.UPI);
  });

  it('fills accountId from a card last4 even when the institution is ambiguous', () => {
    const accounts = [
      { id: 'c1', institutionName: 'HDFC', type: AccountType.CREDIT, last4: '1234' },
      { id: 'c2', institutionName: 'HDFC', type: AccountType.CREDIT, last4: '9999' },
    ];
    const r = resolvePaymentSource('HDFC', 'card', accounts as any, '9999');
    expect(r.accountId).toBe('c2');
    expect(r.paymentMethod).toBe(PaymentMethod.CARD);
  });

  it('a unique card last4 wins over the institution heuristic', () => {
    // Institution would uniquely pick c1 (the only ICICI credit account), but a
    // matching last4 on a DIFFERENT account takes precedence.
    const accounts = [
      { id: 'c1', institutionName: 'ICICI', type: AccountType.CREDIT, last4: '1111' },
      { id: 'c2', institutionName: 'HDFC', type: AccountType.CREDIT, last4: '2222' },
    ];
    const r = resolvePaymentSource('ICICI', 'card', accounts as any, '2222');
    expect(r.accountId).toBe('c2');
  });

  it('falls back to the institution heuristic when the last4 matches nothing', () => {
    const accounts = [
      { id: 'c2', institutionName: 'HDFC', type: AccountType.CREDIT, last4: '9999' },
    ];
    const r = resolvePaymentSource('HDFC', 'card', accounts as any, '0000');
    expect(r.accountId).toBe('c2'); // no last4 match → institution uniquely picks c2
  });

  it('ignores last4 on a non-card rail (upi keeps institution behavior)', () => {
    const accounts = [acc('a1', 'HDFC Bank', AccountType.SAVINGS)];
    const r = resolvePaymentSource('HDFC', 'upi', accounts, '1234');
    expect(r.accountId).toBe('a1');
    expect(r.paymentMethod).toBe(PaymentMethod.UPI);
  });
});
