import { deriveSource } from './paymentSource';

const hdfc = { institutionName: 'HDFC Bank', name: 'HDFC Savings', type: 'savings' };
const icici = { institutionName: 'ICICI Bank', name: 'Amazon Pay', type: 'credit' };

describe('deriveSource', () => {
  it('labels a credit account CC', () => {
    expect(deriveSource('card', icici)).toEqual({ kind: 'card', label: 'ICICI CC' });
  });
  it('labels a bank UPI', () => {
    expect(deriveSource('upi', hdfc)).toEqual({ kind: 'upi', label: 'HDFC UPI' });
  });
  it('labels autopay ACH with the auto marker', () => {
    expect(deriveSource('autopay', hdfc)).toEqual({ kind: 'autopay', label: 'HDFC ACH', autopay: true });
  });
  it('derives card from a null method on a credit account', () => {
    expect(deriveSource(null, icici)).toEqual({ kind: 'card', label: 'ICICI CC' });
  });
  it('derives upi from a null method on a bank account', () => {
    expect(deriveSource(undefined, hdfc)).toEqual({ kind: 'upi', label: 'HDFC UPI' });
  });
  it('falls back to Cash with no account', () => {
    expect(deriveSource(null, undefined)).toEqual({ kind: 'cash', label: 'Cash' });
  });
});
