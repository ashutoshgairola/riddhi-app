import { computeCardSummary, CardConfig, CardTxn } from './card-summary';

const cfg = (o: Partial<CardConfig> = {}): CardConfig => ({
  creditLimit: 200000, statementDay: 18, graceDays: 18,
  statementDate: null, statementBilled: null, statementMinDue: null,
  statementDueDate: null, statementRewards: null, ...o,
});
const cats = new Map([['c1', { id: 'c1', name: 'Shopping', color: '#c97d8c' }]]);
const today = new Date('2026-04-25T00:00:00Z');

describe('computeCardSummary', () => {
  it('derives outstanding/available/usedPct from a negative balance', () => {
    const s = computeCardSummary(cfg(), -34280, [], cats, today);
    expect(s.outstanding).toBe(34280);
    expect(s.available).toBe(165720);
    expect(s.usedPct).toBe(17);
  });
  it('sums unbilled from card expenses on/after the last statement day', () => {
    const txns: CardTxn[] = [
      { amount: 2499, date: '2026-04-23', type: 'expense', categoryId: 'c1', isPaymentIn: false },
      { amount: 500, date: '2026-04-10', type: 'expense', categoryId: 'c1', isPaymentIn: false }, // before 04-18 -> billed
    ];
    const s = computeCardSummary(cfg(), -2999, txns, cats, today);
    expect(s.lastStatementDate).toBe('2026-04-18');
    expect(s.unbilled).toBe(2499);
    expect(s.billed).toBe(500);
    expect(s.cycleByCategory).toEqual([{ categoryId: 'c1', label: 'Shopping', value: 2499, color: '#c97d8c' }]);
  });
  it('computed minDue is 5% of billed floored at 100; dueDate is statement+grace', () => {
    const s = computeCardSummary(cfg(), -34280, [], cats, today);
    expect(s.billed).toBe(34280);           // no unbilled txns
    expect(s.minDue).toBe(1714);            // round(34280*0.05)
    expect(s.dueDate).toBe('2026-05-06');   // 04-18 + 18d
    expect(s.hasBill).toBe(true);
  });
  it('honours a current-cycle override minus payments since the statement date', () => {
    const txns: CardTxn[] = [
      { amount: 5000, date: '2026-04-20', type: 'transfer', categoryId: 'c1', isPaymentIn: true },
    ];
    const s = computeCardSummary(
      cfg({ statementDate: '2026-04-18', statementBilled: 34280, statementMinDue: 1720, statementDueDate: '2026-05-05', statementRewards: 412 }),
      -29280, txns, cats, today,
    );
    expect(s.billed).toBe(29280);           // 34280 - 5000 paid
    expect(s.minDue).toBe(1720);
    expect(s.dueDate).toBe('2026-05-05');
    expect(s.rewardsThisCycle).toBe(412);
  });
  it('ignores a stale override (statementDate != last statement date)', () => {
    const s = computeCardSummary(cfg({ statementDate: '2026-03-18', statementBilled: 99999, statementDueDate: '2026-04-05' }), -34280, [], cats, today);
    expect(s.dueDate).toBe('2026-05-06');   // computed, not the stale override
    expect(s.billed).toBe(34280);
  });
  it('crosses the year boundary for lastStatementDate', () => {
    const s = computeCardSummary(cfg({ statementDay: 18 }), 0, [], cats, new Date('2026-01-05T00:00:00Z'));
    expect(s.lastStatementDate).toBe('2025-12-18');
  });
});
