import { AccountType, PaymentMethod } from '../common/enums';

type Rail = 'upi' | 'card' | 'netbanking' | 'autopay' | null;
interface AccountLite {
  id: string;
  institutionName: string | null;
  type: AccountType;
}

const RAIL_TO_METHOD: Record<Exclude<Rail, null>, PaymentMethod> = {
  upi: PaymentMethod.UPI,
  card: PaymentMethod.CARD,
  netbanking: PaymentMethod.NETBANKING,
  autopay: PaymentMethod.AUTOPAY,
};

/** First word, lowercased: "HDFC Bank" → "hdfc". */
function instKey(name: string | null): string {
  return (name ?? '').trim().split(/\s+/)[0].toLowerCase();
}

/**
 * Map an LLM-detected (institution, rail) onto a Slice-A payment source.
 * paymentMethod comes straight from the rail (UPI default when rail is null).
 * accountId is filled only when institution+type identifies exactly one account;
 * ambiguous or no match leaves it null for the user to pick in review.
 */
export function resolvePaymentSource(
  institution: string | null,
  rail: Rail,
  accounts: AccountLite[],
): { accountId: string | null; paymentMethod: PaymentMethod } {
  const paymentMethod = rail ? RAIL_TO_METHOD[rail] : PaymentMethod.UPI;

  let accountId: string | null = null;
  const key = instKey(institution);
  if (key) {
    let matches = accounts.filter((a) => instKey(a.institutionName) === key);
    // A card rail can only be a credit account; other rails match by institution
    // alone (no type narrowing), so a mixed set of accounts stays ambiguous.
    if (rail === 'card') {
      matches = matches.filter((a) => a.type === AccountType.CREDIT);
    }
    if (matches.length === 1) accountId = matches[0].id;
  }
  return { accountId, paymentMethod };
}
