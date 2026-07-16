import { AccountType, PaymentMethod } from '../common/enums';
import { resolveAccountByLast4 } from '../statements/account-resolve';

type Rail = 'upi' | 'card' | 'netbanking' | 'autopay' | null;
interface AccountLite {
  id: string;
  institutionName: string | null;
  type: AccountType;
  last4?: string | null;
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
  last4: string | null = null,
): { accountId: string | null; paymentMethod: PaymentMethod } {
  const paymentMethod = rail ? RAIL_TO_METHOD[rail] : PaymentMethod.UPI;

  // A card spend that carries its last-4 resolves most precisely by matching the
  // card directly — a unique last4 match wins over the institution heuristic.
  if (rail === 'card' && last4) {
    const byLast4 = resolveAccountByLast4(
      accounts.map((a) => ({
        id: a.id,
        type: a.type,
        institutionName: a.institutionName,
        last4: a.last4 ?? null,
      })),
      last4,
    );
    if (byLast4.accountId) return { accountId: byLast4.accountId, paymentMethod };
  }

  let accountId: string | null = null;
  const key = instKey(institution);
  if (key) {
    let matches = accounts.filter((a) => instKey(a.institutionName) === key);
    // Aggressively narrow by the account type implied by the rail, but only when
    // the rail actually implies one:
    //  - card           → credit accounts (a card spend is a credit account)
    //  - upi/netbanking → bank accounts (these debits come from a bank account)
    //  - autopay/unknown → no narrowing (a mandate can sit on a card OR a bank
    //    account, so don't guess by type).
    if (rail === 'card') {
      matches = matches.filter((a) => a.type === AccountType.CREDIT);
    } else if (rail === 'upi' || rail === 'netbanking') {
      matches = matches.filter((a) => a.type !== AccountType.CREDIT);
    }
    // Leave blank when genuinely in doubt: fill only on a unique candidate.
    if (matches.length === 1) accountId = matches[0].id;
  }
  return { accountId, paymentMethod };
}
