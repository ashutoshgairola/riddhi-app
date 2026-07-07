import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './transaction.entity';
import { QueryTransactionsDto } from './dto/query-transactions.dto';

export interface PaginatedTransactions {
  items: Transaction[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class TransactionsRepository {
  constructor(
    @InjectRepository(Transaction)
    private readonly repo: Repository<Transaction>,
  ) {}

  async findAllByUser(
    userId: string,
    query: QueryTransactionsDto,
  ): Promise<PaginatedTransactions> {
    const {
      type,
      search,
      categoryId,
      accountId,
      source,
      from,
      to,
      page = 1,
      limit = 20,
    } = query;

    const qb = this.repo
      .createQueryBuilder('tx')
      .where('tx.userId = :userId', { userId })
      .orderBy('tx.date', 'DESC')
      .addOrderBy('tx.createdAt', 'DESC');

    if (type) {
      qb.andWhere('tx.type = :type', { type });
    }
    if (search) {
      qb.andWhere('tx.description ILIKE :search', { search: `%${search}%` });
    }
    if (categoryId) {
      qb.andWhere('tx.categoryId = :categoryId', { categoryId });
    }
    if (accountId) {
      qb.andWhere('tx.accountId = :accountId', { accountId });
    }
    if (source === 'card') {
      qb.leftJoin('tx.account', 'srcAcc').andWhere('srcAcc.type = :creditType', {
        creditType: 'credit',
      });
    } else if (source === 'bank') {
      qb.leftJoin('tx.account', 'srcAcc').andWhere(
        '(srcAcc.id IS NULL OR srcAcc.type != :creditType)',
        { creditType: 'credit' },
      );
    }
    if (from) {
      qb.andWhere('tx.date >= :from', { from: new Date(from) });
    }
    if (to) {
      // Include entire "to" day by going to end-of-day
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      qb.andWhere('tx.date <= :to', { to: toDate });
    }

    const skip = (page - 1) * limit;
    qb.skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();

    return { items, total, page, limit };
  }

  findOneByUser(id: string, userId: string): Promise<Transaction | null> {
    return this.repo.findOne({ where: { id, userId } });
  }

  create(data: Partial<Transaction>): Transaction {
    return this.repo.create(data);
  }

  save(transaction: Transaction): Promise<Transaction> {
    return this.repo.save(transaction);
  }

  async remove(transaction: Transaction): Promise<void> {
    await this.repo.remove(transaction);
  }
}
