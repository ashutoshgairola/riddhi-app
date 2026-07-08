import { accountTools } from './accounts.tools';
import { ToolCtx } from './types';

describe('list_accounts tool', () => {
  const tool = accountTools.find((t) => t.name === 'list_accounts')!;

  it('includes card computed fields for a credit account', async () => {
    const getSummary = jest.fn().mockResolvedValue({
      name: 'ICICI Card',
      outstanding: 12000,
      available: 88000,
      minDue: 600,
      dueDate: '2026-07-15',
      daysUntilDue: 7,
    });
    const ctx = {
      userId: 'u1',
      svc: {
        accounts: {
          findAll: jest.fn().mockResolvedValue([
            {
              id: 'acc1',
              name: 'ICICI Card',
              type: 'credit',
              balance: -12000,
              includeInNetWorth: true,
            },
          ]),
        },
        creditCard: { getSummary },
      },
    } as unknown as ToolCtx;

    const result = await tool.handler(ctx, {});

    expect(getSummary).toHaveBeenCalledWith('acc1', 'u1');
    expect((result.data as any[])[0]).toMatchObject({
      id: 'acc1',
      outstanding: 12000,
      available: 88000,
      minDue: 600,
      dueDate: '2026-07-15',
    });
  });

  it('omits card fields for a non-credit account', async () => {
    const getSummary = jest.fn();
    const ctx = {
      userId: 'u1',
      svc: {
        accounts: {
          findAll: jest.fn().mockResolvedValue([
            {
              id: 'acc2',
              name: 'HDFC Savings',
              type: 'savings',
              balance: 50000,
              includeInNetWorth: true,
            },
          ]),
        },
        creditCard: { getSummary },
      },
    } as unknown as ToolCtx;

    const result = await tool.handler(ctx, {});

    expect(getSummary).not.toHaveBeenCalled();
    const item = (result.data as any[])[0];
    expect(item).toMatchObject({ id: 'acc2', name: 'HDFC Savings' });
    expect(item.outstanding).toBeUndefined();
    expect(item.available).toBeUndefined();
    expect(item.minDue).toBeUndefined();
    expect(item.dueDate).toBeUndefined();
  });
});
