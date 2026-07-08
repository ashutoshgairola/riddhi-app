import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import { TransactionsService } from '../transactions/transactions.service';
import { CategoriesService } from '../categories/categories.service';
import { Transaction } from '../transactions/transaction.entity';
import { CreditCard } from './credit-card.entity';
import { TransactionType, AccountType } from '../common/enums';
import { computeCardSummary, CardTxn, CategoryMeta } from './card-summary';
import { UpdateCardDto } from './dto/update-card.dto';

@Injectable()
export class CreditCardService {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly transactionsService: TransactionsService,
    private readonly categoriesService: CategoriesService,
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    @InjectRepository(CreditCard)
    private readonly cardRepo: Repository<CreditCard>,
  ) {}

  private async loadCard(accountId: string, userId: string): Promise<CreditCard> {
    const card = await this.cardRepo.findOne({ where: { accountId, userId } });
    if (!card) throw new NotFoundException('Credit card not found');
    return card;
  }

  async getSummary(accountId: string, userId: string) {
    const account = await this.accountsService.findOne(accountId, userId);
    if (account.type !== AccountType.CREDIT) {
      throw new BadRequestException('Account is not a credit card');
    }
    const card = await this.loadCard(accountId, userId);

    const [swipes, paymentsIn] = await Promise.all([
      this.txRepo.find({
        where: { userId, accountId, type: TransactionType.EXPENSE },
      }),
      this.txRepo.find({
        where: { userId, destinationAccountId: accountId, type: TransactionType.TRANSFER },
      }),
    ]);

    const toCardTxn = (t: Transaction, isPaymentIn: boolean): CardTxn => ({
      amount: Math.abs(t.amount),
      date: new Date(t.date).toISOString(),
      type: t.type as CardTxn['type'],
      categoryId: t.categoryId,
      isPaymentIn,
    });

    const txns: CardTxn[] = [
      ...swipes.map((t) => toCardTxn(t, false)),
      ...paymentsIn.map((t) => toCardTxn(t, true)),
    ];

    const categoryList = await this.categoriesService.findAll(userId);
    const categories = new Map<string, CategoryMeta>(
      categoryList.map((c) => [c.id, { id: c.id, name: c.name, color: c.color }]),
    );

    const summary = computeCardSummary(
      {
        creditLimit: card.creditLimit,
        statementDay: card.statementDay,
        graceDays: card.graceDays,
        statementDate: card.statementDate,
        statementBilled: card.statementBilled,
        statementMinDue: card.statementMinDue,
        statementDueDate: card.statementDueDate,
        statementRewards: card.statementRewards,
      },
      account.balance,
      txns,
      categories,
      new Date(),
    );

    return {
      creditLimit: card.creditLimit,
      statementDay: card.statementDay,
      graceDays: card.graceDays,
      network: card.network,
      last4: card.last4,
      rewardRate: card.rewardRate,
      ...summary,
      accountId,
      name: account.name,
      institutionName: account.institutionName,
    };
  }

  async updateConfig(accountId: string, userId: string, dto: UpdateCardDto) {
    const card = await this.loadCard(accountId, userId);
    Object.assign(card, dto);
    await this.cardRepo.save(card);
    return this.getSummary(accountId, userId);
  }
}
