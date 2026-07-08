import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditCard } from './credit-card.entity';
import { Transaction } from '../transactions/transaction.entity';
import { CreditCardService } from './credit-card.service';
import { CreditCardController } from './credit-card.controller';
import { AccountsModule } from '../accounts/accounts.module';
import { CategoriesModule } from '../categories/categories.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CreditCard, Transaction]),
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
  ],
  controllers: [CreditCardController],
  providers: [CreditCardService],
  exports: [CreditCardService],
})
export class CreditCardModule {}
