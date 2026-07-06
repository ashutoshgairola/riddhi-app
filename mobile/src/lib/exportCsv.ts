/**
 * Transaction CSV export — builds a CSV from the api layer, writes it to a
 * real `.csv` file in the cache dir, and hands that file to the OS share sheet
 * via expo-sharing (so targets receive an actual attachment, not a text blob).
 * Falls back to RN `Share` with the CSV as text when native sharing is
 * unavailable (e.g. web).
 */
import { Platform, Share } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { api } from '../api';
import type { TxPeriod } from '../api';
import type { TxView } from '../api/types';

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildTxCsv(txs: TxView[]): string {
  const header = 'Date,Description,Category,Type,Amount (INR)';
  const rows = txs.map((tx) =>
    [
      tx.date,
      csvEscape(tx.desc),
      csvEscape(tx.cat),
      tx.type === 'inc' ? 'income' : 'expense',
      String(tx.amount),
    ].join(','),
  );
  return [header, ...rows].join('\n');
}

export interface ExportCsvOptions {
  /** Restrict to a time window (default: all history). */
  period?: TxPeriod;
  /** Restrict to a single account's transactions (account statements). */
  accountId?: string;
  /** Filename stem, e.g. an account name; sanitized to `[a-z0-9-]`. */
  label?: string;
}

function safeFileStem(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'transactions';
}

/**
 * Fetches transactions (optionally scoped by period/account) and opens the OS
 * share sheet with a real CSV file. Accepts a plain period string for the
 * common "export everything in this window" call.
 */
export async function shareTxCsv(
  input: TxPeriod | ExportCsvOptions = 'all',
): Promise<void> {
  const opts: ExportCsvOptions = typeof input === 'string' ? { period: input } : input;
  const txs = await api.transactions.list({
    period: opts.period ?? 'all',
    accountId: opts.accountId,
    limit: 100,
  });
  const csv = buildTxCsv(txs);
  const filename = `riddhi-${safeFileStem(opts.label ?? 'transactions')}.csv`;

  // Native path: write a file and share it as an attachment.
  if (Platform.OS !== 'web' && (await Sharing.isAvailableAsync())) {
    const file = new File(Paths.cache, filename);
    if (file.exists) file.delete();
    file.create();
    file.write(csv);
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      dialogTitle: 'Export transactions',
      UTI: 'public.comma-separated-values-text',
    });
    return;
  }

  // Fallback (web / no share targets): hand the CSV over as text.
  await Share.share({ title: filename, message: csv });
}
