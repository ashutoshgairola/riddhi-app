import { classifyLineItems, ExistingTxn, ParsedLineItem, Verdict } from './statement-dedup';

/** Classify one incoming charge (from SMS/notification) against an account's
 * existing transactions using the same deterministic matcher as statement
 * import, so both dedup directions agree. */
export function reverseDedupVerdict(
  candidate: ParsedLineItem,
  existing: ExistingTxn[],
  windowDays = 3,
): Verdict {
  return classifyLineItems('rev', [candidate], existing, { windowDays })[0].verdict;
}

/** True only when the incoming charge is an EXACT duplicate of an existing
 * transaction — the predicate used to SILENTLY suppress a detection. Ambiguous
 * ('possible') matches are deliberately NOT suppressed, so a genuine 2nd
 * identical charge within the window is never dropped without the user seeing
 * it. */
export function isLikelyDuplicateOfExisting(
  candidate: ParsedLineItem,
  existing: ExistingTxn[],
  windowDays = 3,
): boolean {
  return reverseDedupVerdict(candidate, existing, windowDays) === 'duplicate';
}
