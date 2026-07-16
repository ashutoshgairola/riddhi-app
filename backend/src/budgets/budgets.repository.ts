import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { Budget } from './budget.entity';
import { Transaction } from '../transactions/transaction.entity';
import { TransactionCategory } from '../categories/category.entity';
import { TransactionType } from '../common/enums';

@Injectable()
export class BudgetsRepository {
  constructor(
    @InjectRepository(Budget)
    private readonly budgetRepo: Repository<Budget>,
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(TransactionCategory)
    private readonly categoryRepo: Repository<TransactionCategory>,
  ) {}

  /**
   * Flat list of the user's categories with their parent link — used to roll
   * child-category spend up under a parent-linked budget category.
   */
  fetchUserCategories(
    userId: string,
  ): Promise<Array<{ id: string; parentId: string | null }>> {
    return this.categoryRepo.find({
      where: { userId },
      select: ['id', 'parentId'],
    });
  }

  findAllByUser(userId: string): Promise<Budget[]> {
    return this.budgetRepo.find({
      where: { userId },
      relations: ['categories'],
      order: { startDate: 'DESC' },
    });
  }

  findByMonth(userId: string, start: Date, end: Date): Promise<Budget[]> {
    return this.budgetRepo.find({
      where: { userId, startDate: Between(start, end) },
      relations: ['categories'],
      order: { startDate: 'DESC' },
    });
  }

  findOneByUser(id: string, userId: string): Promise<Budget | null> {
    return this.budgetRepo.findOne({
      where: { id, userId },
      relations: ['categories'],
    });
  }

  create(data: Partial<Budget>): Budget {
    return this.budgetRepo.create(data);
  }

  save(budget: Budget): Promise<Budget> {
    return this.budgetRepo.save(budget);
  }

  async remove(budget: Budget): Promise<void> {
    await this.budgetRepo.remove(budget);
  }

  /**
   * Fetch all EXPENSE transactions for the user in [startDate, endDate]
   * whose categoryId is in any of the provided categoryIds.
   * Returns them grouped by categoryId for efficient in-memory summation.
   */
  async fetchExpensesForBudget(
    userId: string,
    startDate: Date,
    endDate: Date,
    categoryIds: string[],
  ): Promise<Map<string, number>> {
    if (categoryIds.length === 0) {
      return new Map();
    }

    // Build end-of-day for endDate to include the full last day
    const toDate = new Date(endDate);
    toDate.setHours(23, 59, 59, 999);

    const transactions = await this.txRepo.find({
      where: {
        userId,
        type: TransactionType.EXPENSE,
        categoryId: In(categoryIds),
      },
      select: ['categoryId', 'amount', 'date'],
    });

    // Filter by date range and sum per categoryId
    const spentMap = new Map<string, number>();
    for (const tx of transactions) {
      const txDate = new Date(tx.date);
      if (txDate >= startDate && txDate <= toDate) {
        const prev = spentMap.get(tx.categoryId) ?? 0;
        spentMap.set(tx.categoryId, prev + tx.amount);
      }
    }

    return spentMap;
  }
}
