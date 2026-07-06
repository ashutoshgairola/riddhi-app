import { BudgetsService } from './budgets.service';
import { Budget } from './budget.entity';

describe('BudgetsService.computeBudget — subcategory rollup', () => {
  it('counts spend from child categories under a parent-linked budget category', async () => {
    const budgetsRepository = {
      // Category tree: C is a child of P; X is unrelated.
      fetchUserCategories: jest.fn().mockResolvedValue([
        { id: 'P', parentId: null },
        { id: 'C', parentId: 'P' },
        { id: 'X', parentId: null },
      ]),
      // ₹2000 booked directly on parent P, ₹3000 on child C.
      fetchExpensesForBudget: jest
        .fn()
        .mockResolvedValue(new Map([['P', 2000], ['C', 3000]])),
    };

    const service = new BudgetsService(budgetsRepository as never);

    const budget = {
      id: 'b1',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-31'),
      categories: [{ name: 'Food', allocated: 10000, categoryIds: ['P'] }],
    } as unknown as Budget;

    const result = await service.computeBudget(budget, 'u1');

    // Parent-linked budget must include child spend: 2000 + 3000.
    expect(result.categories[0].spent).toBe(5000);
    expect(result.totalSpent).toBe(5000);
    expect(result.remaining).toBe(5000);

    // The expense query must be asked for both the parent and its child.
    const idsArg = budgetsRepository.fetchExpensesForBudget.mock.calls[0][3];
    expect(idsArg).toEqual(expect.arrayContaining(['P', 'C']));
  });

  it('does not pull in spend from unrelated categories', async () => {
    const budgetsRepository = {
      fetchUserCategories: jest.fn().mockResolvedValue([
        { id: 'P', parentId: null },
        { id: 'C', parentId: 'P' },
        { id: 'X', parentId: null },
      ]),
      fetchExpensesForBudget: jest
        .fn()
        .mockResolvedValue(new Map([['C', 3000], ['X', 9999]])),
    };
    const service = new BudgetsService(budgetsRepository as never);
    const budget = {
      id: 'b1',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-31'),
      categories: [{ name: 'Food', allocated: 10000, categoryIds: ['P'] }],
    } as unknown as Budget;

    const result = await service.computeBudget(budget, 'u1');
    expect(result.categories[0].spent).toBe(3000); // X excluded
  });
});
