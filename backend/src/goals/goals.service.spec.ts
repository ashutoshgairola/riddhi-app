import { computeGoalFields, GoalsService } from './goals.service';
import { GoalType, GoalStatus } from '../common/enums';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TransactionType } from '../common/enums';
import { GOAL_UPDATED } from '../notifications/notification-events';

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

describe('GoalsService.update relink', () => {
  it('recomputes progress from the newly linked account and emits GOAL_UPDATED', async () => {
    const legacyGoal = baseGoal({
      id: 'g1',
      targetAmount: 100000,
      currentAmount: 0,
      accountId: null,
      account: null,
    });
    // After relinking + save, a fresh load carries the funded account relation.
    const relinkedGoal = baseGoal({
      id: 'g1',
      targetAmount: 100000,
      currentAmount: 0,
      accountId: 'a1',
      account: { id: 'a1', balance: 50000 },
    });
    const goalsRepository = {
      findOneByUser: jest
        .fn()
        .mockResolvedValueOnce(legacyGoal)
        .mockResolvedValueOnce(relinkedGoal),
      // save() returns the entity with the stale (null) relation still attached.
      save: jest.fn().mockResolvedValue({ ...legacyGoal, accountId: 'a1' }),
    };
    const events = { emit: jest.fn() };
    const svc = new GoalsService(
      goalsRepository as any,
      events as any,
      {} as any,
      {} as any,
    );

    const result = await svc.update('g1', 'u1', { accountId: 'a1' } as any);

    expect(result.saved).toBe(50000);
    expect(result.progressPct).toBe(50);
    expect(events.emit).toHaveBeenCalledWith(
      GOAL_UPDATED,
      expect.objectContaining({ previousPct: 0, newPct: 50 }),
    );
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

  it('creates the Transfer category when none exists and uses it', async () => {
    const goalsRepository = {
      findOneByUser: jest.fn().mockResolvedValue({ ...linkedGoal }),
    };
    const transactionsService = { create: jest.fn().mockResolvedValue({ id: 'tx1' }) };
    const categoriesService = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'new-cat', name: 'Transfer' }),
    };
    const events = { emit: jest.fn() };
    const svc = new GoalsService(
      goalsRepository as any,
      events as any,
      transactionsService as any,
      categoriesService as any,
    );

    await svc.contribute('g1', 'u1', { amount: 5000, sourceAccountId: 'src-acct' });

    expect(categoriesService.create).toHaveBeenCalledWith('u1', { name: 'Transfer' });
    expect(transactionsService.create).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ categoryId: 'new-cat' }),
    );
  });

  it('emits GOAL_UPDATED when the transfer moves progress', async () => {
    const before = { ...linkedGoal, account: { id: 'goal-acct', balance: 0 } };
    const after = { ...linkedGoal, account: { id: 'goal-acct', balance: 30000 } };
    const goalsRepository = {
      findOneByUser: jest
        .fn()
        .mockResolvedValueOnce(before) // initial load
        .mockResolvedValueOnce(after), // reload after the transfer
    };
    const transactionsService = { create: jest.fn().mockResolvedValue({ id: 'tx1' }) };
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

    const result = await svc.contribute('g1', 'u1', {
      amount: 30000,
      sourceAccountId: 'src-acct',
    });

    expect(result.progressPct).toBe(30);
    expect(events.emit).toHaveBeenCalledWith(
      GOAL_UPDATED,
      expect.objectContaining({ goalId: 'g1', previousPct: 0, newPct: 30 }),
    );
  });
});
