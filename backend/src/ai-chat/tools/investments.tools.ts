import { CreateInvestmentDto } from '../../investments/dto/create-investment.dto';
import { CreateInvestmentTransactionDto } from '../../investments/dto/create-investment-transaction.dto';
import { Widget } from '../widgets';
import {
  RiddhiTool,
  confirmAmountThreshold,
  fieldsFromInput,
  inr,
  schema,
} from './types';

interface ComputedInvestment {
  id: string;
  name: string;
  ticker: string | null;
  shares: number;
  currentValue: number;
  totalInvested: number;
  gainLoss: number;
  returnPercent: number;
}

function toModelInvestment(inv: ComputedInvestment) {
  return {
    id: inv.id,
    name: inv.name,
    ticker: inv.ticker,
    shares: Number(inv.shares),
    currentValue: inv.currentValue,
    totalInvested: inv.totalInvested,
    gainLoss: inv.gainLoss,
    returnPercent: inv.returnPercent,
  };
}

export const investmentTools: RiddhiTool[] = [
  {
    name: 'list_investments',
    description:
      'Call this when the user asks about their investments, portfolio value, or returns.',
    label: 'Checking your portfolio…',
    inputSchema: schema({}),
    risk: 'safe',
    handler: async (ctx) => {
      const investments = (await ctx.svc.investments.findAll(
        ctx.userId,
      )) as unknown as ComputedInvestment[];
      const items = investments.map(toModelInvestment);
      const totalValue = items.reduce((s, i) => s + i.currentValue, 0);
      const totalGain = items.reduce((s, i) => s + i.gainLoss, 0);
      const widget: Widget = {
        kind: 'stat',
        title: 'Portfolio',
        rows: [
          { label: 'Total value', value: inr(totalValue), tone: 'neutral' },
          {
            label: 'Total gain/loss',
            value: inr(totalGain),
            tone: totalGain >= 0 ? 'pos' : 'neg',
          },
          ...items
            .slice(0, 6)
            .map(
              (i): { label: string; value: string; tone: 'pos' | 'neg' } => ({
                label: i.name,
                value: `${inr(i.currentValue)} (${i.returnPercent >= 0 ? '+' : ''}${i.returnPercent}%)`,
                tone: i.gainLoss >= 0 ? 'pos' : 'neg',
              }),
            ),
        ],
      };
      return {
        data: { totalValue, totalGain, items },
        widgets: [widget],
      };
    },
  },
  {
    name: 'create_investment',
    description:
      'Call this when the user wants to track a new investment holding (stock, mutual fund, ETF, crypto). Requires an accountId from list_accounts (an investment-type account).',
    label: 'Adding investment…',
    inputSchema: schema(
      {
        name: { type: 'string', description: 'e.g. "Nifty 50 Index Fund"' },
        ticker: { type: 'string' },
        assetClass: {
          type: 'string',
          enum: [
            'stocks',
            'bonds',
            'cash',
            'alternatives',
            'real_estate',
            'other',
          ],
        },
        type: {
          type: 'string',
          enum: [
            'individual_stock',
            'etf',
            'mutual_fund',
            'bond',
            'crypto',
            'options',
            'reit',
            'other',
          ],
        },
        shares: { type: 'number', description: 'Units held' },
        purchasePrice: { type: 'number', description: 'Buy price per unit ₹' },
        currentPrice: {
          type: 'number',
          description: 'Current price per unit ₹',
        },
        purchaseDate: { type: 'string', description: 'YYYY-MM-DD' },
        accountId: {
          type: 'string',
          description: 'Account id (investment account)',
        },
      },
      [
        'name',
        'assetClass',
        'type',
        'shares',
        'purchasePrice',
        'currentPrice',
        'purchaseDate',
        'accountId',
      ],
    ),
    risk: 'safe',
    handler: async (ctx, input) => {
      const inv = (await ctx.svc.investments.create(
        ctx.userId,
        input as unknown as CreateInvestmentDto,
      )) as unknown as ComputedInvestment;
      return {
        data: toModelInvestment(inv),
        summary: `Investment "${inv.name}" added`,
      };
    },
  },
  {
    name: 'update_investment',
    description:
      'Call this to change an investment (current price refresh, shares, name). Fetch it first with list_investments.',
    label: 'Updating investment…',
    inputSchema: schema(
      {
        id: { type: 'string' },
        name: { type: 'string' },
        shares: { type: 'number' },
        currentPrice: { type: 'number' },
        notes: { type: 'string' },
      },
      ['id'],
    ),
    risk: 'confirm',
    confirmSummary: (input) => ({
      title: 'Update investment?',
      summary: `Apply changes to investment ${String(input.id).slice(0, 8)}…`,
      fields: fieldsFromInput(input),
    }),
    handler: async (ctx, input) => {
      const { id, ...rest } = input;
      const inv = (await ctx.svc.investments.update(
        id as string,
        ctx.userId,
        rest,
      )) as unknown as ComputedInvestment;
      return { data: toModelInvestment(inv), summary: 'Investment updated' };
    },
  },
  {
    name: 'delete_investment',
    description: 'Call this to delete an investment holding by id.',
    label: 'Deleting investment…',
    inputSchema: schema({ id: { type: 'string' } }, ['id']),
    risk: 'confirm',
    confirmSummary: (input) => ({
      title: 'Delete investment?',
      summary: `Permanently delete investment ${String(input.id).slice(0, 8)}…`,
      fields: fieldsFromInput(input),
    }),
    handler: async (ctx, input) => {
      await ctx.svc.investments.remove(input.id as string, ctx.userId);
      return {
        data: { deleted: true, id: input.id },
        summary: 'Investment deleted',
      };
    },
  },
  {
    name: 'add_investment_transaction',
    description:
      'Call this to record a buy, sell, or dividend on an existing investment. Fetch the investment id first with list_investments.',
    label: 'Recording investment transaction…',
    inputSchema: schema(
      {
        investmentId: { type: 'string' },
        type: { type: 'string', enum: ['buy', 'sell', 'dividend'] },
        amount: { type: 'number', description: 'Total ₹ of the transaction' },
        shares: { type: 'number', description: 'Units bought/sold' },
        price: { type: 'number', description: 'Price per unit ₹' },
        date: { type: 'string', description: 'YYYY-MM-DD; omit for today' },
      },
      ['investmentId', 'type', 'amount'],
    ),
    risk: (input) =>
      Math.abs(Number(input.amount) || 0) > confirmAmountThreshold()
        ? 'confirm'
        : 'safe',
    confirmSummary: (input) => ({
      title: 'Record large investment transaction?',
      summary: `${String(input.type)} of ${inr(Number(input.amount) || 0)}`,
      fields: fieldsFromInput(input),
    }),
    handler: async (ctx, input) => {
      const { investmentId, ...rest } = input;
      const txn = await ctx.svc.investments.addTransaction(
        investmentId as string,
        ctx.userId,
        {
          ...rest,
          date: (rest.date as string) ?? new Date().toISOString().slice(0, 10),
        } as unknown as CreateInvestmentTransactionDto,
      );
      return { data: txn, summary: 'Investment transaction recorded' };
    },
  },
];
