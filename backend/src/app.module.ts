import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health.controller';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { CategoriesModule } from './categories/categories.module';
import { TransactionsModule } from './transactions/transactions.module';
import { BudgetsModule } from './budgets/budgets.module';
import { GoalsModule } from './goals/goals.module';
import { InvestmentsModule } from './investments/investments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';
import { SmsSyncModule } from './sms-sync/sms-sync.module';
import { AiChatModule } from './ai-chat/ai-chat.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: true,
      }),
    }),

    UsersModule,
    AuthModule,
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
    BudgetsModule,
    GoalsModule,
    InvestmentsModule,
    NotificationsModule,
    ReportsModule,
    SmsSyncModule,
    AiChatModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
