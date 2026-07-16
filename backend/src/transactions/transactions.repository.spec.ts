import { TransactionsRepository } from './transactions.repository';

function makeQb() {
  const calls: { method: string; args: any[] }[] = [];
  const qb: any = {};
  for (const m of ['where', 'orderBy', 'addOrderBy', 'andWhere', 'leftJoin', 'skip', 'take']) {
    qb[m] = (...args: any[]) => { calls.push({ method: m, args }); return qb; };
  }
  qb.getManyAndCount = async () => [[], 0];
  return { qb, calls };
}

function makeRepo(qb: any) {
  const repo: any = { createQueryBuilder: () => qb };
  return new TransactionsRepository(repo);
}

describe('TransactionsRepository source filter', () => {
  it('filters to credit accounts for source=card', async () => {
    const { qb, calls } = makeQb();
    await makeRepo(qb).findAllByUser('u1', { source: 'card' } as any);
    expect(calls.some((c) => c.method === 'leftJoin' && c.args[0] === 'tx.account')).toBe(true);
    const card = calls.find((c) => c.method === 'andWhere' && /srcAcc\.type = :creditType/.test(c.args[0]));
    expect(card).toBeTruthy();
    expect(card!.args[1]).toEqual({ creditType: 'credit' });
  });
  it('excludes credit accounts (and allows null) for source=bank', async () => {
    const { qb, calls } = makeQb();
    await makeRepo(qb).findAllByUser('u1', { source: 'bank' } as any);
    const bank = calls.find((c) => c.method === 'andWhere' && /srcAcc\.id IS NULL/.test(c.args[0]));
    expect(bank).toBeTruthy();
  });
  it('adds no join when source is absent', async () => {
    const { qb, calls } = makeQb();
    await makeRepo(qb).findAllByUser('u1', {} as any);
    expect(calls.some((c) => c.method === 'leftJoin')).toBe(false);
  });
});
