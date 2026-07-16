import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceToken } from './device-token.entity';
import { buildExpoMessages, chunk, ExpoPushMessage } from './expo-push';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100;

interface ExpoTicket {
  status: 'ok' | 'error';
  details?: { error?: string };
}

@Injectable()
export class PushDispatcher {
  private readonly logger = new Logger(PushDispatcher.name);

  constructor(
    @InjectRepository(DeviceToken)
    private readonly tokenRepo: Repository<DeviceToken>,
  ) {}

  async send(
    userId: string,
    n: { title: string; body: string; data: Record<string, unknown> },
  ): Promise<void> {
    try {
      const tokens = await this.tokenRepo.find({ where: { userId } });
      if (tokens.length === 0) {
        this.logger.warn(
          `Push skipped for ${userId}: no device tokens registered ("${n.title}")`,
        );
        return;
      }
      this.logger.log(
        `Dispatching "${n.title}" to ${tokens.length} device token(s) for ${userId}`,
      );

      const messages = buildExpoMessages(
        tokens.map((t) => t.expoPushToken),
        n,
      );

      for (const batch of chunk(messages, CHUNK_SIZE)) {
        await this.sendBatch(batch);
      }
    } catch (err) {
      this.logger.warn(
        `Push dispatch failed for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async sendBatch(batch: ExpoPushMessage[]): Promise<void> {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      this.logger.warn(`Expo push HTTP ${res.status}`);
      return;
    }
    const json = (await res.json()) as { data?: ExpoTicket[] };
    const tickets = json.data ?? [];
    await Promise.all(
      tickets.map((ticket, i) => {
        if (ticket.status === 'error') {
          this.logger.warn(
            `Expo push error for ${batch[i].to}: ${ticket.details?.error ?? 'unknown'}`,
          );
          if (ticket.details?.error === 'DeviceNotRegistered') {
            return this.tokenRepo.delete({ expoPushToken: batch[i].to });
          }
        }
        return Promise.resolve();
      }),
    );
  }
}
