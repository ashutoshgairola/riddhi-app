import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Budget } from './budget.entity';
import { BudgetCategory } from './budget-category.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Budget, BudgetCategory])],
  exports: [TypeOrmModule],
})
export class BudgetsModule {}
