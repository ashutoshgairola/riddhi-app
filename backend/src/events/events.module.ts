import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Event } from './event.entity';
import { EventExpense } from './event-expense.entity';
import { TransactionCategory } from '../categories/category.entity';
import { EventsRepository } from './events.repository';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event, EventExpense, TransactionCategory]),
    TransactionsModule,
  ],
  controllers: [EventsController],
  providers: [EventsRepository, EventsService],
  exports: [EventsService, TypeOrmModule],
})
export class EventsModule {}
