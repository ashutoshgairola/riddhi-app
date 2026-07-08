import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CapturedNotification } from './captured-notification.entity';
import { DetectedTransaction } from './detected-transaction.entity';
import { Account } from '../accounts/account.entity';
import { NotificationSyncController } from './notification-sync.controller';
import { NotificationSyncService } from './notification-sync.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CapturedNotification, DetectedTransaction, Account]),
  ],
  controllers: [NotificationSyncController],
  providers: [NotificationSyncService],
  exports: [NotificationSyncService],
})
export class NotificationSyncModule {}
