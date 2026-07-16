import { derivePaymentMethod } from './transactions.service';
import { AccountType, PaymentMethod } from '../common/enums';
import { TransactionsService } from './transactions.service';
import { TransactionType } from '../common/enums';

describe('derivePaymentMethod', () => {
  it('maps a credit account to card', () => {
    expect(derivePaymentMethod(AccountType.CREDIT)).toBe(PaymentMethod.CARD);
  });
  it('maps a bank account to upi', () => {
    expect(derivePaymentMethod(AccountType.SAVINGS)).toBe(PaymentMethod.UPI);
    expect(derivePaymentMethod(AccountType.CHECKING)).toBe(PaymentMethod.UPI);
  });
  it('maps no account to cash', () => {
    expect(derivePaymentMethod(null)).toBe(PaymentMethod.CASH);
    expect(derivePaymentMethod(undefined)).toBe(PaymentMethod.CASH);
  });
});

function makeSvc(accountType?: AccountType) {
  const saved: any[] = [];
  const manager = {
    save: jest.fn(async (tx: any) => { saved.push(tx); return tx; }),
    findOne: jest.fn(async () => ({ id: 'acc-1', userId: 'u1', balance: 1000 })),
  };
  const dataSource = {
    createQueryRunner: () => ({
      connect: jest.fn(), startTransaction: jest.fn(),
      commitTransaction: jest.fn(), rollbackTransaction: jest.fn(),
      release: jest.fn(), manager,
    }),
  } as any;
  const repo = { create: (d: any) => d } as any;
  const accounts = { findOne: jest.fn(async () => ({ type: accountType })) } as any;
  const events = { emit: jest.fn() } as any;
  return { svc: new TransactionsService(repo, accounts, dataSource, events), saved };
}

describe('TransactionsService payment method on create', () => {
  const base = {
    date: '2026-07-07', description: 'x', amount: 100,
    type: TransactionType.EXPENSE, categoryId: 'cat-1',
  };
  it('derives card for a credit account', async () => {
    const { svc, saved } = makeSvc(AccountType.CREDIT);
    await svc.create('u1', { ...base, accountId: 'acc-1' } as any);
    expect(saved[0].paymentMethod).toBe(PaymentMethod.CARD);
  });
  it('derives cash when no account', async () => {
    const { svc, saved } = makeSvc();
    await svc.create('u1', base as any);
    expect(saved[0].paymentMethod).toBe(PaymentMethod.CASH);
  });
  it('honours an explicit paymentMethod from the dto', async () => {
    const { svc, saved } = makeSvc(AccountType.CREDIT);
    await svc.create('u1', { ...base, accountId: 'acc-1', paymentMethod: PaymentMethod.AUTOPAY } as any);
    expect(saved[0].paymentMethod).toBe(PaymentMethod.AUTOPAY);
  });
});
