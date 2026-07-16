import { subscriptionTools } from './subscriptions.tools';

describe('list_subscriptions tool', () => {
  const tool = subscriptionTools.find((t) => t.name === 'list_subscriptions')!;

  it('is registered and safe', () => {
    expect(tool).toBeDefined();
    expect(tool.risk).toBe('safe');
  });

  it('returns burn + active subs', async () => {
    const ctx: any = {
      userId: 'u1',
      svc: { subscriptions: { list: jest.fn(async () => ({
        subscriptions: [{ id: 's1', name: 'Netflix', amount: 649, cycle: 'monthly', status: 'active', nextRenewalDate: '2026-05-10' }],
        summary: { monthlyBurn: 649, yearlyProjection: 7788, activeCount: 1, upcoming: [], flags: [] },
      })) } },
    };
    const res = await tool.handler(ctx, {});
    expect((res.data as any).monthlyBurn).toBe(649);
    expect((res.data as any).subscriptions).toHaveLength(1);
  });
});
