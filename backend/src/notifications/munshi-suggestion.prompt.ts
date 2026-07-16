export interface MunshiSnapshot {
  budget: {
    name: string;
    totalAllocated: number;
    totalSpent: number;
    topCategories: { name: string; allocated: number; spent: number }[];
  } | null;
  goals: { id: string; name: string; progressPct: number }[];
}

const inr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function isNoteworthy(s: MunshiSnapshot): boolean {
  const budgetHot =
    !!s.budget &&
    s.budget.totalAllocated > 0 &&
    (s.budget.totalSpent / s.budget.totalAllocated >= 0.75 ||
      s.budget.topCategories.some(
        (c) => c.allocated > 0 && c.spent / c.allocated >= 0.9,
      ));
  const goalHot = s.goals.some(
    (g) => g.progressPct >= 50 && g.progressPct < 100,
  );
  return budgetHot || goalHot;
}

export const MUNSHI_SYSTEM_PROMPT = `You are Munshi ji, the meticulous, dryly witty family bookkeeper inside Riddhi, an Indian personal-finance app (currency ₹). Judge the kharcha, never the person — at most one gentle jab, then genuinely help. Occasional Hindi word (hisaab, kharcha, bachat) is welcome; keep sentences in English. Use Indian digit grouping and "lakh"/"crore" for large amounts.

You write ONE short push notification based on the user's snapshot. Rules:
- Reply with STRICT JSON only, no prose, no markdown fences.
- If there is nothing genuinely worth a nudge today, reply exactly {"skip": true}.
- Otherwise reply {"title": "<=40 chars", "body": "<=120 chars"}.
- If the nudge is primarily about the budget, add "focus": "budget".
- If it is primarily about one goal, add "focus": "goal" and "focusGoal": "<the goal's exact name from the snapshot>".
- Never invent numbers not present in the snapshot.`;

export function buildMunshiPrompt(s: MunshiSnapshot): string {
  const lines: string[] = [];
  if (s.budget) {
    lines.push(
      `Budget "${s.budget.name}": spent ${inr(s.budget.totalSpent)} of ${inr(s.budget.totalAllocated)}.`,
    );
    for (const c of s.budget.topCategories) {
      lines.push(`- ${c.name}: ${inr(c.spent)}/${inr(c.allocated)}`);
    }
  } else {
    lines.push('No budget set up.');
  }
  if (s.goals.length > 0) {
    for (const g of s.goals)
      lines.push(`Goal "${g.name}": ${g.progressPct}% saved.`);
  } else {
    lines.push('No active goals.');
  }
  return `User snapshot:\n${lines.join('\n')}\n\nWrite the notification now.`;
}

export interface MunshiSuggestion {
  title: string;
  body: string;
  focus?: 'budget' | 'goal';
  focusGoal?: string;
}

export function parseMunshiSuggestion(text: string): MunshiSuggestion | null {
  try {
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/, '')
      .trim();
    const obj = JSON.parse(cleaned) as Record<string, unknown>;
    if (obj.skip === true) return null;
    if (typeof obj.title !== 'string' || typeof obj.body !== 'string') return null;
    const result: MunshiSuggestion = {
      title: obj.title.slice(0, 60),
      body: obj.body.slice(0, 160),
    };
    if (obj.focus === 'budget' || obj.focus === 'goal') {
      result.focus = obj.focus;
      if (
        result.focus === 'goal' &&
        typeof obj.focusGoal === 'string' &&
        obj.focusGoal.trim()
      ) {
        result.focusGoal = obj.focusGoal.trim();
      }
    }
    return result;
  } catch {
    return null;
  }
}

export function munshiDeepLink(
  s: MunshiSuggestion,
  goals: { id: string; name: string }[],
): { screen: string; id?: string } {
  if (s.focus === 'budget') return { screen: 'budgets' };
  if (s.focus === 'goal') {
    const match = s.focusGoal
      ? goals.find((g) => g.name.toLowerCase() === s.focusGoal!.toLowerCase())
      : undefined;
    return match ? { screen: 'goal-detail', id: match.id } : { screen: 'goals' };
  }
  return { screen: 'chat' };
}
