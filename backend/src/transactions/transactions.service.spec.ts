import { TransactionsService } from './transactions.service';
import { TransactionsRepository } from './transactions.repository';
import { TransactionType } from '../common/enums';

/** Fake TypeORM query builder that records calls, mirroring the pattern used
 * in transactions.repository.spec.ts, so we can assert the actual WHERE
 * clauses built for the account/date-range dedup query. */
function makeQb(rows: any[]) {
  const calls: { method: string; args: any[] }[] = [];
  const qb: any = {};
  for (const m of ['where', 'andWhere']) {
    qb[m] = (...args: any[]) => {
      calls.push({ method: m, args });
      return qb;
    };
  }
  qb.getMany = async () => rows;
  return { qb, calls };
}

describe('TransactionsService.findForAccountInRange', () => {
  it('delegates to the repository and returns its rows', async () => {
    const rows = [
      {
        id: 't1',
        date: new Date('2026-06-01'),
        amount: 499,
        type: TransactionType.EXPENSE,
        description: 'Swiggy',
        importFingerprint: null,
        accountId: 'a1',
      },
    ];
    const transactionsRepository = {
      findForAccountInRange: jest.fn().mockResolvedValue(rows),
    };
    const svc = new TransactionsService(
      transactionsRepository as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const from = new Date('2026-05-01');
    const to = new Date('2026-06-30');

    const result = await svc.findForAccountInRange('u1', 'a1', from, to);

    expect(transactionsRepository.findForAccountInRange).toHaveBeenCalledWith(
      'u1',
      'a1',
      from,
      to,
    );
    expect(result).toBe(rows);
  });

  it('repository queries by userId, accountId-or-destinationAccountId, and date BETWEEN', async () => {
    const rows = [{ id: 't2' }];
    const { qb, calls } = makeQb(rows);
    const repo: any = { createQueryBuilder: () => qb };
    const repository = new TransactionsRepository(repo);
    const from = new Date('2026-05-01');
    const to = new Date('2026-06-30');

    const result = await repository.findForAccountInRange(
      'u1',
      'a1',
      from,
      to,
    );

    expect(result).toBe(rows);
    const where = calls.find((c) => c.method === 'where');
    expect(where!.args).toEqual(['tx.userId = :userId', { userId: 'u1' }]);
    const accountClause = calls.find(
      (c) =>
        c.method === 'andWhere' &&
        /tx\.accountId = :accountId OR tx\.destinationAccountId = :accountId/.test(
          c.args[0],
        ),
    );
    expect(accountClause).toBeTruthy();
    expect(accountClause!.args[1]).toEqual({ accountId: 'a1' });
    const dateClause = calls.find(
      (c) => c.method === 'andWhere' && /tx\.date BETWEEN :from AND :to/.test(c.args[0]),
    );
    expect(dateClause).toBeTruthy();
    expect(dateClause!.args[1]).toEqual({ from, to });
  });
});
