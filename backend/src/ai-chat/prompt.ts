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
}

const inr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;

function formatBudgetSection(budget: PromptBudgetContext | null): string {
  if (!budget) {
    return "- The user has not set up a budget yet. Don't assume any spending numbers — ask or answer generally.";
  }

  const lines: string[] = [
    `- Budget "${budget.name}": allocated ${inr(budget.totalAllocated)}; spent so far ${inr(budget.totalSpent)}; remaining ${inr(budget.remaining)}.`,
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
    lines.push(`- Top spend categories this month: ${catStr}.`);
  }

  return lines.join('\n');
}

function formatGoalsSection(goals: PromptGoalContext[]): string {
  if (goals.length === 0) {
    return '- The user has no active goals right now.';
  }
  return goals
    .map(
      (g) =>
        `- Goal "${g.name}" — target ${inr(g.targetAmount)}, saved ${inr(g.currentAmount)} (${g.progressPct}% there).`,
    )
    .join('\n');
}

/**
 * Builds the system prompt for the AI chat proxy, based on the mobile
 * prototype's CHAT_CONTEXT (see project/riddhi/MobileChat.jsx), but with the
 * hardcoded situation lines replaced by live numbers pulled from the DB for
 * the current user.
 */
export function buildSystemPrompt(ctx: ChatPromptContext): string {
  return `You are Riddhi, a warm, concise personal-finance assistant inside an Indian expense-tracker app. Currency is INR (₹).
The user's situation:
${formatBudgetSection(ctx.budget)}
${formatGoalsSection(ctx.goals)}
When the user states a spend or income in natural language (e.g. "ordered pizza at 5 for 1000"), extract a transaction.
Respond with ONLY a raw JSON object (no markdown, no code fences) shaped exactly:
{"reply":"<one or two warm sentences>","transaction":{"merchant":"<short name>","amount":<number; negative for expense, positive for income>,"category":"Food|Transport|Shopping|Groceries|Bills|Health|Fun|Income|Other","time":"<like 5:00 PM, or empty>"}}
If it's a question or not a transaction, set "transaction" to null and put a genuinely helpful, specific answer in "reply" (up to 4 short sentences; use the numbers above; you may use ₹).`;
}
