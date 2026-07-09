import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SmsSyncController } from './sms-sync.controller';
import { SmsSyncService } from './sms-sync.service';
import { AccountsModule } from '../accounts/accounts.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { CreditCard } from '../credit-card/credit-card.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CreditCard]),
    AccountsModule,
    TransactionsModule,
  ],
  controllers: [SmsSyncController],
  providers: [SmsSyncService],
  exports: [SmsSyncService],
})
export class SmsSyncModule {}
