/**
 * Pure mapping from a parsed-SMS wire item (backend `/sms-sync/parse-batch`)
 * to the `SyncDetected` shape the Sync screen renders. Kept free of RN/native
 * imports so the mobile ts-jest harness can exercise it (see jest.config.js).
 */
import type { PaymentMethod } from '../api/types';
import type { SyncDetected } from '../screens/Sync';

export interface ParsedSmsWire {
  id: string;
  raw: string;
  merchant: string | null;
  amount: number;
  type: 'income' | 'expense';
  category: string | null;
  account: string | null;
  bank: string | null;
  last4: string | null;
  confidence: number;
  paymentMethod: PaymentMethod;
  accountId: string | null;
  possibleDuplicate: boolean;
}

/** Category → accent color, mirroring the backend keyword-map Category union. */
const CAT_COLOR: Record<string, string> = {
  Food: '#c9a86a', Groceries: '#7faf93', Utilities: '#6fb3ad', Bills: '#6fb3ad',
  Income: '#7faf93', Shopping: '#c97d8c', Transport: '#9d8bd6', Entertainment: '#c97d8c', Health: '#ef4444',
};
const CAT_ICON: Record<string, string> = {
  Food: '🍽', Groceries: '🛒', Utilities: '⚡', Bills: '⚡', Income: '💼',
  Shopping: '🛍', Transport: '🚇', Entertainment: '🎬', Health: '💊',
};
const DEFAULT_COLOR = '#8a8299';

export function toSyncDetected(p: ParsedSmsWire, isoDate: string): SyncDetected {
  const cat = p.category ?? 'Other';
  const signedAmount = p.type === 'income' ? Math.abs(p.amount) : -Math.abs(p.amount);
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
    time: isoDate,
    conf: p.confidence,
    paymentMethod: p.paymentMethod,
    accountId: p.accountId ?? undefined,
    possibleDuplicate: p.possibleDuplicate,
  };
}

/** Rows safe to bulk-add — excludes likely reverse-duplicates (user confirms
 * those individually). */
export function nonDuplicates(list: SyncDetected[]): SyncDetected[] {
  return list.filter((d) => !d.possibleDuplicate);
}
