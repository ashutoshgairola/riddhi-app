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
              id: 'tx-swipe-1',
              description: 'Grocery run',
              amount: 2000,
              date: new Date(),
              type: TransactionType.EXPENSE,
              categoryId: 'c1',
            },
          ]);
        }
        if (opts.where.type === TransactionType.TRANSFER) {
          return Promise.resolve([
            {
              id: 'tx-payment-1',
              description: 'HDFC Card — bill paid',
              amount: 5000,
              // Yesterday, so it sorts after today's swipe when newest-first.
              date: new Date(Date.now() - 86400000),
              type: TransactionType.TRANSFER,
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

  it('returns a merged, newest-first transactions ledger with signed swipe/payment amounts', async () => {
    const { service } = makeService();
    const summary = await service.getSummary('acc-1', 'user-1');

    expect(summary.transactions).toEqual([
      {
        id: 'tx-swipe-1',
        description: 'Grocery run',
        amount: -2000,
        date: expect.any(String),
        categoryId: 'c1',
        kind: 'swipe',
      },
      {
        id: 'tx-payment-1',
        description: 'HDFC Card — bill paid',
        amount: 5000,
        date: expect.any(String),
        categoryId: 'c1',
        kind: 'payment',
      },
    ]);
  });

  it('rejects a non-credit account', async () => {
    const { service } = makeService({ accountType: AccountType.CHECKING });
    await expect(service.getSummary('acc-1', 'user-1')).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('updateConfig upsert (legacy card)', () => {
  let service: CreditCardService;
  let cardRepo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let accountsService: { findOne: jest.Mock };

  beforeEach(() => {
    cardRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };
    accountsService = {
      findOne: jest.fn(),
    };
    service = new CreditCardService(
      accountsService as never,
      {} as never,
      {} as never,
      {} as never,
      cardRepo as never,
    );
  });

  it('creates the row from defaults when none exists, then applies the dto', async () => {
    cardRepo.findOne = jest.fn().mockResolvedValue(null); // no existing row
    accountsService.findOne = jest
      .fn()
      .mockResolvedValue({ id: 'acc1', type: AccountType.CREDIT, name: 'HDFC', balance: -5000 });
    const created: any = { accountId: 'acc1', userId: 'u1', creditLimit: 0, statementDay: 1, graceDays: 18 };
    cardRepo.create = jest.fn().mockReturnValue(created);
    cardRepo.save = jest.fn().mockImplementation(async (c) => c);
    // getSummary re-reads the row; stub it to short-circuit after the save
    const getSummary = jest.spyOn(service, 'getSummary').mockResolvedValue({ ok: true } as any);

    await service.updateConfig('acc1', 'u1', { creditLimit: 200000, statementDay: 5 });

    expect(cardRepo.create).toHaveBeenCalledWith({ accountId: 'acc1', userId: 'u1' });
    expect(cardRepo.save).toHaveBeenCalledWith(expect.objectContaining({ creditLimit: 200000, statementDay: 5 }));
    expect(getSummary).toHaveBeenCalledWith('acc1', 'u1');
  });

  it('rejects setting up a non-credit account', async () => {
    cardRepo.findOne = jest.fn().mockResolvedValue(null);
    accountsService.findOne = jest.fn().mockResolvedValue({ id: 'acc1', type: AccountType.CHECKING, name: 'SBI', balance: 100 });
    await expect(service.updateConfig('acc1', 'u1', { creditLimit: 1 })).rejects.toThrow('Account is not a credit card');
    expect(cardRepo.create).not.toHaveBeenCalled();
  });

  it('updates in place when the row already exists (no create)', async () => {
    const existing: any = { accountId: 'acc1', userId: 'u1', creditLimit: 0, statementDay: 1 };
    cardRepo.findOne = jest.fn().mockResolvedValue(existing);
    cardRepo.save = jest.fn().mockImplementation(async (c) => c);
    cardRepo.create = jest.fn();
    jest.spyOn(service, 'getSummary').mockResolvedValue({ ok: true } as any);
    await service.updateConfig('acc1', 'u1', { creditLimit: 50000 });
    expect(cardRepo.create).not.toHaveBeenCalled();
    expect(cardRepo.save).toHaveBeenCalledWith(expect.objectContaining({ creditLimit: 50000 }));
  });
});
