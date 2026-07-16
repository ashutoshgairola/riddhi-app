import { NotificationSyncController } from './notification-sync.controller';

describe('POST /notification-sync/analyze', () => {
  it('runs analysis interactively for the current user', async () => {
    const service = { runAnalysisForUser: jest.fn(async () => ({ detected: 3 })) } as any;
    const controller = new NotificationSyncController(service);
    const res = await controller.analyze({ userId: 'u1', email: 'e' });
    expect(res).toEqual({ detected: 3 });
    expect(service.runAnalysisForUser).toHaveBeenCalledWith('u1', { interactive: true });
  });
});
