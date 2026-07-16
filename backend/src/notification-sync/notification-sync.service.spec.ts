import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationSyncService } from './notification-sync.service';
import { CapturedNotification } from './captured-notification.entity';
import { DetectedTransaction } from './detected-transaction.entity';
import { Account } from '../accounts/account.entity';
import { CreditCard } from '../credit-card/credit-card.entity';
import { VendorMapping } from './vendor-mapping.entity';
import { TransactionCategory } from '../categories/category.entity';
import { NotificationAnalysisService } from './notification-analysis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TransactionsService } from '../transactions/transactions.service';

describe('NotificationSyncService.ingest', () => {
  it('inserts new captures and ignores dedup collisions within and across batches', async () => {
    const saved: CapturedNotification[] = [];
    const capRepo = {
      create: (x: Partial<CapturedNotification>) => x as CapturedNotification,
      // Faithfully model the DB unique constraint on (userId, dedupKey) with
      // ON CONFLICT DO NOTHING, INCLUDING duplicates within the same batch.
      createQueryBuilder: () => ({
        insert: () => ({
          values: (rows: CapturedNotification[]) => ({
            orIgnore: () => ({
              execute: async () => {
                const seen = new Set(
                  saved.map((s) => `${s.userId}|${s.dedupKey}`),
                );
                const inserted: CapturedNotification[] = [];
                for (const r of rows) {
                  const key = `${r.userId}|${r.dedupKey}`;
                  if (seen.has(key)) continue; // already saved OR earlier in this batch
                  seen.add(key);
                  inserted.push(r);
                }
                saved.push(...inserted);
                return { identifiers: inserted.map(() => ({})) };
              },
            }),
          }),
        }),
      }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationSyncService,
        { provide: getRepositoryToken(CapturedNotification), useValue: capRepo },
        { provide: getRepositoryToken(DetectedTransaction), useValue: {} },
        { provide: getRepositoryToken(Account), useValue: {} },
        { provide: getRepositoryToken(CreditCard), useValue: {} },
        { provide: getRepositoryToken(VendorMapping), useValue: {} },
        { provide: getRepositoryToken(TransactionCategory), useValue: {} },
        { provide: NotificationAnalysisService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: TransactionsService, useValue: {} },
      ],
    }).compile();
    const svc = moduleRef.get(NotificationSyncService);

    const a = { packageName: 'com.rapido', text: 'ride ₹159', postedAt: 1_700_000_000_000 };
    const b = { packageName: 'com.uber', text: 'ride ₹220', postedAt: 1_700_000_000_000 };
    const c = { packageName: 'com.swiggy', text: 'order ₹499', postedAt: 1_700_000_000_000 };

    // a is duplicated WITHIN the same batch → only one a + one b insert.
    const first = await svc.ingest('u1', [a, a, b]);
    expect(first).toEqual({ inserted: 2 });
    expect(saved.length).toBe(2);

    // a repeats ACROSS batches (already saved); c is new → only c inserts.
    const second = await svc.ingest('u1', [a, c]);
    expect(second).toEqual({ inserted: 1 });
    expect(saved.length).toBe(3);
  });
});

describe('NotificationSyncService.listPending', () => {
  /** Builds a service whose detected-repo `find` records the options it was
   * called with, so we can assert the `take` (page size) that gets applied. */
  async function makeService() {
    const calls: Array<{ take?: number }> = [];
    const detectedRepo = {
      find: async (opts: { take?: number }) => {
        calls.push(opts);
        return [];
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationSyncService,
        { provide: getRepositoryToken(CapturedNotification), useValue: {} },
        { provide: getRepositoryToken(DetectedTransaction), useValue: detectedRepo },
        { provide: getRepositoryToken(Account), useValue: {} },
        { provide: getRepositoryToken(CreditCard), useValue: {} },
        { provide: getRepositoryToken(VendorMapping), useValue: {} },
        { provide: getRepositoryToken(TransactionCategory), useValue: {} },
        { provide: NotificationAnalysisService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: TransactionsService, useValue: {} },
      ],
    }).compile();
    return { svc: moduleRef.get(NotificationSyncService), calls };
  }

  it('applies the default page size when no limit is given', async () => {
    const { svc, calls } = await makeService();
    await svc.listPending('u1');
    expect(calls[0].take).toBe(50);
  });

  it('honors a valid limit from the query string', async () => {
    const { svc, calls } = await makeService();
    await svc.listPending('u1', '10');
    expect(calls[0].take).toBe(10);
  });

  it('clamps an over-large limit to the hard maximum', async () => {
    const { svc, calls } = await makeService();
    await svc.listPending('u1', '9999');
    expect(calls[0].take).toBe(100);
  });

  it('falls back to the default for a non-numeric or non-positive limit', async () => {
    const { svc, calls } = await makeService();
    await svc.listPending('u1', 'abc');
    await svc.listPending('u1', '0');
    await svc.listPending('u1', '-5');
    expect(calls.map((c) => c.take)).toEqual([50, 50, 50]);
  });
});
