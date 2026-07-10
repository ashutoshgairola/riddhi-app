import { apiClient } from './client';

export type SubCycle = 'monthly' | 'yearly';
export type SubStatus = 'active' | 'paused' | 'cancelled';

export interface SubView {
  id: string; name: string; emoji: string; color: string;
  amount: number; cycle: SubCycle; status: SubStatus;
  nextRenewalDate: string; firstSeenDate: string;
  priceHistory: { amount: number; since: string }[] | null;
  accountId: string | null; paymentMethod: string | null;
  reminderDays?: number | null; detailOpenedAt?: string | null;
}

export interface SubCandidateView {
  merchantDescriptor: string; rawDescription: string; name: string; emoji: string; color: string;
  amount: number; cycle: SubCycle; nextRenewalDate: string; firstSeenDate: string;
  accountId: string | null; paymentMethod: string | null; categoryId: string;
  priceHistory: { amount: number; since: string }[]; transactionIds: string[]; occurrences: number;
}

export type SubFlagView =
  | { subId: string; name: string; kind: 'hike'; from: number; to: number; pct: number; extraYearly: number }
  | { subId: string; name: string; kind: 'renewal_soon'; inDays: number; amount: number }
  | { subId: string; name: string; kind: 'forgotten'; yearlyCost: number };

export interface SubSummaryView {
  monthlyBurn: number; yearlyProjection: number; activeCount: number;
  upcoming: { subId: string; nextRenewalDate: string; inDays: number; amount: number }[];
  flags: SubFlagView[];
}

export interface SubListView extends SubSummaryView { subscriptions: SubView[] }

export function mapSubList(raw: { subscriptions: SubView[]; summary: SubSummaryView }): SubListView {
  return { ...raw.summary, subscriptions: raw.subscriptions };
}

export const subscriptionsApi = {
  async detect(): Promise<SubCandidateView[]> {
    return apiClient.get<SubCandidateView[]>('/subscriptions/detect');
  },
  async list(): Promise<SubListView> {
    const raw = await apiClient.get<{ subscriptions: SubView[]; summary: SubSummaryView }>('/subscriptions');
    return mapSubList(raw);
  },
  async create(payload: Partial<SubCandidateView> & { name: string; merchantDescriptor: string; amount: number; cycle: SubCycle; nextRenewalDate: string; firstSeenDate: string }): Promise<SubView> {
    return apiClient.post<SubView>('/subscriptions', payload);
  },
  async update(id: string, patch: Partial<{ name: string; amount: number; cycle: SubCycle; status: SubStatus; nextRenewalDate: string; accountId: string | null; reminderDays: number | null; markDetailOpened: boolean }>): Promise<SubView> {
    return apiClient.patch<SubView>(`/subscriptions/${id}`, patch);
  },
  async remove(id: string): Promise<void> {
    await apiClient.delete<void>(`/subscriptions/${id}`);
  },
  async dismiss(merchantDescriptor: string): Promise<void> {
    await apiClient.post<void>('/subscriptions/dismiss', { merchantDescriptor });
  },
};
