import { BadRequestException } from '@nestjs/common';
import { CreditCardService } from './credit-card.service';
import { AccountType, TransactionType } from '../common/enums';

describe('CreditCardService.getSummary', () => {
  const account = {
    id: 'acc-1',
    type: AccountType.CREDIT,
    balance: -3000,
    name: 'HDFC Card',
    institutionName: 'HDFC',
  };

  const card = {
    id: 'card-1',
    accountId: 'acc-1',
    creditLimit: 100000,
    statementDay: 18,
    graceDays: 18,
    network: 'visa',
    last4: '1234',
    rewardRate: '2%',
    statementDate: null,
    statementBilled: null,
    statementMinDue: null,
    statementDueDate: null,
    statementRewards: null,
  };

  const categories = [{ id: 'c1', name: 'Shopping', color: '#c97d8c' }];

  const makeService = (overrides: { accountType?: AccountType } = {}) => {
    const accountsService = {
      findOne: jest.fn().mockResolvedValue({
        ...account,
        type: overrides.accountType ?? account.type,
      }),
    };
    const transactionsService = {};
    const categoriesService = {
      findAll: jest.fn().mockResolvedValue(categories),
    };
    const txRepo = {
      find: jest.fn((opts: { where: { type: TransactionType } }) => {
        if (opts.where.type === TransactionType.EXPENSE) {
          return Promise.resolve([
            {
              // Today, so it always falls within the current (unbilled) cycle
              // regardless of when this test runs.
              amount: 2000,
              date: new Date(),
              type: TransactionType.EXPENSE,
              categoryId: 'c1',
            },
          ]);
        }
        return Promise.resolve([]);
      }),
    };
    const cardRepo = {
      findOne: jest.fn().mockResolvedValue({ ...card }),
      save: jest.fn((c) => Promise.resolve(c)),
    };

    const service = new CreditCardService(
      accountsService as never,
      transactionsService as never,
      categoriesService as never,
      txRepo as never,
      cardRepo as never,
    );
    return { service, accountsService, categoriesService, txRepo, cardRepo };
  };

  it('computes outstanding from the account balance and cycleByCategory from expense txns', async () => {
    const { service } = makeService();
    const summary = await service.getSummary('acc-1', 'user-1');

    expect(summary.outstanding).toBe(3000);
    expect(summary.cycleByCategory).toEqual([
      { categoryId: 'c1', label: 'Shopping', value: 2000, color: '#c97d8c' },
    ]);
    expect(summary.creditLimit).toBe(100000);
    expect(summary.accountId).toBe('acc-1');
    expect(summary.name).toBe('HDFC Card');
  });

  it('rejects a non-credit account', async () => {
    const { service } = makeService({ accountType: AccountType.CHECKING });
    await expect(service.getSummary('acc-1', 'user-1')).rejects.toThrow(
      BadRequestException,
    );
  });
});
