import { MASKED_AMOUNT } from '../prefs/PrefsProvider';

/**
 * Replaces every ₹-amount token in free-form text with `MASKED_AMOUNT`.
 * A token is `₹` followed by digits (with optional thousands commas,
 * optional decimal, optional L/K suffix), e.g. `₹19,550`, `₹889`, `₹1.2L`.
 * Trailing units like `/day` are left intact:
 * `₹889/day` → `••••••/day`.
 */
export function maskAmounts(text: string): string {
  return text.replace(/₹\s?\d(?:[\d,]*\d)?(?:\.\d+)?[LKk]?/g, MASKED_AMOUNT);
}
