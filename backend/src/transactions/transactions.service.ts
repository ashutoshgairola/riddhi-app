import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  TransactionsRepository,
  PaginatedTransactions,
} from './transactions.repository';
import { AccountsService } from '../accounts/accounts.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { Transaction } from './transaction.entity';
import { TransactionType, TransactionStatus } from '../common/enums';
import { Account } from '../accounts/account.entity';
import type { EntityManager } from 'typeorm';

/**
 * Per-account balance movement for a transaction, before signing for
 * apply/reverse. Income credits the source; expense debits it; a transfer
 * debits the source and credits the destination by the same amount so it
 * conserves money (net-worth neutral).
 */
export function transactionBalanceDeltas(
  type: TransactionType,
  amount: number,
): { source: number; destination: number } {
  switch (type) {
    case TransactionType.INCOME:
      return { source: amount, destination: 0 };
    case TransactionType.TRANSFER:
      return { source: -amount, destination: amount };
    default: // EXPENSE
      return { source: -amount, destination: 0 };
  }
}

interface BalanceEffect {
  accountId: string | null;
  destinationAccountId: string | null;
  amount: number;
  type: TransactionType;
}

@Injectable()
export class TransactionsService {
  constructor(
    private readonly transactionsRepository: TransactionsRepository,
    private readonly accountsService: AccountsService,
    private readonly dataSource: DataSource,
  ) {}

  findAll(
    userId: string,
    query: QueryTransactionsDto,
  ): Promise<PaginatedTransactions> {
    return this.transactionsRepository.findAllByUser(userId, query);
  }

  async findOne(id: string, userId: string): Promise<Transaction> {
    const tx = await this.transactionsRepository.findOneByUser(id, userId);
    if (!tx) throw new NotFoundException('Transaction not found');
    return tx;
  }

  async create(
    userId: string,
    dto: CreateTransactionDto,
  ): Promise<Transaction> {
    // Validate account ownership before starting DB transaction
    if (dto.accountId) {
      const account = await this.accountsService.findOne(dto.accountId, userId);
      if (!account) {
        throw new BadRequestException(
          'Account not found or does not belong to user',
        );
      }
    }
    if (dto.destinationAccountId) {
      const dest = await this.accountsService.findOne(
        dto.destinationAccountId,
        userId,
      );
      if (!dest) {
        throw new BadRequestException(
          'Destination account not found or does not belong to user',
        );
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
        accountId: dto.accountId ?? null,
        destinationAccountId: dto.destinationAccountId ?? null,
        notes: dto.notes ?? null,
      });

      const saved = await queryRunner.manager.save(tx);

      // Update account balances within the same DB transaction
      await this.applyBalances(
        queryRunner.manager,
        userId,
        {
          accountId: dto.accountId ?? null,
          destinationAccountId: dto.destinationAccountId ?? null,
          amount: dto.amount,
          type: dto.type,
        },
        1,
      );

      await queryRunner.commitTransaction();
      return saved;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateTransactionDto,
  ): Promise<Transaction> {
    const tx = await this.findOne(id, userId);

    const oldEffect: BalanceEffect = {
      accountId: tx.accountId,
      destinationAccountId: tx.destinationAccountId,
      amount: tx.amount,
      type: tx.type,
    };

    // Validate new accounts if provided
    if (dto.accountId !== undefined && dto.accountId !== null) {
      const account = await this.accountsService.findOne(dto.accountId, userId);
      if (!account) {
        throw new BadRequestException(
          'Account not found or does not belong to user',
        );
      }
    }
    if (
      dto.destinationAccountId !== undefined &&
      dto.destinationAccountId !== null
    ) {
      const dest = await this.accountsService.findOne(
        dto.destinationAccountId,
        userId,
      );
      if (!dest) {
        throw new BadRequestException(
          'Destination account not found or does not belong to user',
        );
      }
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Determine new effective values
      const newAccountId =
        dto.accountId !== undefined ? (dto.accountId ?? null) : tx.accountId;
      const newDestinationAccountId =
        dto.destinationAccountId !== undefined
          ? (dto.destinationAccountId ?? null)
          : tx.destinationAccountId;
      const newAmount = dto.amount !== undefined ? dto.amount : tx.amount;
      const newType = dto.type !== undefined ? dto.type : tx.type;

      // Reverse the old balance effect
      await this.applyBalances(queryRunner.manager, userId, oldEffect, -1);

      // Apply updates to transaction
      Object.assign(tx, {
        ...dto,
        date: dto.date ? new Date(dto.date) : tx.date,
        accountId: newAccountId,
        destinationAccountId: newDestinationAccountId,
      });
      const saved = await queryRunner.manager.save(tx);

      // Apply the new balance effect
      await this.applyBalances(
        queryRunner.manager,
        userId,
        {
          accountId: newAccountId,
          destinationAccountId: newDestinationAccountId,
          amount: newAmount,
          type: newType,
        },
        1,
      );

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
      await this.applyBalances(
        queryRunner.manager,
        userId,
        {
          accountId: tx.accountId,
          destinationAccountId: tx.destinationAccountId,
          amount: tx.amount,
          type: tx.type,
        },
        -1,
      );

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
   * Apply (sign=1) or reverse (sign=-1) a transaction's effect on account
   * balances. A transfer moves money only when it has both a source and a
   * destination account; otherwise it leaves balances untouched so money is
   * never created or destroyed.
   */
  private async applyBalances(
    manager: EntityManager,
    userId: string,
    effect: BalanceEffect,
    sign: 1 | -1,
  ): Promise<void> {
    const { accountId, destinationAccountId, amount, type } = effect;

    if (
      type === TransactionType.TRANSFER &&
      (!accountId || !destinationAccountId)
    ) {
      return;
    }

    const { source, destination } = transactionBalanceDeltas(type, amount);
    if (accountId) {
      await this.adjustAccount(manager, userId, accountId, source * sign);
    }
    if (destinationAccountId) {
      await this.adjustAccount(
        manager,
        userId,
        destinationAccountId,
        destination * sign,
      );
    }
  }

  private async adjustAccount(
    manager: EntityManager,
    userId: string,
    accountId: string,
    delta: number,
  ): Promise<void> {
    if (delta === 0) return;
    const account = await manager.findOne(Account, {
      where: { id: accountId, userId },
    });
    if (!account) {
      throw new BadRequestException('Account not found or not owned by user');
    }
    account.balance = Math.round((account.balance + delta) * 100) / 100;
    account.lastUpdated = new Date();
    await manager.save(account);
  }
}
