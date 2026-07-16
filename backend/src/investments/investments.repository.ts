import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Investment } from './investment.entity';
import { InvestmentTransaction } from './investment-transaction.entity';

@Injectable()
export class InvestmentsRepository {
  constructor(
    @InjectRepository(Investment)
    private readonly repo: Repository<Investment>,
    @InjectRepository(InvestmentTransaction)
    private readonly txnRepo: Repository<InvestmentTransaction>,
  ) {}

  findAllByUser(userId: string): Promise<Investment[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'ASC' } });
  }

  findOneByUser(id: string, userId: string): Promise<Investment | null> {
    return this.repo.findOne({ where: { id, userId } });
  }

  create(data: Partial<Investment>): Investment {
    return this.repo.create(data);
  }

  save(inv: Investment): Promise<Investment> {
    return this.repo.save(inv);
  }

  async remove(inv: Investment): Promise<void> {
    await this.repo.remove(inv);
  }

  findTransactionsByInvestment(
    investmentId: string,
  ): Promise<InvestmentTransaction[]> {
    return this.txnRepo.find({
      where: { investmentId },
      order: { date: 'DESC' },
    });
  }

  createTransaction(
    data: Partial<InvestmentTransaction>,
  ): InvestmentTransaction {
    return this.txnRepo.create(data);
  }

  saveTransaction(txn: InvestmentTransaction): Promise<InvestmentTransaction> {
    return this.txnRepo.save(txn);
  }
}
