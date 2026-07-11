import { computeGoalFields, GoalsService } from './goals.service';
import { GoalType, GoalStatus } from '../common/enums';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TransactionType } from '../common/enums';

function baseGoal(overrides: any = {}): any {
  return {
    id: 'g1',
    name: 'Emergency Fund',
    type: GoalType.SAVINGS,
    targetAmount: 100000,
    currentAmount: 0,
    startDate: new Date('2026-01-01'),
    targetDate: new Date('2026-12-31'),
    accountId: null,
    account: null,
    priority: 1,
    status: GoalStatus.ACTIVE,
    contributionFrequency: null,
    contributionAmount: null,
    color: null,
    notes: null,
    userId: 'u1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('computeGoalFields', () => {
  it('derives saved/progress/remaining from the linked account balance', () => {
    const goal = baseGoal({
      accountId: 'a1',
      account: { id: 'a1', balance: 25000 },
    });
    const result = computeGoalFields(goal);
    expect(result.saved).toBe(25000);
    expect(result.progressPct).toBe(25);
    expect(result.remaining).toBe(75000);
  });

  it('falls back to currentAmount when no account is linked', () => {
    const goal = baseGoal({ currentAmount: 40000, account: null });
    const result = computeGoalFields(goal);
    expect(result.saved).toBe(40000);
    expect(result.progressPct).toBe(40);
    expect(result.remaining).toBe(60000);
  });

  it('caps progress at 100 and never goes below 0', () => {
    const goal = baseGoal({ accountId: 'a1', account: { balance: 150000 } });
    const result = computeGoalFields(goal);
    expect(result.progressPct).toBe(100);
    expect(result.remaining).toBe(0);
  });
});

describe('GoalsService.contribute', () => {
  function makeService(goal: any) {
    const goalsRepository = {
      findOneByUser: jest.fn().mockResolvedValue(goal),
    };
    const transactionsService = {
      create: jest.fn().mockResolvedValue({ id: 'tx1' }),
    };
    const categoriesService = {
      findAll: jest.fn().mockResolvedValue([{ id: 'cat-transfer', name: 'Transfer' }]),
      create: jest.fn(),
    };
    const events = { emit: jest.fn() };
    const svc = new GoalsService(
      goalsRepository as any,
      events as any,
      transactionsService as any,
      categoriesService as any,
    );
    return { svc, goalsRepository, transactionsService, categoriesService };
  }

  const linkedGoal = {
    id: 'g1',
    name: 'Emergency Fund',
    targetAmount: 100000,
    currentAmount: 0,
    accountId: 'goal-acct',
    account: { id: 'goal-acct', balance: 0 },
  };

  it('creates a transfer from the source into the goal account', async () => {
    const { svc, transactionsService } = makeService({ ...linkedGoal });
    await svc.contribute('g1', 'u1', { amount: 5000, sourceAccountId: 'src-acct' });
    expect(transactionsService.create).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        type: TransactionType.TRANSFER,
        accountId: 'src-acct',
        destinationAccountId: 'goal-acct',
        amount: 5000,
        categoryId: 'cat-transfer',
      }),
    );
  });

  it('throws when the goal is not found', async () => {
    const { svc } = makeService(null);
    await expect(
      svc.contribute('g1', 'u1', { amount: 5000, sourceAccountId: 'src-acct' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws when the goal has no linked account', async () => {
    const { svc } = makeService({ ...linkedGoal, accountId: null, account: null });
    await expect(
      svc.contribute('g1', 'u1', { amount: 5000, sourceAccountId: 'src-acct' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when source equals the goal account', async () => {
    const { svc } = makeService({ ...linkedGoal });
    await expect(
      svc.contribute('g1', 'u1', { amount: 5000, sourceAccountId: 'goal-acct' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
