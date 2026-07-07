import { SmsSyncService } from './sms-sync.service';

describe('SmsSyncService payment method hint', () => {
  const svc = new SmsSyncService();
  it('tags a credit-card spend as card', () => {
    const r = svc.parse('Rs.2499 spent on ICICI Credit Card XX8830 at AMAZON on 23-04');
    expect(r.paymentMethod).toBe('card');
  });
  it('tags a UPI debit as upi', () => {
    const r = svc.parse('Rs.649 debited from HDFC Bank a/c XX4521 to SWIGGY via UPI');
    expect(r.paymentMethod).toBe('upi');
  });
  it('tags an autopay/SIP/ACH mandate as autopay', () => {
    const r = svc.parse('Rs.10000 debited via ACH E-Mandate SIP from HDFC a/c XX4521');
    expect(r.paymentMethod).toBe('autopay');
  });
});
