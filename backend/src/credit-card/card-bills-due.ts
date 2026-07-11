import { CardConfig, CardTxn, computeCardSummary } from './card-summary';

export interface CardBill {
  billed: number;
  minDue: number;
  dueDate: string;
  daysUntilDue: number;
  hasBill: boolean;
}

export interface CardBillInput<A> {
  account: A;
  config: CardConfig;
  balance: number;
  txns: CardTxn[];
}

export interface CardBillDue<A> {
  account: A;
  bill: CardBill;
}

/** Keeps only cards with a real outstanding statement bill and sorts them
 * soonest-due first. (`hasBill` is `billed > 0`; both are checked for clarity.) */
export function selectDueBills<A>(cards: CardBillDue<A>[]): CardBillDue<A>[] {
  return cards
    .filter((c) => c.bill.hasBill && c.bill.billed > 0)
    .sort((a, b) => a.bill.daysUntilDue - b.bill.daysUntilDue);
}

/** Runs the existing pure card-summary math per credit account (categories are
 * irrelevant to the bill fields, so an empty map is passed), then filters and
 * sorts via `selectDueBills`. Generic over the account shape — `account` is
 * passed through untouched so the caller can attach any DTO it likes. */
export function buildCardBillsDue<A>(inputs: CardBillInput<A>[], today: Date): CardBillDue<A>[] {
  const summarized: CardBillDue<A>[] = inputs.map((input) => {
    const s = computeCardSummary(input.config, input.balance, input.txns, new Map(), today);
    return {
      account: input.account,
      bill: {
        billed: s.billed,
        minDue: s.minDue,
        dueDate: s.dueDate,
        daysUntilDue: s.daysUntilDue,
        hasBill: s.hasBill,
      },
    };
  });
  return selectDueBills(summarized);
}
