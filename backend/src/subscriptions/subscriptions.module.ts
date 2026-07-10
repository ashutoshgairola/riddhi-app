import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription } from './subscription.entity';
import { SubscriptionIgnore } from './subscription-ignore.entity';
import { Transaction } from '../transactions/transaction.entity';
import { CapturedNotification } from '../notification-sync/captured-notification.entity';
import { SubscriptionsService } from './subscriptions.service';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [
    // CapturedNotification is registered read-only for aggregator name enrichment
    // (a repository handle only — no dependency on NotificationSyncModule).
    TypeOrmModule.forFeature([Subscription, SubscriptionIgnore, Transaction, CapturedNotification]),
    CategoriesModule,
  ],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
