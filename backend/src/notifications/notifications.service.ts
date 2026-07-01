import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationsRepository } from './notifications.repository';
import { Notification } from './notification.entity';
import { NotificationType } from '../common/enums';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notificationsRepository: NotificationsRepository,
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
}
