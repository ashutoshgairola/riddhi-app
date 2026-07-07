import { toTxView, toRecentTxView } from './adapters';
import type { ApiTransaction, ApiAccount } from './types';

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
