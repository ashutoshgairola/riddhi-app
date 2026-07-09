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
import { CreditCard } from '../credit-card/credit-card.entity';
import { resolvePaymentSource } from './payment-source-resolver';
import { isLikelyDuplicateOfExisting } from '../statements/reverse-dedup';
import { ExistingTxn } from '../statements/statement-dedup';
import { DetectedStatus, NotificationType, TransactionType } from '../common/enums';
import { NOTIFICATION_CATALOG, CatalogEntry } from './catalog.constant';

@Injectable()
export class NotificationSyncService {
  constructor(
    @InjectRepository(CapturedNotification)
    private readonly captures: Repository<CapturedNotification>,
    @InjectRepository(DetectedTransaction)
    private readonly detected: Repository<DetectedTransaction>,
    @InjectRepository(Account)
    private readonly accounts: Repository<Account>,
    @InjectRepository(CreditCard)
    private readonly cards: Repository<CreditCard>,
    private readonly analysis: NotificationAnalysisService,
    private readonly notifications: NotificationsService,
    private readonly transactions: TransactionsService,
  ) {}

  /** The canonical app catalog the mobile client fetches to build its
   * notification allowlist. Static today; a DB-backed catalog can replace
   * this without changing the controller contract. */
  getCatalog(): CatalogEntry[] {
    return NOTIFICATION_CATALOG;
  }

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
    // Only credit accounts carry a last4 (on their credit_card row); use it to
    // resolve card spends by the exact card and to dedup against existing txns.
    const cardRows = await this.cards.find({ where: { userId } });
    const last4ByAccount = new Map(cardRows.map((c) => [c.accountId, c.last4]));
    const augmentedAccounts = userAccounts.map((a) => ({
      id: a.id,
      institutionName: a.institutionName,
      type: a.type,
      last4: last4ByAccount.get(a.id) ?? null,
    }));
    const keyToPostedAt = new Map(captures.map((c) => [c.dedupKey, c.postedAt]));

    let detected = 0;
    for (const g of groups) {
      const { accountId, paymentMethod } = resolvePaymentSource(
        g.institution,
        g.rail,
        augmentedAccounts,
        g.last4,
      );
      const postedAt =
        g.sourceKeys.map((k) => keyToPostedAt.get(k)).find(Boolean) ?? null;

      // Reverse dedup: when we know the account, skip a detection that already
      // matches an existing transaction (including one imported from a
      // statement) so the same charge isn't surfaced twice. Only possible when
      // accountId resolved — without it we can't scope the candidate query.
      if (accountId) {
        const when = postedAt ?? new Date();
        const from = new Date(when.getTime() - 5 * 86_400_000);
        const to = new Date(when.getTime() + 5 * 86_400_000);
        const rows = await this.transactions.findForAccountInRange(
          userId,
          accountId,
          from,
          to,
        );
        const existing: ExistingTxn[] = rows.map((t) => ({
          id: t.id,
          isoDate: new Date(t.date).toISOString().slice(0, 10),
          amount: Math.abs(t.amount),
          direction:
            t.type === TransactionType.INCOME
              ? 'credit'
              : t.type === TransactionType.TRANSFER
                ? t.accountId === accountId
                  ? 'debit'
                  : 'credit'
                : 'debit',
          descriptor: t.description ?? '',
          importFingerprint: t.importFingerprint ?? null,
        }));
        const candidate = {
          isoDate: when.toISOString().slice(0, 10),
          amount: g.amount as number,
          direction: (g.type === 'income' ? 'credit' : 'debit') as 'credit' | 'debit',
          descriptor: g.merchant ?? '',
          category: null,
        };
        if (isLikelyDuplicateOfExisting(candidate, existing)) continue;
      }

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
        type: NotificationType.MUNSHI_SUGGESTION,
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
