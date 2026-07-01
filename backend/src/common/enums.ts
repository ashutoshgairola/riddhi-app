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
