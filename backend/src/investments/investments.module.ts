import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Investment } from './investment.entity';
import { InvestmentTransaction } from './investment-transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Investment, InvestmentTransaction])],
  exports: [TypeOrmModule],
})
export class InvestmentsModule {}
