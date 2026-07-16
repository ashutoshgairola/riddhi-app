import { selectDueBills, buildCardBillsDue, CardBillDue } from './card-bills-due';
import { CardConfig, CardTxn } from './card-summary';

const bill = (over: Partial<CardBillDue<string>['bill']> = {}): CardBillDue<string>['bill'] => ({
  billed: 1000, minDue: 100, dueDate: '2026-07-20', daysUntilDue: 9, hasBill: true, ...over,
});

describe('selectDueBills', () => {
  it('drops cards with no bill and sorts the rest soonest-due first', () => {
    const cards: CardBillDue<string>[] = [
      { account: 'far', bill: bill({ daysUntilDue: 20 }) },
      { account: 'nobill', bill: bill({ billed: 0, hasBill: false, daysUntilDue: 2 }) },
      { account: 'soon', bill: bill({ daysUntilDue: 3 }) },
    ];
    const out = selectDueBills(cards);
    expect(out.map((c) => c.account)).toEqual(['soon', 'far']);
  });

  it('returns [] when nothing has a bill', () => {
    expect(selectDueBills([{ account: 'x', bill: bill({ billed: 0, hasBill: false }) }])).toEqual([]);
  });
});

describe('buildCardBillsDue', () => {
  const config = (over: Partial<CardConfig> = {}): CardConfig => ({
    creditLimit: 100000, statementDay: 1, graceDays: 18,
    statementDate: null, statementBilled: null, statementMinDue: null,
    statementDueDate: null, statementRewards: null, ...over,
  });
  const today = new Date('2026-07-11T00:00:00Z');

  it('includes a card carrying an outstanding balance and excludes a settled one', () => {
    const inputs = [
      { account: 'owes', config: config(), balance: -5000, txns: [] as CardTxn[] },
      { account: 'settled', config: config(), balance: 0, txns: [] as CardTxn[] },
    ];
    const out = buildCardBillsDue(inputs, today);
    expect(out.map((c) => c.account)).toEqual(['owes']);
    expect(out[0].bill.billed).toBe(5000);
    expect(out[0].bill.hasBill).toBe(true);
  });
});
