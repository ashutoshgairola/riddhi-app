import { AccountsService } from './accounts.service';
import { AccountType } from '../common/enums';

function makeService() {
  const saved: any = { id: 'acc-1', type: AccountType.CREDIT };
  const accountsRepo = { create: (d: any) => ({ ...d, id: 'acc-1' }), save: jest.fn(async () => saved) } as any;
  const cardRows: any[] = [];
  const cardRepo = { create: (d: any) => d, save: jest.fn(async (r: any) => { cardRows.push(r); return r; }) } as any;
  return { svc: new AccountsService(accountsRepo, cardRepo), cardRows, accountsRepo };
}

describe('AccountsService credit-card row creation', () => {
  it('creates a CreditCard row for a credit account with the given config', async () => {
    const { svc, cardRows } = makeService();
    await svc.create('user-1', { name: 'ICICI', type: AccountType.CREDIT, balance: -1000, creditLimit: 200000, statementDay: 18 } as any);
    expect(cardRows).toHaveLength(1);
    expect(cardRows[0]).toMatchObject({ accountId: 'acc-1', userId: 'user-1', creditLimit: 200000, statementDay: 18 });
  });
  it('does not create a CreditCard row for a non-credit account', async () => {
    const { svc, cardRows } = makeService();
    await svc.create('user-1', { name: 'HDFC', type: AccountType.SAVINGS, balance: 1000 } as any);
    expect(cardRows).toHaveLength(0);
  });
});
