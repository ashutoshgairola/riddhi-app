import { CreateGoalDto } from '../../goals/dto/create-goal.dto';
import { GoalType } from '../../common/enums';
import { Widget } from '../widgets';
import { RiddhiTool, fieldsFromInput, inr, schema } from './types';

interface ComputedGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  progressPct: number;
  remaining: number;
  projectedCompletionDate: string | null;
  targetDate: Date;
  status: string;
}

function toGoalWidget(g: ComputedGoal): Widget {
  return {
    kind: 'goal',
    goal: {
      id: g.id,
      name: g.name,
      targetAmount: Number(g.targetAmount),
      currentAmount: Number(g.currentAmount),
      progressPct: g.progressPct,
      projectedCompletionDate: g.projectedCompletionDate,
    },
  };
}

function toModelGoal(g: ComputedGoal) {
  return {
    id: g.id,
    name: g.name,
    targetAmount: Number(g.targetAmount),
    currentAmount: Number(g.currentAmount),
    progressPct: g.progressPct,
    remaining: g.remaining,
    targetDate: g.targetDate,
    projectedCompletionDate: g.projectedCompletionDate,
    status: g.status,
  };
}

export const goalTools: RiddhiTool[] = [
  {
    name: 'list_goals',
    description:
      'Call this when the user asks about savings goals, progress toward a goal, or wants a goal id for updates. Returns computed progress and projections.',
    label: 'Checking your goals…',
    inputSchema: schema({}),
    risk: 'safe',
    handler: async (ctx) => {
      const goals = (await ctx.svc.goals.findAll(
        ctx.userId,
      )) as unknown as ComputedGoal[];
      return {
        data: goals.map(toModelGoal),
        widgets: goals.map(toGoalWidget),
      };
    },
  },
  {
    name: 'create_goal',
    description:
      'Call this when the user wants to start a new savings goal (e.g. "save 2 lakh for a trip by December").',
    label: 'Creating goal…',
    inputSchema: schema(
      {
        name: { type: 'string', description: 'e.g. "Goa trip"' },
        type: {
          type: 'string',
          enum: ['savings', 'debt', 'retirement', 'major_purchase', 'other'],
        },
        targetAmount: { type: 'number', description: 'Target ₹' },
        currentAmount: { type: 'number', description: 'Already saved ₹' },
        startDate: {
          type: 'string',
          description: 'YYYY-MM-DD; omit for today',
        },
        targetDate: { type: 'string', description: 'YYYY-MM-DD' },
        contributionAmount: {
          type: 'number',
          description: 'Planned contribution per period ₹',
        },
        contributionFrequency: {
          type: 'string',
          enum: ['daily', 'weekly', 'biweekly', 'monthly'],
        },
      },
      ['name', 'targetAmount', 'targetDate'],
    ),
    risk: 'safe',
    handler: async (ctx, input) => {
      const dto = {
        ...input,
        type: (input.type as GoalType) ?? GoalType.SAVINGS,
        startDate:
          (input.startDate as string) ?? new Date().toISOString().slice(0, 10),
      } as unknown as CreateGoalDto;
      const goal = (await ctx.svc.goals.create(
        ctx.userId,
        dto,
      )) as unknown as ComputedGoal;
      return {
        data: toModelGoal(goal),
        widgets: [toGoalWidget(goal)],
        summary: `Goal "${goal.name}" created (target ${inr(Number(goal.targetAmount))})`,
      };
    },
  },
  {
    name: 'update_goal',
    description:
      'Call this to change a goal — add saved money (currentAmount), change target, rename, pause/complete. Fetch it first with list_goals to get its id and current values.',
    label: 'Updating goal…',
    inputSchema: schema(
      {
        id: { type: 'string' },
        name: { type: 'string' },
        targetAmount: { type: 'number' },
        currentAmount: { type: 'number' },
        targetDate: { type: 'string' },
        status: { type: 'string', enum: ['active', 'completed', 'paused'] },
        contributionAmount: { type: 'number' },
        contributionFrequency: {
          type: 'string',
          enum: ['daily', 'weekly', 'biweekly', 'monthly'],
        },
      },
      ['id'],
    ),
    risk: 'confirm',
    confirmSummary: (input) => ({
      title: 'Update goal?',
      summary: `Apply changes to goal ${String(input.id).slice(0, 8)}…`,
      fields: fieldsFromInput(input),
    }),
    handler: async (ctx, input) => {
      const { id, ...rest } = input;
      const goal = (await ctx.svc.goals.update(
        id as string,
        ctx.userId,
        rest,
      )) as unknown as ComputedGoal;
      return {
        data: toModelGoal(goal),
        widgets: [toGoalWidget(goal)],
        summary: 'Goal updated',
      };
    },
  },
  {
    name: 'delete_goal',
    description: 'Call this to delete a goal by id.',
    label: 'Deleting goal…',
    inputSchema: schema({ id: { type: 'string' } }, ['id']),
    risk: 'confirm',
    confirmSummary: (input) => ({
      title: 'Delete goal?',
      summary: `Permanently delete goal ${String(input.id).slice(0, 8)}…`,
      fields: fieldsFromInput(input),
    }),
    handler: async (ctx, input) => {
      await ctx.svc.goals.remove(input.id as string, ctx.userId);
      return { data: { deleted: true, id: input.id }, summary: 'Goal deleted' };
    },
  },
];
