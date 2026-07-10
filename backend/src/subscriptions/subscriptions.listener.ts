import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TRANSACTION_CREATED } from '../notifications/notification-events';
import type { TransactionCreatedEvent } from '../notifications/notification-events';
import { PaymentMethod, TransactionType } from '../common/enums';
import { SubscriptionsService } from './subscriptions.service';

/** Attributes a newly created recurring charge (SMS/statement/manual) to a
 * matching subscription. Mirrors NotificationsListener's TRANSACTION_CREATED
 * handler — fully decoupled from TransactionsService. */
@Injectable()
export class SubscriptionsListener {
  private readonly logger = new Logger(SubscriptionsListener.name);

  constructor(private readonly subscriptions: SubscriptionsService) {}

  @OnEvent(TRANSACTION_CREATED)
  async onTransactionCreated(e: TransactionCreatedEvent): Promise<void> {
    try {
      const tx = e.transaction;
      if (tx.type !== TransactionType.EXPENSE) return;
      // Only recurring-signal charges are subscription candidates.
      if (tx.paymentMethod !== PaymentMethod.AUTOPAY && !tx.isRecurring) return;
      await this.subscriptions.attachTransaction(e.userId, {
        id: tx.id,
        description: tx.description,
        amount: Number(tx.amount),
        date: new Date(tx.date).toISOString(),
        accountId: tx.accountId,
      });
    } catch (err) {
      this.logger.warn(
        `subscription attach failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
