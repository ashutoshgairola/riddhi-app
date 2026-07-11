import { computeGoalFields } from './goals.service';
import { GoalType, GoalStatus } from '../common/enums';

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
