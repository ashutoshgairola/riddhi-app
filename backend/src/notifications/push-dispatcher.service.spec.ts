import { PushDispatcher } from './push-dispatcher.service';
import { DeviceToken } from './device-token.entity';

function repoMock(tokens: Partial<DeviceToken>[]) {
  return {
    find: jest.fn().mockResolvedValue(tokens),
    delete: jest.fn().mockResolvedValue({}),
  } as any;
}

describe('PushDispatcher', () => {
  const OLD_FETCH = global.fetch;
  afterEach(() => {
    global.fetch = OLD_FETCH;
    jest.restoreAllMocks();
  });

  it('does nothing when the user has no tokens', async () => {
    global.fetch = jest.fn() as any;
    const repo = repoMock([]);
    const d = new PushDispatcher(repo);
    await d.send('u1', { title: 't', body: 'b', data: {} });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('POSTs Expo messages for each token', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: 'ok' }] }) }) as any;
    const repo = repoMock([{ expoPushToken: 'ExponentPushToken[a]' }]);
    const d = new PushDispatcher(repo);
    await d.send('u1', { title: 't', body: 'b', data: { screen: 'budgets' } });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('prunes DeviceNotRegistered tokens', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }],
      }),
    }) as any;
    const repo = repoMock([{ expoPushToken: 'ExponentPushToken[dead]' }]);
    const d = new PushDispatcher(repo);
    await d.send('u1', { title: 't', body: 'b', data: {} });
    expect(repo.delete).toHaveBeenCalledWith({ expoPushToken: 'ExponentPushToken[dead]' });
  });

  it('never throws when fetch rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network')) as any;
    const repo = repoMock([{ expoPushToken: 'ExponentPushToken[a]' }]);
    const d = new PushDispatcher(repo);
    await expect(d.send('u1', { title: 't', body: 'b', data: {} })).resolves.toBeUndefined();
  });
});
