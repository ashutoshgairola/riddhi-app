import { computeImportFingerprint } from './import-fingerprint';

export type LineDirection = 'debit' | 'credit';

export interface ParsedLineItem {
  isoDate: string;        // YYYY-MM-DD
  amount: number;         // positive
  direction: LineDirection;
  descriptor: string;
  category: string | null;
}

export type Verdict = 'new' | 'duplicate' | 'possible';

export interface ClassifiedLineItem extends ParsedLineItem {
  verdict: Verdict;
  matchedTransactionId?: string;
}

export interface ExistingTxn {
  id: string;
  isoDate: string;
  amount: number;
  direction: LineDirection;
  descriptor: string;
  importFingerprint: string | null;
}

function daysApart(a: string, b: string): number {
  const ms = Math.abs(Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z'));
  return Math.round(ms / 86_400_000);
}

function amountEq(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

/**
 * Deterministically classify each parsed statement line against the account's
 * existing transactions. Matching backbone is exact amount + same direction +
 * posting date within ±windowDays; a fingerprint match is definitive. Matches
 * are consumed 1:1 so two identical lines don't both collapse onto one existing
 * transaction. Ambiguity (2+ live candidates) is surfaced as 'possible' for the
 * user to resolve — never silently skipped. The LLM never judges duplicates.
 */
export function classifyLineItems(
  accountId: string,
  items: ParsedLineItem[],
  existing: ExistingTxn[],
  opts: { windowDays?: number } = {},
): ClassifiedLineItem[] {
  const windowDays = opts.windowDays ?? 3;
  const consumed = new Set<string>();
  // Deterministic order: by date then amount.
  const ordered = [...items].sort((a, b) =>
    a.isoDate === b.isoDate ? a.amount - b.amount : a.isoDate < b.isoDate ? -1 : 1,
  );
  const byId = new Map<ParsedLineItem, ClassifiedLineItem>();

  for (const it of ordered) {
    const fp = computeImportFingerprint(accountId, it.amount, it.isoDate, it.descriptor);
    const fpMatch = existing.find((e) => !consumed.has(e.id) && e.importFingerprint === fp);
    if (fpMatch) {
      consumed.add(fpMatch.id);
      byId.set(it, { ...it, verdict: 'duplicate', matchedTransactionId: fpMatch.id });
      continue;
    }
    const candidates = existing.filter(
      (e) =>
        !consumed.has(e.id) &&
        e.direction === it.direction &&
        amountEq(e.amount, it.amount) &&
        daysApart(e.isoDate, it.isoDate) <= windowDays,
    );
    if (candidates.length === 0) {
      byId.set(it, { ...it, verdict: 'new' });
    } else if (candidates.length === 1) {
      consumed.add(candidates[0].id);
      byId.set(it, { ...it, verdict: 'duplicate', matchedTransactionId: candidates[0].id });
    } else {
      // Ambiguous: pick the closest-dated to consume, but flag for the user.
      const best = candidates.sort((a, b) => daysApart(a.isoDate, it.isoDate) - daysApart(b.isoDate, it.isoDate))[0];
      consumed.add(best.id);
      byId.set(it, { ...it, verdict: 'possible', matchedTransactionId: best.id });
    }
  }
  // Return in the caller's original item order.
  return items.map((it) => byId.get(it)!);
}
