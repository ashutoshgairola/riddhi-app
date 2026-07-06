/**
 * Transaction CSV export — builds a CSV from the api layer and hands it to
 * the OS share sheet (RN `Share`). No file-system dependency: the CSV
 * travels as the share payload text, which mail/notes/drive targets accept.
 */
import { Share } from 'react-native';

import { api } from '../api';
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

/** Fetches transactions (optionally period-scoped) and opens the share sheet. */
export async function shareTxCsv(period: 'week' | 'month' | '3m' | 'all' = 'all'): Promise<void> {
  const txs = await api.transactions.list({ period });
  await Share.share({
    title: 'riddhi-transactions.csv',
    message: buildTxCsv(txs),
  });
}
