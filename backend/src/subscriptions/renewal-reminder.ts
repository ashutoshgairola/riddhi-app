import { Subscription, SubscriptionCycle } from './subscription.entity';
import { addCycle } from './detect-subscriptions';

const dayOnly = (s: string): string => s.slice(0, 10);

export function isReminderDue(
  sub: Pick<Subscription, 'status' | 'reminderDays' | 'nextRenewalDate' | 'lastReminderSentFor'>,
  today: Date,
): boolean {
  if (sub.status !== 'active') return false;
  if (sub.reminderDays == null) return false;
  if (sub.lastReminderSentFor && dayOnly(sub.lastReminderSentFor) === dayOnly(sub.nextRenewalDate)) return false;
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const inDays = Math.round((new Date(dayOnly(sub.nextRenewalDate) + 'T00:00:00Z').getTime() - start) / 86400000);
  return inDays >= 0 && inDays <= sub.reminderDays;
}

/** Advance a renewal date by whole cycles until it is >= today. */
export function rollForwardRenewal(nextRenewalDate: string, cycle: SubscriptionCycle, today: Date): string {
  const todayIso = today.toISOString().slice(0, 10);
  let d = nextRenewalDate.slice(0, 10);
  let guard = 0;
  while (d < todayIso && guard++ < 1000) d = addCycle(d, cycle);
  return d;
}
