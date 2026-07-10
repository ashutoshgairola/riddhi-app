import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { Notification } from './notification.entity';
import { DeviceToken } from './device-token.entity';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsListener } from './notifications.listener';
import { NotificationsScheduler } from './notifications.scheduler';
import { PushDispatcher } from './push-dispatcher.service';
import { ANTHROPIC_CLIENT } from '../ai-chat/ai-chat.service';
import { UserPreferences } from '../users/user-preferences.entity';
import { UsersModule } from '../users/users.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { GoalsModule } from '../goals/goals.module';
import { ReportsModule } from '../reports/reports.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, DeviceToken, UserPreferences]),
    UsersModule,
    BudgetsModule,
    GoalsModule,
    ReportsModule,
    SubscriptionsModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsRepository,
    NotificationsService,
    PushDispatcher,
    NotificationsListener,
    NotificationsScheduler,
    {
      provide: ANTHROPIC_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Anthropic | null => {
        const apiKey = config.get<string>('ANTHROPIC_API_KEY');
        return apiKey ? new Anthropic({ apiKey }) : null;
      },
    },
  ],
  exports: [TypeOrmModule, NotificationsService],
})
export class NotificationsModule {}
