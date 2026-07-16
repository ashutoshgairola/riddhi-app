import { CreditCardController } from './credit-card.controller';

describe('CreditCardController', () => {
  it('GET /accounts/cards/due returns the user-scoped bills-due list', async () => {
    const rows = [
      { account: { id: 'a1' }, bill: { billed: 5000, minDue: 250, dueDate: '2026-07-20', daysUntilDue: 9, hasBill: true } },
    ];
    const service = { getBillsDue: jest.fn(async () => rows) } as any;
    const controller = new CreditCardController(service);
    const result = await controller.getBillsDue({ userId: 'u1', email: 'e' });
    expect(service.getBillsDue).toHaveBeenCalledWith('u1');
    expect(result).toBe(rows);
  });
});
