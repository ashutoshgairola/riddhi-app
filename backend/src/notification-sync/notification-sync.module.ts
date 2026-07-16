import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { CapturedNotification } from './captured-notification.entity';
import { DetectedTransaction } from './detected-transaction.entity';
import { Account } from '../accounts/account.entity';
import { CreditCard } from '../credit-card/credit-card.entity';
import { UserPreferences } from '../users/user-preferences.entity';
import { NotificationSyncController } from './notification-sync.controller';
import { NotificationSyncService } from './notification-sync.service';
import { NotificationSyncScheduler } from './notification-sync.scheduler';
import { NotificationsModule } from '../notifications/notifications.module';
import { TransactionsModule } from '../transactions/transactions.module';
import {
  NotificationAnalysisService,
  NOTIFICATION_ANTHROPIC_CLIENT,
} from './notification-analysis.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CapturedNotification,
      DetectedTransaction,
      Account,
      CreditCard,
      UserPreferences,
    ]),
    NotificationsModule,
    TransactionsModule,
  ],
  controllers: [NotificationSyncController],
  providers: [
    NotificationSyncService,
    NotificationAnalysisService,
    NotificationSyncScheduler,
    {
      provide: NOTIFICATION_ANTHROPIC_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Anthropic | null => {
        const apiKey = config.get<string>('ANTHROPIC_API_KEY');
        return apiKey ? new Anthropic({ apiKey }) : null;
      },
    },
  ],
  exports: [NotificationSyncService, NotificationAnalysisService],
})
export class NotificationSyncModule {}
