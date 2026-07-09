import { createHash } from 'crypto';

/**
 * Normalize a statement/transaction descriptor so cosmetic differences
 * (case, punctuation, trailing reference numbers, extra spaces) don't change
 * a transaction's identity.
 */
export function normalizeDescriptor(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[#*]\d+.*$/g, ' ')  // drop trailing ref after # or * (only if followed by digits)
    .replace(/\d{4,}/g, ' ')      // drop long numeric runs (ref/order numbers)
    .replace(/[^a-z0-9]+/g, ' ')  // punctuation → space
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Stable identity for an imported statement line: account + amount(2dp) + ISO
 * date + normalized descriptor. Persisted on the created Transaction so a
 * re-import of the same statement, and a later SMS/notification for the same
 * charge, both dedup against it.
 */
export function computeImportFingerprint(
  accountId: string,
  amount: number,
  isoDate: string,
  descriptor: string,
): string {
  const key = `${accountId}|${amount.toFixed(2)}|${isoDate}|${normalizeDescriptor(descriptor)}`;
  return createHash('sha256').update(key).digest('hex');
}
