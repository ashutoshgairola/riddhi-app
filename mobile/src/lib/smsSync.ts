/**
 * smsSync — Android-only pipeline that turns bank SMS into reviewable
 * transactions:
 *
 *   1. request the READ_SMS runtime permission,
 *   2. read the recent inbox via the local `sms-reader` native module,
 *   3. drop messages already processed (persisted id set) + non-currency noise,
 *   4. send the survivors to the backend parser (`POST /sms-sync/parse-batch`),
 *   5. map the parsed results into the `SyncDetected` shape the Sync screen
 *      renders.
 *
 * Message bodies are only sent to the app's own backend for parsing; nothing
 * is written back to the device and ids of confirmed/dismissed messages are
 * remembered so they don't resurface on the next sync.
 */
import { PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiClient } from '../api/client';
import { getMessages, isSmsReaderAvailable } from '../../modules/sms-reader';
import type { SyncDetected } from '../screens/Sync';

/** Category → accent color, mirroring the backend keyword-map Category union. */
const CAT_COLOR: Record<string, string> = {
  Food: '#c9a86a',
  Groceries: '#7faf93',
  Utilities: '#6fb3ad',
  Bills: '#6fb3ad',
  Income: '#7faf93',
  Shopping: '#c97d8c',
  Transport: '#9d8bd6',
  Entertainment: '#c97d8c',
  Health: '#ef4444',
};
const CAT_ICON: Record<string, string> = {
  Food: '🍽',
  Groceries: '🛒',
  Utilities: '⚡',
  Bills: '⚡',
  Income: '💼',
  Shopping: '🛍',
  Transport: '🚇',
  Entertainment: '🎬',
  Health: '💊',
};
const DEFAULT_COLOR = '#8a8299';

const PROCESSED_IDS_KEY = 'sms-sync/processed-ids';
/** How far back to read on each sync. */
const LOOKBACK_DAYS = 30;
/** Cap the number of ids we remember so the set can't grow unbounded. */
const MAX_REMEMBERED_IDS = 2000;

interface ParsedSms {
  id: string;
  raw: string;
  merchant: string | null;
  amount: number | null;
  type: 'income' | 'expense';
  category: string | null;
  account: string | null;
  bank: string | null;
  last4: string | null;
  confidence: number;
}

/** True only where the native reader is linked (an Android dev/preview build). */
export function smsSyncSupported(): boolean {
  return Platform.OS === 'android' && isSmsReaderAvailable;
}

/** Requests READ_SMS, returning whether it is now granted. */
export async function ensureSmsPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const already = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
  if (already) return true;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
    title: 'Read bank SMS',
    message:
      'Riddhi reads transaction alerts from your bank SMS to suggest entries. Messages are parsed for amounts and merchants only.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

async function loadProcessedIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(PROCESSED_IDS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Marks message ids as processed so they never resurface as suggestions. */
export async function rememberProcessed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const set = await loadProcessedIds();
  for (const id of ids) set.add(id);
  const trimmed = Array.from(set).slice(-MAX_REMEMBERED_IDS);
  try {
    await AsyncStorage.setItem(PROCESSED_IDS_KEY, JSON.stringify(trimmed));
  } catch {
    // Non-fatal: worst case a suggestion reappears next sync.
  }
}

const looksLikeMoney = (body: string) => /(?:₹|rs\.?|inr)\s*[\d,]/i.test(body);

/**
 * Reads recent SMS and returns parsed, not-yet-processed transaction
 * suggestions. Assumes the permission is already granted (call
 * `ensureSmsPermission` first); returns [] on unsupported platforms.
 */
export async function fetchSmsSuggestions(): Promise<SyncDetected[]> {
  if (!smsSyncSupported()) return [];

  const since = Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000;
  const messages = await getMessages(since, 300);
  const processed = await loadProcessedIds();

  const candidates = messages
    .filter((m) => !processed.has(m.id) && looksLikeMoney(m.body))
    .map((m) => ({ id: m.id, raw: m.body }));
  if (candidates.length === 0) return [];

  const parsed = await apiClient.post<ParsedSms[]>('/sms-sync/parse-batch', {
    messages: candidates,
  });

  return parsed.map((p) => {
    const cat = p.category ?? 'Other';
    const signedAmount = p.type === 'income' ? Math.abs(p.amount ?? 0) : -Math.abs(p.amount ?? 0);
    return {
      id: p.id,
      raw: p.raw,
      bank: p.bank ?? 'Bank',
      amount: signedAmount,
      merchant: p.merchant ?? p.bank ?? 'Transaction',
      icon: CAT_ICON[cat] ?? '💳',
      cat,
      catCol: CAT_COLOR[cat] ?? DEFAULT_COLOR,
      account: p.account ?? '',
      time: new Date().toISOString().slice(0, 10),
      conf: p.confidence,
    };
  });
}
