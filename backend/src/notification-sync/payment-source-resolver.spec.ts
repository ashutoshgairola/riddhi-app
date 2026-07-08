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
});
