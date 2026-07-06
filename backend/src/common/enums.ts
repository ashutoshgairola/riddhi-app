export enum AccountType {
  CHECKING = 'checking',
  SAVINGS = 'savings',
  CREDIT = 'credit',
  INVESTMENT = 'investment',
  CASH = 'cash',
  LOAN = 'loan',
  OTHER = 'other',
}

export enum TransactionType {
  INCOME = 'income',
  EXPENSE = 'expense',
  TRANSFER = 'transfer',
}

export enum TransactionStatus {
  PENDING = 'pending',
  CLEARED = 'cleared',
  RECONCILED = 'reconciled',
  VOID = 'void',
}

export enum RecurringFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

// Goal enums
export enum GoalType {
  SAVINGS = 'savings',
  DEBT = 'debt',
  RETIREMENT = 'retirement',
  MAJOR_PURCHASE = 'major_purchase',
  OTHER = 'other',
}

export enum GoalStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  PAUSED = 'paused',
}

export enum ContributionFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  BIWEEKLY = 'biweekly',
  MONTHLY = 'monthly',
}

// Investment enums
export enum AssetClass {
  STOCKS = 'stocks',
  BONDS = 'bonds',
  CASH = 'cash',
  ALTERNATIVES = 'alternatives',
  REAL_ESTATE = 'real_estate',
  OTHER = 'other',
}

export enum InvestmentType {
  INDIVIDUAL_STOCK = 'individual_stock',
  ETF = 'etf',
  MUTUAL_FUND = 'mutual_fund',
  BOND = 'bond',
  CRYPTO = 'crypto',
  OPTIONS = 'options',
  REIT = 'reit',
  OTHER = 'other',
}

export enum InvestmentTransactionType {
  BUY = 'buy',
  SELL = 'sell',
  DIVIDEND = 'dividend',
}

// Notification enums
export enum NotificationType {
  BUDGET_ALERT = 'budget_alert',
  GOAL_PROGRESS = 'goal_progress',
  LARGE_TRANSACTION = 'large_transaction',
  MONTHLY_REPORT = 'monthly_report',
  SECURITY_ALERT = 'security_alert',
  MUNSHI_SUGGESTION = 'munshi_suggestion',
}

// User Preferences enums
export enum Theme {
  LIGHT = 'light',
  DARK = 'dark',
  SYSTEM = 'system',
}

export enum StartOfWeek {
  SUNDAY = 'sunday',
  MONDAY = 'monday',
}
