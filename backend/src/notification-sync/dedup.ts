import { createHash } from 'crypto';

/**
 * Stable key identifying "the same notification": package + body + the minute
 * it was posted. Two ingests of one notification collapse to one row; the
 * cross-source (SMS vs notification) dedup is the LLM's job, not this key's.
 */
export function computeDedupKey(
  packageName: string,
  text: string,
  postedAtMs: number,
): string {
  const bucket = Math.floor(postedAtMs / 60_000);
  return createHash('sha1')
    .update(`${packageName}|${text}|${bucket}`)
    .digest('hex')
    .slice(0, 64);
}
