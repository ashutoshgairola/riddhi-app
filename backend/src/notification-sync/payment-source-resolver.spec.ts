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

  it('leaves accountId null when the institution is ambiguous', () => {
    const accounts = [
      acc('a1', 'HDFC Bank', AccountType.SAVINGS),
      acc('a2', 'HDFC Bank', AccountType.CREDIT),
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

  it('null institution → no account, upi default when rail null', () => {
    const r = resolvePaymentSource(null, null, []);
    expect(r.accountId).toBeNull();
    expect(r.paymentMethod).toBe(PaymentMethod.UPI);
  });
});
