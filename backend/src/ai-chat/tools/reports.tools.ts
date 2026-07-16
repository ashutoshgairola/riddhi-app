import { RiddhiTool, inr, schema } from './types';
import { PeriodKey } from '../../reports/dto/period.dto';

const periodProp = {
  period: {
    type: 'string',
    enum: ['1m', '3m', '6m', '1y'],
    description: 'Lookback window (default 1m)',
  },
};

function period(input: Record<string, unknown>): PeriodKey {
  return (input.period as PeriodKey) ?? '1m';
}

const monthLabel = (m: string): string => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleString('en-IN', { month: 'short' });
};

export const reportTools: RiddhiTool[] = [
  {
    name: 'get_spending_overview',
    description:
      'Call this when the user asks "how am I doing", about total income vs expenses, savings rate, or a general financial summary for a period.',
    label: 'Crunching the numbers…',
    inputSchema: schema(periodProp),
    risk: 'safe',
    handler: async (ctx, input) => {
      const o = await ctx.svc.reports.getOverview(ctx.userId, period(input));
      return {
        data: o,
        widgets: [
          {
            kind: 'stat',
            title: `Overview (${period(input)})`,
            rows: [
              { label: 'Income', value: inr(o.totalIncome), tone: 'pos' },
              { label: 'Expenses', value: inr(o.totalExpenses), tone: 'neg' },
              {
                label: 'Net',
                value: inr(o.netIncome),
                tone: o.netIncome >= 0 ? 'pos' : 'neg',
              },
              {
                label: 'Savings rate',
                value: `${o.savingsRate}%`,
                tone: o.savingsRate >= 20 ? 'pos' : 'neutral',
              },
            ],
          },
        ],
      };
    },
  },
  {
    name: 'get_income_vs_expense',
    description:
      'Call this when the user wants a month-by-month comparison of income and expenses (trend over time).',
    label: 'Charting income vs expenses…',
    inputSchema: schema(periodProp),
    risk: 'safe',
    handler: async (ctx, input) => {
      const rows = await ctx.svc.reports.getIncomeVsExpense(
        ctx.userId,
        period(input),
      );
      return {
        data: rows,
        widgets: [
          {
            kind: 'chart_bar',
            title: 'Income vs Expenses',
            labels: rows.map((r) => monthLabel(r.month)),
            income: rows.map((r) => r.income),
            expense: rows.map((r) => r.expense),
          },
        ],
      };
    },
  },
  {
    name: 'get_category_breakdown',
    description:
      'Call this when the user asks where their money goes — spending split by category for a period.',
    label: 'Breaking down categories…',
    inputSchema: schema(periodProp),
    risk: 'safe',
    handler: async (ctx, input) => {
      const rows = await ctx.svc.reports.getCategories(
        ctx.userId,
        period(input),
      );
      const total = rows.reduce((s, r) => s + r.value, 0);
      return {
        data: rows,
        widgets: [
          {
            kind: 'chart_donut',
            title: `Spending by category (${period(input)})`,
            total,
            items: rows.map((r) => ({
              name: r.name,
              value: r.value,
              sharePct: r.sharePct,
              color: r.color ?? undefined,
            })),
          },
        ],
      };
    },
  },
  {
    name: 'get_net_worth_trend',
    description:
      'Call this when the user asks how their net worth has changed over time.',
    label: 'Tracing net worth…',
    inputSchema: schema(periodProp),
    risk: 'safe',
    handler: async (ctx, input) => {
      const [trend, nw] = await Promise.all([
        ctx.svc.reports.getNetWorthTrend(ctx.userId, period(input)),
        ctx.svc.accounts.computeNetWorth(ctx.userId),
      ]);
      return {
        data: { current: nw, trend },
        widgets: [
          {
            kind: 'net_worth',
            total: nw.netWorth,
            assets: nw.totalAssets,
            liabilities: nw.totalLiabilities,
            trend,
          },
        ],
      };
    },
  },
];
