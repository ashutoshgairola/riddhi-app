import { EventsService } from './events.service';
import { TransactionType } from '../common/enums';

function harness() {
  const event = { id: 'ev1', userId: 'u1', name: "Aarav's Birthday", budget: 25000, expenses: [] as any[] };
  const repo = {
    findOneByUser: jest.fn(async () => event),
    findExpense: jest.fn(async (id: string) => event.expenses.find((e) => e.id === id) ?? null),
    createExpense: jest.fn((d: any) => ({ id: 'x1', transactionId: null, actual: 0, paid: false, ...d })),
    saveExpense: jest.fn(async (e: any) => { if (!event.expenses.includes(e)) event.expenses.push(e); return e; }),
    removeExpense: jest.fn(async (e: any) => { event.expenses.splice(event.expenses.indexOf(e), 1); }),
  } as any;
  const tx = {
    create: jest.fn(async (_uid: string, dto: any) => ({ id: 'tx1', ...dto })),
    update: jest.fn(async () => ({})),
    remove: jest.fn(async () => undefined),
  } as any;
  return { svc: new EventsService(repo, tx), tx, event };
}

describe('EventsService paid sync', () => {
  it('addExpense(paid) creates an account-less expense transaction tagged to the event', async () => {
    const { svc, tx } = harness();
    await svc.addExpense('ev1', 'u1', { categoryId: 'c1', label: 'Cake', planned: 2500, actual: 2800, paid: true } as any);
    expect(tx.create).toHaveBeenCalledTimes(1);
    const dto = tx.create.mock.calls[0][1];
    expect(dto).toMatchObject({
      description: 'Cake', amount: 2800, type: TransactionType.EXPENSE,
      categoryId: 'c1', eventId: 'ev1', notes: "For Aarav's Birthday",
    });
    expect(dto.accountId).toBeUndefined();
  });

  it('addExpense(paid) with no actual defaults the amount to planned', async () => {
    const { svc, tx } = harness();
    await svc.addExpense('ev1', 'u1', { categoryId: 'c1', label: 'DJ', planned: 2000, paid: true } as any);
    expect(tx.create.mock.calls[0][1].amount).toBe(2000);
  });

  it('unpaid->paid via updateExpense creates the transaction', async () => {
    const { svc, tx, event } = harness();
    event.expenses.push({ id: 'x1', categoryId: 'c1', label: 'Cake', planned: 2500, actual: 0, paid: false, transactionId: null });
    await svc.updateExpense('ev1', 'x1', 'u1', { paid: true, actual: 2800 } as any);
    expect(tx.create).toHaveBeenCalledTimes(1);
    expect(event.expenses[0].transactionId).toBe('tx1');
  });

  it('paid->unpaid deletes the transaction and clears the link', async () => {
    const { svc, tx, event } = harness();
    event.expenses.push({ id: 'x1', categoryId: 'c1', label: 'Cake', planned: 2500, actual: 2800, paid: true, transactionId: 'tx1' });
    await svc.updateExpense('ev1', 'x1', 'u1', { paid: false } as any);
    expect(tx.remove).toHaveBeenCalledWith('tx1', 'u1');
    expect(event.expenses[0].transactionId).toBeNull();
  });

  it('paid->paid amount change updates the transaction', async () => {
    const { svc, tx, event } = harness();
    event.expenses.push({ id: 'x1', categoryId: 'c1', label: 'Cake', planned: 2500, actual: 2800, paid: true, transactionId: 'tx1' });
    await svc.updateExpense('ev1', 'x1', 'u1', { actual: 3000 } as any);
    expect(tx.update).toHaveBeenCalledWith('tx1', 'u1', expect.objectContaining({ amount: 3000 }));
  });

  it('removeExpense deletes the linked transaction first', async () => {
    const { svc, tx, event } = harness();
    event.expenses.push({ id: 'x1', categoryId: 'c1', label: 'Cake', planned: 2500, actual: 2800, paid: true, transactionId: 'tx1' });
    await svc.removeExpense('ev1', 'x1', 'u1');
    expect(tx.remove).toHaveBeenCalledWith('tx1', 'u1');
  });
});
