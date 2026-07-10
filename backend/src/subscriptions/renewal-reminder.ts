import { Subscription } from './subscription.entity';

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
