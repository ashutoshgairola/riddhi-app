import { TransactionsService } from './transactions.service';
import { TransactionType } from '../common/enums';

describe('TransactionsService eventId passthrough', () => {
  it('persists eventId from the dto onto the created transaction', async () => {
    const saved: any[] = [];
    const manager = { save: jest.fn(async (tx: any) => { saved.push(tx); return tx; }) };
    const dataSource = {
      createQueryRunner: () => ({
        connect: jest.fn(), startTransaction: jest.fn(),
        commitTransaction: jest.fn(), rollbackTransaction: jest.fn(),
        release: jest.fn(), manager,
      }),
    } as any;
    const repo = { create: (data: any) => data } as any;
    const accounts = {} as any;
    const events = { emit: jest.fn() } as any;
    const svc = new TransactionsService(repo, accounts, dataSource, events);

    await svc.create('user-1', {
      date: '2026-07-07', description: 'Cake', amount: 800,
      type: TransactionType.EXPENSE, categoryId: 'cat-1', eventId: 'ev-1',
    } as any);

    expect(saved[0].eventId).toBe('ev-1');
    expect(saved[0].accountId).toBeNull();
  });
});
