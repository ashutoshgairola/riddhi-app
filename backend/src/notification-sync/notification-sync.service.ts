import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CapturedNotification } from './captured-notification.entity';
import { DetectedTransaction } from './detected-transaction.entity';
import { IngestItemDto } from './dto/ingest.dto';
import { ConfirmDetectedDto } from './dto/confirm.dto';
import { computeDedupKey } from './dedup';
import { NotificationAnalysisService } from './notification-analysis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TransactionsService } from '../transactions/transactions.service';
import { Account } from '../accounts/account.entity';
import { resolvePaymentSource } from './payment-source-resolver';
import { DetectedStatus, NotificationType, TransactionType } from '../common/enums';

@Injectable()
export class NotificationSyncService {
  constructor(
    @InjectRepository(CapturedNotification)
    private readonly captures: Repository<CapturedNotification>,
    @InjectRepository(DetectedTransaction)
    private readonly detected: Repository<DetectedTransaction>,
    @InjectRepository(Account)
    private readonly accounts: Repository<Account>,
    private readonly analysis: NotificationAnalysisService,
    private readonly notifications: NotificationsService,
    private readonly transactions: TransactionsService,
  ) {}

  /**
   * Persist a batch of raw captures, dropping rows that collide on
   * (userId, dedupKey). Uses an ON CONFLICT DO NOTHING insert so a re-upload
   * of the same notification is a silent no-op.
   */
  async ingest(userId: string, items: IngestItemDto[]): Promise<{ inserted: number }> {
    if (items.length === 0) return { inserted: 0 };
    const rows = items.map((i) =>
      this.captures.create({
        userId,
        packageName: i.packageName,
        title: i.title ?? null,
        text: i.text,
        postedAt: new Date(i.postedAt),
        dedupKey: computeDedupKey(i.packageName, i.text, i.postedAt),
        analyzed: false,
      }),
    );
    const res = await this.captures
      .createQueryBuilder()
      .insert()
      .values(rows)
      .orIgnore() // ON CONFLICT DO NOTHING
      .execute();
    return { inserted: res.identifiers.filter(Boolean).length };
  }

  /**
   * Analyse this user's un-analysed captures in one LLM call, turn each returned
   * group into a pending DetectedTransaction (resolving its payment source),
   * mark the captures analysed, and push a summary if anything was found.
   */
  async runAnalysisForUser(userId: string): Promise<{ detected: number }> {
    const captures = await this.captures.find({
      where: { userId, analyzed: false },
      order: { postedAt: 'ASC' },
      take: 150,
    });
    if (captures.length === 0) return { detected: 0 };

    const groups = await this.analysis.analyze(
      captures.map((c) => ({
        dedupKey: c.dedupKey,
        packageName: c.packageName,
        title: c.title,
        text: c.text,
      })),
    );

    const userAccounts = await this.accounts.find({ where: { userId } });
    const keyToPostedAt = new Map(captures.map((c) => [c.dedupKey, c.postedAt]));

    let detected = 0;
    for (const g of groups) {
      const { accountId, paymentMethod } = resolvePaymentSource(
        g.institution,
        g.rail,
        userAccounts,
      );
      const postedAt =
        g.sourceKeys.map((k) => keyToPostedAt.get(k)).find(Boolean) ?? null;
      await this.detected.save(
        this.detected.create({
          userId,
          merchant: g.merchant,
          amount: g.amount,
          type: g.type === 'income' ? TransactionType.INCOME : TransactionType.EXPENSE,
          suggestedCategory: g.category,
          accountId,
          paymentMethod,
          confidence: g.confidence,
          status: DetectedStatus.PENDING,
          sourceKeys: g.sourceKeys,
          transactionId: null,
          postedAt,
        }),
      );
      detected += 1;
    }

    await this.captures.update(
      { id: In(captures.map((c) => c.id)) },
      { analyzed: true },
    );

    if (detected > 0) {
      await this.notifications.create(userId, {
        type: NotificationType.LARGE_TRANSACTION,
        title: 'New transactions to review',
        body: `Munshi found ${detected} transaction${detected === 1 ? '' : 's'} from your notifications.`,
        data: { screen: 'sync' },
      });
    }
    return { detected };
  }

  listPending(userId: string): Promise<DetectedTransaction[]> {
    return this.detected.find({
      where: { userId, status: DetectedStatus.PENDING },
      order: { createdAt: 'DESC' },
    });
  }

  private async loadPending(userId: string, id: string): Promise<DetectedTransaction> {
    const det = await this.detected.findOne({ where: { id, userId } });
    if (!det || det.status !== DetectedStatus.PENDING) {
      throw new NotFoundException('Detected transaction not found');
    }
    return det;
  }

  async confirm(
    userId: string,
    id: string,
    dto: ConfirmDetectedDto,
  ): Promise<{ transactionId: string }> {
    const det = await this.loadPending(userId, id);
    const tx = await this.transactions.create(userId, {
      date: dto.date,
      description: dto.description,
      amount: dto.amount,
      type: dto.type,
      categoryId: dto.categoryId,
      accountId: dto.accountId,
      paymentMethod: dto.paymentMethod,
      notes: dto.notes,
    });
    det.status = DetectedStatus.CONFIRMED;
    det.transactionId = tx.id;
    await this.detected.save(det);
    return { transactionId: tx.id };
  }

  async dismiss(userId: string, id: string): Promise<{ ok: true }> {
    const det = await this.loadPending(userId, id);
    det.status = DetectedStatus.DISMISSED;
    await this.detected.save(det);
    return { ok: true };
  }
}
