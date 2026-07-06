import { Module } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module';
import { GoalsModule } from '../goals/goals.module';
import { ReportsModule } from '../reports/reports.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';

@Module({
  imports: [BudgetsModule, GoalsModule, ReportsModule, TransactionsModule],
  controllers: [InsightsController],
  providers: [InsightsService],
})
export class InsightsModule {}
