import { BadRequestException } from '@nestjs/common';
import { CreditCardService } from './credit-card.service';
import { AccountType, PaymentMethod, TransactionType } from '../common/enums';

function make(overrides: any = {}) {
  const accountsService = {
    findOne: jest.fn(async (id: string) =>
      id === 'card-1'
        ? { id: 'card-1', type: AccountType.CREDIT, name: 'ICICI', balance: -34280 }
        : { id: 'bank-1', type: AccountType.SAVINGS, name: 'HDFC', balance: overrides.bankBal ?? 100000 }),
  };
  const categoriesService = { findAll: jest.fn(async () => overrides.cats ?? [{ id: 'cat-other', name: 'Other' }]) };
  const txCreate = jest.fn(async (uid: string, dto: any) => ({ id: 'tx-1', ...dto }));
  const transactionsService = { create: txCreate };
  const svc = new CreditCardService(
    accountsService as any, transactionsService as any, categoriesService as any,
    {} as any, {} as any, // txRepo, cardRepo (unused in pay)
  );
  return { svc, txCreate, accountsService };
}

describe('CreditCardService.pay', () => {
  it('rejects a non-credit destination', async () => {
    const { svc } = make();
    await expect(svc.pay('bank-1', 'u1', { fromAccountId: 'bank-1', amount: 100 } as any)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects insufficient source balance', async () => {
    const { svc } = make({ bankBal: 50 });
    await expect(svc.pay('card-1', 'u1', { fromAccountId: 'bank-1', amount: 1000 } as any)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects when the user has no categories', async () => {
    const { svc } = make({ cats: [] });
    await expect(svc.pay('card-1', 'u1', { fromAccountId: 'bank-1', amount: 1000 } as any)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('creates a transfer bank->card with a resolved category', async () => {
    const { svc, txCreate } = make();
    await svc.pay('card-1', 'u1', { fromAccountId: 'bank-1', amount: 1000 } as any);
    expect(txCreate).toHaveBeenCalledWith('u1', expect.objectContaining({
      type: TransactionType.TRANSFER, accountId: 'bank-1', destinationAccountId: 'card-1',
      amount: 1000, paymentMethod: PaymentMethod.NETBANKING, categoryId: 'cat-other',
    }));
  });
  it('rejects paying a card bill from a credit-card source account', async () => {
    const { svc, txCreate, accountsService } = make();
    accountsService.findOne = jest
      .fn()
      .mockResolvedValueOnce({ id: 'card-1', type: AccountType.CREDIT, name: 'ICICI', balance: -34280 }) // target card
      .mockResolvedValueOnce({ id: 'card-2', type: AccountType.CREDIT, name: 'HDFC CC', balance: 100000 }); // source
    await expect(
      svc.pay('card-1', 'u1', { fromAccountId: 'card-2', amount: 500 } as any),
    ).rejects.toThrow('Cannot pay a card bill from a credit card');
    expect(txCreate).not.toHaveBeenCalled();
  });
});
