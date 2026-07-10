import { SubView, SubCandidateView } from '../api/subscriptions';

export function formatInr(n: number): string {
  return '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN');
}

export function payTag(sub: { paymentMethod: string | null }): { label: string; icon: 'card' | 'bank' | 'upi' } {
  const pm = (sub.paymentMethod ?? '').toLowerCase();
  if (pm === 'card' || pm === 'credit_card') return { label: 'Card', icon: 'card' };
  if (pm === 'netbanking' || pm === 'ach' || pm === 'bank') return { label: 'Bank', icon: 'bank' };
  return { label: 'UPI', icon: 'upi' };
}

export interface CreateSubPayload {
  name: string; merchantDescriptor: string; emoji: string; color: string;
  amount: number; cycle: 'monthly' | 'yearly'; nextRenewalDate: string; firstSeenDate: string;
  accountId: string | null; paymentMethod: string | null; categoryId: string;
  reminderDays: number | null; transactionIds: string[];
}

export function candidateToCreatePayload(c: SubCandidateView, reminderDays: number | null): CreateSubPayload {
  return {
    name: c.name, merchantDescriptor: c.merchantDescriptor, emoji: c.emoji, color: c.color,
    amount: c.amount, cycle: c.cycle, nextRenewalDate: c.nextRenewalDate, firstSeenDate: c.firstSeenDate,
    accountId: c.accountId, paymentMethod: c.paymentMethod, categoryId: c.categoryId,
    reminderDays, transactionIds: c.transactionIds,
  };
}

export function filterByTab(subs: SubView[], tab: 'all' | 'active' | 'paused'): SubView[] {
  const visible = subs.filter((s) => s.status !== 'cancelled');
  if (tab === 'active') return visible.filter((s) => s.status === 'active');
  if (tab === 'paused') return visible.filter((s) => s.status === 'paused');
  return visible;
}
