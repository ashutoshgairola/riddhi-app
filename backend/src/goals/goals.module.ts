import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Goal } from './goal.entity';
import { GoalsRepository } from './goals.repository';
import { GoalsService } from './goals.service';
import { GoalsController } from './goals.controller';
import { TransactionsModule } from '../transactions/transactions.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [TypeOrmModule.forFeature([Goal]), TransactionsModule, CategoriesModule],
  controllers: [GoalsController],
  providers: [GoalsRepository, GoalsService],
  exports: [TypeOrmModule, GoalsService],
})
export class GoalsModule {}
