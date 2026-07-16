import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationSyncService } from './notification-sync.service';
import { NotificationAnalysisService } from './notification-analysis.service';
import { CapturedNotification } from './captured-notification.entity';
import { DetectedTransaction } from './detected-transaction.entity';
import { Account } from '../accounts/account.entity';
import { CreditCard } from '../credit-card/credit-card.entity';
import { VendorMapping } from './vendor-mapping.entity';
import { TransactionCategory } from '../categories/category.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { TransactionsService } from '../transactions/transactions.service';
import {
  AccountType,
  NotificationType,
  PaymentMethod,
  TransactionType,
} from '../common/enums';

describe('runAnalysisForUser', () => {
  it('turns a correlated group into one pending detection, marks captures analyzed, pushes', async () => {
    const captures: any[] = [
      {
        id: 'c1',
        dedupKey: 'k-rapido',
        packageName: 'com.rapido',
        title: '',
        text: 'ride ₹159',
        postedAt: new Date(),
        analyzed: false,
      },
      {
        id: 'c2',
        dedupKey: 'k-hdfc',
        packageName: 'com.hdfc',
        title: '',
        text: 'Rs.159 debited A/C *1281',
        postedAt: new Date(),
        analyzed: false,
      },
    ];
    const savedDetections: any[] = [];

    const capRepo = {
      find: jest.fn(async () => captures),
      update: jest.fn(async () => undefined),
    };
    const detRepo = {
      create: (x: any) => x,
      save: jest.fn(async (x: any) => {
        savedDetections.push(x);
        return x;
      }),
    };
    const accRepo = {
      find: jest.fn(
        async () =>
          [
            {
              id: 'a1',
              institutionName: 'HDFC Bank',
              type: AccountType.SAVINGS,
            },
          ] as Account[],
      ),
    };
    const cardRepo = { find: jest.fn(async () => [] as CreditCard[]) };
    const analysis = {
      analyze: jest.fn(async () => [
        {
          merchant: 'Rapido',
          amount: 159,
          type: 'expense',
          category: 'Transport',
          institution: 'HDFC',
          rail: 'upi',
          last4: null,
          confidence: 0.9,
          sourceKeys: ['k-rapido', 'k-hdfc'],
        },
      ]),
    };
    const notifications = { create: jest.fn(async () => ({})) };
    // No existing account txns → nothing to dedup against; the detection saves.
    const transactions = { findForAccountInRange: jest.fn(async () => []) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationSyncService,
        {
          provide: getRepositoryToken(CapturedNotification),
          useValue: capRepo,
        },
        { provide: getRepositoryToken(DetectedTransaction), useValue: detRepo },
        { provide: getRepositoryToken(Account), useValue: accRepo },
        { provide: getRepositoryToken(CreditCard), useValue: cardRepo },
        { provide: getRepositoryToken(VendorMapping), useValue: {} },
        { provide: getRepositoryToken(TransactionCategory), useValue: {} },
        { provide: NotificationAnalysisService, useValue: analysis },
        { provide: NotificationsService, useValue: notifications },
        { provide: TransactionsService, useValue: transactions },
      ],
    }).compile();
    const svc = moduleRef.get(NotificationSyncService);

    const res = await svc.runAnalysisForUser('u1');

    expect(res.detected).toBe(1);
    expect(savedDetections[0]).toMatchObject({
      merchant: 'Rapido',
      amount: 159,
      accountId: 'a1',
      paymentMethod: PaymentMethod.UPI,
    });
    expect(capRepo.update).toHaveBeenCalledTimes(1);
    expect(notifications.create).toHaveBeenCalledTimes(1);
    // Review nudges are Munshi-driven, not large-transaction alerts: tagging
    // them MUNSHI_SUGGESTION keeps them off the largeTxAlertsEnabled gate and
    // correctly labeled in the in-app list.
    expect(notifications.create).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ type: NotificationType.MUNSHI_SUGGESTION }),
    );
  });

  it('no captures → no analyze call, no push', async () => {
    const capRepo = { find: jest.fn(async () => []), update: jest.fn() };
    const analysis = { analyze: jest.fn() };
    const notifications = { create: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationSyncService,
        {
          provide: getRepositoryToken(CapturedNotification),
          useValue: capRepo,
        },
        { provide: getRepositoryToken(DetectedTransaction), useValue: {} },
        { provide: getRepositoryToken(Account), useValue: { find: jest.fn() } },
        {
          provide: getRepositoryToken(CreditCard),
          useValue: { find: jest.fn() },
        },
        { provide: getRepositoryToken(VendorMapping), useValue: {} },
        { provide: getRepositoryToken(TransactionCategory), useValue: {} },
        { provide: NotificationAnalysisService, useValue: analysis },
        { provide: NotificationsService, useValue: notifications },
        { provide: TransactionsService, useValue: {} },
      ],
    }).compile();
    const svc = moduleRef.get(NotificationSyncService);
    const res = await svc.runAnalysisForUser('u1');
    expect(res.detected).toBe(0);
    expect(analysis.analyze).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('suppresses a detection whose charge already exists on the resolved account (reverse dedup)', async () => {
    const posted = new Date('2026-06-12T10:00:00Z');
    const captures: any[] = [
      {
        id: 'c1',
        dedupKey: 'k-hdfc',
        packageName: 'com.hdfc',
        title: '',
        text: 'Rs.499 spent on card *1234',
        postedAt: posted,
        analyzed: false,
      },
    ];
    const savedDetections: any[] = [];
    const capRepo = {
      find: jest.fn(async () => captures),
      update: jest.fn(async () => undefined),
    };
    const detRepo = {
      create: (x: any) => x,
      save: jest.fn(async (x: any) => {
        savedDetections.push(x);
        return x;
      }),
    };
    // One HDFC credit account, whose card carries last4 1234 → resolves by last4.
    const accRepo = {
      find: jest.fn(
        async () =>
          [
            {
              id: 'cc1',
              institutionName: 'HDFC Bank',
              type: AccountType.CREDIT,
            },
          ] as Account[],
      ),
    };
    const cardRepo = {
      find: jest.fn(
        async () => [{ accountId: 'cc1', last4: '1234' }] as CreditCard[],
      ),
    };
    const analysis = {
      analyze: jest.fn(async () => [
        {
          merchant: 'Swiggy',
          amount: 499,
          type: 'expense',
          category: 'Food',
          institution: 'HDFC',
          rail: 'card',
          last4: '1234',
          confidence: 0.9,
          sourceKeys: ['k-hdfc'],
        },
      ]),
    };
    const notifications = { create: jest.fn(async () => ({})) };
    // An existing debit of 499 on the same account within the window → duplicate.
    const transactions = {
      findForAccountInRange: jest.fn(async () => [
        {
          id: 't1',
          date: new Date('2026-06-12T09:00:00Z'),
          amount: 499,
          type: TransactionType.EXPENSE,
          accountId: 'cc1',
          description: 'SWIGGY',
          importFingerprint: null,
        },
      ]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationSyncService,
        {
          provide: getRepositoryToken(CapturedNotification),
          useValue: capRepo,
        },
        { provide: getRepositoryToken(DetectedTransaction), useValue: detRepo },
        { provide: getRepositoryToken(Account), useValue: accRepo },
        { provide: getRepositoryToken(CreditCard), useValue: cardRepo },
        { provide: getRepositoryToken(VendorMapping), useValue: {} },
        { provide: getRepositoryToken(TransactionCategory), useValue: {} },
        { provide: NotificationAnalysisService, useValue: analysis },
        { provide: NotificationsService, useValue: notifications },
        { provide: TransactionsService, useValue: transactions },
      ],
    }).compile();
    const svc = moduleRef.get(NotificationSyncService);

    const res = await svc.runAnalysisForUser('u1');

    // The charge already exists → no new detection, no review nudge, but the
    // captures are still marked analyzed so we don't re-process them.
    expect(res.detected).toBe(0);
    expect(savedDetections).toHaveLength(0);
    expect(transactions.findForAccountInRange).toHaveBeenCalledTimes(1);
    expect(capRepo.update).toHaveBeenCalledTimes(1);
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('keeps a detection when no existing account txn matches (reverse dedup miss)', async () => {
    const posted = new Date('2026-06-12T10:00:00Z');
    const captures: any[] = [
      {
        id: 'c1',
        dedupKey: 'k-hdfc',
        packageName: 'com.hdfc',
        title: '',
        text: 'Rs.499 spent on card *1234',
        postedAt: posted,
        analyzed: false,
      },
    ];
    const savedDetections: any[] = [];
    const capRepo = {
      find: jest.fn(async () => captures),
      update: jest.fn(async () => undefined),
    };
    const detRepo = {
      create: (x: any) => x,
      save: jest.fn(async (x: any) => {
        savedDetections.push(x);
        return x;
      }),
    };
    const accRepo = {
      find: jest.fn(
        async () =>
          [
            {
              id: 'cc1',
              institutionName: 'HDFC Bank',
              type: AccountType.CREDIT,
            },
          ] as Account[],
      ),
    };
    const cardRepo = {
      find: jest.fn(
        async () => [{ accountId: 'cc1', last4: '1234' }] as CreditCard[],
      ),
    };
    const analysis = {
      analyze: jest.fn(async () => [
        {
          merchant: 'Swiggy',
          amount: 499,
          type: 'expense',
          category: 'Food',
          institution: 'HDFC',
          rail: 'card',
          last4: '1234',
          confidence: 0.9,
          sourceKeys: ['k-hdfc'],
        },
      ]),
    };
    const notifications = { create: jest.fn(async () => ({})) };
    // A different amount on the account → no match → detection is kept.
    const transactions = {
      findForAccountInRange: jest.fn(async () => [
        {
          id: 't1',
          date: new Date('2026-06-12T09:00:00Z'),
          amount: 42,
          type: TransactionType.EXPENSE,
          accountId: 'cc1',
          description: 'OTHER',
          importFingerprint: null,
        },
      ]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationSyncService,
        {
          provide: getRepositoryToken(CapturedNotification),
          useValue: capRepo,
        },
        { provide: getRepositoryToken(DetectedTransaction), useValue: detRepo },
        { provide: getRepositoryToken(Account), useValue: accRepo },
        { provide: getRepositoryToken(CreditCard), useValue: cardRepo },
        { provide: getRepositoryToken(VendorMapping), useValue: {} },
        { provide: getRepositoryToken(TransactionCategory), useValue: {} },
        { provide: NotificationAnalysisService, useValue: analysis },
        { provide: NotificationsService, useValue: notifications },
        { provide: TransactionsService, useValue: transactions },
      ],
    }).compile();
    const svc = moduleRef.get(NotificationSyncService);

    const res = await svc.runAnalysisForUser('u1');

    expect(res.detected).toBe(1);
    expect(savedDetections).toHaveLength(1);
    // Resolved to the exact card via last4, even though institution alone would too.
    expect(savedDetections[0]).toMatchObject({
      merchant: 'Swiggy',
      amount: 499,
      accountId: 'cc1',
    });
  });

  it('gates an OTP capture out of the LLM batch but still marks it analyzed', async () => {
    const captures: any[] = [
      {
        id: 'c1',
        dedupKey: 'k-otp',
        packageName: 'sms',
        title: 'HDFCBK',
        text: 'OTP is 867317 for txn of INR 1190.00 at BUNDL TECHN',
        postedAt: new Date(),
        analyzed: false,
      },
    ];
    const capRepo = {
      find: jest.fn(async () => captures),
      update: jest.fn(async () => undefined),
    };
    const analysis = { analyze: jest.fn(async () => []) };
    const notifications = { create: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationSyncService,
        {
          provide: getRepositoryToken(CapturedNotification),
          useValue: capRepo,
        },
        {
          provide: getRepositoryToken(DetectedTransaction),
          useValue: { create: (x: any) => x, save: jest.fn() },
        },
        {
          provide: getRepositoryToken(Account),
          useValue: { find: jest.fn(async () => []) },
        },
        {
          provide: getRepositoryToken(CreditCard),
          useValue: { find: jest.fn(async () => []) },
        },
        { provide: getRepositoryToken(VendorMapping), useValue: {} },
        { provide: getRepositoryToken(TransactionCategory), useValue: {} },
        { provide: NotificationAnalysisService, useValue: analysis },
        { provide: NotificationsService, useValue: notifications },
        {
          provide: TransactionsService,
          useValue: { findForAccountInRange: jest.fn() },
        },
      ],
    }).compile();
    const svc = moduleRef.get(NotificationSyncService);
    const res = await svc.runAnalysisForUser('u1');
    expect(res.detected).toBe(0);
    expect(analysis.analyze).not.toHaveBeenCalled(); // OTP was the only capture → nothing to send
    expect(capRepo.update).toHaveBeenCalledTimes(1); // still marked analyzed
  });

  it('does not push a review nudge when interactive', async () => {
    const captures: any[] = [
      {
        id: 'c1',
        dedupKey: 'k-hdfc',
        packageName: 'sms',
        title: 'HDFCBK',
        text: 'Rs.499 spent on card *1234',
        postedAt: new Date(),
        analyzed: false,
      },
    ];
    const capRepo = {
      find: jest.fn(async () => captures),
      update: jest.fn(async () => undefined),
    };
    const analysis = {
      analyze: jest.fn(async () => [
        {
          merchant: 'Swiggy',
          amount: 499,
          type: 'expense',
          category: 'Food',
          institution: 'HDFC',
          rail: 'card',
          last4: '1234',
          confidence: 0.9,
          sourceKeys: ['k-hdfc'],
        },
      ]),
    };
    const notifications = { create: jest.fn(async () => ({})) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationSyncService,
        {
          provide: getRepositoryToken(CapturedNotification),
          useValue: capRepo,
        },
        {
          provide: getRepositoryToken(DetectedTransaction),
          useValue: {
            create: (x: any) => x,
            save: jest.fn(async (x: any) => x),
          },
        },
        {
          provide: getRepositoryToken(Account),
          useValue: { find: jest.fn(async () => []) },
        },
        {
          provide: getRepositoryToken(CreditCard),
          useValue: { find: jest.fn(async () => []) },
        },
        { provide: getRepositoryToken(VendorMapping), useValue: {} },
        { provide: getRepositoryToken(TransactionCategory), useValue: {} },
        { provide: NotificationAnalysisService, useValue: analysis },
        { provide: NotificationsService, useValue: notifications },
        {
          provide: TransactionsService,
          useValue: { findForAccountInRange: jest.fn(async () => []) },
        },
      ],
    }).compile();
    const svc = moduleRef.get(NotificationSyncService);
    const res = await svc.runAnalysisForUser('u1', { interactive: true });
    expect(res.detected).toBe(1);
    expect(notifications.create).not.toHaveBeenCalled();
  });
});
