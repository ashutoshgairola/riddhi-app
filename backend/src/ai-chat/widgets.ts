// Widget payload contract between backend tool handlers and the mobile chat
// renderer. Mirrored at mobile/src/ai/widgets.ts — KEEP IN SYNC.
//
// Widgets are emitted by tool handlers, never composed by the model, so the
// mobile renderer can trust the shape unconditionally.

export interface TxWidgetItem {
  id: string;
  description: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  categoryName: string;
  date: string;
  accountName?: string | null;
}

export type Widget =
  | { kind: 'transaction'; tx: TxWidgetItem }
  | {
      kind: 'transaction_list';
      title?: string;
      items: TxWidgetItem[];
      totalCount?: number;
    }
  | {
      kind: 'budget';
      budget: {
        id: string;
        name: string;
        totalAllocated: number;
        totalSpent: number;
        remaining: number;
        categories: {
          name: string;
          allocated: number;
          spent: number;
          color?: string;
        }[];
      };
    }
  | {
      kind: 'goal';
      goal: {
        id: string;
        name: string;
        targetAmount: number;
        currentAmount: number;
        progressPct: number;
        projectedCompletionDate?: string | null;
      };
    }
  | {
      kind: 'account_list';
      accounts: { id: string; name: string; type: string; balance: number }[];
    }
  | {
      kind: 'net_worth';
      total: number;
      assets: number;
      liabilities: number;
      trend?: { month: string; netWorth: number }[];
    }
  | {
      kind: 'chart_bar';
      title: string;
      labels: string[];
      income: number[];
      expense: number[];
    }
  | {
      kind: 'chart_donut';
      title: string;
      total: number;
      items: {
        name: string;
        value: number;
        sharePct: number;
        color?: string;
      }[];
    }
  | {
      kind: 'stat';
      title: string;
      rows: {
        label: string;
        value: string;
        tone?: 'pos' | 'neg' | 'neutral';
      }[];
    }
  | {
      kind: 'confirmation';
      actionId: string;
      title: string;
      summary: string;
      fields: { label: string; value: string }[];
      status: 'pending' | 'executed' | 'cancelled' | 'expired';
    };

export type ConfirmationWidget = Extract<Widget, { kind: 'confirmation' }>;
