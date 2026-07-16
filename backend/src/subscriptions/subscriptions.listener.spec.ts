import { SubscriptionsListener } from './subscriptions.listener';
import { PaymentMethod, TransactionType } from '../common/enums';

describe('SubscriptionsListener', () => {
  const tx = (over: any = {}) => ({
    id: 't1', description: 'NETFLIX.COM', amount: 649, date: new Date('2026-05-02'),
    type: TransactionType.EXPENSE, paymentMethod: PaymentMethod.AUTOPAY, isRecurring: false, accountId: 'a1',
    ...over,
  });

  function build() {
    const subscriptions = { attachTransaction: jest.fn(async () => undefined) };
    const listener = new SubscriptionsListener(subscriptions as any);
    return { listener, subscriptions };
  }

  it('attaches an autopay expense (mapping fields)', async () => {
    const { listener, subscriptions } = build();
    await listener.onTransactionCreated({ userId: 'u1', transaction: tx() } as any);
    expect(subscriptions.attachTransaction).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 't1', description: 'NETFLIX.COM', amount: 649, accountId: 'a1', paymentMethod: PaymentMethod.AUTOPAY }));
  });

  it('attaches an isRecurring expense even without autopay', async () => {
    const { listener, subscriptions } = build();
    await listener.onTransactionCreated({ userId: 'u1', transaction: tx({ paymentMethod: PaymentMethod.UPI, isRecurring: true }) } as any);
    expect(subscriptions.attachTransaction).toHaveBeenCalled();
  });

  it('ignores a non-recurring, non-autopay expense', async () => {
    const { listener, subscriptions } = build();
    await listener.onTransactionCreated({ userId: 'u1', transaction: tx({ paymentMethod: PaymentMethod.UPI, isRecurring: false }) } as any);
    expect(subscriptions.attachTransaction).not.toHaveBeenCalled();
  });

  it('ignores a non-expense transaction', async () => {
    const { listener, subscriptions } = build();
    await listener.onTransactionCreated({ userId: 'u1', transaction: tx({ type: TransactionType.TRANSFER }) } as any);
    expect(subscriptions.attachTransaction).not.toHaveBeenCalled();
  });

  it('swallows a failure from attachTransaction (never breaks tx creation)', async () => {
    const { listener, subscriptions } = build();
    subscriptions.attachTransaction.mockRejectedValueOnce(new Error('boom'));
    await expect(listener.onTransactionCreated({ userId: 'u1', transaction: tx() } as any)).resolves.toBeUndefined();
  });
});
