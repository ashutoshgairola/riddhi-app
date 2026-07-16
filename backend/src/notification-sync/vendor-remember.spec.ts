import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
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
import {
  DetectedStatus,
  TransactionType,
  PaymentMethod,
} from '../common/enums';

const MAPPING = {
  id: 'm1',
  userId: 'u1',
  matchKey: 'true software scandinavia ab',
  displayName: 'Truecaller',
  categoryId: 'catSub',
};

function build(opts: {
  detRepo: any;
  mapRepo: any;
  txCreate?: any;
  capRepo?: any;
  catRepo?: any;
}) {
  return Test.createTestingModule({
    providers: [
      NotificationSyncService,
      {
        provide: getRepositoryToken(CapturedNotification),
        useValue: opts.capRepo ?? { find: jest.fn(async () => []) },
      },
      {
        provide: getRepositoryToken(DetectedTransaction),
        useValue: opts.detRepo,
      },
      { provide: getRepositoryToken(Account), useValue: {} },
      { provide: getRepositoryToken(CreditCard), useValue: {} },
      { provide: getRepositoryToken(VendorMapping), useValue: opts.mapRepo },
      {
        provide: getRepositoryToken(TransactionCategory),
        useValue: opts.catRepo ?? {
          findOne: jest.fn(async () => ({ id: 'catSub', userId: 'u1' })),
        },
      },
      { provide: NotificationAnalysisService, useValue: {} },
      { provide: NotificationsService, useValue: {} },
      {
        provide: TransactionsService,
        useValue: {
          create: opts.txCreate ?? jest.fn(async () => ({ id: 'tx1' })),
        },
      },
    ],
  }).compile();
}

const CONFIRM_DTO = {
  date: '2026-07-16',
  description: 'Truecaller',
  amount: 249,
  type: TransactionType.EXPENSE,
  categoryId: 'catSub',
  accountId: 'a1',
  paymentMethod: PaymentMethod.AUTOPAY,
  notes: 'n',
  remember: true,
} as any;

describe('confirm with remember', () => {
  it('upserts a mapping keyed on the normalized detected merchant', async () => {
    const det: any = {
      id: 'd1',
      userId: 'u1',
      status: DetectedStatus.PENDING,
      merchant: 'True Software Scandinavia AB',
      sourceKeys: [],
    };
    const detRepo = {
      findOne: jest.fn(async () => det),
      save: jest.fn(async (x: any) => x),
      find: jest.fn(async () => []), // sweep finds nothing else pending
    };
    const mapRepo = {
      upsert: jest.fn(async () => ({})),
      findOne: jest.fn(async () => MAPPING),
    };
    const svc = (await build({ detRepo, mapRepo })).get(
      NotificationSyncService,
    );

    await svc.confirm('u1', 'd1', CONFIRM_DTO);

    expect(mapRepo.upsert).toHaveBeenCalledWith(
      {
        userId: 'u1',
        matchKey: 'true software scandinavia ab',
        displayName: 'Truecaller',
        categoryId: 'catSub',
      },
      ['userId', 'matchKey'],
    );
  });

  it('sweeps same-key pending detections with a resolved account, skips the rest', async () => {
    const det: any = {
      id: 'd1',
      userId: 'u1',
      status: DetectedStatus.PENDING,
      merchant: 'True Software Scandinavia AB',
      sourceKeys: [],
    };
    const sweepable: any = {
      id: 'd2',
      userId: 'u1',
      status: DetectedStatus.PENDING,
      merchant: 'TRUE SOFTWARE SCANDINAVIA AB',
      amount: 249,
      type: TransactionType.EXPENSE,
      accountId: 'a1',
      paymentMethod: PaymentMethod.AUTOPAY,
      postedAt: new Date('2026-07-01T10:00:00Z'),
      sourceKeys: [],
    };
    const noAccount: any = { ...sweepable, id: 'd3', accountId: null };
    const otherVendor: any = { ...sweepable, id: 'd4', merchant: 'Netflix' };
    const detRepo = {
      findOne: jest.fn(async () => det),
      save: jest.fn(async (x: any) => x),
      find: jest.fn(async () => [sweepable, noAccount, otherVendor]),
    };
    const mapRepo = {
      upsert: jest.fn(async () => ({})),
      findOne: jest.fn(async () => MAPPING),
    };
    const txCreate = jest.fn(async () => ({ id: 'tx-new' }));
    const svc = (await build({ detRepo, mapRepo, txCreate })).get(
      NotificationSyncService,
    );

    await svc.confirm('u1', 'd1', CONFIRM_DTO);

    // 1 call for d1 itself + 1 for the swept d2 (d3 lacks an account, d4 is another vendor).
    expect(txCreate).toHaveBeenCalledTimes(2);
    expect(txCreate).toHaveBeenLastCalledWith(
      'u1',
      expect.objectContaining({
        description: 'Truecaller',
        categoryId: 'catSub',
        amount: 249,
        accountId: 'a1',
        date: '2026-07-01',
      }),
    );
    expect(sweepable.status).toBe(DetectedStatus.CONFIRMED);
    expect(sweepable.transactionId).toBe('tx-new');
    expect(noAccount.status).toBe(DetectedStatus.PENDING);
    expect(otherVendor.status).toBe(DetectedStatus.PENDING);
  });

  it('remember with a null detected merchant is a no-op', async () => {
    const det: any = {
      id: 'd1',
      userId: 'u1',
      status: DetectedStatus.PENDING,
      merchant: null,
      sourceKeys: [],
    };
    const detRepo = {
      findOne: jest.fn(async () => det),
      save: jest.fn(async (x: any) => x),
    };
    const mapRepo = { upsert: jest.fn(), findOne: jest.fn() };
    const svc = (await build({ detRepo, mapRepo })).get(
      NotificationSyncService,
    );
    await svc.confirm('u1', 'd1', CONFIRM_DTO);
    expect(mapRepo.upsert).not.toHaveBeenCalled();
  });

  it('confirm without remember never touches mappings', async () => {
    const det: any = {
      id: 'd1',
      userId: 'u1',
      status: DetectedStatus.PENDING,
      merchant: 'X',
      sourceKeys: [],
    };
    const detRepo = {
      findOne: jest.fn(async () => det),
      save: jest.fn(async (x: any) => x),
    };
    const mapRepo = { upsert: jest.fn(), findOne: jest.fn() };
    const svc = (await build({ detRepo, mapRepo })).get(
      NotificationSyncService,
    );
    await svc.confirm('u1', 'd1', { ...CONFIRM_DTO, remember: undefined });
    expect(mapRepo.upsert).not.toHaveBeenCalled();
  });

  it('rejects remember when the categoryId is not owned by this user, without upserting', async () => {
    const det: any = {
      id: 'd1',
      userId: 'u1',
      status: DetectedStatus.PENDING,
      merchant: 'True Software Scandinavia AB',
      sourceKeys: [],
    };
    const detRepo = {
      findOne: jest.fn(async () => det),
      save: jest.fn(async (x: any) => x),
      find: jest.fn(async () => []),
    };
    const mapRepo = {
      upsert: jest.fn(async () => ({})),
      findOne: jest.fn(async () => MAPPING),
    };
    const catRepo = { findOne: jest.fn(async () => null) };
    const svc = (await build({ detRepo, mapRepo, catRepo })).get(
      NotificationSyncService,
    );

    await expect(svc.confirm('u1', 'd1', CONFIRM_DTO)).rejects.toThrow(
      'Category not found',
    );
    expect(mapRepo.upsert).not.toHaveBeenCalled();
  });

  it('swallows a failing swept autoConfirm and still resolves with the primary transactionId', async () => {
    const det: any = {
      id: 'd1',
      userId: 'u1',
      status: DetectedStatus.PENDING,
      merchant: 'True Software Scandinavia AB',
      sourceKeys: [],
    };
    const failing: any = {
      id: 'd2',
      userId: 'u1',
      status: DetectedStatus.PENDING,
      merchant: 'TRUE SOFTWARE SCANDINAVIA AB',
      amount: 249,
      type: TransactionType.EXPENSE,
      accountId: 'deleted-account',
      paymentMethod: PaymentMethod.AUTOPAY,
      postedAt: new Date('2026-07-01T10:00:00Z'),
      sourceKeys: [],
    };
    const sweepable: any = {
      id: 'd3',
      userId: 'u1',
      status: DetectedStatus.PENDING,
      merchant: 'TRUE SOFTWARE SCANDINAVIA AB',
      amount: 249,
      type: TransactionType.EXPENSE,
      accountId: 'a1',
      paymentMethod: PaymentMethod.AUTOPAY,
      postedAt: new Date('2026-07-02T10:00:00Z'),
      sourceKeys: [],
    };
    const detRepo = {
      findOne: jest.fn(async () => det),
      save: jest.fn(async (x: any) => x),
      find: jest.fn(async () => [failing, sweepable]),
    };
    const mapRepo = {
      upsert: jest.fn(async () => ({})),
      findOne: jest.fn(async () => MAPPING),
    };
    const txCreate = jest
      .fn()
      .mockResolvedValueOnce({ id: 'tx1' }) // d1's own confirm
      .mockRejectedValueOnce(new Error('account deleted')) // failing (d2)
      .mockResolvedValueOnce({ id: 'tx-swept' }); // sweepable (d3)
    const svc = (await build({ detRepo, mapRepo, txCreate })).get(
      NotificationSyncService,
    );

    const result = await svc.confirm('u1', 'd1', CONFIRM_DTO);

    expect(result).toEqual({ transactionId: 'tx1' });
    expect(failing.status).toBe(DetectedStatus.PENDING);
    expect(sweepable.status).toBe(DetectedStatus.CONFIRMED);
    expect(sweepable.transactionId).toBe('tx-swept');
  });
});
