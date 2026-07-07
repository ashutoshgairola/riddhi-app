import { RiddhiTool, schema } from './types';

interface EventLike {
  id: string; name: string; emoji: string; budget: number;
  planned: number; paid: number; projected: number; over: boolean;
  paidCount: number; count: number;
}

export const eventTools: RiddhiTool[] = [
  {
    name: 'list_events',
    description:
      'Call this when the user asks about their event budgets — a birthday, wedding, trip, or party they are planning — e.g. "how are my event budgets?" or "how much have I spent on the Goa trip?". Returns each event with its budget, planned, paid, projected total, and whether it is over budget.',
    label: 'Checking your events…',
    inputSchema: schema({}),
    risk: 'safe',
    handler: async (ctx) => {
      const events = (await ctx.svc.events.findAll(ctx.userId)) as unknown as EventLike[];
      return {
        data: events.map((e) => ({
          id: e.id, name: e.name, emoji: e.emoji, budget: e.budget,
          planned: e.planned, paid: e.paid, projected: e.projected,
          over: e.over, paidCount: e.paidCount, count: e.count,
        })),
      };
    },
  },
];
