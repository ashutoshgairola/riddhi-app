import { NotificationsListener } from './notifications.listener';
import { NotificationType, TransactionType } from '../common/enums';

function setup(budgets: any[] = []) {
  const notifications = { create: jest.fn().mockResolvedValue({ id: 'n1' }) } as any;
  const budgetsService = { findAll: jest.fn().mockResolvedValue(budgets) } as any;
  const config = { get: jest.fn().mockReturnValue('20000') } as any;
  const listener = new NotificationsListener(notifications, budgetsService, config);
  return { listener, notifications };
}

describe('NotificationsListener', () => {
  it('creates a large_transaction notification over threshold', async () => {
    const { listener, notifications } = setup();
    await listener.onTransactionCreated({
      userId: 'u1',
      transaction: {
        id: 't1',
        amount: 28000,
        type: TransactionType.EXPENSE,
        description: 'Rent',
      } as any,
    });
    expect(notifications.create).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        type: NotificationType.LARGE_TRANSACTION,
        data: { screen: 'tx-detail', id: 't1' },
      }),
    );
  });

  it('ignores income transactions for large-tx', async () => {
    const { listener, notifications } = setup();
    await listener.onTransactionCreated({
      userId: 'u1',
      transaction: { id: 't1', amount: 50000, type: TransactionType.INCOME } as any,
    });
    expect(notifications.create).not.toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ type: NotificationType.LARGE_TRANSACTION }),
    );
  });

  it('fires a budget_alert when a budget crosses 75%', async () => {
    const { listener, notifications } = setup([
      { name: 'April', totalAllocated: 10000, totalSpent: 8000 },
    ]);
    // before this ₹1000 tx: 7000/10000 = 0.7; after: 0.8 → crosses 0.75
    await listener.onTransactionCreated({
      userId: 'u1',
      transaction: { id: 't2', amount: 1000, type: TransactionType.EXPENSE } as any,
    });
    expect(notifications.create).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ type: NotificationType.BUDGET_ALERT }),
    );
  });

  it('creates a goal_progress notification on milestone crossing', async () => {
    const { listener, notifications } = setup();
    await listener.onGoalUpdated({ userId: 'u1', goalId: 'g1', previousPct: 40, newPct: 55 });
    expect(notifications.create).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        type: NotificationType.GOAL_PROGRESS,
        data: { screen: 'goal-detail', id: 'g1' },
      }),
    );
  });
});
