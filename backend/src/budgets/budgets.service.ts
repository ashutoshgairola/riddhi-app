import { Injectable, NotFoundException } from '@nestjs/common';
import { BudgetsRepository } from './budgets.repository';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';
import { Budget } from './budget.entity';
import { BudgetCategory } from './budget-category.entity';

export interface BudgetCategoryWithSpent extends BudgetCategory {
  spent: number;
}

export interface ComputedBudget extends Budget {
  totalAllocated: number;
  totalSpent: number;
  remaining: number;
  categories: BudgetCategoryWithSpent[];
}

@Injectable()
export class BudgetsService {
  constructor(private readonly budgetsRepository: BudgetsRepository) {}

  async findAll(userId: string): Promise<ComputedBudget[]> {
    const budgets = await this.budgetsRepository.findAllByUser(userId);
    return Promise.all(budgets.map((b) => this.computeBudget(b, userId)));
  }

  async findOne(id: string, userId: string): Promise<ComputedBudget> {
    const budget = await this.budgetsRepository.findOneByUser(id, userId);
    if (!budget) throw new NotFoundException('Budget not found');
    return this.computeBudget(budget, userId);
  }

  async create(userId: string, dto: CreateBudgetDto): Promise<ComputedBudget> {
    const budget = this.budgetsRepository.create({
      name: dto.name,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      income: dto.income,
      userId,
      categories: dto.categories.map((c) => ({
        name: c.name,
        allocated: c.allocated,
        categoryIds: c.categoryIds ?? [],
        color: c.color ?? null,
        icon: c.icon ?? null,
        rollover: c.rollover ?? false,
        notes: c.notes ?? null,
      })) as BudgetCategory[],
    });
    const saved = await this.budgetsRepository.save(budget);
    // Reload with relations
    const reloaded = await this.budgetsRepository.findOneByUser(
      saved.id,
      userId,
    );
    return this.computeBudget(reloaded!, userId);
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateBudgetDto,
  ): Promise<ComputedBudget> {
    const budget = await this.budgetsRepository.findOneByUser(id, userId);
    if (!budget) throw new NotFoundException('Budget not found');

    if (dto.name !== undefined) budget.name = dto.name;
    if (dto.startDate !== undefined) budget.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) budget.endDate = new Date(dto.endDate);
    if (dto.income !== undefined) budget.income = dto.income;

    if (dto.categories !== undefined) {
      budget.categories = dto.categories.map((c) => ({
        name: c.name,
        allocated: c.allocated,
        categoryIds: c.categoryIds ?? [],
        color: c.color ?? null,
        icon: c.icon ?? null,
        rollover: c.rollover ?? false,
        notes: c.notes ?? null,
        budgetId: budget.id,
      })) as BudgetCategory[];
    }

    const saved = await this.budgetsRepository.save(budget);
    const reloaded = await this.budgetsRepository.findOneByUser(
      saved.id,
      userId,
    );
    return this.computeBudget(reloaded!, userId);
  }

  async remove(id: string, userId: string): Promise<void> {
    const budget = await this.budgetsRepository.findOneByUser(id, userId);
    if (!budget) throw new NotFoundException('Budget not found');
    await this.budgetsRepository.remove(budget);
  }

  /**
   * Compute spent per category and budget-level totals.
   * Single DB query for all relevant transactions — no N+1.
   */
  async computeBudget(budget: Budget, userId: string): Promise<ComputedBudget> {
    const categories = budget.categories ?? [];

    // Map each category to its direct children so spend booked on a
    // subcategory rolls up under a budget category that links only the parent.
    const userCategories =
      await this.budgetsRepository.fetchUserCategories(userId);
    const childrenByParent = new Map<string, string[]>();
    for (const c of userCategories) {
      if (c.parentId) {
        const siblings = childrenByParent.get(c.parentId) ?? [];
        siblings.push(c.id);
        childrenByParent.set(c.parentId, siblings);
      }
    }

    // Expand a set of linked ids to include all descendant category ids.
    const expandIds = (ids: string[]): string[] => {
      const out = new Set<string>();
      const stack = [...ids];
      while (stack.length > 0) {
        const id = stack.pop()!;
        if (out.has(id)) continue;
        out.add(id);
        for (const child of childrenByParent.get(id) ?? []) stack.push(child);
      }
      return Array.from(out);
    };

    // Per budget category: the linked ids plus their descendants.
    // Filter empty strings: simple-array round-trips [] as [''] from the DB.
    const expandedByCategory = categories.map((c) =>
      expandIds((c.categoryIds ?? []).filter(Boolean)),
    );

    // Collect the union of expanded ids across all budget categories.
    const allCategoryIds = Array.from(
      new Set(expandedByCategory.flat()),
    );

    // One query to get all relevant expenses
    const spentMap = await this.budgetsRepository.fetchExpensesForBudget(
      userId,
      budget.startDate,
      budget.endDate,
      allCategoryIds,
    );

    // Sum per budget category over its expanded id set. Keep the originally
    // linked ids (not the expanded set) on the returned category.
    const categoriesWithSpent: BudgetCategoryWithSpent[] = categories.map(
      (cat, i) => {
        const cleanIds = (cat.categoryIds ?? []).filter(Boolean);
        const spent = expandedByCategory[i].reduce(
          (sum, cid) => sum + (spentMap.get(cid) ?? 0),
          0,
        );
        return {
          ...cat,
          categoryIds: cleanIds,
          spent: Math.round(spent * 100) / 100,
        };
      },
    );

    const totalAllocated = categoriesWithSpent.reduce(
      (sum, c) => sum + c.allocated,
      0,
    );
    const totalSpent = categoriesWithSpent.reduce((sum, c) => sum + c.spent, 0);
    const remaining = totalAllocated - totalSpent;

    return {
      ...budget,
      categories: categoriesWithSpent,
      totalAllocated: Math.round(totalAllocated * 100) / 100,
      totalSpent: Math.round(totalSpent * 100) / 100,
      remaining: Math.round(remaining * 100) / 100,
    };
  }
}
