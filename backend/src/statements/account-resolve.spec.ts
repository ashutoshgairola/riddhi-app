import { resolveAccountByLast4, ResolvableAccount } from './account-resolve';
import { AccountType } from '../common/enums';

const acc = (o: Partial<ResolvableAccount>): ResolvableAccount => ({
  id: 'a', type: AccountType.CREDIT, institutionName: 'HDFC', last4: '1234', ...o,
});

describe('resolveAccountByLast4', () => {
  it('unique last4 → that account', () => {
    const r = resolveAccountByLast4([acc({ id: 'x', last4: '1234' }), acc({ id: 'y', last4: '9999' })], '1234');
    expect(r).toEqual({ accountId: 'x', ambiguous: false });
  });
  it('no last4 given → null, not ambiguous', () => {
    expect(resolveAccountByLast4([acc({})], null)).toEqual({ accountId: null, ambiguous: false });
  });
  it('no match → null', () => {
    expect(resolveAccountByLast4([acc({ last4: '1111' })], '2222')).toEqual({ accountId: null, ambiguous: false });
  });
  it('two accounts share the last4 → ambiguous', () => {
    const r = resolveAccountByLast4([acc({ id: 'x', last4: '1234' }), acc({ id: 'y', last4: '1234' })], '1234');
    expect(r).toEqual({ accountId: null, ambiguous: true });
  });
});
