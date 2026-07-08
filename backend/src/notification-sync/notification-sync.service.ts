import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CapturedNotification } from './captured-notification.entity';
import { DetectedTransaction } from './detected-transaction.entity';
import { IngestItemDto } from './dto/ingest.dto';
import { computeDedupKey } from './dedup';

@Injectable()
export class NotificationSyncService {
  constructor(
    @InjectRepository(CapturedNotification)
    private readonly captures: Repository<CapturedNotification>,
    @InjectRepository(DetectedTransaction)
    private readonly detected: Repository<DetectedTransaction>,
  ) {}

  /**
   * Persist a batch of raw captures, dropping rows that collide on
   * (userId, dedupKey). Uses an ON CONFLICT DO NOTHING insert so a re-upload
   * of the same notification is a silent no-op.
   */
  async ingest(userId: string, items: IngestItemDto[]): Promise<{ inserted: number }> {
    if (items.length === 0) return { inserted: 0 };
    const rows = items.map((i) =>
      this.captures.create({
        userId,
        packageName: i.packageName,
        title: i.title ?? null,
        text: i.text,
        postedAt: new Date(i.postedAt),
        dedupKey: computeDedupKey(i.packageName, i.text, i.postedAt),
        analyzed: false,
      }),
    );
    const res = await this.captures
      .createQueryBuilder()
      .insert()
      .values(rows)
      .orIgnore() // ON CONFLICT DO NOTHING
      .execute();
    return { inserted: res.identifiers.filter(Boolean).length };
  }
}
