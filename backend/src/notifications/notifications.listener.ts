import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { BudgetsService } from '../budgets/budgets.service';
import { NotificationsService } from './notifications.service';
import { NotificationType, TransactionType } from '../common/enums';
import {
  crossedThresholds,
  goalMilestonesCrossed,
  isLargeTransaction,
} from './notification-rules';
import { GOAL_UPDATED, TRANSACTION_CREATED } from './notification-events';
import type {
  GoalUpdatedEvent,
  TransactionCreatedEvent,
} from './notification-events';

const BUDGET_THRESHOLDS = [0.75, 1];
const DEFAULT_LARGE_TX = 20000;
const inr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;

@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly budgets: BudgetsService,
    private readonly config: ConfigService,
  ) {}

  private get largeTxThreshold(): number {
    const raw = this.config.get<string>('LARGE_TX_THRESHOLD');
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LARGE_TX;
  }

  @OnEvent(TRANSACTION_CREATED)
  async onTransactionCreated(e: TransactionCreatedEvent): Promise<void> {
    try {
      const tx = e.transaction;
      if (tx.type !== TransactionType.EXPENSE) return;
      const amount = Number(tx.amount);

      if (isLargeTransaction(amount, this.largeTxThreshold)) {
        await this.notifications.create(e.userId, {
          type: NotificationType.LARGE_TRANSACTION,
          title: 'Large transaction detected',
          body: `${inr(amount)} debited — ${tx.description ?? 'transaction'}.`,
          data: { screen: 'tx-detail', id: tx.id },
        });
      }

      await this.checkBudgets(e.userId, amount);
    } catch (err) {
      this.logger.warn(
        `transaction.created handler failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async checkBudgets(userId: string, txAmount: number): Promise<void> {
    const budgets = await this.budgets.findAll(userId);
    for (const b of budgets) {
      if (!b.totalAllocated || b.totalAllocated <= 0) continue;
      const after = b.totalSpent / b.totalAllocated;
      const before = (b.totalSpent - txAmount) / b.totalAllocated;
      const crossed = crossedThresholds(before, after, BUDGET_THRESHOLDS);
      if (crossed.length === 0) continue;
      const top = Math.max(...crossed);
      await this.notifications.create(userId, {
        type: NotificationType.BUDGET_ALERT,
        title:
          top >= 1 ? `${b.name} budget exceeded` : `${b.name} budget at 75%`,
        body: `${inr(b.totalSpent)} spent of ${inr(b.totalAllocated)}.`,
        data: { screen: 'budgets' },
      });
    }
  }

  @OnEvent(GOAL_UPDATED)
  async onGoalUpdated(e: GoalUpdatedEvent): Promise<void> {
    try {
      const crossed = goalMilestonesCrossed(e.previousPct, e.newPct);
      if (crossed.length === 0) return;
      const milestone = Math.max(...crossed);
      await this.notifications.create(e.userId, {
        type: NotificationType.GOAL_PROGRESS,
        title:
          milestone >= 100 ? 'Goal reached! 🎉' : `Goal milestone: ${milestone}%`,
        body:
          milestone >= 100
            ? 'You hit your target. The ledger approves.'
            : `${milestone}% of the way there.`,
        data: { screen: 'goals' },
      });
    } catch (err) {
      this.logger.warn(
        `goal.updated handler failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
