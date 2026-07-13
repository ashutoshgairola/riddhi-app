import { isOtpMessage, parseSms } from './sms-parse';

describe('isOtpMessage', () => {
  it('flags an OTP that carries an amount', () => {
    expect(
      isOtpMessage('OTP is 867317 for txn of INR 1190.00 at BUNDL TECHN on HDFC Bank Card'),
    ).toBe(true);
  });
  it('does not flag a real debit alert whose footer mentions OTP', () => {
    expect(
      isOtpMessage('Rs.1190 spent on HDFC Bank Card x8374 at BUNDL TECHNOLOGIES. Never share your OTP with anyone.'),
    ).toBe(false);
  });
});

describe('parseSms', () => {
  it('extracts amount, type, bank, last4 from a card spend', () => {
    const p = parseSms('Rs.499 spent on HDFC Bank Card xx1234 at SWIGGY');
    expect(p.amount).toBe(499);
    expect(p.type).toBe('expense');
    expect(p.bank).toBe('HDFC Bank');
    expect(p.last4).toBe('1234');
    expect(p.paymentMethod).toBe('card');
  });
  it('returns null amount for a message with no currency', () => {
    expect(parseSms('Your ride is arriving').amount).toBeNull();
  });
});
