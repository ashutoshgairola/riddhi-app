import { classifyLineItems, ExistingTxn, ParsedLineItem } from './statement-dedup';

/** True when a new incoming charge (from SMS/notification) already exists on the
 * account — including one imported from a statement. Reuses the same
 * deterministic matcher so both dedup directions agree. */
export function isLikelyDuplicateOfExisting(
  candidate: ParsedLineItem,
  existing: ExistingTxn[],
  windowDays = 3,
): boolean {
  const [r] = classifyLineItems('rev', [candidate], existing, { windowDays });
  return r.verdict !== 'new';
}
