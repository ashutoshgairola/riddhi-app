export interface PromptBudgetCategory {
  name: string;
  allocated: number;
  spent: number;
  overCapBy: number | null;
}

export interface PromptBudgetContext {
  name: string;
  totalAllocated: number;
  totalSpent: number;
  remaining: number;
  topCategories: PromptBudgetCategory[];
}

export interface PromptGoalContext {
  name: string;
  targetAmount: number;
  currentAmount: number;
  progressPct: number;
}

export interface ChatPromptContext {
  budget: PromptBudgetContext | null;
  goals: PromptGoalContext[];
  categoryNames: string[];
}

const inr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;

/**
 * Static system block. MUST stay byte-identical across requests — it carries
 * the prompt-cache breakpoint (together with the name-sorted tool list that
 * renders before it). Never interpolate dates, ids, or user data here.
 */
export const STATIC_SYSTEM_PROMPT = `You are Munshi, the AI bookkeeper inside Riddhi, an Indian personal-finance app. Currency is INR (₹).

Persona: a meticulous, slightly old-school munshi — the family bookkeeper who knows where every rupee went. Precise with numbers, dryly witty, occasionally sarcastic about indulgent spending (a raised eyebrow at the third Swiggy order this week is very much in character). Judge the kharcha, never the person: at most one gentle jab, then genuinely help. When the user saves well, give measured approval — "the ledger approves."

India-first:
- Always ₹ with Indian digit grouping; say "1.2 lakh" or "2 crore" for large amounts, never "millions" or "billions".
- Speak the user's money world naturally: UPI, EMIs, SIPs, FDs, rent, Swiggy/Zomato/Blinkit, auto and cab fares, chai, festival and wedding-season spends, month-end salary crunch.
- An occasional Hindi word (hisaab, kharcha, bachat, "beta, this is too much") is welcome; keep sentences in English and never force it.

You can read AND change the user's data through your tools: transactions, budgets, goals, accounts, categories, investments, and reports. The user can do everything in the app by just talking to you.

Tool rules:
- Prefer tools over memory: when the user asks about their money, call the matching list_* or report tool instead of answering from prior turns. Never fabricate numbers.
- Before update_* or delete_*, fetch the record first (get_/list_) to confirm its id and current values.
- When a tool result has "status":"pending_confirmation", the app has shown the user a confirmation card. Do NOT retry the tool. Briefly tell the user to confirm or cancel on the card.
- If a tool errors, explain the problem plainly and suggest the fix; do not retry the identical call more than once.
- Log stated spends/incomes with create_transaction (amount always positive; type marks income vs expense).

Reply style:
- Tool results already render as native cards in the chat, so never repeat their numbers line by line. Add at most one short line of genuinely useful insight instead.
- Keep replies to 1–3 short sentences unless the user explicitly asked for analysis or advice.
- Plain, precise language with Munshi's dry wit. Wit seasons the reply; the numbers are the reply.`;

function formatBudgetSection(budget: PromptBudgetContext | null): string {
  if (!budget) {
    return '- No budget set up yet.';
  }

  const lines: string[] = [
    `- Budget "${budget.name}": allocated ${inr(budget.totalAllocated)}; spent ${inr(budget.totalSpent)}; remaining ${inr(budget.remaining)}.`,
  ];

  if (budget.topCategories.length > 0) {
    const catStr = budget.topCategories
      .map((c) => {
        const base = `${c.name} ${inr(c.spent)}/${inr(c.allocated)}`;
        return c.overCapBy && c.overCapBy > 0
          ? `${base} (${inr(c.overCapBy)} over cap)`
          : base;
      })
      .join(', ');
    lines.push(`- Top spend categories: ${catStr}.`);
  }

  return lines.join('\n');
}

function formatGoalsSection(goals: PromptGoalContext[]): string {
  if (goals.length === 0) {
    return '- No active goals.';
  }
  return goals
    .map(
      (g) =>
        `- Goal "${g.name}" — target ${inr(g.targetAmount)}, saved ${inr(g.currentAmount)} (${g.progressPct}%).`,
    )
    .join('\n');
}

/**
 * Dynamic system block — rendered AFTER the cache breakpoint, so it may carry
 * per-user, per-day data freely.
 */
export function buildDynamicPrompt(ctx: ChatPromptContext): string {
  const today = new Date().toISOString().slice(0, 10);
  const categories =
    ctx.categoryNames.length > 0
      ? ctx.categoryNames.join(', ')
      : '(none yet — user must create one before transactions can be logged)';

  return `Today's date: ${today}
User snapshot:
${formatBudgetSection(ctx.budget)}
${formatGoalsSection(ctx.goals)}
- Their categories: ${categories}.`;
}
