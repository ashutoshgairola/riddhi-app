import { SubscriptionsController } from './subscriptions.controller';

describe('SubscriptionsController', () => {
  const svc = {
    list: jest.fn(async () => ({ subscriptions: [], summary: {} })),
    detect: jest.fn(async () => []),
    create: jest.fn(async () => ({ id: 's1' })),
    update: jest.fn(async () => ({ id: 's1', status: 'paused' })),
    remove: jest.fn(async () => undefined),
    dismiss: jest.fn(async () => undefined),
  };
  const ctrl = new SubscriptionsController(svc as any);
  const user = { userId: 'u1', email: 'a@b.c' };

  it('GET /subscriptions returns list + summary', async () => {
    await ctrl.list(user);
    expect(svc.list).toHaveBeenCalledWith('u1');
  });
  it('GET /subscriptions/detect returns candidates', async () => {
    await ctrl.detect(user);
    expect(svc.detect).toHaveBeenCalledWith('u1');
  });
  it('POST /subscriptions creates', async () => {
    await ctrl.create(user, { name: 'Netflix' } as any);
    expect(svc.create).toHaveBeenCalledWith('u1', { name: 'Netflix' });
  });
  it('PATCH /subscriptions/:id updates', async () => {
    await ctrl.update(user, 's1', { status: 'paused' } as any);
    expect(svc.update).toHaveBeenCalledWith('u1', 's1', { status: 'paused' });
  });
  it('DELETE /subscriptions/:id removes', async () => {
    await ctrl.remove(user, 's1');
    expect(svc.remove).toHaveBeenCalledWith('u1', 's1');
  });
  it('POST /subscriptions/dismiss records an ignore', async () => {
    await ctrl.dismiss(user, { merchantDescriptor: 'netflix.com' } as any);
    expect(svc.dismiss).toHaveBeenCalledWith('u1', 'netflix.com');
  });
});
