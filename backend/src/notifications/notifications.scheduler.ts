import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { BudgetsService } from '../budgets/budgets.service';
import { GoalsService } from '../goals/goals.service';
import { ReportsService } from '../reports/reports.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UserPreferences } from '../users/user-preferences.entity';
import { GoalStatus, NotificationType } from '../common/enums';
import { ANTHROPIC_CLIENT } from '../ai-chat/ai-chat.service';
import { NotificationsService } from './notifications.service';
import {
  buildMunshiPrompt,
  isNoteworthy,
  MUNSHI_SYSTEM_PROMPT,
  parseMunshiSuggestion,
} from './munshi-suggestion.prompt';
import type { MunshiSnapshot } from './munshi-suggestion.prompt';

const inr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

@Injectable()
export class NotificationsScheduler {
  private readonly logger = new Logger(NotificationsScheduler.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly budgets: BudgetsService,
    private readonly goals: GoalsService,
    private readonly reports: ReportsService,
    @Inject(ANTHROPIC_CLIENT) private readonly client: Anthropic | null,
    private readonly config: ConfigService,
    @InjectRepository(UserPreferences)
    private readonly prefsRepo: Repository<UserPreferences>,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  private get model(): string {
    return this.config.get<string>('AI_MODEL') ?? 'claude-sonnet-5';
  }

  @Cron('0 9 * * *', { timeZone: 'Asia/Kolkata' })
  async runDailyMunshi(): Promise<void> {
    const prefs = await this.prefsRepo.find({ where: { munshiSuggestionsEnabled: true } });
    for (const p of prefs) {
      await this.safe(() => this.generateMunshiForUser(p.userId));
    }
  }

  @Cron('0 9 1 * *', { timeZone: 'Asia/Kolkata' })
  async runMonthlyReport(): Promise<void> {
    const prefs = await this.prefsRepo.find({ where: { monthlyReportEnabled: true } });
    for (const p of prefs) {
      await this.safe(() => this.generateMonthlyForUser(p.userId));
    }
  }

  @Cron('0 9 * * *', { timeZone: 'Asia/Kolkata' })
  async runSubscriptionReminders(): Promise<void> {
    const userIds = await this.subscriptions.allActiveUserIds();
    for (const userId of userIds) {
      await this.safe(() => this.remindUser(userId));
    }
  }

  async generateMunshiForUser(userId: string): Promise<void> {
    if (!this.client) return;
    const snapshot = await this.buildSnapshot(userId);
    if (!isNoteworthy(snapshot)) return;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 256,
      system: MUNSHI_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildMunshiPrompt(snapshot) }],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const parsed = parseMunshiSuggestion(text);
    if (!parsed) return;

    await this.notifications.create(userId, {
      type: NotificationType.MUNSHI_SUGGESTION,
      title: parsed.title,
      body: parsed.body,
      data: { screen: 'chat' },
    });
  }

  async generateMonthlyForUser(userId: string): Promise<void> {
    const overview = await this.reports.getOverview(userId, '1m');
    const lastMonth = MONTHS[(new Date().getMonth() + 11) % 12];
    await this.notifications.create(userId, {
      type: NotificationType.MONTHLY_REPORT,
      title: `${lastMonth} report ready`,
      body: `Net savings: ${inr(overview.netIncome)}. Tap to view.`,
      data: { screen: 'reports' },
    });
  }

  private async remindUser(userId: string): Promise<void> {
    const due = await this.subscriptions.dueForReminder(userId, new Date());
    for (const sub of due) {
      await this.notifications.create(userId, {
        type: NotificationType.SUBSCRIPTION_RENEWAL,
        title: `${sub.name} renews soon`,
        body: `${inr(sub.amount)} on ${sub.nextRenewalDate}`,
        data: { screen: 'subscriptions', id: sub.id },
      });
      await this.subscriptions.markReminded(sub.id, sub.nextRenewalDate);
    }
  }

  private async buildSnapshot(userId: string): Promise<MunshiSnapshot> {
    const [budgets, goals] = await Promise.all([
      this.budgets.findAll(userId).catch(() => []),
      this.goals.findAll(userId).catch(() => []),
    ]);
    const b = budgets[0];
    return {
      budget: b
        ? {
            name: b.name,
            totalAllocated: b.totalAllocated,
            totalSpent: b.totalSpent,
            topCategories: [...(b.categories ?? [])]
              .sort((x, y) => y.spent - x.spent)
              .slice(0, 4)
              .map((c) => ({ name: c.name, allocated: c.allocated, spent: c.spent })),
          }
        : null,
      goals: goals
        .filter((g: any) => g.status === GoalStatus.ACTIVE)
        .map((g: any) => ({ name: g.name, progressPct: g.progressPct })),
    };
  }

  private async safe(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.warn(
        `Scheduled job failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
