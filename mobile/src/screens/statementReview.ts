/**
 * statementReview — pure, RN-free helpers for the StatementReview screen
 * (Task 10). Buckets classified line items by dedup verdict, decides
 * default inclusion, and builds the `/statements/import` payload from the
 * screen's selection state. No React Native / API imports here so these
 * stay unit-testable under the mobile's pure-logic jest project.
 */

export type Verdict = 'new' | 'possible' | 'duplicate';

/** Screen-facing line item — near-passthrough of the backend's
 * `ClassifiedLineItem` (see `ApiStatementParseResult` in api/types.ts). */
export interface ClassifiedLineView {
  isoDate: string;
  amount: number;
  direction: 'debit' | 'credit';
  descriptor: string;
  category: string | null;
  verdict: Verdict;
  matchedTransactionId?: string;
}

/** Screen-facing parse result — near-passthrough of the backend's
 * `StatementParseResult` (see `ApiStatementParseResult` in api/types.ts). */
export interface StatementParseResultView {
  account: { id: string | null; matchedByLast4: boolean; ambiguous: boolean; mismatchWarning: boolean };
  statementType: 'card' | 'bank';
  period: { from: string | null; to: string | null };
  summary: Record<string, number | string | null>;
  items: ClassifiedLineView[];
}

/** Splits classified items into the three dedup buckets, preserving order
 * within each bucket. */
export function bucketByVerdict(items: ClassifiedLineView[]): {
  new: ClassifiedLineView[];
  possible: ClassifiedLineView[];
  duplicate: ClassifiedLineView[];
} {
  return {
    new: items.filter((i) => i.verdict === 'new'),
    possible: items.filter((i) => i.verdict === 'possible'),
    duplicate: items.filter((i) => i.verdict === 'duplicate'),
  };
}

/** Default checkbox state per item: only `new` items are pre-selected for
 * import — `possible`/`duplicate` require the user to opt in explicitly. */
export function defaultIncluded(item: ClassifiedLineView): boolean {
  return item.verdict === 'new';
}

export interface ImportStatementPayload {
  accountId: string;
  statementType: 'card' | 'bank';
  items: Array<{
    isoDate: string;
    amount: number;
    direction: 'debit' | 'credit';
    descriptor: string;
    category: string | null;
  }>;
  summary?: Record<string, number | string | null>;
  setBalance?: number;
}

/**
 * Builds the `/statements/import` request body from the parsed view and the
 * screen's selection (indices into `view.items` the user has checked).
 * Card-statement summary overrides are only attached when `applySummary`.
 */
export function buildImportPayload(
  view: StatementParseResultView,
  selected: Set<number>,
  opts: { applySummary: boolean; setBalance?: number },
): ImportStatementPayload {
  const items = view.items
    .map((it, idx) => ({ it, idx }))
    .filter(({ idx }) => selected.has(idx))
    .map(({ it }) => ({
      isoDate: it.isoDate,
      amount: it.amount,
      direction: it.direction,
      descriptor: it.descriptor,
      category: it.category,
    }));
  return {
    accountId: view.account.id!,
    statementType: view.statementType,
    items,
    summary: opts.applySummary && view.statementType === 'card' ? view.summary : undefined,
    setBalance: opts.setBalance,
  };
}
