import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { NotificationSyncService } from './notification-sync.service';
import { NotificationAnalysisService } from './notification-analysis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TransactionsService } from '../transactions/transactions.service';
import { CapturedNotification } from './captured-notification.entity';
import { DetectedTransaction } from './detected-transaction.entity';
import { Account } from '../accounts/account.entity';
import { CreditCard } from '../credit-card/credit-card.entity';
import { VendorMapping } from './vendor-mapping.entity';
import { TransactionCategory } from '../categories/category.entity';
import { DetectedStatus, TransactionType, PaymentMethod } from '../common/enums';

function build(detRepoOverrides: any, txCreate = jest.fn(async () => ({ id: 'tx1' }))) {
  return Test.createTestingModule({
    providers: [
      NotificationSyncService,
      { provide: getRepositoryToken(CapturedNotification), useValue: {} },
      { provide: getRepositoryToken(DetectedTransaction), useValue: detRepoOverrides },
      { provide: getRepositoryToken(Account), useValue: {} },
      { provide: getRepositoryToken(CreditCard), useValue: {} },
      { provide: getRepositoryToken(VendorMapping), useValue: {} },
      { provide: getRepositoryToken(TransactionCategory), useValue: {} },
      { provide: NotificationAnalysisService, useValue: {} },
      { provide: NotificationsService, useValue: {} },
      { provide: TransactionsService, useValue: { create: txCreate } },
    ],
  }).compile();
}

describe('confirm/dismiss', () => {
  it('confirm creates a transaction and marks the detection confirmed', async () => {
    const det: any = { id: 'd1', userId: 'u1', status: DetectedStatus.PENDING };
    const detRepo = {
      findOne: jest.fn(async () => det),
      save: jest.fn(async (x: any) => x),
    };
    const txCreate = jest.fn(async () => ({ id: 'tx1' }));
    const moduleRef = await build(detRepo, txCreate);
    const svc = moduleRef.get(NotificationSyncService);

    const res = await svc.confirm('u1', 'd1', {
      date: '2026-07-08', description: 'Rapido', amount: 159,
      type: TransactionType.EXPENSE, categoryId: 'cat1', accountId: 'a1',
      paymentMethod: PaymentMethod.UPI, notes: 'auto ride home',
    } as any);

    // The whole point of the feature: the payment-source fields on the review
    // payload (accountId / paymentMethod / notes) pass through to the created tx.
    expect(txCreate).toHaveBeenCalledTimes(1);
    expect(txCreate).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        date: '2026-07-08',
        description: 'Rapido',
        amount: 159,
        type: TransactionType.EXPENSE,
        categoryId: 'cat1',
        accountId: 'a1',
        paymentMethod: PaymentMethod.UPI,
        notes: 'auto ride home',
      }),
    );
    expect(res.transactionId).toBe('tx1');
    expect(detRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: DetectedStatus.CONFIRMED, transactionId: 'tx1' }),
    );
  });

  it('confirm on a foreign/missing detection throws and scopes the lookup by userId', async () => {
    const findOne = jest.fn(async () => null);
    const detRepo = { findOne, save: jest.fn() };
    const txCreate = jest.fn(async () => ({ id: 'tx1' }));
    const moduleRef = await build(detRepo, txCreate);
    const svc = moduleRef.get(NotificationSyncService);
    await expect(
      svc.confirm('u1', 'missing', { date: '2026-07-08', description: 'x', amount: 1, type: TransactionType.EXPENSE, categoryId: 'c' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    // userId scoping is what filters out foreign detections, not just null → 404.
    expect(findOne).toHaveBeenCalledWith({ where: { id: 'missing', userId: 'u1' } });
    expect(txCreate).not.toHaveBeenCalled();
    expect(detRepo.save).not.toHaveBeenCalled();
  });

  it('confirm on an already-CONFIRMED detection throws and never re-creates a tx', async () => {
    const det: any = { id: 'd1', userId: 'u1', status: DetectedStatus.CONFIRMED };
    const detRepo = { findOne: jest.fn(async () => det), save: jest.fn() };
    const txCreate = jest.fn(async () => ({ id: 'tx2' }));
    const moduleRef = await build(detRepo, txCreate);
    const svc = moduleRef.get(NotificationSyncService);
    await expect(
      svc.confirm('u1', 'd1', {
        date: '2026-07-08', description: 'Rapido', amount: 159,
        type: TransactionType.EXPENSE, categoryId: 'cat1',
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    // Terminal-state guard: a resolved detection can't be confirmed into a duplicate tx.
    expect(txCreate).not.toHaveBeenCalled();
    expect(detRepo.save).not.toHaveBeenCalled();
  });

  it('dismiss marks the detection dismissed', async () => {
    const det: any = { id: 'd1', userId: 'u1', status: DetectedStatus.PENDING };
    const detRepo = { findOne: jest.fn(async () => det), save: jest.fn(async (x: any) => x) };
    const moduleRef = await build(detRepo);
    const svc = moduleRef.get(NotificationSyncService);
    await svc.dismiss('u1', 'd1');
    expect(detRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: DetectedStatus.DISMISSED }),
    );
  });

  it('dismiss on an already-DISMISSED detection throws and does not re-save', async () => {
    const det: any = { id: 'd1', userId: 'u1', status: DetectedStatus.DISMISSED };
    const detRepo = { findOne: jest.fn(async () => det), save: jest.fn() };
    const moduleRef = await build(detRepo);
    const svc = moduleRef.get(NotificationSyncService);
    await expect(svc.dismiss('u1', 'd1')).rejects.toBeInstanceOf(NotFoundException);
    expect(detRepo.save).not.toHaveBeenCalled();
  });
});
