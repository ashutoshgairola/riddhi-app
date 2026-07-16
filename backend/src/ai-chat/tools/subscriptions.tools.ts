import { RiddhiTool, inr, schema } from './types';

export const subscriptionTools: RiddhiTool[] = [
  {
    name: 'list_subscriptions',
    description:
      'Call this when the user asks about their subscriptions, recurring payments, monthly subscription burn, or upcoming renewals.',
    label: 'Checking your subscriptions…',
    inputSchema: schema({}),
    risk: 'safe',
    handler: async (ctx) => {
      const { subscriptions, summary } = await ctx.svc.subscriptions.list(ctx.userId);
      const active = subscriptions.filter((s: any) => s.status === 'active');
      return {
        data: {
          monthlyBurn: summary.monthlyBurn,
          yearlyProjection: summary.yearlyProjection,
          activeCount: summary.activeCount,
          upcoming: summary.upcoming,
          subscriptions: active.map((s: any) => ({
            id: s.id, name: s.name, amount: s.amount, cycle: s.cycle, nextRenewalDate: s.nextRenewalDate,
          })),
        },
        summary: `Subscription burn ${inr(summary.monthlyBurn)}/mo`,
      };
    },
  },
];
