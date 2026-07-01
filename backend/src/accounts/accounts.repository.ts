import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from './account.entity';

@Injectable()
export class AccountsRepository {
  constructor(
    @InjectRepository(Account)
    private readonly repo: Repository<Account>,
  ) {}

  findAllByUser(userId: string): Promise<Account[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'ASC' } });
  }

  findOneByUser(id: string, userId: string): Promise<Account | null> {
    return this.repo.findOne({ where: { id, userId } });
  }

  findAllIncludedInNetWorthByUser(userId: string): Promise<Account[]> {
    return this.repo.find({
      where: { userId, includeInNetWorth: true },
    });
  }

  create(data: Partial<Account>): Account {
    return this.repo.create(data);
  }

  save(account: Account): Promise<Account> {
    return this.repo.save(account);
  }

  async remove(account: Account): Promise<void> {
    await this.repo.remove(account);
  }
}
