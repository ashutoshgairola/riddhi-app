import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../transactions/transaction.entity';
import { Account } from '../accounts/account.entity';
import { TransactionCategory } from '../categories/category.entity';
import { TransactionType } from '../common/enums';
import { PeriodKey } from './dto/period.dto';

/**
 * Start date for a period, N months/years before `now`.
 *
 * Uses day-1 pivoting so month subtraction never overflows: naive
 * `setMonth(getMonth() - 1)` on e.g. Mar 31 rolls forward to early March
 * (Feb has no 31st). We pivot to the 1st, shift the month/year, then clamp
 * the day to that month's length.
 */
export function periodStartDate(period: PeriodKey, now: Date = new Date()): Date {
  const start = new Date(now);
  const day = start.getDate();
  start.setDate(1); // pivot to avoid month-length overflow
  switch (period) {
    case '1m':
      start.setMonth(start.getMonth() - 1);
      break;
    case '3m':
      start.setMonth(start.getMonth() - 3);
      break;
    case '6m':
      start.setMonth(start.getMonth() - 6);
      break;
    case '1y':
      start.setFullYear(start.getFullYear() - 1);
      break;
  }
  const lastDayOfMonth = new Date(
    start.getFullYear(),
    start.getMonth() + 1,
    0,
  ).getDate();
  start.setDate(Math.min(day, lastDayOfMonth));
  start.setHours(0, 0, 0, 0);
  return start;
}

export interface CategorySlice {
  categoryId: string;
  name: string;
  color: string | null;
  value: number;
  sharePct: number;
}

export interface CategoryActivity {
  categoryId: string;
  count: number;
  total: number;
  incomeTotal: number;
  expenseTotal: number;
}

/**
 * Roll per-category expense totals up to their top-level parent so the
 * spending breakdown shows one slice per top-level category (subcategory
 * spend is folded into its ancestor rather than shown as a separate slice).
 */
export function rollUpCategorySpend(
  rows: Array<{ categoryId: string; total: number }>,
  categories: Array<{
    id: string;
    parentId: string | null;
    name: string;
    color: string | null;
  }>,
): CategorySlice[] {
  const byId = new Map(categories.map((c) => [c.id, c]));

  const topLevelId = (id: string): string => {
    let cur = byId.get(id);
    const seen = new Set<string>();
    while (cur && cur.parentId && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.parentId);
    }
    return cur ? cur.id : id;
  };

  const totals = new Map<string, number>();
  for (const row of rows) {
    const top = topLevelId(row.categoryId);
    totals.set(top, (totals.get(top) ?? 0) + row.total);
  }

  const grandTotal = Array.from(totals.values()).reduce((s, v) => s + v, 0);

  return Array.from(totals.entries())
    .map(([id, value]) => {
      const cat = byId.get(id);
      return {
        categoryId: id,
        name: cat?.name ?? '',
        color: cat?.color ?? null,
        value,
        sharePct:
          grandTotal > 0
            ? Math.round((value / grandTotal) * 10000) / 100
            : 0,
      };
    })
    .sort((a, b) => b.value - a.value);
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,

    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,

    @InjectRepository(TransactionCategory)
    private readonly categoryRepo: Repository<TransactionCategory>,
  ) {}

  /**
   * Map a period key to a start date relative to now.
   * Since seed data is April 2026 and today is mid-2026, a 1y window covers it.
   */
  private getStartDate(period: PeriodKey): Date {
    return periodStartDate(period);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Overview
  // ────────────────────────────────────────────────────────────────────────────

  async getOverview(
    userId: string,
    period: PeriodKey,
  ): Promise<{
    totalIncome: number;
    totalExpenses: number;
    netIncome: number;
    savingsRate: number;
  }> {
    const startDate = this.getStartDate(period);

    const rows = await this.txRepo
      .createQueryBuilder('tx')
      .select('tx.type', 'type')
      .addSelect('SUM(tx.amount)', 'total')
      .where('tx.userId = :userId', { userId })
      .andWhere('tx.date >= :startDate', { startDate })
      .andWhere('tx.type IN (:...types)', {
        types: [TransactionType.INCOME, TransactionType.EXPENSE],
      })
      .groupBy('tx.type')
      .getRawMany<{ type: string; total: string }>();

    let totalIncome = 0;
    let totalExpenses = 0;

    for (const row of rows) {
      const val = parseFloat(row.total) || 0;
      if (row.type === TransactionType.INCOME) totalIncome = val;
      else if (row.type === TransactionType.EXPENSE) totalExpenses = val;
    }

    const netIncome = totalIncome - totalExpenses;
    const savingsRate =
      totalIncome > 0 ? Math.round((netIncome / totalIncome) * 100) : 0;

    return { totalIncome, totalExpenses, netIncome, savingsRate };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Income vs Expense (monthly breakdown)
  // ────────────────────────────────────────────────────────────────────────────

  async getIncomeVsExpense(
    userId: string,
    period: PeriodKey,
  ): Promise<Array<{ month: string; income: number; expense: number }>> {
    const startDate = this.getStartDate(period);

    // GROUP BY month using to_char for YYYY-MM format
    const rows = await this.txRepo
      .createQueryBuilder('tx')
      .select("to_char(tx.date, 'YYYY-MM')", 'month')
      .addSelect('tx.type', 'type')
      .addSelect('SUM(tx.amount)', 'total')
      .where('tx.userId = :userId', { userId })
      .andWhere('tx.date >= :startDate', { startDate })
      .andWhere('tx.type IN (:...types)', {
        types: [TransactionType.INCOME, TransactionType.EXPENSE],
      })
      .groupBy("to_char(tx.date, 'YYYY-MM')")
      .addGroupBy('tx.type')
      .orderBy("to_char(tx.date, 'YYYY-MM')", 'ASC')
      .getRawMany<{ month: string; type: string; total: string }>();

    // Aggregate into month buckets
    const monthMap = new Map<string, { income: number; expense: number }>();
    for (const row of rows) {
      if (!monthMap.has(row.month)) {
        monthMap.set(row.month, { income: 0, expense: 0 });
      }
      const bucket = monthMap.get(row.month)!;
      const val = parseFloat(row.total) || 0;
      if (row.type === TransactionType.INCOME) bucket.income = val;
      else if (row.type === TransactionType.EXPENSE) bucket.expense = val;
    }

    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { income, expense }]) => ({ month, income, expense }));
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Categories breakdown (expenses only)
  // ────────────────────────────────────────────────────────────────────────────

  async getCategories(
    userId: string,
    period: PeriodKey,
  ): Promise<CategorySlice[]> {
    const startDate = this.getStartDate(period);

    const rawRows = await this.txRepo
      .createQueryBuilder('tx')
      .select('tx.categoryId', 'categoryId')
      .addSelect('SUM(tx.amount)', 'total')
      .where('tx.userId = :userId', { userId })
      .andWhere('tx.date >= :startDate', { startDate })
      .andWhere('tx.type = :type', { type: TransactionType.EXPENSE })
      .groupBy('tx.categoryId')
      .getRawMany<{ categoryId: string; total: string }>();

    const rows = rawRows.map((r) => ({
      categoryId: r.categoryId,
      total: parseFloat(r.total) || 0,
    }));

    // Roll subcategory spend up to its top-level parent for the breakdown.
    const categories = await this.categoryRepo.find({
      where: { userId },
      select: ['id', 'parentId', 'name', 'color'],
    });

    return rollUpCategorySpend(rows, categories);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Category activity (all-time count + total per category)
  //
  // Powers the Categories screen, which lists every category with its
  // transaction count and total throughput. Unlike getCategories (expenses,
  // period-scoped, rolled up to parents), this is all-time and keeps income
  // and expense totals separate so a category can be classified by its
  // dominant transaction type instead of a colour heuristic.
  // ────────────────────────────────────────────────────────────────────────────

  async getCategoryActivity(userId: string): Promise<CategoryActivity[]> {
    const rows = await this.txRepo
      .createQueryBuilder('tx')
      .select('tx.categoryId', 'categoryId')
      .addSelect('tx.type', 'type')
      .addSelect('SUM(tx.amount)', 'total')
      .addSelect('COUNT(*)', 'count')
      .where('tx.userId = :userId', { userId })
      .andWhere('tx.type IN (:...types)', {
        types: [TransactionType.INCOME, TransactionType.EXPENSE],
      })
      .groupBy('tx.categoryId')
      .addGroupBy('tx.type')
      .getRawMany<{
        categoryId: string;
        type: string;
        total: string;
        count: string;
      }>();

    const byCategory = new Map<string, CategoryActivity>();
    for (const row of rows) {
      if (!row.categoryId) continue;
      let entry = byCategory.get(row.categoryId);
      if (!entry) {
        entry = {
          categoryId: row.categoryId,
          count: 0,
          total: 0,
          incomeTotal: 0,
          expenseTotal: 0,
        };
        byCategory.set(row.categoryId, entry);
      }
      const val = parseFloat(row.total) || 0;
      const count = parseInt(row.count, 10) || 0;
      entry.count += count;
      entry.total += val;
      if (row.type === TransactionType.INCOME) entry.incomeTotal += val;
      else entry.expenseTotal += val;
    }

    return Array.from(byCategory.values());
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Net Worth Trend
  //
  // Approach: current net worth (sum of balances on accounts with
  // includeInNetWorth=true) minus the cumulative net flow of transactions
  // AFTER each month-end, working backwards month by month.
  //
  // netWorth[month M] ≈ currentNetWorth - SUM(income - expense) for all months
  //                       that come AFTER M (i.e. from M+1 onward).
  //
  // This is a reasonable approximation because each income txn increased
  // balances and each expense txn decreased them.  Transfer txns are excluded
  // (they move money between accounts without changing net worth).
  // ────────────────────────────────────────────────────────────────────────────

  async getNetWorthTrend(
    userId: string,
    period: PeriodKey,
  ): Promise<Array<{ month: string; netWorth: number }>> {
    const startDate = this.getStartDate(period);
    const now = new Date();

    // Current net worth from accounts
    const accounts = await this.accountRepo.find({
      where: { userId, includeInNetWorth: true },
    });
    const currentNetWorth = accounts.reduce((sum, a) => sum + a.balance, 0);

    // Monthly net flow (income - expense) for entire history (not just period)
    // so we can accurately reconstruct past values
    const allRows = await this.txRepo
      .createQueryBuilder('tx')
      .select("to_char(tx.date, 'YYYY-MM')", 'month')
      .addSelect('tx.type', 'type')
      .addSelect('SUM(tx.amount)', 'total')
      .where('tx.userId = :userId', { userId })
      .andWhere('tx.type IN (:...types)', {
        types: [TransactionType.INCOME, TransactionType.EXPENSE],
      })
      .groupBy("to_char(tx.date, 'YYYY-MM')")
      .addGroupBy('tx.type')
      .getRawMany<{ month: string; type: string; total: string }>();

    // Build a map: month → net flow (income - expense)
    const netFlowByMonth = new Map<string, number>();
    for (const row of allRows) {
      const val = parseFloat(row.total) || 0;
      const current = netFlowByMonth.get(row.month) ?? 0;
      if (row.type === TransactionType.INCOME) {
        netFlowByMonth.set(row.month, current + val);
      } else {
        netFlowByMonth.set(row.month, current - val);
      }
    }

    // Build sorted list of all months from history
    const allMonths = Array.from(netFlowByMonth.keys()).sort();

    // Determine current month string (end of current month)
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Build list of months in the requested period
    const periodMonths: string[] = [];
    const cursor = new Date(startDate);
    // Move to first day of that month
    cursor.setDate(1);
    while (cursor <= now) {
      const m = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      periodMonths.push(m);
      cursor.setMonth(cursor.getMonth() + 1);
    }

    // For each month M in the period, compute estimated net worth:
    // netWorth[M] = currentNetWorth - SUM(netFlow[m']) for all m' > M in the
    //               total history that are after M up to and including current month
    const result: Array<{ month: string; netWorth: number }> = [];

    for (const month of periodMonths) {
      // Sum net flows from months AFTER this month up to current
      let flowAfter = 0;
      for (const m of allMonths) {
        if (m > month && m <= currentMonth) {
          flowAfter += netFlowByMonth.get(m) ?? 0;
        }
      }
      const netWorth = Math.round((currentNetWorth - flowAfter) * 100) / 100;
      result.push({ month, netWorth });
    }

    // Filter to only months within the requested period
    return result.filter((r) => r.month >= periodMonths[0]);
  }
}
