import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CapturedNotification } from './captured-notification.entity';
import { DetectedTransaction } from './detected-transaction.entity';
import { Account } from '../accounts/account.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CapturedNotification, DetectedTransaction, Account]),
  ],
  controllers: [],
  providers: [],
})
export class NotificationSyncModule {}
