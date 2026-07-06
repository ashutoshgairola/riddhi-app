import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './notification.entity';
import { DeviceToken } from './device-token.entity';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PushDispatcher } from './push-dispatcher.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, DeviceToken]), UsersModule],
  controllers: [NotificationsController],
  providers: [NotificationsRepository, NotificationsService, PushDispatcher],
  exports: [TypeOrmModule, NotificationsService],
})
export class NotificationsModule {}
