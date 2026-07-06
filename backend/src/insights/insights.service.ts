import { Injectable } from '@nestjs/common';
import { BudgetsService } from '../budgets/budgets.service';
import { GoalsService } from '../goals/goals.service';
import { ReportsService } from '../reports/reports.service';
import { TransactionsService } from '../transactions/transactions.service';
import { TransactionType, GoalStatus } from '../common/enums';

export type InsightSeverity = 'info' | 'warn' | 'good';

export interface Insight {
  id: string;
  icon: string;
  title: string;
  body: string;
  severity: InsightSeverity;
  /** Prompt the mobile app autosends into chat when the card is tapped. */
  chatPrompt: string;
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_INSIGHTS = 4;
const SEVERITY_ORDER: Record<InsightSeverity, number> = {
  warn: 0,
  good: 1,
  info: 2,
};

const inr = (n: number): string =>
  `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;

/**
 * Rule-based AI-insight cards for the Home strip. Deterministic and free —
 * no model call — computed from the same aggregates the report screens use.
 * Each card deep-links into chat via `chatPrompt` for the full breakdown.
 */
@Injectable()
export class InsightsService {
  private readonly cache = new Map<string, { at: number; data: Insight[] }>();

  constructor(
    private readonly budgetsService: BudgetsService,
    private readonly goalsService: GoalsService,
    private readonly reportsService: ReportsService,
    private readonly transactionsService: TransactionsService,
  ) {}

  async getInsights(userId: string): Promise<{ insights: Insight[] }> {
    const cached = this.cache.get(userId);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return { insights: cached.data };
    }

    const insights = await this.compute(userId);
    this.cache.set(userId, { at: Date.now(), data: insights });
    return { insights };
  }

  private async compute(userId: string): Promise<Insight[]> {
    const [budgets, goals, overview, trend, largest] = await Promise.all([
      this.budgetsService
        .findAll(userId)
        .catch(() => [] as Awaited<ReturnType<BudgetsService['findAll']>>),
      this.goalsService
        .findAll(userId)
        .catch(() => [] as Awaited<ReturnType<GoalsService['findAll']>>),
      this.reportsService.getOverview(userId, '1m').catch(() => null),
      this.reportsService.getNetWorthTrend(userId, '3m').catch(() => []),
      this.largestRecentExpense(userId).catch(() => null),
    ]);

    const insights: Insight[] = [];
    const budget = budgets[0];

    // 1. Over-cap budget categories.
    if (budget) {
      const over = budget.categories
        .filter((c) => c.allocated > 0 && c.spent > c.allocated)
        .sort((a, b) => b.spent - b.allocated - (a.spent - a.allocated));
      if (over.length > 0) {
        const worst = over[0];
        insights.push({
          id: 'over-cap',
          icon: '🚨',
          title: `${worst.name} is over budget`,
          body: `${inr(worst.spent - worst.allocated)} over its ${inr(worst.allocated)} cap${over.length > 1 ? ` (+${over.length - 1} more over)` : ''}.`,
          severity: 'warn',
          chatPrompt: `Why am I over budget on ${worst.name} and how do I fix it?`,
        });
      }
    }

    // 2. Budget pace vs days left in the period.
    if (budget && budget.totalAllocated > 0) {
      const now = Date.now();
      const start = new Date(budget.startDate).getTime();
      const end = new Date(budget.endDate).getTime();
      if (now >= start && now <= end && end > start) {
        const elapsedPct = ((now - start) / (end - start)) * 100;
        const spentPct = (budget.totalSpent / budget.totalAllocated) * 100;
        const daysLeft = Math.max(1, Math.ceil((end - now) / 86_400_000));
        const safePerDay = Math.max(0, budget.remaining) / daysLeft;
        if (spentPct > elapsedPct + 10) {
          insights.push({
            id: 'budget-pace',
            icon: '⏳',
            title: 'Spending ahead of pace',
            body: `${Math.round(spentPct)}% of budget used with ${daysLeft} days left. Safe-to-spend: ${inr(safePerDay)}/day.`,
            severity: 'warn',
            chatPrompt:
              'Am I spending too fast this month? Where should I slow down?',
          });
        } else {
          insights.push({
            id: 'budget-pace',
            icon: '✅',
            title: 'Budget on track',
            body: `${inr(budget.remaining)} left — about ${inr(safePerDay)}/day for ${daysLeft} more days.`,
            severity: 'good',
            chatPrompt: 'Give me a quick budget check-in for this month.',
          });
        }
      }
    }

    // 3. Savings rate this month.
    if (overview && overview.totalIncome > 0) {
      if (overview.netIncome < 0) {
        insights.push({
          id: 'savings-rate',
          icon: '📉',
          title: 'Spending exceeds income',
          body: `Expenses are ${inr(-overview.netIncome)} above income this month.`,
          severity: 'warn',
          chatPrompt:
            'I spent more than I earned this month — where did it go?',
        });
      } else if (overview.savingsRate >= 20) {
        insights.push({
          id: 'savings-rate',
          icon: '🌱',
          title: `Saving ${overview.savingsRate}% of income`,
          body: `${inr(overview.netIncome)} saved this month. Solid.`,
          severity: 'good',
          chatPrompt: 'How should I put this month’s savings to work?',
        });
      }
    }

    // 4. Goal projected to miss its target date.
    const slipping = goals.find(
      (g) =>
        g.status === GoalStatus.ACTIVE &&
        g.projectedCompletionDate &&
        g.targetDate &&
        new Date(g.projectedCompletionDate) > new Date(g.targetDate),
    );
    if (slipping) {
      insights.push({
        id: 'goal-slip',
        icon: '🎯',
        title: `"${slipping.name}" is slipping`,
        body: `At the current pace it lands after the target date.`,
        severity: 'warn',
        chatPrompt: `How can I get my "${slipping.name}" goal back on track?`,
      });
    }

    // 5. Largest expense in the last 30 days.
    if (largest) {
      insights.push({
        id: 'largest-tx',
        icon: '💸',
        title: 'Biggest recent spend',
        body: `${inr(largest.amount)} — ${largest.description}.`,
        severity: 'info',
        chatPrompt: `Show my biggest expenses this month.`,
      });
    }

    // 6. Net-worth trend direction (last 3 months).
    if (trend.length >= 2) {
      const delta = trend[trend.length - 1].netWorth - trend[0].netWorth;
      if (Math.abs(delta) > 0) {
        insights.push({
          id: 'net-worth-trend',
          icon: delta >= 0 ? '📈' : '📉',
          title: delta >= 0 ? 'Net worth is growing' : 'Net worth dipped',
          body: `${delta >= 0 ? 'Up' : 'Down'} ${inr(delta)} over the last 3 months.`,
          severity: delta >= 0 ? 'good' : 'info',
          chatPrompt: 'How has my net worth changed recently and why?',
        });
      }
    }

    return insights
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
      .slice(0, MAX_INSIGHTS);
  }

  private async largestRecentExpense(
    userId: string,
  ): Promise<{ description: string; amount: number } | null> {
    const from = new Date(Date.now() - 30 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const page = await this.transactionsService.findAll(userId, {
      type: TransactionType.EXPENSE,
      from,
      page: 1,
      limit: 100,
    });
    if (page.items.length === 0) return null;
    const top = [...page.items].sort((a, b) => b.amount - a.amount)[0];
    return { description: top.description, amount: top.amount };
  }
}
