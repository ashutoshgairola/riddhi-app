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
  DECLARED_QUERY_PACKAGES,
  getPending,
  markUploaded,
  setAllowlist,
  getInstalledPackages,
} from '../../modules/notification-listener';
import { fetchCatalog } from './catalogSource';
import { resolveAllowlist } from './allowlistResolver';
import { getToggles } from './toggleStore';

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

/** Builds the effective allowlist from the live catalog, the device's installed
 * apps, and the user's per-app toggles, then pushes it to the native store.
 * Falls back safely (cached/seed catalog, empty install list off-Android). */
export async function configureAllowlist(): Promise<void> {
  if (!notificationSyncSupported()) return;
  const catalog = await fetchCatalog();
  const installed = await getInstalledPackages(catalog.map((c) => c.packageName));
  const toggles = await getToggles();
  const effective = resolveAllowlist(catalog, installed, DECLARED_QUERY_PACKAGES, toggles);
  await setAllowlist(effective);
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
