import { eventTools } from './events.tools';

describe('list_events tool', () => {
  it('returns each event with computed totals', async () => {
    const ctx: any = {
      userId: 'u1',
      svc: {
        events: {
          findAll: jest.fn(async () => [
            { id: 'ev1', name: 'Goa Getaway', emoji: '✈️', budget: 60000,
              planned: 60000, paid: 43900, projected: 60400, over: true,
              paidCount: 3, count: 5 },
          ]),
        },
      },
    };
    const tool = eventTools.find((t) => t.name === 'list_events')!;
    const res = await tool.handler(ctx, {});
    expect((res.data as any[])[0]).toMatchObject({ name: 'Goa Getaway', paid: 43900, over: true });
  });
});
