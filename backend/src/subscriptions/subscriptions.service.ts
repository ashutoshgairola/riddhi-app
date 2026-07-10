import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from './subscription.entity';
import { SubscriptionIgnore } from './subscription-ignore.entity';
import { Transaction } from '../transactions/transaction.entity';
import { CategoriesService } from '../categories/categories.service';
import { CapturedNotification } from '../notification-sync/captured-notification.entity';
import { TransactionType, PaymentMethod } from '../common/enums';
import { detectSubscriptions, normalizeDescriptor, DetectTxn, SubscriptionCandidate } from './detect-subscriptions';
import { isReminderDue } from './renewal-reminder';
import { resolveName, ResolvedName, isAggregator, extractServiceName } from './subscription-catalog';
import { computeSubscriptionSummary, SummarySub } from './subscription-summary';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

export type SubscriptionCandidateView = SubscriptionCandidate & ResolvedName;

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription) private readonly subRepo: Repository<Subscription>,
    @InjectRepository(SubscriptionIgnore) private readonly ignoreRepo: Repository<SubscriptionIgnore>,
    @InjectRepository(Transaction) private readonly txRepo: Repository<Transaction>,
    @InjectRepository(CapturedNotification) private readonly capturedRepo: Repository<CapturedNotification>,
    private readonly categoriesService: CategoriesService,
  ) {}

  /**
   * Best-effort: for an aggregator charge (bank SMS says only "Google Play"),
   * mine the real service name from a captured Play/Gmail receipt notification
   * that both names a service and mentions the amount. Read-only against
   * notification-sync's table; returns null when nothing matches (→ generic
   * aggregator name, user renames at confirm).
   */
  private async findNotificationName(userId: string, amount: number): Promise<string | null> {
    try {
      const notes = await this.capturedRepo.find({ where: { userId }, order: { postedAt: 'DESC' }, take: 200 });
      const amtStr = String(Math.round(amount));
      // Require a currency token immediately before the amount, and no trailing
      // digit — so ₹9 does NOT match "₹99"/"₹99.00", and a bare order-number
      // digit run never matches. Optional ".dd" decimals are allowed.
      const re = new RegExp(`(?:₹|rs\\.?|inr)\\s*${amtStr}(?:\\.\\d{2})?(?!\\d)`, 'i');
      for (const n of notes) {
        const text = `${n.title ?? ''} ${n.text}`;
        const name = extractServiceName(text);
        if (name && re.test(text)) return name;
      }
      return null;
    } catch {
      return null;
    }
  }

  private toSummarySub(s: Subscription): SummarySub {
    return {
      id: s.id, name: s.name, emoji: s.emoji, color: s.color, amount: s.amount,
      cycle: s.cycle, nextRenewalDate: s.nextRenewalDate, firstSeenDate: s.firstSeenDate,
      status: s.status, priceHistory: s.priceHistory, detailOpenedAt: s.detailOpenedAt, accountId: s.accountId,
    };
  }

  async detect(userId: string): Promise<SubscriptionCandidateView[]> {
    const [txns, existing, ignored] = await Promise.all([
      this.txRepo.find({ where: { userId, type: TransactionType.EXPENSE }, relations: ['category'] }),
      this.subRepo.find({ where: { userId } }),
      this.ignoreRepo.find({ where: { userId } }),
    ]);
    const skip = new Set<string>([
      ...existing.map((s) => s.merchantDescriptor),
      ...ignored.map((i) => i.merchantDescriptor),
    ]);
    const detectTxns: DetectTxn[] = txns.map((t) => ({
      id: t.id, date: new Date(t.date).toISOString(), description: t.description,
      amount: Math.abs(t.amount), categoryId: t.categoryId,
      categoryName: (t as any).category?.name ?? '', accountId: t.accountId,
      paymentMethod: t.paymentMethod, isRecurring: t.isRecurring,
    }));
    const candidates = detectSubscriptions(detectTxns, skip, new Date());
    return Promise.all(
      candidates.map(async (c) => {
        const hint = isAggregator(c.merchantDescriptor) ? await this.findNotificationName(userId, c.amount) : null;
        return { ...c, ...(await resolveName(c.merchantDescriptor, { hint })) };
      }),
    );
  }

  async list(userId: string) {
    const subs = await this.subRepo.find({ where: { userId } });
    const summary = computeSubscriptionSummary(subs.map((s) => this.toSummarySub(s)), new Date());
    return { subscriptions: subs, summary };
  }

  async create(userId: string, dto: CreateSubscriptionDto): Promise<Subscription> {
    let categoryId = dto.categoryId ?? null;
    if (!categoryId) {
      const cats = await this.categoriesService.findAll(userId);
      categoryId = cats.find((c) => c.name.toLowerCase() === 'subscriptions')?.id ?? null;
    }
    const sub = this.subRepo.create({
      userId, name: dto.name, merchantDescriptor: normalizeDescriptor(dto.merchantDescriptor),
      emoji: dto.emoji ?? '🔁', color: dto.color ?? '#a78bfa', amount: dto.amount, cycle: dto.cycle,
      nextRenewalDate: dto.nextRenewalDate, firstSeenDate: dto.firstSeenDate,
      status: 'active', accountId: dto.accountId ?? null,
      paymentMethod: (dto.paymentMethod as PaymentMethod) ?? null, categoryId,
      reminderDays: dto.reminderDays ?? null, priceHistory: null, detailOpenedAt: null, lastReminderSentFor: null,
    });
    const saved = await this.subRepo.save(sub);
    for (const id of dto.transactionIds ?? []) {
      await this.txRepo.update({ id, userId }, { subscriptionId: saved.id });
    }
    return saved;
  }

  private async load(userId: string, id: string): Promise<Subscription> {
    const sub = await this.subRepo.findOne({ where: { id, userId } });
    if (!sub) throw new NotFoundException('Subscription not found');
    return sub;
  }

  async update(userId: string, id: string, dto: UpdateSubscriptionDto): Promise<Subscription> {
    const sub = await this.load(userId, id);
    const { markDetailOpened, ...rest } = dto;
    Object.assign(sub, rest);
    if (markDetailOpened && !sub.detailOpenedAt) sub.detailOpenedAt = new Date();
    return this.subRepo.save(sub);
  }

  async remove(userId: string, id: string): Promise<void> {
    const sub = await this.load(userId, id);
    await this.txRepo.update({ subscriptionId: id, userId }, { subscriptionId: null });
    await this.subRepo.remove(sub);
  }

  async dismiss(userId: string, merchantDescriptor: string): Promise<void> {
    const descriptor = normalizeDescriptor(merchantDescriptor);
    const existing = await this.ignoreRepo.findOne({ where: { userId, merchantDescriptor: descriptor } });
    if (existing) return;
    await this.ignoreRepo.save(this.ignoreRepo.create({ userId, merchantDescriptor: descriptor }));
  }

  async dueForReminder(userId: string, today: Date): Promise<Subscription[]> {
    const subs = await this.subRepo.find({ where: { userId, status: 'active' as any } });
    return subs.filter((s) => isReminderDue(s, today));
  }

  async markReminded(id: string, forDate: string): Promise<void> {
    await this.subRepo.update({ id }, { lastReminderSentFor: forDate });
  }

  async allActiveUserIds(): Promise<string[]> {
    const subs = await this.subRepo.find({ where: { status: 'active' as any } });
    return [...new Set(subs.map((s) => s.userId))];
  }
}
