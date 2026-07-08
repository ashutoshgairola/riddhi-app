import { toCardSummaryView } from './adapters';
import type { ApiCardSummary } from './types';

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
});
