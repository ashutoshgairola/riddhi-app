import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationSyncService } from './notification-sync.service';
import { CapturedNotification } from './captured-notification.entity';
import { DetectedTransaction } from './detected-transaction.entity';

describe('NotificationSyncService.ingest', () => {
  it('inserts new captures and ignores dedup collisions', async () => {
    const saved: CapturedNotification[] = [];
    const capRepo = {
      create: (x: Partial<CapturedNotification>) => x as CapturedNotification,
      // simulate ON CONFLICT DO NOTHING via query-builder insert
      createQueryBuilder: () => ({
        insert: () => ({
          values: (rows: CapturedNotification[]) => ({
            orIgnore: () => ({
              execute: async () => {
                const inserted = rows.filter(
                  (r) => !saved.find((s) => s.dedupKey === r.dedupKey),
                );
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
      ],
    }).compile();
    const svc = moduleRef.get(NotificationSyncService);

    const item = { packageName: 'com.rapido', text: 'ride ₹159', postedAt: 1_700_000_000_000 };
    await svc.ingest('u1', [item]);
    await svc.ingest('u1', [item]); // same → dedup

    expect(saved.length).toBe(1);
  });
});
