import { ComputedBudget } from '../../budgets/budgets.service';
import { CreateBudgetDto } from '../../budgets/dto/create-budget.dto';
import { Widget } from '../widgets';
import { RiddhiTool, fieldsFromInput, inr, schema } from './types';

function toBudgetWidget(b: ComputedBudget): Widget {
  return {
    kind: 'budget',
    budget: {
      id: b.id,
      name: b.name,
      totalAllocated: b.totalAllocated,
      totalSpent: b.totalSpent,
      remaining: b.remaining,
      categories: b.categories.map((c) => ({
        name: c.name,
        allocated: c.allocated,
        spent: c.spent,
        color: c.color ?? undefined,
      })),
    },
  };
}

function toModelBudget(b: ComputedBudget) {
  return {
    id: b.id,
    name: b.name,
    startDate: b.startDate,
    endDate: b.endDate,
    income: b.income,
    totalAllocated: b.totalAllocated,
    totalSpent: b.totalSpent,
    remaining: b.remaining,
    categories: b.categories.map((c) => ({
      name: c.name,
      allocated: c.allocated,
      spent: c.spent,
    })),
  };
}

const budgetCategoriesSchema = {
  type: 'array',
  description: 'Budget envelopes with allocated amounts',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      allocated: { type: 'number', description: 'Allocated ₹ for the period' },
      categoryIds: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Transaction category ids this envelope tracks (from list_categories)',
      },
    },
    required: ['name', 'allocated'],
    additionalProperties: false,
  },
};

export const budgetTools: RiddhiTool[] = [
  {
    name: 'list_budgets',
    description:
      'Call this when the user asks about their budget, remaining budget, or how spending tracks against limits. Returns computed spent/remaining per category.',
    label: 'Checking your budget…',
    inputSchema: schema({}),
    risk: 'safe',
    handler: async (ctx) => {
      const budgets = await ctx.svc.budgets.findAll(ctx.userId);
      return {
        data: budgets.map(toModelBudget),
        widgets: budgets.map(toBudgetWidget),
      };
    },
  },
  {
    name: 'get_budget',
    description:
      'Call this to fetch a single budget by id with computed per-category spend.',
    label: 'Checking your budget…',
    inputSchema: schema({ id: { type: 'string' } }, ['id']),
    risk: 'safe',
    handler: async (ctx, input) => {
      const budget = await ctx.svc.budgets.findOne(
        input.id as string,
        ctx.userId,
      );
      return { data: toModelBudget(budget), widgets: [toBudgetWidget(budget)] };
    },
  },
  {
    name: 'create_budget',
    description:
      'Call this when the user wants to set up a new budget with category envelopes. Use list_categories first to map envelope names to category ids.',
    label: 'Creating budget…',
    inputSchema: schema(
      {
        name: { type: 'string', description: 'e.g. "May 2026"' },
        startDate: { type: 'string', description: 'YYYY-MM-DD' },
        endDate: { type: 'string', description: 'YYYY-MM-DD' },
        income: { type: 'number', description: 'Expected income ₹' },
        categories: budgetCategoriesSchema,
      },
      ['name', 'startDate', 'endDate', 'income', 'categories'],
    ),
    risk: 'safe',
    handler: async (ctx, input) => {
      const dto = input as unknown as CreateBudgetDto;
      const budget = await ctx.svc.budgets.create(ctx.userId, dto);
      return {
        data: toModelBudget(budget),
        widgets: [toBudgetWidget(budget)],
        summary: `Budget "${budget.name}" created (${inr(budget.totalAllocated)} allocated)`,
      };
    },
  },
  {
    name: 'update_budget',
    description:
      'Call this to change a budget (name, dates, income, or category allocations). Fetch it first with get_budget/list_budgets. Note: the categories array replaces all envelopes, so include every envelope you want to keep.',
    label: 'Updating budget…',
    inputSchema: schema(
      {
        id: { type: 'string' },
        name: { type: 'string' },
        startDate: { type: 'string' },
        endDate: { type: 'string' },
        income: { type: 'number' },
        categories: budgetCategoriesSchema,
      },
      ['id'],
    ),
    risk: 'confirm',
    confirmSummary: (input) => ({
      title: 'Update budget?',
      summary: `Apply changes to budget ${String(input.id).slice(0, 8)}…`,
      fields: fieldsFromInput(input),
    }),
    handler: async (ctx, input) => {
      const { id, ...rest } = input;
      const budget = await ctx.svc.budgets.update(
        id as string,
        ctx.userId,
        rest,
      );
      return {
        data: toModelBudget(budget),
        widgets: [toBudgetWidget(budget)],
        summary: 'Budget updated',
      };
    },
  },
  {
    name: 'delete_budget',
    description: 'Call this to delete a budget by id.',
    label: 'Deleting budget…',
    inputSchema: schema({ id: { type: 'string' } }, ['id']),
    risk: 'confirm',
    confirmSummary: (input) => ({
      title: 'Delete budget?',
      summary: `Permanently delete budget ${String(input.id).slice(0, 8)}… (transactions are not affected).`,
      fields: fieldsFromInput(input),
    }),
    handler: async (ctx, input) => {
      await ctx.svc.budgets.remove(input.id as string, ctx.userId);
      return {
        data: { deleted: true, id: input.id },
        summary: 'Budget deleted',
      };
    },
  },
];
