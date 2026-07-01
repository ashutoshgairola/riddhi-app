/**
 * Seed script — Riddhi app Indian-market demo data
 * Run: npm run seed
 * Idempotent: clears all tables (FK-safe order) then re-inserts.
 */

import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

// ── Entity imports ─────────────────────────────────────────────────────
import { User } from '../users/user.entity';
import { UserPreferences } from '../users/user-preferences.entity';
import { Account } from '../accounts/account.entity';
import { TransactionCategory } from '../categories/category.entity';
import { Transaction } from '../transactions/transaction.entity';
import { Budget } from '../budgets/budget.entity';
import { BudgetCategory } from '../budgets/budget-category.entity';
import { Goal } from '../goals/goal.entity';
import { Investment } from '../investments/investment.entity';
import { InvestmentTransaction } from '../investments/investment-transaction.entity';
import { Notification } from '../notifications/notification.entity';

// ── Enums ───────────────────────────────────────────────────────────────
import {
  AccountType,
  TransactionType,
  TransactionStatus,
  GoalType,
  GoalStatus,
  ContributionFrequency,
  AssetClass,
  InvestmentType,
  NotificationType,
  Theme,
  StartOfWeek,
} from '../common/enums';

// ── DataSource ──────────────────────────────────────────────────────────
const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    User,
    UserPreferences,
    Account,
    TransactionCategory,
    Transaction,
    Budget,
    BudgetCategory,
    Goal,
    Investment,
    InvestmentTransaction,
    Notification,
  ],
  synchronize: false,
  logging: false,
});

// ── Helpers ─────────────────────────────────────────────────────────────
function d(iso: string): Date {
  return new Date(iso);
}

async function main() {
  await AppDataSource.initialize();
  console.log('Connected to database');

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // ── Clear tables in FK-safe order ─────────────────────────────────
    await queryRunner.query(`DELETE FROM notification`);
    await queryRunner.query(`DELETE FROM investment_transaction`);
    await queryRunner.query(`DELETE FROM investment`);
    await queryRunner.query(`DELETE FROM goal`);
    await queryRunner.query(`DELETE FROM budget_category`);
    await queryRunner.query(`DELETE FROM budget`);
    await queryRunner.query(`DELETE FROM "transaction"`);
    await queryRunner.query(`DELETE FROM transaction_category`);
    await queryRunner.query(`DELETE FROM account`);
    await queryRunner.query(`DELETE FROM user_preferences`);
    await queryRunner.query(`DELETE FROM "user"`);
    console.log('Cleared all tables');

    // ── User ──────────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash('password123', 10);
    const userRepo = AppDataSource.getRepository(User);
    const user = userRepo.create({
      name: 'Riddhi Desai',
      email: 'riddhi@example.com',
      password: passwordHash,
      isFirstLogin: false,
    });
    await queryRunner.manager.save(user);
    console.log('Created user:', user.id);

    // ── UserPreferences ───────────────────────────────────────────────
    const prefsRepo = AppDataSource.getRepository(UserPreferences);
    const prefs = prefsRepo.create({
      userId: user.id,
      currency: 'INR',
      dateFormat: 'DD/MM/YYYY',
      theme: Theme.DARK,
      startOfWeek: StartOfWeek.MONDAY,
      language: 'en',
    });
    await queryRunner.manager.save(prefs);

    // ── Accounts ──────────────────────────────────────────────────────
    const accountRepo = AppDataSource.getRepository(Account);
    const accountsData = [
      {
        name: 'HDFC Savings',
        type: AccountType.SAVINGS,
        balance: 824500,
        institutionName: 'HDFC Bank',
        color: '#2b3f63',
        includeInNetWorth: true,
      },
      {
        name: 'ICICI Credit',
        type: AccountType.CREDIT,
        balance: -12340,
        institutionName: 'ICICI Bank',
        color: '#5e3038',
        includeInNetWorth: true,
      },
      {
        name: 'Zerodha',
        type: AccountType.INVESTMENT,
        balance: 318000,
        institutionName: 'Zerodha',
        color: '#2a5446',
        includeInNetWorth: true,
      },
      {
        name: 'Paytm Wallet',
        type: AccountType.CASH,
        balance: 4520,
        institutionName: 'Paytm',
        color: '#235058',
        includeInNetWorth: true,
      },
      {
        name: 'Axis Salary',
        type: AccountType.SAVINGS,
        balance: 142000,
        institutionName: 'Axis Bank',
        color: '#3b3563',
        includeInNetWorth: true,
      },
      {
        name: 'SBI Joint',
        type: AccountType.SAVINGS,
        balance: 68000,
        institutionName: 'SBI',
        color: '#4d3d26',
        includeInNetWorth: true,
      },
    ];

    const accounts: Account[] = [];
    for (const data of accountsData) {
      const account = accountRepo.create({
        ...data,
        currency: 'INR',
        isConnected: false,
        userId: user.id,
      });
      await queryRunner.manager.save(account);
      accounts.push(account);
    }
    const hdfcAccount = accounts[0]; // HDFC Savings — used for transactions
    const zerodhaAccount = accounts[2]; // Zerodha — used for investments
    console.log('Created', accounts.length, 'accounts');

    // ── Transaction Categories (parent) ───────────────────────────────
    const catRepo = AppDataSource.getRepository(TransactionCategory);

    type CatRecord = {
      name: string;
      icon: string;
      color: string;
      subs: string[];
    };

    const parentCatsData: CatRecord[] = [
      { name: 'Housing',       icon: '🏠', color: '#8197c4', subs: ['Rent', 'Maintenance'] },
      { name: 'Food & Dining', icon: '🍽', color: '#c9a86a', subs: ['Groceries', 'Restaurants', 'Delivery'] },
      { name: 'Transport',     icon: '🚇', color: '#9d8bd6', subs: ['Metro', 'Cab', 'Fuel'] },
      { name: 'Utilities',     icon: '⚡', color: '#6fb3ad', subs: ['Electricity', 'Internet'] },
      { name: 'Entertainment', icon: '🎬', color: '#c97d8c', subs: ['Subscriptions', 'Events'] },
      { name: 'Healthcare',    icon: '💊', color: '#ef4444', subs: [] },
      { name: 'Shopping',      icon: '🛍', color: '#c97d8c', subs: [] },
      { name: 'Education',     icon: '🎓', color: '#6fb3ad', subs: [] },
      { name: 'Income',        icon: '💼', color: '#7faf93', subs: ['Salary', 'Freelance'] },
    ];

    const parentCats: Record<string, TransactionCategory> = {};
    const allCats: Record<string, TransactionCategory> = {};

    for (const cd of parentCatsData) {
      const cat = catRepo.create({
        name: cd.name,
        icon: cd.icon,
        color: cd.color,
        parentId: null,
        userId: user.id,
      });
      await queryRunner.manager.save(cat);
      parentCats[cd.name] = cat;
      allCats[cd.name] = cat;

      for (const subName of cd.subs) {
        const sub = catRepo.create({
          name: subName,
          icon: cd.icon,
          color: cd.color,
          parentId: cat.id,
          userId: user.id,
        });
        await queryRunner.manager.save(sub);
        allCats[subName] = sub;
      }
    }
    console.log('Created', Object.keys(allCats).length, 'categories (parent + sub)');

    // ── Transactions (April 2026) ──────────────────────────────────────
    const txRepo = AppDataSource.getRepository(Transaction);

    // SIP uses Income category (no Investments category defined)
    const txData = [
      { date: '2026-04-25', desc: 'Salary — April 2026',  amount: 118000, type: TransactionType.INCOME,  catName: 'Income' },
      { date: '2026-04-25', desc: 'Swiggy Order',          amount:    649, type: TransactionType.EXPENSE, catName: 'Food & Dining' },
      { date: '2026-04-24', desc: 'Rent — April',          amount:  28000, type: TransactionType.EXPENSE, catName: 'Housing' },
      { date: '2026-04-24', desc: 'BESCOM Electricity',    amount:   1840, type: TransactionType.EXPENSE, catName: 'Utilities' },
      { date: '2026-04-23', desc: 'Metro Smart Card',      amount:    500, type: TransactionType.EXPENSE, catName: 'Transport' },
      { date: '2026-04-22', desc: 'Netflix',               amount:    649, type: TransactionType.EXPENSE, catName: 'Entertainment' },
      { date: '2026-04-21', desc: 'Myntra Shopping',       amount:   3200, type: TransactionType.EXPENSE, catName: 'Shopping' },
      { date: '2026-04-19', desc: 'Apollo Pharmacy',       amount:    820, type: TransactionType.EXPENSE, catName: 'Healthcare' },
      { date: '2026-04-15', desc: 'SIP — Nifty 50 ETF',   amount:  10000, type: TransactionType.EXPENSE, catName: 'Income' },
      { date: '2026-04-08', desc: 'Freelance Project',     amount:  35000, type: TransactionType.INCOME,  catName: 'Income' },
      { date: '2026-04-07', desc: 'BPCL Fuel',             amount:   2400, type: TransactionType.EXPENSE, catName: 'Transport' },
    ];

    for (const td of txData) {
      const cat = allCats[td.catName];
      if (!cat) throw new Error(`Category not found: ${td.catName}`);
      const tx = txRepo.create({
        date: d(td.date),
        description: td.desc,
        amount: td.amount, // always positive
        type: td.type,
        categoryId: cat.id,
        accountId: hdfcAccount.id,
        status: TransactionStatus.CLEARED,
        userId: user.id,
        tags: [],
        attachments: [],
        isRecurring: false,
        recurringDetails: null,
        notes: null,
      });
      await queryRunner.manager.save(tx);
    }
    console.log('Created', txData.length, 'transactions');

    // ── Budget: April 2026 ────────────────────────────────────────────
    const budgetRepo = AppDataSource.getRepository(Budget);
    const budget = budgetRepo.create({
      name: 'April 2026',
      startDate: d('2026-04-01'),
      endDate: d('2026-04-30'),
      income: 118000,
      userId: user.id,
    });
    await queryRunner.manager.save(budget);

    const budgetCatRepo = AppDataSource.getRepository(BudgetCategory);
    const budgetCatsData = [
      { name: 'Housing',       allocated: 30000, icon: '🏠', color: '#8197c4', catName: 'Housing' },
      { name: 'Food & Dining', allocated: 15000, icon: '🍽', color: '#c9a86a', catName: 'Food & Dining' },
      { name: 'Transport',     allocated:  8000, icon: '🚇', color: '#9d8bd6', catName: 'Transport' },
      { name: 'Shopping',      allocated: 10000, icon: '🛍', color: '#c97d8c', catName: 'Shopping' },
      { name: 'Utilities',     allocated:  5000, icon: '⚡', color: '#6fb3ad', catName: 'Utilities' },
      { name: 'Healthcare',    allocated:  4000, icon: '💊', color: '#ef4444', catName: 'Healthcare' },
      { name: 'Entertainment', allocated:  3000, icon: '🎬', color: '#c97d8c', catName: 'Entertainment' },
    ];

    for (const bcd of budgetCatsData) {
      const linkedCat = parentCats[bcd.catName];
      if (!linkedCat) throw new Error(`Parent category not found for budget: ${bcd.catName}`);
      const bc = budgetCatRepo.create({
        name: bcd.name,
        allocated: bcd.allocated,
        categoryIds: [linkedCat.id],
        color: bcd.color,
        icon: bcd.icon,
        rollover: false,
        notes: null,
        budgetId: budget.id,
      });
      await queryRunner.manager.save(bc);
    }
    console.log('Created budget "April 2026" with', budgetCatsData.length, 'categories');

    // ── Goals ─────────────────────────────────────────────────────────
    const goalRepo = AppDataSource.getRepository(Goal);
    const goalsData = [
      {
        name: 'Emergency Fund',
        type: GoalType.SAVINGS,
        targetAmount: 300000,
        currentAmount: 185000,
        targetDate: d('2026-12-31'),
        priority: 1,
        color: '#7faf93',
      },
      {
        name: 'Goa Trip',
        type: GoalType.SAVINGS,
        targetAmount: 50000,
        currentAmount: 32000,
        targetDate: d('2026-06-30'),
        priority: 2,
        color: '#6fb3ad',
      },
      {
        name: 'MacBook Pro',
        type: GoalType.MAJOR_PURCHASE,
        targetAmount: 200000,
        currentAmount: 68000,
        targetDate: d('2027-03-31'),
        priority: 3,
        color: '#9d8bd6',
      },
      {
        name: 'House Down Payment',
        type: GoalType.SAVINGS,
        targetAmount: 1500000,
        currentAmount: 120000,
        targetDate: d('2028-12-31'),
        priority: 4,
        color: '#c9a86a',
      },
    ];

    for (const gd of goalsData) {
      const goal = goalRepo.create({
        ...gd,
        startDate: d('2026-01-01'),
        status: GoalStatus.ACTIVE,
        contributionFrequency: ContributionFrequency.MONTHLY,
        contributionAmount: null,
        accountId: null,
        userId: user.id,
        notes: null,
      });
      await queryRunner.manager.save(goal);
    }
    console.log('Created', goalsData.length, 'goals');

    // ── Investments ───────────────────────────────────────────────────
    const investRepo = AppDataSource.getRepository(Investment);
    const holdingsData = [
      {
        name: 'Nifty 50 ETF',
        ticker: 'NIFTYBEES',
        type: InvestmentType.ETF,
        assetClass: AssetClass.STOCKS,
        currentValue: 145000,
        returnPercent: 12.8,
        sector: 'Index',
      },
      {
        name: 'HDFC Bank',
        ticker: 'HDFCBANK',
        type: InvestmentType.INDIVIDUAL_STOCK,
        assetClass: AssetClass.STOCKS,
        currentValue: 62000,
        returnPercent: 7.4,
        sector: 'Banking',
      },
      {
        name: 'Tata Motors',
        ticker: 'TATAMOTORS',
        type: InvestmentType.INDIVIDUAL_STOCK,
        assetClass: AssetClass.STOCKS,
        currentValue: 38000,
        returnPercent: -3.2,
        sector: 'Automobile',
      },
      {
        name: 'Reliance',
        ticker: 'RELIANCE',
        type: InvestmentType.INDIVIDUAL_STOCK,
        assetClass: AssetClass.STOCKS,
        currentValue: 48000,
        returnPercent: 9.1,
        sector: 'Conglomerate',
      },
      {
        name: 'Gold ETF',
        ticker: 'GOLDBEES',
        type: InvestmentType.ETF,
        assetClass: AssetClass.ALTERNATIVES,
        currentValue: 25000,
        returnPercent: 5.6,
        sector: 'Commodities',
      },
    ];

    for (const hd of holdingsData) {
      // Derive price/shares so currentValue ≈ val and return ≈ ret
      const shares = 100;
      const currentPrice = hd.currentValue / shares;
      const purchasePrice = currentPrice / (1 + hd.returnPercent / 100);

      const inv = investRepo.create({
        name: hd.name,
        ticker: hd.ticker,
        assetClass: hd.assetClass,
        type: hd.type,
        shares,
        purchasePrice: Math.round(purchasePrice * 100) / 100,
        currentPrice: Math.round(currentPrice * 100) / 100,
        purchaseDate: d('2024-01-15'),
        accountId: zerodhaAccount.id,
        currency: 'INR',
        sector: hd.sector,
        region: 'India',
        dividendYield: null,
        notes: null,
        userId: user.id,
      });
      await queryRunner.manager.save(inv);
    }
    console.log('Created', holdingsData.length, 'investments');

    // ── Notifications ─────────────────────────────────────────────────
    const notifRepo = AppDataSource.getRepository(Notification);
    const notifsData = [
      {
        type: NotificationType.BUDGET_ALERT,
        title: 'Shopping budget exceeded',
        body: '₹10,820 spent of ₹10,000 budget. 108% used.',
        read: false,
      },
      {
        type: NotificationType.GOAL_PROGRESS,
        title: 'Emergency Fund milestone',
        body: '60% complete — ₹1.85L saved so far!',
        read: false,
      },
      {
        type: NotificationType.LARGE_TRANSACTION,
        title: 'Large transaction detected',
        body: '₹28,000 debited — Rent April 2026.',
        read: false,
      },
      {
        type: NotificationType.MONTHLY_REPORT,
        title: 'March 2026 report ready',
        body: 'Net savings: ₹24,500. Tap to view.',
        read: true,
      },
      {
        type: NotificationType.SECURITY_ALERT,
        title: 'New login detected',
        body: 'Chrome · MacOS · Bengaluru, India.',
        read: true,
      },
      {
        type: NotificationType.LARGE_TRANSACTION,
        title: 'SIP installment due',
        body: '₹10,000 — Nifty 50 ETF, 15 Apr.',
        read: true,
      },
      {
        type: NotificationType.MONTHLY_REPORT,
        title: 'Portfolio up 12.4%',
        body: 'Best performer: HDFC Bank (+7.4%).',
        read: true,
      },
    ];

    for (const nd of notifsData) {
      const notif = notifRepo.create({
        ...nd,
        userId: user.id,
      });
      await queryRunner.manager.save(notif);
    }
    console.log('Created', notifsData.length, 'notifications');

    await queryRunner.commitTransaction();
    console.log('\nSeed completed successfully!');
  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error('Seed failed — rolling back:', err);
    throw err;
  } finally {
    await queryRunner.release();
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
