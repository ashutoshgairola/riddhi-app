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
import AsyncStorage from '@react-native-async-storage/async-storage';
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

// Whether notification capture is user-paused, persisted locally. Shared with
// Sync.tsx (which owns the pause toggle UI) so this constant stays the single
// source of truth for the storage key.
export const CAPTURE_PAUSED_KEY = 'notification-sync/paused';

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

/** Merges FormSheet edit values (Sync's "Edit detection" form — keys `desc`,
 * `amount`, `cat`, `account`, `date`, `type`) back onto a detected view.
 * Amount is stored unsigned (sign comes from `type`, matching how
 * `confirmDetectedItem` builds its payload); an empty account value means
 * Unlinked; editing the date keeps the original time-of-day when known. */
export function applyDetectedEdit(d: DetectedView, v: Record<string, string>): DetectedView {
  const date = v['date']!;
  return {
    ...d,
    merchant: v['desc']!,
    amount: Math.abs(Number(v['amount'])),
    type: v['type'] === 'income' ? 'income' : 'expense',
    suggestedCategory: v['cat']!,
    accountId: v['account'] ? v['account'] : null,
    postedAt: d.postedAt ? date + d.postedAt.slice(10) : `${date}T00:00:00.000Z`,
  };
}

export function notificationSyncSupported(): boolean {
  return Platform.OS === 'android' && isNotificationListenerAvailable;
}

/** Builds the effective allowlist from the live catalog, the device's installed
 * apps, and the user's per-app toggles, then pushes it to the native store.
 * Falls back safely (cached/seed catalog, empty install list off-Android). */
export async function configureAllowlist(): Promise<void> {
  if (!notificationSyncSupported()) return;
  // The pause flag is authoritative here (not just in Sync.tsx's callers) so
  // that every caller — including MonitoredApps.onToggle — is prevented from
  // silently resuming capture by pushing a non-empty allowlist while paused.
  if ((await AsyncStorage.getItem(CAPTURE_PAUSED_KEY)) === '1') {
    await setAllowlist([]);
    return;
  }
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

/** Upper bound on how many pending detections a single fetch pulls. The
 * screen only renders a small window at a time (see `Sync.tsx`), and the
 * backend clamps to its own max — this keeps the payload (and the number of
 * blur-heavy `DetectedCard`s that can ever mount) bounded so a large backlog
 * can't blank the review screen. */
export const DETECTED_FETCH_LIMIT = 50;

export async function fetchDetected(
  limit: number = DETECTED_FETCH_LIMIT,
): Promise<DetectedView[]> {
  return apiClient.get<DetectedView[]>(`/notification-sync/pending?limit=${limit}`);
}

export async function confirmDetected(id: string, payload: ConfirmPayload): Promise<void> {
  await apiClient.post(`/notification-sync/${id}/confirm`, payload);
}

export async function dismissDetected(id: string): Promise<void> {
  await apiClient.post(`/notification-sync/${id}/dismiss`, {});
}

/** Triggers an immediate server-side analysis pass for the current user
 * (SMS + notification captures), independent of the cron. Returns how many
 * new detections it produced. Safe to call repeatedly — the server no-ops when
 * there are no unanalyzed captures. */
export async function analyzeNow(): Promise<{ detected: number }> {
  return apiClient.post<{ detected: number }>(`/notification-sync/analyze`, {});
}
