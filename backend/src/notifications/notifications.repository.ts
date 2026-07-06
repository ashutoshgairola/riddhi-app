import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './notification.entity';
import { NotificationType } from '../common/enums';

@Injectable()
export class NotificationsRepository {
  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
  ) {}

  findByUser(
    userId: string,
    filters: { type?: NotificationType; read?: boolean },
  ): Promise<Notification[]> {
    const where: Record<string, unknown> = { userId };
    if (filters.type !== undefined) where['type'] = filters.type;
    if (filters.read !== undefined) where['read'] = filters.read;

    return this.repo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  findOneByUser(id: string, userId: string): Promise<Notification | null> {
    return this.repo.findOne({ where: { id, userId } });
  }

  create(data: Partial<Notification>): Notification {
    return this.repo.create(data);
  }

  save(notification: Notification): Promise<Notification> {
    return this.repo.save(notification);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.repo.update({ userId, read: false }, { read: true });
  }
}
