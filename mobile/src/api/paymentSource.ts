import type { PaymentMethod } from './types';

export type SourceKind = 'upi' | 'card' | 'bank' | 'autopay' | 'cash';

export interface TxSource {
  kind: SourceKind;
  label: string;
  autopay?: boolean;
}

interface SourceAccount {
  institutionName?: string | null;
  name: string;
  type: string;
}

/** First word of the institution name, e.g. "HDFC Bank" → "HDFC". */
function instShort(account?: SourceAccount): string {
  const inst = account?.institutionName || account?.name || '';
  return inst.split(' ')[0] || inst;
}

/**
 * Derives the display source ({kind,label}) for a transaction from its stored
 * paymentMethod and account. Mirrors the backend create-path default when the
 * method is null (credit → card, other account → upi, no account → cash).
 */
export function deriveSource(
  paymentMethod: PaymentMethod | null | undefined,
  account?: SourceAccount,
): TxSource {
  const method: PaymentMethod =
    paymentMethod ?? (account?.type === 'credit' ? 'card' : account ? 'upi' : 'cash');
  const short = instShort(account);
  switch (method) {
    case 'card':
      return { kind: 'card', label: short ? `${short} CC` : 'Card' };
    case 'netbanking':
      return { kind: 'bank', label: short || 'Bank' };
    case 'autopay':
      return { kind: 'autopay', label: short ? `${short} ACH` : 'Autopay', autopay: true };
    case 'cash':
      return { kind: 'cash', label: 'Cash' };
    case 'upi':
    default:
      return { kind: 'upi', label: short ? `${short} UPI` : 'UPI' };
  }
}
