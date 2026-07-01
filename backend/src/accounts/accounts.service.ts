import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountsRepository } from './accounts.repository';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { Account } from './account.entity';

export interface NetWorthResult {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
}

@Injectable()
export class AccountsService {
  constructor(private readonly accountsRepository: AccountsRepository) {}

  findAll(userId: string): Promise<Account[]> {
    return this.accountsRepository.findAllByUser(userId);
  }

  async findOne(id: string, userId: string): Promise<Account> {
    const account = await this.accountsRepository.findOneByUser(id, userId);
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  async create(userId: string, dto: CreateAccountDto): Promise<Account> {
    const account = this.accountsRepository.create({
      ...dto,
      userId,
      lastUpdated: new Date(),
    });
    return this.accountsRepository.save(account);
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateAccountDto,
  ): Promise<Account> {
    const account = await this.findOne(id, userId);
    Object.assign(account, dto, { lastUpdated: new Date() });
    return this.accountsRepository.save(account);
  }

  async remove(id: string, userId: string): Promise<void> {
    const account = await this.findOne(id, userId);
    await this.accountsRepository.remove(account);
  }

  async computeNetWorth(userId: string): Promise<NetWorthResult> {
    const accounts =
      await this.accountsRepository.findAllIncludedInNetWorthByUser(userId);

    let totalAssets = 0;
    let totalLiabilities = 0;

    for (const acc of accounts) {
      if (acc.balance > 0) {
        totalAssets += acc.balance;
      } else {
        totalLiabilities += Math.abs(acc.balance);
      }
    }

    const netWorth = totalAssets - totalLiabilities;

    return {
      netWorth: Math.round(netWorth * 100) / 100,
      totalAssets: Math.round(totalAssets * 100) / 100,
      totalLiabilities: Math.round(totalLiabilities * 100) / 100,
    };
  }
}
