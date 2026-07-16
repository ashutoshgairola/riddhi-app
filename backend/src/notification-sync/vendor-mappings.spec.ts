import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { NotificationSyncService } from './notification-sync.service';
import { NotificationAnalysisService } from './notification-analysis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TransactionsService } from '../transactions/transactions.service';
import { CapturedNotification } from './captured-notification.entity';
import { DetectedTransaction } from './detected-transaction.entity';
import { VendorMapping } from './vendor-mapping.entity';
import { TransactionCategory } from '../categories/category.entity';
import { Account } from '../accounts/account.entity';
import { CreditCard } from '../credit-card/credit-card.entity';

function build(mappingsRepo: any, categoriesRepo: any = {}) {
  return Test.createTestingModule({
    providers: [
      NotificationSyncService,
      { provide: getRepositoryToken(CapturedNotification), useValue: {} },
      { provide: getRepositoryToken(DetectedTransaction), useValue: {} },
      { provide: getRepositoryToken(Account), useValue: {} },
      { provide: getRepositoryToken(CreditCard), useValue: {} },
      { provide: getRepositoryToken(VendorMapping), useValue: mappingsRepo },
      { provide: getRepositoryToken(TransactionCategory), useValue: categoriesRepo },
      { provide: NotificationAnalysisService, useValue: {} },
      { provide: NotificationsService, useValue: {} },
      { provide: TransactionsService, useValue: {} },
    ],
  }).compile();
}

describe('vendor mapping CRUD', () => {
  it('listMappings scopes by user and sorts by displayName', async () => {
    const find = jest.fn(async () => [{ id: 'm1' }]);
    const svc = (await build({ find })).get(NotificationSyncService);
    const res = await svc.listMappings('u1');
    expect(res).toEqual([{ id: 'm1' }]);
    expect(find).toHaveBeenCalledWith({ where: { userId: 'u1' }, order: { displayName: 'ASC' } });
  });

  it('updateMapping patches displayName/categoryId on an owned row', async () => {
    const row: any = { id: 'm1', userId: 'u1', displayName: 'Old', categoryId: 'c1' };
    const repo = {
      findOne: jest.fn(async () => row),
      save: jest.fn(async (x: any) => x),
    };
    const catRepo = { findOne: jest.fn(async () => ({ id: 'c2', userId: 'u1' })) };
    const svc = (await build(repo, catRepo)).get(NotificationSyncService);
    const res = await svc.updateMapping('u1', 'm1', { displayName: 'Truecaller', categoryId: 'c2' });
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'm1', userId: 'u1' } });
    expect(catRepo.findOne).toHaveBeenCalledWith({ where: { id: 'c2', userId: 'u1' } });
    expect(res).toMatchObject({ displayName: 'Truecaller', categoryId: 'c2' });
  });

  it('updateMapping rejects a categoryId the user does not own', async () => {
    const row: any = { id: 'm1', userId: 'u1', displayName: 'Old', categoryId: 'c1' };
    const repo = { findOne: jest.fn(async () => row), save: jest.fn() };
    const catRepo = { findOne: jest.fn(async () => null) };
    const svc = (await build(repo, catRepo)).get(NotificationSyncService);
    await expect(svc.updateMapping('u1', 'm1', { categoryId: 'foreign' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('updateMapping on a foreign/missing row throws NotFound', async () => {
    const repo = { findOne: jest.fn(async () => null), save: jest.fn() };
    const svc = (await build(repo)).get(NotificationSyncService);
    await expect(svc.updateMapping('u1', 'nope', { displayName: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('deleteMapping deletes an owned row and 404s otherwise', async () => {
    const repo = { delete: jest.fn(async () => ({ affected: 1 })) };
    const svc = (await build(repo)).get(NotificationSyncService);
    await expect(svc.deleteMapping('u1', 'm1')).resolves.toEqual({ ok: true });
    expect(repo.delete).toHaveBeenCalledWith({ id: 'm1', userId: 'u1' });

    const repoMiss = { delete: jest.fn(async () => ({ affected: 0 })) };
    const svcMiss = (await build(repoMiss)).get(NotificationSyncService);
    await expect(svcMiss.deleteMapping('u1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
