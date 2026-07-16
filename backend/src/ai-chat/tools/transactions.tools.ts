import { Transaction } from '../../transactions/transaction.entity';
import { TransactionType } from '../../common/enums';
import { CreateTransactionDto } from '../../transactions/dto/create-transaction.dto';
import { UpdateTransactionDto } from '../../transactions/dto/update-transaction.dto';
import { QueryTransactionsDto } from '../../transactions/dto/query-transactions.dto';
import { TxWidgetItem } from '../widgets';
import {
  RiddhiTool,
  ToolCtx,
  confirmAmountThreshold,
  fieldsFromInput,
  inr,
  schema,
} from './types';

async function categoryNameMap(ctx: ToolCtx): Promise<Map<string, string>> {
  const categories = await ctx.svc.categories.findAll(ctx.userId);
  return new Map(categories.map((c) => [c.id, c.name]));
}

/**
 * Finds the user's category matching the given name (case-insensitive),
 * else falls back to any existing category. Returns null when the user has
 * no categories at all.
 */
async function resolveCategoryId(
  ctx: ToolCtx,
  categoryName: string | undefined,
  categoryId: string | undefined,
): Promise<string | null> {
  if (categoryId) return categoryId;
  const categories = await ctx.svc.categories.findAll(ctx.userId);
  if (categories.length === 0) return null;
  if (categoryName) {
    const match = categories.find(
      (c) => c.name.toLowerCase() === categoryName.toLowerCase(),
    );
    if (match) return match.id;
  }
  return categories[0].id;
}

function toWidgetItem(
  tx: Transaction,
  categoryNames: Map<string, string>,
): TxWidgetItem {
  return {
    id: tx.id,
    description: tx.description,
    amount: tx.amount,
    type: tx.type,
    categoryName: categoryNames.get(tx.categoryId) ?? 'Other',
    date: tx.date instanceof Date ? tx.date.toISOString() : String(tx.date),
    accountName: null,
  };
}

function toModelItem(tx: Transaction, categoryNames: Map<string, string>) {
  return {
    id: tx.id,
    date: tx.date instanceof Date ? tx.date.toISOString() : String(tx.date),
    description: tx.description,
    amount: tx.amount,
    type: tx.type,
    category: categoryNames.get(tx.categoryId) ?? null,
    accountId: tx.accountId,
    paymentMethod: tx.paymentMethod,
    notes: tx.notes,
  };
}

export const transactionTools: RiddhiTool[] = [
  {
    name: 'list_transactions',
    description:
      'Call this when the user asks about their transactions, recent spends, or wants to find a specific transaction. Filter by type, date range, or category. Returns transaction ids needed for updates/deletes.',
    label: 'Looking up transactions…',
    inputSchema: schema({
      type: {
        type: 'string',
        enum: ['income', 'expense', 'transfer'],
        description: 'Filter by transaction type',
      },
      from: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
      to: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      categoryId: { type: 'string', description: 'Filter by category id' },
      source: {
        type: 'string',
        enum: ['bank', 'card'],
        description: 'Filter by payment side: bank/UPI or credit card',
      },
      limit: {
        type: 'integer',
        description: 'Max items to return (default 10, max 50)',
      },
    }),
    risk: 'safe',
    handler: async (ctx, input) => {
      const query = Object.assign(new QueryTransactionsDto(), {
        type: input.type as TransactionType | undefined,
        from: input.from as string | undefined,
        to: input.to as string | undefined,
        categoryId: input.categoryId as string | undefined,
        source: input.source as 'bank' | 'card' | undefined,
        page: 1,
        limit: Math.min(Number(input.limit) || 10, 50),
      });
      const [page, names] = await Promise.all([
        ctx.svc.tx.findAll(ctx.userId, query),
        categoryNameMap(ctx),
      ]);
      return {
        data: {
          total: page.total,
          items: page.items.map((t) => toModelItem(t, names)),
        },
        widgets: [
          {
            kind: 'transaction_list',
            items: page.items.map((t) => toWidgetItem(t, names)),
            totalCount: page.total,
          },
        ],
      };
    },
  },
  {
    name: 'get_transaction',
    description:
      'Call this to fetch a single transaction by id — always do this before updating or deleting one, to confirm its current values.',
    label: 'Fetching transaction…',
    inputSchema: schema(
      { id: { type: 'string', description: 'Transaction id' } },
      ['id'],
    ),
    risk: 'safe',
    handler: async (ctx, input) => {
      const [tx, names] = await Promise.all([
        ctx.svc.tx.findOne(input.id as string, ctx.userId),
        categoryNameMap(ctx),
      ]);
      return {
        data: toModelItem(tx, names),
        widgets: [{ kind: 'transaction', tx: toWidgetItem(tx, names) }],
      };
    },
  },
  {
    name: 'create_transaction',
    description:
      'Call this when the user states a spend or income to log (e.g. "ordered pizza for 450", "got salary 80k"). Amount is always positive; use type to mark income vs expense. Pass the category by name — it is matched to the user\'s categories.',
    label: 'Logging transaction…',
    inputSchema: schema(
      {
        description: {
          type: 'string',
          description: 'Short merchant / description, e.g. "Pizza Hut"',
        },
        amount: { type: 'number', description: 'Positive amount in ₹' },
        type: { type: 'string', enum: ['income', 'expense', 'transfer'] },
        category: {
          type: 'string',
          description: 'Category name, e.g. Food, Transport, Bills',
        },
        date: {
          type: 'string',
          description: 'ISO date-time; omit for now',
        },
        accountId: {
          type: 'string',
          description: 'Optional source account id (money leaves this account)',
        },
        destinationAccountId: {
          type: 'string',
          description:
            'For a transfer only: the destination account id (money arrives here). A transfer moves money only when both accountId and destinationAccountId are set.',
        },
        notes: { type: 'string', description: 'Optional note' },
      },
      ['description', 'amount', 'type'],
    ),
    risk: (input) =>
      Math.abs(Number(input.amount) || 0) > confirmAmountThreshold()
        ? 'confirm'
        : 'safe',
    confirmSummary: (input) => ({
      title: 'Log large transaction?',
      summary: `${String(input.type)} of ${inr(Number(input.amount) || 0)} — "${String(input.description)}"`,
      fields: fieldsFromInput(input),
    }),
    handler: async (ctx, input) => {
      const categoryId = await resolveCategoryId(
        ctx,
        input.category as string | undefined,
        undefined,
      );
      if (!categoryId) {
        throw new Error(
          'No categories exist for this user yet — ask them to create one first.',
        );
      }
      const dto: CreateTransactionDto = {
        date: (input.date as string) || new Date().toISOString(),
        description: input.description as string,
        amount: Math.abs(Number(input.amount)),
        type: input.type as TransactionType,
        categoryId,
        accountId: input.accountId as string | undefined,
        destinationAccountId: input.destinationAccountId as string | undefined,
        notes: input.notes as string | undefined,
      };
      const [saved, names] = [
        await ctx.svc.tx.create(ctx.userId, dto),
        await categoryNameMap(ctx),
      ];
      return {
        data: toModelItem(saved, names),
        widgets: [{ kind: 'transaction', tx: toWidgetItem(saved, names) }],
        summary: `Logged ${inr(saved.amount)} ${saved.type}`,
      };
    },
  },
  {
    name: 'update_transaction',
    description:
      'Call this to change an existing transaction (amount, description, category, date, type). Fetch it first with get_transaction or list_transactions to get its id and current values.',
    label: 'Updating transaction…',
    inputSchema: schema(
      {
        id: { type: 'string', description: 'Transaction id' },
        description: { type: 'string' },
        amount: { type: 'number', description: 'Positive amount in ₹' },
        type: { type: 'string', enum: ['income', 'expense', 'transfer'] },
        category: { type: 'string', description: 'New category name' },
        date: { type: 'string', description: 'ISO date-time' },
        notes: { type: 'string' },
      },
      ['id'],
    ),
    risk: 'confirm',
    confirmSummary: (input) => ({
      title: 'Update transaction?',
      summary: `Apply changes to transaction ${String(input.id).slice(0, 8)}…`,
      fields: fieldsFromInput(input),
    }),
    handler: async (ctx, input) => {
      const dto: UpdateTransactionDto = {};
      if (input.description !== undefined)
        dto.description = input.description as string;
      if (input.amount !== undefined)
        dto.amount = Math.abs(Number(input.amount));
      if (input.type !== undefined) dto.type = input.type as TransactionType;
      if (input.date !== undefined) dto.date = input.date as string;
      if (input.notes !== undefined) dto.notes = input.notes as string;
      if (input.category !== undefined) {
        const categoryId = await resolveCategoryId(
          ctx,
          input.category as string,
          undefined,
        );
        if (categoryId) dto.categoryId = categoryId;
      }
      const [saved, names] = [
        await ctx.svc.tx.update(input.id as string, ctx.userId, dto),
        await categoryNameMap(ctx),
      ];
      return {
        data: toModelItem(saved, names),
        widgets: [{ kind: 'transaction', tx: toWidgetItem(saved, names) }],
        summary: 'Transaction updated',
      };
    },
  },
  {
    name: 'delete_transaction',
    description:
      'Call this to delete a transaction by id. Fetch it first to confirm which one the user means.',
    label: 'Deleting transaction…',
    inputSchema: schema(
      { id: { type: 'string', description: 'Transaction id' } },
      ['id'],
    ),
    risk: 'confirm',
    confirmSummary: (input) => ({
      title: 'Delete transaction?',
      summary: `Permanently delete transaction ${String(input.id).slice(0, 8)}… (account balance will be adjusted back).`,
      fields: fieldsFromInput(input),
    }),
    handler: async (ctx, input) => {
      await ctx.svc.tx.remove(input.id as string, ctx.userId);
      return {
        data: { deleted: true, id: input.id },
        summary: 'Transaction deleted',
      };
    },
  },
];
