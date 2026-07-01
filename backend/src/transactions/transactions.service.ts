import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TransactionsRepository, PaginatedTransactions } from './transactions.repository';
import { AccountsService } from '../accounts/accounts.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { Transaction } from './transaction.entity';
import { TransactionType, TransactionStatus } from '../common/enums';
import { Account } from '../accounts/account.entity';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly transactionsRepository: TransactionsRepository,
    private readonly accountsService: AccountsService,
    private readonly dataSource: DataSource,
  ) {}

  findAll(userId: string, query: QueryTransactionsDto): Promise<PaginatedTransactions> {
    return this.transactionsRepository.findAllByUser(userId, query);
  }

  async findOne(id: string, userId: string): Promise<Transaction> {
    const tx = await this.transactionsRepository.findOneByUser(id, userId);
    if (!tx) throw new NotFoundException('Transaction not found');
    return tx;
  }

  async create(userId: string, dto: CreateTransactionDto): Promise<Transaction> {
    // Validate account ownership before starting DB transaction
    if (dto.accountId) {
      const account = await this.accountsService.findOne(dto.accountId, userId);
      if (!account) {
        throw new BadRequestException('Account not found or does not belong to user');
      }
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Create transaction
      const tx = this.transactionsRepository.create({
        ...dto,
        date: new Date(dto.date),
        userId,
        status: dto.status ?? TransactionStatus.CLEARED,
        tags: dto.tags ?? [],
        attachments: dto.attachments ?? [],
        isRecurring: dto.isRecurring ?? false,
        recurringDetails: dto.recurringDetails ?? null,
        notes: dto.notes ?? null,
        accountId: dto.accountId ?? null,
      });

      const saved = await queryRunner.manager.save(tx);

      // Update account balance within the same DB transaction
      if (dto.accountId) {
        const account = await queryRunner.manager.findOne(Account, {
          where: { id: dto.accountId, userId },
        });
        if (!account) {
          throw new BadRequestException('Account not found or not owned by user');
        }
        account.balance = this.applyBalanceDelta(account.balance, dto.amount, dto.type);
        account.lastUpdated = new Date();
        await queryRunner.manager.save(account);
      }

      await queryRunner.commitTransaction();
      return saved;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async update(id: string, userId: string, dto: UpdateTransactionDto): Promise<Transaction> {
    const tx = await this.findOne(id, userId);

    const oldAccountId = tx.accountId;
    const oldAmount = tx.amount;
    const oldType = tx.type;

    // Validate new account if provided
    if (dto.accountId !== undefined && dto.accountId !== null) {
      const account = await this.accountsService.findOne(dto.accountId, userId);
      if (!account) {
        throw new BadRequestException('Account not found or does not belong to user');
      }
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Determine new effective values
      const newAccountId = dto.accountId !== undefined ? (dto.accountId ?? null) : oldAccountId;
      const newAmount = dto.amount !== undefined ? dto.amount : oldAmount;
      const newType = dto.type !== undefined ? dto.type : oldType;

      // Reverse old balance effect
      if (oldAccountId) {
        const oldAccount = await queryRunner.manager.findOne(Account, {
          where: { id: oldAccountId, userId },
        });
        if (!oldAccount) {
          throw new BadRequestException('Account not found or not owned by user');
        }
        oldAccount.balance = this.reverseBalanceDelta(oldAccount.balance, oldAmount, oldType);
        oldAccount.lastUpdated = new Date();
        await queryRunner.manager.save(oldAccount);
      }

      // Apply updates to transaction
      Object.assign(tx, {
        ...dto,
        date: dto.date ? new Date(dto.date) : tx.date,
        accountId: newAccountId,
      });
      const saved = await queryRunner.manager.save(tx);

      // Apply new balance effect
      if (newAccountId) {
        const newAccount = await queryRunner.manager.findOne(Account, {
          where: { id: newAccountId, userId },
        });
        if (!newAccount) {
          throw new BadRequestException('Account not found or not owned by user');
        }
        newAccount.balance = this.applyBalanceDelta(newAccount.balance, newAmount, newType);
        newAccount.lastUpdated = new Date();
        await queryRunner.manager.save(newAccount);
      }

      await queryRunner.commitTransaction();
      return saved;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(id: string, userId: string): Promise<void> {
    const tx = await this.findOne(id, userId);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Reverse balance effect before deleting
      if (tx.accountId) {
        const account = await queryRunner.manager.findOne(Account, {
          where: { id: tx.accountId, userId },
        });
        if (!account) {
          throw new BadRequestException('Account not found or not owned by user');
        }
        account.balance = this.reverseBalanceDelta(account.balance, tx.amount, tx.type);
        account.lastUpdated = new Date();
        await queryRunner.manager.save(account);
      }

      await queryRunner.manager.remove(tx);
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Apply balance delta: income → +amount, expense/transfer → -amount
   */
  private applyBalanceDelta(
    currentBalance: number,
    amount: number,
    type: TransactionType,
  ): number {
    const delta = type === TransactionType.INCOME ? amount : -amount;
    return Math.round((currentBalance + delta) * 100) / 100;
  }

  /**
   * Reverse a previously applied balance delta (inverse of applyBalanceDelta)
   */
  private reverseBalanceDelta(
    currentBalance: number,
    amount: number,
    type: TransactionType,
  ): number {
    const delta = type === TransactionType.INCOME ? -amount : amount;
    return Math.round((currentBalance + delta) * 100) / 100;
  }
}
