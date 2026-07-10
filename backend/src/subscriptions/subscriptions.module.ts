import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription } from './subscription.entity';
import { SubscriptionIgnore } from './subscription-ignore.entity';
import { Transaction } from '../transactions/transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Subscription, SubscriptionIgnore, Transaction])],
})
export class SubscriptionsModule {}
