import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { AccountsModule } from '../accounts/accounts.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { CreditCardModule } from '../credit-card/credit-card.module';
import { CreditCard } from '../credit-card/credit-card.entity';
import { CategoriesModule } from '../categories/categories.module';
import { StatementsController } from './statements.controller';
import { StatementsService } from './statements.service';
import { StatementParserService, STATEMENTS_ANTHROPIC_CLIENT } from './statement-parser.service';

@Module({
  imports: [
    AccountsModule,
    TransactionsModule,
    CreditCardModule,
    CategoriesModule,
    TypeOrmModule.forFeature([CreditCard]),
  ],
  controllers: [StatementsController],
  providers: [
    StatementsService,
    StatementParserService,
    {
      provide: STATEMENTS_ANTHROPIC_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Anthropic | null => {
        const apiKey = config.get<string>('ANTHROPIC_API_KEY');
        return apiKey ? new Anthropic({ apiKey }) : null;
      },
    },
  ],
})
export class StatementsModule {}
