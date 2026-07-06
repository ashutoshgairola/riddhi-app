import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './notification.entity';
import { DeviceToken } from './device-token.entity';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PushDispatcher } from './push-dispatcher.service';
import { UsersModule } from '../users/users.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { NotificationsListener } from './notifications.listener';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, DeviceToken]),
    UsersModule,
    BudgetsModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsRepository,
    NotificationsService,
    PushDispatcher,
    NotificationsListener,
  ],
  exports: [TypeOrmModule, NotificationsService],
})
export class NotificationsModule {}
