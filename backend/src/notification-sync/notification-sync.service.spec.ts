import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationSyncService } from './notification-sync.service';
import { CapturedNotification } from './captured-notification.entity';
import { DetectedTransaction } from './detected-transaction.entity';

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
