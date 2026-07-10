import { matchSubscription } from './attach-transaction';

const sub = (over: any = {}) => ({ id: 's1', merchantDescriptor: 'netflix.com', accountId: 'a1', status: 'active', ...over });

describe('matchSubscription', () => {
  it('matches by normalized descriptor + account (4+ digit ref stripped)', () => {
    expect(matchSubscription('NETFLIX.COM 9982', 'a1', [sub()])?.id).toBe('s1');
  });
  it('does not match a different account', () => {
    expect(matchSubscription('NETFLIX.COM', 'a2', [sub()])).toBeNull();
  });
  it('does not match a cancelled subscription', () => {
    expect(matchSubscription('NETFLIX.COM', 'a1', [sub({ status: 'cancelled' })])).toBeNull();
  });
});
