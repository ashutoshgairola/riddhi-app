import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Budget } from './budget.entity';
import { BudgetCategory } from './budget-category.entity';
import { Transaction } from '../transactions/transaction.entity';
import { TransactionCategory } from '../categories/category.entity';
import { BudgetsRepository } from './budgets.repository';
import { BudgetsService } from './budgets.service';
import { BudgetsController } from './budgets.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Budget,
      BudgetCategory,
      Transaction,
      TransactionCategory,
    ]),
  ],
  controllers: [BudgetsController],
  providers: [BudgetsRepository, BudgetsService],
  exports: [TypeOrmModule, BudgetsService],
})
export class BudgetsModule {}
