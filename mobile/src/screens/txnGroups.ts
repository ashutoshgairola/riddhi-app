/**
 * txnGroups — pure, RN-free date-grouping helper for the Txns screen
 * (Task P2b). Originally ported verbatim from `MobileTxns.jsx:17–31`, but
 * that version compared a UTC-midnight `today` against local transaction
 * instants, which split same-day transactions across "Today" and a
 * weekday header whenever a txn was timed later in the day (e.g. IST
 * evenings). Fixed to compare local calendar dates instead. Extracted out
 * of `Txns.tsx` (rather than kept inline) so it stays unit-testable under
 * the mobile's pure-logic jest project (`**\/*.spec.ts`).
 */
import type { SwipeTx } from './SwipeRow';

export interface TxGroup {
  label: string;
  date: string;
  txs: SwipeTx[];
}

function startOfLocalDay(dt: Date): Date {
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

export function groupTxByDate(txs: SwipeTx[]): TxGroup[] {
  const groups: Record<string, TxGroup> = {};
  txs.forEach((tx) => {
    const d = new Date(tx.date);
    const d0 = startOfLocalDay(d);
    const today0 = startOfLocalDay(new Date());
    const diff = Math.round((today0.getTime() - d0.getTime()) / 86400000);
    let label: string;
    if (diff === 0) label = 'Today';
    else if (diff === 1) label = 'Yesterday';
    else label = d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
    if (!groups[label]) groups[label] = { label, date: tx.date, txs: [] };
    groups[label].txs.push(tx);
  });
  return Object.values(groups);
}
