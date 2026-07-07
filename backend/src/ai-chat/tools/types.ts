import { TransactionsService } from '../../transactions/transactions.service';
import { BudgetsService } from '../../budgets/budgets.service';
import { GoalsService } from '../../goals/goals.service';
import { AccountsService } from '../../accounts/accounts.service';
import { CategoriesService } from '../../categories/categories.service';
import { InvestmentsService } from '../../investments/investments.service';
import { ReportsService } from '../../reports/reports.service';
import { EventsService } from '../../events/events.service';
import { Widget } from '../widgets';

export interface ToolCtx {
  userId: string;
  svc: {
    tx: TransactionsService;
    budgets: BudgetsService;
    goals: GoalsService;
    accounts: AccountsService;
    categories: CategoriesService;
    investments: InvestmentsService;
    reports: ReportsService;
    events: EventsService;
  };
}

export interface ToolResult {
  /** Compact payload sent back to the model as the tool_result. */
  data: unknown;
  /** Native cards streamed to the client; the model never composes these. */
  widgets?: Widget[];
  /** Optional one-line label shown in the tool-status chip. */
  summary?: string;
}

export type ToolRisk = 'safe' | 'confirm';

export interface ConfirmSummary {
  title: string;
  summary: string;
  fields: { label: string; value: string }[];
}

export interface RiddhiTool {
  name: string;
  /** Prescriptive: "Call this when the user…" — drives should-call rate. */
  description: string;
  /** Full JSON Schema; must set additionalProperties:false + required (strict mode). */
  inputSchema: Record<string, unknown>;
  /** Human label streamed while the tool runs, e.g. "Looking up transactions…". */
  label: string;
  risk: ToolRisk | ((input: Record<string, unknown>) => ToolRisk);
  /** Required for tools that can resolve to 'confirm'. */
  confirmSummary?: (input: Record<string, unknown>) => ConfirmSummary;
  handler: (
    ctx: ToolCtx,
    input: Record<string, unknown>,
  ) => Promise<ToolResult>;
}

/** Amount (₹) above which creates require an in-chat confirmation. */
export function confirmAmountThreshold(): number {
  const raw = Number(process.env.AI_CONFIRM_AMOUNT_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 ? raw : 50_000;
}

export function resolveRisk(
  tool: RiddhiTool,
  input: Record<string, unknown>,
): ToolRisk {
  return typeof tool.risk === 'function' ? tool.risk(input) : tool.risk;
}

/** JSON Schema object helper satisfying strict-mode requirements. */
export function schema(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return { type: 'object', properties, required, additionalProperties: false };
}

export const inr = (n: number): string =>
  `₹${Math.round(n).toLocaleString('en-IN')}`;

/** Renders confirmation-card field rows from a tool input object. */
export function fieldsFromInput(
  input: Record<string, unknown>,
): { label: string; value: string }[] {
  return Object.entries(input)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => ({
      label: k,
      value:
        typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
          ? String(v)
          : JSON.stringify(v),
    }));
}
