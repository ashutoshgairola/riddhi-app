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
import { AccountType, DetectedStatus } from '../common/enums';

const MAPPING = {
  id: 'm1',
  userId: 'u1',
  matchKey: 'google play',
  displayName: 'Truecaller',
  categoryId: 'catSub',
};

const GROUP = {
  merchant: 'Google Play',
  amount: 249,
  type: 'expense',
  category: 'Entertainment',
  institution: 'HDFC',
  rail: 'autopay',
  last4: null,
  confidence: 0.9,
  sourceKeys: ['k1'],
};

function harness(opts: { accounts: any[]; mappings: any[]; groups: any[] }) {
  const savedDetections: any[] = [];
  const capRepo = {
    find: jest.fn(async () => [
      {
        id: 'c1',
        dedupKey: 'k1',
        packageName: 'sms',
        title: 'HDFCBK',
        text: 'UPI Mandate Rs.249.00 to Google Play',
        postedAt: new Date('2026-07-16T13:31:00Z'),
        analyzed: false,
      },
    ]),
    update: jest.fn(async () => undefined),
  };
  const detRepo = {
    create: (x: any) => x,
    save: jest.fn(async (x: any) => {
      savedDetections.push(x);
      return x;
    }),
  };
  const txCreate = jest.fn(async () => ({ id: 'tx1' }));
  const notifications = { create: jest.fn(async () => ({})) };
  const providers = [
    NotificationSyncService,
    { provide: getRepositoryToken(CapturedNotification), useValue: capRepo },
    { provide: getRepositoryToken(DetectedTransaction), useValue: detRepo },
    { provide: getRepositoryToken(Account), useValue: { find: jest.fn(async () => opts.accounts) } },
    { provide: getRepositoryToken(CreditCard), useValue: { find: jest.fn(async () => []) } },
    { provide: getRepositoryToken(VendorMapping), useValue: { find: jest.fn(async () => opts.mappings) } },
    {
      provide: getRepositoryToken(TransactionCategory),
      useValue: { find: jest.fn(async () => [{ id: 'catSub', name: 'Subscriptions' }]) },
    },
    { provide: NotificationAnalysisService, useValue: { analyze: jest.fn(async () => opts.groups) } },
    { provide: NotificationsService, useValue: notifications },
    {
      provide: TransactionsService,
      useValue: { create: txCreate, findForAccountInRange: jest.fn(async () => []) },
    },
  ];
  return { providers, savedDetections, txCreate, notifications };
}

const HDFC = { id: 'a1', institutionName: 'HDFC Bank', type: AccountType.SAVINGS };

describe('vendor mapping auto-apply in runAnalysisForUser', () => {
  it('auto-confirms a mapped detection when the account resolved', async () => {
    const h = harness({ accounts: [HDFC], mappings: [MAPPING], groups: [GROUP] });
    const svc = (await Test.createTestingModule({ providers: h.providers }).compile()).get(
      NotificationSyncService,
    );

    const res = await svc.runAnalysisForUser('u1');

    expect(res).toEqual({ detected: 0, autoAdded: 1 });
    expect(h.txCreate).toHaveBeenCalledTimes(1);
    expect(h.txCreate).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ description: 'Truecaller', categoryId: 'catSub', amount: 249 }),
    );
    const finalSave = h.savedDetections[h.savedDetections.length - 1];
    expect(finalSave).toMatchObject({
      status: DetectedStatus.CONFIRMED,
      transactionId: 'tx1',
      merchant: 'Truecaller',
    });
    // Nothing left to review → no push.
    expect(h.notifications.create).not.toHaveBeenCalled();
  });

  it('pre-fills but keeps PENDING when the account did not resolve', async () => {
    const h = harness({ accounts: [], mappings: [MAPPING], groups: [GROUP] });
    const svc = (await Test.createTestingModule({ providers: h.providers }).compile()).get(
      NotificationSyncService,
    );

    const res = await svc.runAnalysisForUser('u1');

    expect(res).toEqual({ detected: 1, autoAdded: 0 });
    expect(h.txCreate).not.toHaveBeenCalled();
    expect(h.savedDetections[0]).toMatchObject({
      status: DetectedStatus.PENDING,
      merchant: 'Truecaller',
      suggestedCategory: 'Subscriptions',
    });
    // Still needs review → push fires (non-interactive).
    expect(h.notifications.create).toHaveBeenCalledTimes(1);
  });

  it('unmapped detections behave exactly as before', async () => {
    const h = harness({ accounts: [HDFC], mappings: [], groups: [GROUP] });
    const svc = (await Test.createTestingModule({ providers: h.providers }).compile()).get(
      NotificationSyncService,
    );

    const res = await svc.runAnalysisForUser('u1');

    expect(res).toEqual({ detected: 1, autoAdded: 0 });
    expect(h.txCreate).not.toHaveBeenCalled();
    expect(h.savedDetections[0]).toMatchObject({
      status: DetectedStatus.PENDING,
      merchant: 'Google Play',
      suggestedCategory: 'Entertainment',
    });
  });
});
