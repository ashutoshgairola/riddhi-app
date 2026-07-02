import { Module } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module';
import { GoalsModule } from '../goals/goals.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { CategoriesModule } from '../categories/categories.module';
import { AiChatController } from './ai-chat.controller';
import { AiChatService } from './ai-chat.service';

@Module({
  imports: [BudgetsModule, GoalsModule, TransactionsModule, CategoriesModule],
  controllers: [AiChatController],
  providers: [AiChatService],
})
export class AiChatModule {}
