/**
 * notificationSync — Android-only pipeline mirroring smsSync.ts but for
 * NotificationListenerService captures:
 *   1. push the allowlist to the native store,
 *   2. upload un-sent captures to POST /notification-sync/ingest,
 *   3. mark them uploaded natively,
 *   4. fetch backend-detected (LLM-grouped) transactions for review,
 *   5. confirm/dismiss each one.
 */
import { Platform } from 'react-native';
import { apiClient } from '../api/client';
import {
  isNotificationListenerAvailable,
  DEFAULT_ALLOWLIST,
  getPending,
  markUploaded,
  setAllowlist,
} from '../../modules/notification-listener';

const UPLOAD_BATCH = 100;

export interface DetectedView {
  id: string;
  merchant: string | null;
  amount: number | null;
  type: 'income' | 'expense';
  suggestedCategory: string | null;
  accountId: string | null;
  paymentMethod: string;
  confidence: number;
  postedAt: string | null;
}

export interface ConfirmPayload {
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  categoryId: string;
  accountId?: string;
  paymentMethod?: string;
  notes?: string;
}

export function notificationSyncSupported(): boolean {
  return Platform.OS === 'android' && isNotificationListenerAvailable;
}

export async function configureAllowlist(): Promise<void> {
  if (!notificationSyncSupported()) return;
  await setAllowlist(DEFAULT_ALLOWLIST);
}

export async function uploadCaptured(): Promise<number> {
  if (!notificationSyncSupported()) return 0;
  const pending = await getPending(UPLOAD_BATCH * 3);
  if (pending.length === 0) return 0;
  let uploaded = 0;
  for (let i = 0; i < pending.length; i += UPLOAD_BATCH) {
    const batch = pending.slice(i, i + UPLOAD_BATCH);
    await apiClient.post('/notification-sync/ingest', {
      notifications: batch.map((p) => ({
        packageName: p.packageName,
        title: p.title,
        text: p.text,
        postedAt: p.postedAt,
      })),
    });
    await markUploaded(batch.map((p) => p.id));
    uploaded += batch.length;
  }
  return uploaded;
}

export async function fetchDetected(): Promise<DetectedView[]> {
  return apiClient.get<DetectedView[]>('/notification-sync/pending');
}

export async function confirmDetected(id: string, payload: ConfirmPayload): Promise<void> {
  await apiClient.post(`/notification-sync/${id}/confirm`, payload);
}

export async function dismissDetected(id: string): Promise<void> {
  await apiClient.post(`/notification-sync/${id}/dismiss`, {});
}
