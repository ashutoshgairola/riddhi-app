import { toTxView, toRecentTxView, toGoalView, toNotificationView } from './adapters';
import type { ApiTransaction, ApiAccount, ApiGoal, ApiNotification } from './types';

const tx: ApiTransaction = {
  id: 't1', date: '2026-07-01T00:00:00.000Z', description: 'Amazon', amount: 2499,
  type: 'expense', categoryId: 'c1', status: 'cleared', tags: [], attachments: [],
  isRecurring: false, paymentMethod: 'card', accountId: 'a1',
};
const acc: ApiAccount = {
  id: 'a1', name: 'Amazon Pay', type: 'credit', balance: 0, currency: 'INR',
  isConnected: false, includeInNetWorth: true, lastUpdated: '', institutionName: 'ICICI Bank',
};

describe('adapter source', () => {
  it('sets source on toTxView from the account', () => {
    expect(toTxView(tx, undefined, acc).source).toEqual({ kind: 'card', label: 'ICICI CC' });
  });
  it('sets source on toRecentTxView', () => {
    expect(toRecentTxView(tx, undefined, 'Today', acc).source).toEqual({ kind: 'card', label: 'ICICI CC' });
  });
  it('derives cash when no account given', () => {
    expect(toTxView({ ...tx, paymentMethod: null, accountId: undefined }, undefined, undefined).source)
      .toEqual({ kind: 'cash', label: 'Cash' });
  });
});

const apiGoal = {
  id: 'g1',
  name: 'Emergency Fund',
  type: 'savings',
  targetAmount: 100000,
  currentAmount: 0,
  startDate: '2026-01-01',
  targetDate: '2026-12-31',
  accountId: 'a1',
  priority: 1,
  status: 'active',
  saved: 25000,
  remaining: 75000,
} as ApiGoal;

describe('toGoalView', () => {
  it('threads id and accountId and uses backend saved/remaining', () => {
    const v = toGoalView(apiGoal);
    expect(v.id).toBe('g1');
    expect(v.accountId).toBe('a1');
    expect(v.saved).toBe(25000);
    expect(v.remaining).toBe(75000);
    expect(v.current).toBe(25000); // current mirrors saved for display
    expect(v.target).toBe(100000);
  });
});

describe('toNotificationView', () => {
  it('carries the notification id and deep-link data', () => {
    const n: ApiNotification = {
      id: 'n1', type: 'large_transaction', title: 'T', body: 'B',
      read: false, createdAt: '2026-07-12T00:00:00.000Z',
      data: { screen: 'tx-detail', id: 't1' },
    };
    const v = toNotificationView(n);
    expect(v.id).toBe('n1');
    expect(v.data).toEqual({ screen: 'tx-detail', id: 't1' });
    expect(v.unread).toBe(true);
  });
});
