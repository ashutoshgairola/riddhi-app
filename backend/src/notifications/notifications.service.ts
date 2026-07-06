import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationsRepository } from './notifications.repository';
import { Notification, NotificationData } from './notification.entity';
import { DeviceToken } from './device-token.entity';
import { PushDispatcher } from './push-dispatcher.service';
import { UsersService } from '../users/users.service';
import { NotificationType } from '../common/enums';

const TYPE_PREF: Partial<Record<NotificationType, string>> = {
  [NotificationType.BUDGET_ALERT]: 'budgetAlertsEnabled',
  [NotificationType.GOAL_PROGRESS]: 'goalMilestonesEnabled',
  [NotificationType.LARGE_TRANSACTION]: 'largeTxAlertsEnabled',
  [NotificationType.MUNSHI_SUGGESTION]: 'munshiSuggestionsEnabled',
  [NotificationType.MONTHLY_REPORT]: 'monthlyReportEnabled',
};

export interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  data: NotificationData;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notificationsRepository: NotificationsRepository,
    private readonly pushDispatcher: PushDispatcher,
    @InjectRepository(DeviceToken)
    private readonly tokenRepo: Repository<DeviceToken>,
    private readonly usersService: UsersService,
  ) {}

  findAll(
    userId: string,
    filters: { type?: NotificationType; read?: boolean },
  ): Promise<Notification[]> {
    return this.notificationsRepository.findByUser(userId, filters);
  }

  async markRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.notificationsRepository.findOneByUser(
      id,
      userId,
    );
    if (!notification) throw new NotFoundException('Notification not found');
    notification.read = true;
    return this.notificationsRepository.save(notification);
  }

  async markAllRead(userId: string): Promise<{ updated: true }> {
    await this.notificationsRepository.markAllRead(userId);
    return { updated: true };
  }

  async create(
    userId: string,
    input: CreateNotificationInput,
  ): Promise<Notification | null> {
    const prefs = (await this.usersService.getPreferences(userId)) as unknown as Record<
      string,
      boolean
    >;

    if (!this.isTypeEnabled(prefs, input.type)) {
      return null; // per-type disabled
    }

    const row = await this.notificationsRepository.save(
      this.notificationsRepository.create({
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data,
        read: false,
      }),
    );

    if (prefs.notificationsEnabled !== false) {
      await this.pushDispatcher.send(userId, {
        title: input.title,
        body: input.body,
        data: input.data as unknown as Record<string, unknown>,
      });
    }

    return row;
  }

  private isTypeEnabled(
    prefs: Record<string, boolean>,
    type: NotificationType,
  ): boolean {
    const prefKey = TYPE_PREF[type];
    if (!prefKey) return true; // e.g. security_alert: always enabled
    return prefs[prefKey] !== false;
  }

  async registerDevice(
    userId: string,
    expoPushToken: string,
    platform: string,
  ): Promise<void> {
    await this.tokenRepo.upsert(
      { userId, expoPushToken, platform },
      { conflictPaths: ['expoPushToken'] },
    );
  }

  async unregisterDevice(expoPushToken: string): Promise<void> {
    await this.tokenRepo.delete({ expoPushToken });
  }
}
