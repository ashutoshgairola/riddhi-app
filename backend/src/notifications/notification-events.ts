import { Transaction } from '../transactions/transaction.entity';

export const TRANSACTION_CREATED = 'transaction.created';
export const GOAL_UPDATED = 'goal.updated';

export interface TransactionCreatedEvent {
  userId: string;
  transaction: Transaction;
}

export interface GoalUpdatedEvent {
  userId: string;
  goalId: string;
  previousPct: number;
  newPct: number;
}
