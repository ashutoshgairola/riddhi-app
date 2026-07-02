import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionCategory } from './category.entity';

@Injectable()
export class CategoriesRepository {
  constructor(
    @InjectRepository(TransactionCategory)
    private readonly repo: Repository<TransactionCategory>,
  ) {}

  findAllByUser(userId: string): Promise<TransactionCategory[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'ASC' } });
  }

  findOneByUser(
    id: string,
    userId: string,
  ): Promise<TransactionCategory | null> {
    return this.repo.findOne({ where: { id, userId } });
  }

  create(data: Partial<TransactionCategory>): TransactionCategory {
    return this.repo.create(data);
  }

  save(category: TransactionCategory): Promise<TransactionCategory> {
    return this.repo.save(category);
  }

  async remove(category: TransactionCategory): Promise<void> {
    await this.repo.remove(category);
  }
}
