import { RiddhiTool } from './types';
import { transactionTools } from './transactions.tools';
import { budgetTools } from './budgets.tools';
import { goalTools } from './goals.tools';
import { accountTools } from './accounts.tools';
import { categoryTools } from './categories.tools';
import { investmentTools } from './investments.tools';
import { reportTools } from './reports.tools';
import { eventTools } from './events.tools';

/**
 * Full registry, name-sorted so the serialized tool list is byte-identical
 * across requests (prompt-cache determinism — tools render before system).
 */
export const TOOL_REGISTRY: RiddhiTool[] = [
  ...transactionTools,
  ...budgetTools,
  ...goalTools,
  ...accountTools,
  ...categoryTools,
  ...investmentTools,
  ...reportTools,
  ...eventTools,
].sort((a, b) => a.name.localeCompare(b.name));

export const TOOLS_BY_NAME: Map<string, RiddhiTool> = new Map(
  TOOL_REGISTRY.map((t) => [t.name, t]),
);

export * from './types';
