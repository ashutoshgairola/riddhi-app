import { toCardSummaryView, toCardBillView } from './adapters';
import type { ApiCardSummary, AccountView } from './types';

function makeDto(overrides: Partial<ApiCardSummary> = {}): ApiCardSummary {
  return {
    accountId: 'acc-1',
    name: 'HDFC Regalia',
    institutionName: 'HDFC Bank',
    creditLimit: 100000,
    statementDay: 5,
    graceDays: 18,
    network: 'visa',
    last4: '4242',
    rewardRate: '2%',
    outstanding: 20000,
    available: 80000,
    usedPct: 20,
    unbilled: 5000,
    billed: 15000,
    minDue: 750,
    dueDate: '2026-07-23',
    daysUntilDue: 5,
    hasBill: true,
    rewardsThisCycle: 300,
    lastStatementDate: '2026-07-05',
    cycleByCategory: [
      { categoryId: 'cat-1', label: 'Food', value: 3000, color: '#c9a86a' },
      { categoryId: 'cat-2', label: 'Shopping', value: 2000, color: null },
    ],
    transactions: [
      {
        id: 'tx-1',
        description: 'Card swipe',
        amount: -1200,
        date: '2026-07-06',
        categoryId: 'cat-1',
        kind: 'swipe',
      },
      {
        id: 'tx-2',
        description: 'HDFC Regalia — bill paid',
        amount: 15000,
        date: '2026-07-04',
        categoryId: 'cat-1',
        kind: 'payment',
      },
    ],
    ...overrides,
  };
}

describe('toCardSummaryView', () => {
  it('marks daysUntilDue = 3 as urgent (boundary)', () => {
    expect(toCardSummaryView(makeDto({ daysUntilDue: 3 })).dueTone).toBe('urgent');
  });

  it('marks daysUntilDue = 7 as warn (boundary)', () => {
    expect(toCardSummaryView(makeDto({ daysUntilDue: 7 })).dueTone).toBe('warn');
  });

  it('marks daysUntilDue = 8 as ok (boundary)', () => {
    expect(toCardSummaryView(makeDto({ daysUntilDue: 8 })).dueTone).toBe('ok');
  });

  it('marks a negative (overdue) daysUntilDue as urgent', () => {
    expect(toCardSummaryView(makeDto({ daysUntilDue: -2 })).dueTone).toBe('urgent');
  });

  it('passes through a non-null category color unchanged', () => {
    const view = toCardSummaryView(makeDto());
    expect(view.cycleByCategory[0]!.color).toBe('#c9a86a');
  });

  it('defaults a null category color via the fallback palette', () => {
    const view = toCardSummaryView(makeDto());
    const shopping = view.cycleByCategory[1]!;
    expect(shopping.color).toBeTruthy();
    expect(shopping.color).not.toBeNull();
    expect(typeof shopping.color).toBe('string');
  });

  it('preserves all other fields unchanged', () => {
    const dto = makeDto();
    const view = toCardSummaryView(dto);
    expect(view.accountId).toBe(dto.accountId);
    expect(view.outstanding).toBe(dto.outstanding);
    expect(view.minDue).toBe(dto.minDue);
    expect(view.dueDate).toBe(dto.dueDate);
  });

  it('passes through the merged ledger with signed swipe/payment amounts intact', () => {
    const view = toCardSummaryView(makeDto());
    expect(view.transactions).toEqual([
      {
        id: 'tx-1',
        description: 'Card swipe',
        amount: -1200,
        date: '2026-07-06',
        categoryId: 'cat-1',
        kind: 'swipe',
      },
      {
        id: 'tx-2',
        description: 'HDFC Regalia — bill paid',
        amount: 15000,
        date: '2026-07-04',
        categoryId: 'cat-1',
        kind: 'payment',
      },
    ]);
  });
});

describe('toCardBillView', () => {
  it('passes the account through and maps the bill fields', () => {
    const account = { id: 'a1', name: 'HDFC', type: 'credit', sub: 'Credit card', bal: -5000, gradient: ['#1', '#2'], logo: 'H', bank: 'HDFC', change: 0 } as AccountView;
    const view = toCardBillView(account, { billed: 5000, minDue: 250, dueDate: '2026-07-20', daysUntilDue: 9, hasBill: true });
    expect(view).toEqual({ account, billed: 5000, minDue: 250, dueDate: '2026-07-20', daysUntilDue: 9 });
  });
});
