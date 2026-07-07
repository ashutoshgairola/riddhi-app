import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { BudgetsModule } from '../budgets/budgets.module';
import { GoalsModule } from '../goals/goals.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { CategoriesModule } from '../categories/categories.module';
import { AccountsModule } from '../accounts/accounts.module';
import { InvestmentsModule } from '../investments/investments.module';
import { ReportsModule } from '../reports/reports.module';
import { EventsModule } from '../events/events.module';
import { AiChatController } from './ai-chat.controller';
import { AiChatService, ANTHROPIC_CLIENT } from './ai-chat.service';
import { ChatThread } from './entities/chat-thread.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { PendingAction } from './entities/pending-action.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatThread, ChatMessage, PendingAction]),
    BudgetsModule,
    GoalsModule,
    TransactionsModule,
    CategoriesModule,
    AccountsModule,
    InvestmentsModule,
    ReportsModule,
    EventsModule,
  ],
  controllers: [AiChatController],
  providers: [
    AiChatService,
    {
      provide: ANTHROPIC_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Anthropic | null => {
        const apiKey = config.get<string>('ANTHROPIC_API_KEY');
        return apiKey ? new Anthropic({ apiKey }) : null;
      },
    },
  ],
})
export class AiChatModule {}
