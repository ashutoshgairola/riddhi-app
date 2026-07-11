import { NotificationsScheduler } from './notifications.scheduler';
import { NotificationType } from '../common/enums';

function setup(opts: {
  budgets?: any[];
  goals?: any[];
  overview?: any;
  aiText?: string | null;
  activeUserIds?: string[];
  dueSubs?: any[];
}) {
  const notifications = { create: jest.fn().mockResolvedValue({ id: 'n' }) } as any;
  const budgets = { findAll: jest.fn().mockResolvedValue(opts.budgets ?? []) } as any;
  const goals = { findAll: jest.fn().mockResolvedValue(opts.goals ?? []) } as any;
  const reports = {
    getOverview: jest.fn().mockResolvedValue(opts.overview ?? { netIncome: 24500 }),
  } as any;
  const client =
    opts.aiText == null
      ? null
      : ({
          messages: {
            create: jest
              .fn()
              .mockResolvedValue({ content: [{ type: 'text', text: opts.aiText }] }),
          },
        } as any);
  const config = { get: jest.fn().mockReturnValue('claude-sonnet-5') } as any;
  const prefsRepo = { find: jest.fn().mockResolvedValue([{ userId: 'u1' }]) } as any;
  const subscriptions = {
    allActiveUserIds: jest.fn().mockResolvedValue(opts.activeUserIds ?? []),
    dueForReminder: jest.fn().mockResolvedValue(opts.dueSubs ?? []),
    markReminded: jest.fn().mockResolvedValue(undefined),
    rollForwardElapsedRenewals: jest.fn(async () => undefined),
  } as any;
  const scheduler = new NotificationsScheduler(
    notifications,
    budgets,
    goals,
    reports,
    client,
    config,
    prefsRepo,
    subscriptions,
  );
  return { scheduler, notifications, subscriptions };
}

describe('NotificationsScheduler', () => {
  it('creates a munshi_suggestion when noteworthy and AI returns one', async () => {
    const { scheduler, notifications } = setup({
      budgets: [{ name: 'April', totalAllocated: 10000, totalSpent: 8000, categories: [] }],
      aiText: '{"title":"Slow down","body":"80% of April budget gone, beta."}',
    });
    await scheduler.generateMunshiForUser('u1');
    expect(notifications.create).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        type: NotificationType.MUNSHI_SUGGESTION,
        data: { screen: 'chat' },
      }),
    );
  });

  it('skips when the snapshot is not noteworthy (no AI call, no notification)', async () => {
    const { scheduler, notifications } = setup({
      budgets: [{ name: 'April', totalAllocated: 10000, totalSpent: 500, categories: [] }],
      goals: [],
      aiText: '{"title":"x","body":"y"}',
    });
    await scheduler.generateMunshiForUser('u1');
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('skips when the AI client is absent', async () => {
    const { scheduler, notifications } = setup({
      budgets: [{ name: 'April', totalAllocated: 10000, totalSpent: 9000, categories: [] }],
      aiText: null,
    });
    await scheduler.generateMunshiForUser('u1');
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('creates a monthly_report notification', async () => {
    const { scheduler, notifications } = setup({ overview: { netIncome: 24500 } });
    await scheduler.generateMonthlyForUser('u1');
    expect(notifications.create).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        type: NotificationType.MONTHLY_REPORT,
        data: { screen: 'reports' },
      }),
    );
  });

  it('sends a subscription_renewal notification and marks it reminded', async () => {
    const { scheduler, notifications, subscriptions } = setup({
      activeUserIds: ['u1'],
      dueSubs: [{ id: 's1', name: 'Netflix', amount: 499, nextRenewalDate: '2026-05-03' }],
    });
    await scheduler.runSubscriptionReminders();
    expect(notifications.create).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        type: NotificationType.SUBSCRIPTION_RENEWAL,
        data: { screen: 'subscriptions', id: 's1' },
      }),
    );
    expect(subscriptions.markReminded).toHaveBeenCalledWith('s1', '2026-05-03');
  });

  it('does nothing when no subscriptions are due', async () => {
    const { scheduler, notifications } = setup({ activeUserIds: ['u1'], dueSubs: [] });
    await scheduler.runSubscriptionReminders();
    expect(notifications.create).not.toHaveBeenCalled();
  });
});
