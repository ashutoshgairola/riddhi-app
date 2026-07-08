import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationSyncService } from './notification-sync.service';
import { NotificationAnalysisService } from './notification-analysis.service';
import { CapturedNotification } from './captured-notification.entity';
import { DetectedTransaction } from './detected-transaction.entity';
import { Account } from '../accounts/account.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { AccountType, PaymentMethod } from '../common/enums';

describe('runAnalysisForUser', () => {
  it('turns a correlated group into one pending detection, marks captures analyzed, pushes', async () => {
    const captures: any[] = [
      { id: 'c1', dedupKey: 'k-rapido', packageName: 'com.rapido', title: '', text: 'ride ₹159', postedAt: new Date(), analyzed: false },
      { id: 'c2', dedupKey: 'k-hdfc', packageName: 'com.hdfc', title: '', text: 'Rs.159 debited A/C *1281', postedAt: new Date(), analyzed: false },
    ];
    const savedDetections: any[] = [];

    const capRepo = {
      find: jest.fn(async () => captures),
      update: jest.fn(async () => undefined),
    };
    const detRepo = {
      create: (x: any) => x,
      save: jest.fn(async (x: any) => { savedDetections.push(x); return x; }),
    };
    const accRepo = { find: jest.fn(async () => [{ id: 'a1', institutionName: 'HDFC Bank', type: AccountType.SAVINGS }] as Account[]) };
    const analysis = { analyze: jest.fn(async () => [{
      merchant: 'Rapido', amount: 159, type: 'expense', category: 'Transport',
      institution: 'HDFC', rail: 'upi', confidence: 0.9, sourceKeys: ['k-rapido', 'k-hdfc'],
    }]) };
    const notifications = { create: jest.fn(async () => ({})) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationSyncService,
        { provide: getRepositoryToken(CapturedNotification), useValue: capRepo },
        { provide: getRepositoryToken(DetectedTransaction), useValue: detRepo },
        { provide: getRepositoryToken(Account), useValue: accRepo },
        { provide: NotificationAnalysisService, useValue: analysis },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    const svc = moduleRef.get(NotificationSyncService);

    const res = await svc.runAnalysisForUser('u1');

    expect(res.detected).toBe(1);
    expect(savedDetections[0]).toMatchObject({
      merchant: 'Rapido', amount: 159, accountId: 'a1', paymentMethod: PaymentMethod.UPI,
    });
    expect(capRepo.update).toHaveBeenCalledTimes(1);
    expect(notifications.create).toHaveBeenCalledTimes(1);
  });

  it('no captures → no analyze call, no push', async () => {
    const capRepo = { find: jest.fn(async () => []), update: jest.fn() };
    const analysis = { analyze: jest.fn() };
    const notifications = { create: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationSyncService,
        { provide: getRepositoryToken(CapturedNotification), useValue: capRepo },
        { provide: getRepositoryToken(DetectedTransaction), useValue: {} },
        { provide: getRepositoryToken(Account), useValue: { find: jest.fn() } },
        { provide: NotificationAnalysisService, useValue: analysis },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    const svc = moduleRef.get(NotificationSyncService);
    const res = await svc.runAnalysisForUser('u1');
    expect(res.detected).toBe(0);
    expect(analysis.analyze).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });
});
