import { transactionBalanceDeltas } from './transactions.service';
import { TransactionType } from '../common/enums';

describe('transactionBalanceDeltas', () => {
  it('income credits the source account', () => {
    expect(transactionBalanceDeltas(TransactionType.INCOME, 1000)).toEqual({
      source: 1000,
      destination: 0,
    });
  });

  it('expense debits the source account', () => {
    expect(transactionBalanceDeltas(TransactionType.EXPENSE, 1000)).toEqual({
      source: -1000,
      destination: 0,
    });
  });

  it('transfer debits source and credits destination equally (net-worth neutral)', () => {
    const d = transactionBalanceDeltas(TransactionType.TRANSFER, 30000);
    expect(d).toEqual({ source: -30000, destination: 30000 });
    expect(d.source + d.destination).toBe(0); // conserves money
  });
});
