import { AccountType } from '../common/enums';

export interface ResolvableAccount {
  id: string;
  type: AccountType;
  institutionName: string | null;
  last4: string | null; // from the linked credit_card row for credit accounts
}

/**
 * Match a parsed statement's (or an SMS's) last-4 to exactly one account.
 * Only credit accounts carry a last4 (on their credit_card row), so this is
 * the card case — it is the shared helper the SMS/notification path uses to
 * fill accountId on card spends (Slice A follow-up #1). Returns ambiguous=true
 * when 2+ accounts share the last4 so the caller can ask the user.
 */
export function resolveAccountByLast4(
  accounts: ResolvableAccount[],
  last4: string | null,
): { accountId: string | null; ambiguous: boolean } {
  const key = (last4 ?? '').trim();
  if (!key) return { accountId: null, ambiguous: false };
  const matches = accounts.filter((a) => (a.last4 ?? '').trim() === key);
  if (matches.length === 1) return { accountId: matches[0].id, ambiguous: false };
  if (matches.length > 1) return { accountId: null, ambiguous: true };
  return { accountId: null, ambiguous: false };
}
