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
import { DetectedStatus, TransactionType } from '../common/enums';

function build(detRepoOverrides: any, txCreate = jest.fn(async () => ({ id: 'tx1' }))) {
  return Test.createTestingModule({
    providers: [
      NotificationSyncService,
      { provide: getRepositoryToken(CapturedNotification), useValue: {} },
      { provide: getRepositoryToken(DetectedTransaction), useValue: detRepoOverrides },
      { provide: getRepositoryToken(Account), useValue: {} },
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
    } as any);

    expect(txCreate).toHaveBeenCalledTimes(1);
    expect(res.transactionId).toBe('tx1');
    expect(detRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: DetectedStatus.CONFIRMED, transactionId: 'tx1' }),
    );
  });

  it('confirm on a foreign/missing detection throws', async () => {
    const detRepo = { findOne: jest.fn(async () => null), save: jest.fn() };
    const moduleRef = await build(detRepo);
    const svc = moduleRef.get(NotificationSyncService);
    await expect(
      svc.confirm('u1', 'missing', { date: '2026-07-08', description: 'x', amount: 1, type: TransactionType.EXPENSE, categoryId: 'c' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
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
});
