import { Account } from '../../accounts/account.entity';
import { AccountType } from '../../common/enums';
import { RiddhiTool, ToolCtx, fieldsFromInput, inr, schema } from './types';

function toModelAccount(a: Account) {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    balance: a.balance,
    includeInNetWorth: a.includeInNetWorth,
  };
}

/** Adds card computed fields (outstanding/available/minDue/dueDate) for credit accounts. */
async function toModelAccountWithCard(ctx: ToolCtx, a: Account) {
  const base = toModelAccount(a);
  if (a.type !== AccountType.CREDIT) return base;
  try {
    const summary = await ctx.svc.creditCard.getSummary(a.id, ctx.userId);
    return {
      ...base,
      outstanding: summary.outstanding,
      available: summary.available,
      minDue: summary.minDue,
      dueDate: summary.dueDate,
    };
  } catch {
    return base;
  }
}

export const accountTools: RiddhiTool[] = [
  {
    name: 'list_accounts',
    description:
      'Call this when the user asks about their accounts or balances, or when you need an account id for a transaction.',
    label: 'Checking your accounts…',
    inputSchema: schema({}),
    risk: 'safe',
    handler: async (ctx) => {
      const accounts = await ctx.svc.accounts.findAll(ctx.userId);
      const items = await Promise.all(
        accounts.map((a) => toModelAccountWithCard(ctx, a)),
      );
      return {
        data: items,
        widgets: [
          {
            kind: 'account_list',
            accounts: accounts.map((a) => ({
              id: a.id,
              name: a.name,
              type: a.type,
              balance: a.balance,
            })),
          },
        ],
      };
    },
  },
  {
    name: 'create_account',
    description:
      'Call this when the user wants to add a bank account, credit card, cash wallet, or loan to track.',
    label: 'Adding account…',
    inputSchema: schema(
      {
        name: { type: 'string', description: 'e.g. "HDFC Savings"' },
        type: {
          type: 'string',
          enum: [
            'checking',
            'savings',
            'credit',
            'investment',
            'cash',
            'loan',
            'other',
          ],
        },
        balance: {
          type: 'number',
          description: 'Current balance ₹ (negative for debt)',
        },
        institutionName: { type: 'string', description: 'Bank name' },
      },
      ['name', 'type'],
    ),
    risk: 'safe',
    handler: async (ctx, input) => {
      const account = await ctx.svc.accounts.create(ctx.userId, {
        name: input.name as string,
        type: input.type as AccountType,
        balance: (input.balance as number) ?? 0,
        institutionName: input.institutionName as string | undefined,
      });
      return {
        data: toModelAccount(account),
        widgets: [
          {
            kind: 'account_list',
            accounts: [
              {
                id: account.id,
                name: account.name,
                type: account.type,
                balance: account.balance,
              },
            ],
          },
        ],
        summary: `Account "${account.name}" added`,
      };
    },
  },
  {
    name: 'update_account',
    description:
      'Call this to change an account (name, balance correction, type). Fetch it first with list_accounts.',
    label: 'Updating account…',
    inputSchema: schema(
      {
        id: { type: 'string' },
        name: { type: 'string' },
        balance: { type: 'number' },
        institutionName: { type: 'string' },
        includeInNetWorth: { type: 'boolean' },
      },
      ['id'],
    ),
    risk: 'confirm',
    confirmSummary: (input) => ({
      title: 'Update account?',
      summary: `Apply changes to account ${String(input.id).slice(0, 8)}…`,
      fields: fieldsFromInput(input),
    }),
    handler: async (ctx, input) => {
      const { id, ...rest } = input;
      const account = await ctx.svc.accounts.update(
        id as string,
        ctx.userId,
        rest,
      );
      return { data: toModelAccount(account), summary: 'Account updated' };
    },
  },
  {
    name: 'delete_account',
    description:
      'Call this to delete an account by id. Its transactions keep existing but lose the account link.',
    label: 'Deleting account…',
    inputSchema: schema({ id: { type: 'string' } }, ['id']),
    risk: 'confirm',
    confirmSummary: (input) => ({
      title: 'Delete account?',
      summary: `Permanently delete account ${String(input.id).slice(0, 8)}…`,
      fields: fieldsFromInput(input),
    }),
    handler: async (ctx, input) => {
      await ctx.svc.accounts.remove(input.id as string, ctx.userId);
      return {
        data: { deleted: true, id: input.id },
        summary: 'Account deleted',
      };
    },
  },
  {
    name: 'get_net_worth',
    description:
      'Call this when the user asks about their net worth, total assets, or total liabilities.',
    label: 'Calculating net worth…',
    inputSchema: schema({}),
    risk: 'safe',
    handler: async (ctx) => {
      const [nw, trend] = await Promise.all([
        ctx.svc.accounts.computeNetWorth(ctx.userId),
        ctx.svc.reports.getNetWorthTrend(ctx.userId, '6m'),
      ]);
      return {
        data: { ...nw, trend },
        widgets: [
          {
            kind: 'net_worth',
            total: nw.netWorth,
            assets: nw.totalAssets,
            liabilities: nw.totalLiabilities,
            trend,
          },
        ],
        summary: `Net worth ${inr(nw.netWorth)}`,
      };
    },
  },
];
