import { NotificationsService } from './notifications.service';
import { NotificationType } from '../common/enums';

function make(prefs: Record<string, boolean>) {
  const repo = {
    findByUser: jest.fn(),
    findOneByUser: jest.fn(),
    save: jest.fn((n) => Promise.resolve({ id: 'n1', ...n })),
    markAllRead: jest.fn(),
    create: jest.fn((n) => n),
  } as any;
  const push = { send: jest.fn().mockResolvedValue(undefined) } as any;
  const tokenRepo = { upsert: jest.fn(), delete: jest.fn() } as any;
  const users = { getPreferences: jest.fn().mockResolvedValue(prefs) } as any;
  const svc = new NotificationsService(repo, push, tokenRepo, users);
  return { svc, repo, push };
}

const base = {
  notificationsEnabled: true,
  budgetAlertsEnabled: true,
  goalMilestonesEnabled: true,
  largeTxAlertsEnabled: true,
  munshiSuggestionsEnabled: true,
  monthlyReportEnabled: true,
};

describe('NotificationsService.create', () => {
  it('creates the row and pushes when enabled', async () => {
    const { svc, repo, push } = make({ ...base });
    await svc.create('u1', {
      type: NotificationType.LARGE_TRANSACTION,
      title: 'Large',
      body: 'x',
      data: { screen: 'tx-detail', id: 't1' },
    });
    expect(repo.save).toHaveBeenCalled();
    expect(push.send).toHaveBeenCalled();
  });

  it('does not create when the per-type toggle is off', async () => {
    const { svc, repo, push } = make({ ...base, largeTxAlertsEnabled: false });
    const result = await svc.create('u1', {
      type: NotificationType.LARGE_TRANSACTION,
      title: 'Large',
      body: 'x',
      data: { screen: 'tx-detail' },
    });
    expect(result).toBeNull();
    expect(repo.save).not.toHaveBeenCalled();
    expect(push.send).not.toHaveBeenCalled();
  });

  it('creates the row but skips push when master toggle is off', async () => {
    const { svc, repo, push } = make({ ...base, notificationsEnabled: false });
    await svc.create('u1', {
      type: NotificationType.LARGE_TRANSACTION,
      title: 'Large',
      body: 'x',
      data: { screen: 'tx-detail' },
    });
    expect(repo.save).toHaveBeenCalled();
    expect(push.send).not.toHaveBeenCalled();
  });
});
