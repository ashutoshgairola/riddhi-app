import { PriceHistoryEntry, SubscriptionCycle, SubscriptionStatus } from './subscription.entity';

export const RENEWAL_SOON_DAYS = 14;
export const FORGOTTEN_MIN_AGE_DAYS = 180;
export const FORGOTTEN_MIN_YEARLY = 1000;
export const UPCOMING_WINDOW_DAYS = 35;

export interface SummarySub {
  id: string;
  name: string;
  emoji: string;
  color: string;
  amount: number;
  cycle: SubscriptionCycle;
  nextRenewalDate: string;
  firstSeenDate: string;
  status: SubscriptionStatus;
  priceHistory: PriceHistoryEntry[] | null;
  detailOpenedAt: Date | null;
  accountId: string | null;
}

export interface UpcomingItem { subId: string; nextRenewalDate: string; inDays: number; amount: number }

export type SubFlag =
  | { subId: string; name: string; kind: 'hike'; from: number; to: number; pct: number; extraYearly: number }
  | { subId: string; name: string; kind: 'renewal_soon'; inDays: number; amount: number }
  | { subId: string; name: string; kind: 'forgotten'; yearlyCost: number };

export interface SubscriptionSummary {
  monthlyBurn: number;
  yearlyProjection: number;
  activeCount: number;
  upcoming: UpcomingItem[];
  flags: SubFlag[];
}

const dayOnly = (s: string): string => s.slice(0, 10);
const startOfDay = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const daysUntil = (iso: string, today: Date): number =>
  Math.round((new Date(dayOnly(iso) + 'T00:00:00Z').getTime() - startOfDay(today)) / 86400000);

export const monthlyEquiv = (s: SummarySub): number => (s.cycle === 'yearly' ? s.amount / 12 : s.amount);
const yearlyCost = (s: SummarySub): number => (s.cycle === 'yearly' ? s.amount : s.amount * 12);

export function computeSubscriptionSummary(subs: SummarySub[], today: Date): SubscriptionSummary {
  const active = subs.filter((s) => s.status === 'active');

  const monthlyBurn = active.reduce((sum, s) => sum + monthlyEquiv(s), 0);
  const yearlyProjection = active.reduce((sum, s) => sum + yearlyCost(s), 0);

  const upcoming: UpcomingItem[] = active
    .map((s) => ({ subId: s.id, nextRenewalDate: dayOnly(s.nextRenewalDate), inDays: daysUntil(s.nextRenewalDate, today), amount: s.amount }))
    .filter((u) => u.inDays >= 0 && u.inDays <= UPCOMING_WINDOW_DAYS)
    .sort((a, b) => a.inDays - b.inDays);

  const flags: SubFlag[] = [];
  for (const s of active) {
    if (s.priceHistory && s.priceHistory.length >= 2) {
      const from = s.priceHistory[0].amount;
      const to = s.priceHistory[s.priceHistory.length - 1].amount;
      if (to > from) {
        flags.push({
          subId: s.id, name: s.name, kind: 'hike', from, to,
          pct: Math.round(((to - from) / from) * 100),
          extraYearly: (s.cycle === 'yearly' ? to - from : (to - from) * 12),
        });
      }
    }
    const inDays = daysUntil(s.nextRenewalDate, today);
    if (s.cycle === 'yearly' && inDays >= 0 && inDays <= RENEWAL_SOON_DAYS) {
      flags.push({ subId: s.id, name: s.name, kind: 'renewal_soon', inDays, amount: s.amount });
    }
    const ageDays = daysUntil(s.firstSeenDate, today) * -1;
    if (s.detailOpenedAt == null && ageDays >= FORGOTTEN_MIN_AGE_DAYS && yearlyCost(s) >= FORGOTTEN_MIN_YEARLY) {
      flags.push({ subId: s.id, name: s.name, kind: 'forgotten', yearlyCost: yearlyCost(s) });
    }
  }

  return { monthlyBurn, yearlyProjection, activeCount: active.length, upcoming, flags };
}
