import { TransactionCategory } from '../../categories/category.entity';
import { CreateCategoryDto } from '../../categories/dto/create-category.dto';
import { RiddhiTool, fieldsFromInput, schema } from './types';

function toModelCategory(c: TransactionCategory) {
  return { id: c.id, name: c.name, color: c.color, parentId: c.parentId };
}

export const categoryTools: RiddhiTool[] = [
  {
    name: 'list_categories',
    description:
      'Call this when you need the user\'s transaction categories — e.g. to pick a categoryId for a budget envelope or to answer "what categories do I have".',
    label: 'Fetching categories…',
    inputSchema: schema({}),
    risk: 'safe',
    handler: async (ctx) => {
      const categories = await ctx.svc.categories.findAll(ctx.userId);
      return { data: categories.map(toModelCategory) };
    },
  },
  {
    name: 'create_category',
    description:
      'Call this when the user wants a new transaction category (e.g. "add a Pets category").',
    label: 'Creating category…',
    inputSchema: schema(
      {
        name: { type: 'string' },
        color: { type: 'string', description: 'Hex color, e.g. #9d8bd6' },
        icon: { type: 'string', description: 'Icon name or emoji' },
      },
      ['name'],
    ),
    risk: 'safe',
    handler: async (ctx, input) => {
      const category = await ctx.svc.categories.create(
        ctx.userId,
        input as unknown as CreateCategoryDto,
      );
      return {
        data: toModelCategory(category),
        summary: `Category "${category.name}" created`,
      };
    },
  },
  {
    name: 'update_category',
    description:
      'Call this to rename or recolor a category. Fetch its id first with list_categories.',
    label: 'Updating category…',
    inputSchema: schema(
      {
        id: { type: 'string' },
        name: { type: 'string' },
        color: { type: 'string' },
        icon: { type: 'string' },
      },
      ['id'],
    ),
    risk: 'confirm',
    confirmSummary: (input) => ({
      title: 'Update category?',
      summary: `Apply changes to category ${String(input.id).slice(0, 8)}…`,
      fields: fieldsFromInput(input),
    }),
    handler: async (ctx, input) => {
      const { id, ...rest } = input;
      const category = await ctx.svc.categories.update(
        id as string,
        ctx.userId,
        rest,
      );
      return { data: toModelCategory(category), summary: 'Category updated' };
    },
  },
  {
    name: 'delete_category',
    description:
      'Call this to delete a category by id. Fails if transactions still use it.',
    label: 'Deleting category…',
    inputSchema: schema({ id: { type: 'string' } }, ['id']),
    risk: 'confirm',
    confirmSummary: (input) => ({
      title: 'Delete category?',
      summary: `Permanently delete category ${String(input.id).slice(0, 8)}…`,
      fields: fieldsFromInput(input),
    }),
    handler: async (ctx, input) => {
      await ctx.svc.categories.remove(input.id as string, ctx.userId);
      return {
        data: { deleted: true, id: input.id },
        summary: 'Category deleted',
      };
    },
  },
];
