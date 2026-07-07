import 'reflect-metadata';
import { transactionTools } from './transactions.tools';
import { PaymentMethod } from '../../common/enums';
import { ToolCtx } from './types';

const listTool = transactionTools.find((t) => t.name === 'list_transactions')!;

function makeCtx(capture: { query?: any }) {
  return {
    userId: 'u1',
    svc: {
      tx: {
        findAll: async (_uid: string, query: any) => {
          capture.query = query;
          return {
            total: 1,
            items: [
              {
                id: 't1',
                date: new Date('2026-07-01'),
                description: 'Amazon',
                amount: 2499,
                type: 'expense',
                categoryId: 'c1',
                accountId: 'a1',
                notes: null,
                paymentMethod: PaymentMethod.CARD,
              },
            ],
          };
        },
      },
      categories: {
        findAll: async () => [{ id: 'c1', name: 'Shopping' }],
      },
    },
  } as unknown as ToolCtx;
}

describe('list_transactions source awareness', () => {
  it('passes the source filter through to the query', async () => {
    const cap: { query?: any } = {};
    await listTool.handler(makeCtx(cap), { source: 'card' });
    expect(cap.query.source).toBe('card');
  });

  it('includes paymentMethod on returned model items', async () => {
    const res: any = await listTool.handler(makeCtx({}), {});
    expect(res.data.items[0].paymentMethod).toBe(PaymentMethod.CARD);
  });
});
