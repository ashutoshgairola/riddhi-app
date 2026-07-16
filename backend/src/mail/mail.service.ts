import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * MailService — sends transactional email via the Brevo HTTP API when
 * configured, and degrades gracefully otherwise.
 *
 * Configure with BREVO_API_KEY (and optional BREVO_SENDER_EMAIL /
 * BREVO_SENDER_NAME). When the API key is not set (e.g. local dev), the email
 * is logged instead of sent so flows like password reset remain testable
 * without a real mailbox — `isConfigured()` reports which mode is active.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private static readonly ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

  private readonly apiKey?: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('BREVO_API_KEY') || undefined;
  }

  isConfigured(): boolean {
    return this.apiKey !== undefined;
  }

  private sender(): { email: string; name?: string } {
    return {
      email:
        this.config.get<string>('BREVO_SENDER_EMAIL') ?? 'no-reply@riddhi.app',
      name: this.config.get<string>('BREVO_SENDER_NAME') ?? 'Riddhi',
    };
  }

  /**
   * Sends an email. Returns true if actually dispatched via Brevo; false when
   * no API key is configured (the message is logged instead).
   */
  async send(to: string, subject: string, text: string): Promise<boolean> {
    if (!this.apiKey) {
      this.logger.warn(
        `BREVO_API_KEY not configured — email to ${to} not sent. Subject: "${subject}"\n${text}`,
      );
      return false;
    }

    const res = await fetch(MailService.ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: this.sender(),
        to: [{ email: to }],
        subject,
        textContent: text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(
        `Brevo email send failed (${res.status}): ${detail || res.statusText}`,
      );
    }
    return true;
  }
}
