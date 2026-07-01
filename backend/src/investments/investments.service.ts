import { Injectable, NotFoundException } from '@nestjs/common';
import { InvestmentsRepository } from './investments.repository';
import { CreateInvestmentDto } from './dto/create-investment.dto';
import { UpdateInvestmentDto } from './dto/update-investment.dto';
import { CreateInvestmentTransactionDto } from './dto/create-investment-transaction.dto';
import { Investment } from './investment.entity';

function computeInvestmentFields(inv: Investment) {
  const shares = Number(inv.shares);
  const purchasePrice = Number(inv.purchasePrice);
  const currentPrice = Number(inv.currentPrice);

  const currentValue = Math.round(shares * currentPrice * 100) / 100;
  const totalInvested = Math.round(shares * purchasePrice * 100) / 100;
  const gainLoss = Math.round((currentValue - totalInvested) * 100) / 100;
  const returnPercent =
    totalInvested > 0
      ? Math.round((gainLoss / totalInvested) * 100 * 100) / 100
      : 0;

  return {
    ...inv,
    currentValue,
    totalInvested,
    gainLoss,
    returnPercent,
  };
}

@Injectable()
export class InvestmentsService {
  constructor(private readonly investmentsRepository: InvestmentsRepository) {}

  async findAll(userId: string) {
    const investments = await this.investmentsRepository.findAllByUser(userId);
    return investments.map(computeInvestmentFields);
  }

  async findOne(id: string, userId: string) {
    const inv = await this.investmentsRepository.findOneByUser(id, userId);
    if (!inv) throw new NotFoundException('Investment not found');
    return computeInvestmentFields(inv);
  }

  async create(userId: string, dto: CreateInvestmentDto) {
    const inv = this.investmentsRepository.create({
      ...dto,
      userId,
      purchaseDate: new Date(dto.purchaseDate as string),
    });
    const saved = await this.investmentsRepository.save(inv);
    return computeInvestmentFields(saved);
  }

  async update(id: string, userId: string, dto: UpdateInvestmentDto) {
    const inv = await this.investmentsRepository.findOneByUser(id, userId);
    if (!inv) throw new NotFoundException('Investment not found');
    Object.assign(inv, dto);
    const saved = await this.investmentsRepository.save(inv);
    return computeInvestmentFields(saved);
  }

  async remove(id: string, userId: string): Promise<void> {
    const inv = await this.investmentsRepository.findOneByUser(id, userId);
    if (!inv) throw new NotFoundException('Investment not found');
    await this.investmentsRepository.remove(inv);
  }

  async findTransactions(investmentId: string, userId: string) {
    const inv = await this.investmentsRepository.findOneByUser(
      investmentId,
      userId,
    );
    if (!inv) throw new NotFoundException('Investment not found');
    return this.investmentsRepository.findTransactionsByInvestment(investmentId);
  }

  async addTransaction(
    investmentId: string,
    userId: string,
    dto: CreateInvestmentTransactionDto,
  ) {
    const inv = await this.investmentsRepository.findOneByUser(
      investmentId,
      userId,
    );
    if (!inv) throw new NotFoundException('Investment not found');
    const txn = this.investmentsRepository.createTransaction({
      ...dto,
      investmentId,
      date: new Date(dto.date as string),
    });
    return this.investmentsRepository.saveTransaction(txn);
  }
}
