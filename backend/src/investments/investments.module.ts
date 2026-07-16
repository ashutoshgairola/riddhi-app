import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Investment } from './investment.entity';
import { InvestmentTransaction } from './investment-transaction.entity';
import { InvestmentsRepository } from './investments.repository';
import { InvestmentsService } from './investments.service';
import { InvestmentsController } from './investments.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Investment, InvestmentTransaction])],
  controllers: [InvestmentsController],
  providers: [InvestmentsRepository, InvestmentsService],
  exports: [TypeOrmModule, InvestmentsService],
})
export class InvestmentsModule {}
