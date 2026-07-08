import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPreferences } from '../users/user-preferences.entity';
import { NotificationSyncService } from './notification-sync.service';

@Injectable()
export class NotificationSyncScheduler {
  private readonly logger = new Logger(NotificationSyncScheduler.name);

  constructor(
    private readonly service: NotificationSyncService,
    @InjectRepository(UserPreferences)
    private readonly prefsRepo: Repository<UserPreferences>,
  ) {}

  // A few times a day (IST): 09:00, 13:00, 18:00, 22:00.
  @Cron('0 9,13,18,22 * * *', { timeZone: 'Asia/Kolkata' })
  async run(): Promise<void> {
    const prefs = await this.prefsRepo.find();
    for (const p of prefs) {
      await this.safe(() => this.service.runAnalysisForUser(p.userId));
    }
  }

  private async safe(fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.warn(
        `Notification analysis failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
