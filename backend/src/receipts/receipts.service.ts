import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ScannedReceipt } from './dto/scan-receipt.dto';

/** DI token for the (optional) Anthropic client used by receipt scanning.
 * Defined here (not in the module) so the module→service and service→token
 * imports don't form a cycle. */
export const RECEIPTS_ANTHROPIC_CLIENT = 'RECEIPTS_ANTHROPIC_CLIENT';

/**
 * ReceiptsService — extracts a structured transaction from a receipt photo
 * using a Claude vision model. Returns best-effort fields (any of which may be
 * null); the client presents them for the user to confirm before saving, so a
 * misread never silently creates a wrong entry.
 */
@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    @Inject(RECEIPTS_ANTHROPIC_CLIENT) private readonly client: Anthropic | null,
    private readonly config: ConfigService,
  ) {}

  private get model(): string {
    return this.config.get<string>('AI_MODEL') ?? 'claude-sonnet-5';
  }

  async scan(
    image: string,
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
  ): Promise<ScannedReceipt> {
    if (!this.client) {
      throw new ServiceUnavailableException('Receipt scanning is not configured');
    }

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      system:
        'You extract a single transaction from a receipt or bill image. Reply with ONLY a JSON object, no prose, no markdown fences. Shape: ' +
        '{"amount": number|null, "merchant": string|null, "date": string|null (YYYY-MM-DD), "type": "income"|"expense", "category": string|null}. ' +
        'amount is the grand total in the receipt currency as a positive number. ' +
        'category is one of Food, Groceries, Transport, Shopping, Bills, Utilities, Entertainment, Health, Income, or null if unclear. ' +
        'If the image is not a receipt/bill, return all null fields with type "expense".',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: image },
            },
            { type: 'text', text: 'Extract the transaction as JSON.' },
          ],
        },
      ],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    return this.parse(text);
  }

  /** Parses the model's JSON reply, tolerating stray code fences/prose. */
  private parse(text: string): ScannedReceipt {
    const fallback: ScannedReceipt = {
      amount: null,
      merchant: null,
      date: null,
      type: 'expense',
      category: null,
    };
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      this.logger.warn(`Receipt scan returned no JSON: ${text.slice(0, 120)}`);
      return fallback;
    }
    try {
      const raw = JSON.parse(match[0]) as Record<string, unknown>;
      const amount =
        typeof raw['amount'] === 'number' && isFinite(raw['amount'])
          ? Math.abs(raw['amount'])
          : null;
      const type = raw['type'] === 'income' ? 'income' : 'expense';
      return {
        amount,
        merchant: typeof raw['merchant'] === 'string' ? raw['merchant'] : null,
        date:
          typeof raw['date'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw['date'])
            ? raw['date']
            : null,
        type,
        category: typeof raw['category'] === 'string' ? raw['category'] : null,
      };
    } catch {
      this.logger.warn(`Receipt scan JSON parse failed: ${text.slice(0, 120)}`);
      return fallback;
    }
  }
}
