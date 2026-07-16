import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { LineDirection, ParsedLineItem } from './statement-dedup';

/** DI token for the (optional) Anthropic client used by statement parsing.
 * Defined here (not in the module) so the module→service and service→token
 * imports don't form a cycle. */
export const STATEMENTS_ANTHROPIC_CLIENT = 'STATEMENTS_ANTHROPIC_CLIENT';

export interface ParsedStatementSummary {
  statementDate: string | null;
  statementBilled: number | null;
  statementMinDue: number | null;
  statementDueDate: string | null;
  statementRewards: number | null;
  openingBalance: number | null;
  closingBalance: number | null;
}

export interface ParsedStatement {
  last4: string | null;
  inferredType: 'card' | 'bank';
  period: { from: string | null; to: string | null };
  summary: ParsedStatementSummary;
  items: ParsedLineItem[];
}

/** Either raw PDF base64 (document block) or on-device-extracted text. */
export type StatementInput = { pdf: string } | { text: string };

const EMPTY_SUMMARY: ParsedStatementSummary = {
  statementDate: null,
  statementBilled: null,
  statementMinDue: null,
  statementDueDate: null,
  statementRewards: null,
  openingBalance: null,
  closingBalance: null,
};

/**
 * StatementParserService — extracts a structured bank/card statement from a
 * PDF (or on-device-extracted text, for encrypted PDFs the client decrypted
 * locally) using Claude. Returns best-effort fields; downstream dedup/import
 * flows treat the result as untrusted input, so a misread never silently
 * creates a wrong transaction (see the hallucination guard in parseReply).
 */
@Injectable()
export class StatementParserService {
  private readonly logger = new Logger(StatementParserService.name);

  constructor(
    @Inject(STATEMENTS_ANTHROPIC_CLIENT) private readonly client: Anthropic | null,
    private readonly config: ConfigService,
  ) {}

  private get model(): string {
    return this.config.get<string>('AI_MODEL') ?? 'claude-sonnet-5';
  }

  async parse(input: StatementInput): Promise<ParsedStatement> {
    if (!this.client) {
      throw new ServiceUnavailableException('Statement import is not configured');
    }
    // Build the source block: a PDF document block for raw bytes, or a text
    // block for on-device-extracted text (encrypted PDFs decrypted on-device).
    const sourceBlock =
      'pdf' in input
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.pdf } }
        : { type: 'text', text: `STATEMENT TEXT (extracted on device):\n${input.text}` };

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      system:
        'You extract a bank or credit-card statement into JSON. Reply with ONLY a JSON object, no prose, no markdown fences. Shape: ' +
        '{"last4": string|null (last 4 digits of the account/card), "type": "card"|"bank", ' +
        '"period": {"from": "YYYY-MM-DD"|null, "to": "YYYY-MM-DD"|null}, ' +
        '"summary": {"statementDate":"YYYY-MM-DD"|null,"statementBilled":number|null,"statementMinDue":number|null,"statementDueDate":"YYYY-MM-DD"|null,"statementRewards":number|null,"openingBalance":number|null,"closingBalance":number|null}, ' +
        '"items": [{"date":"YYYY-MM-DD","amount":number (positive),"direction":"debit"|"credit","descriptor":string,"category":string|null}]}. ' +
        'A debit is money out (a purchase/withdrawal), a credit is money in (a payment/refund/deposit). ' +
        'category is one of Food, Groceries, Transport, Shopping, Bills, Utilities, Entertainment, Health, Income, or null. ' +
        'For a credit-card statement fill the statement* summary fields; for a bank statement fill opening/closingBalance. Omit interest/finance-charge summary rows from items only if they are not real charges.',
      messages: [
        {
          role: 'user',
          content: [
            sourceBlock as any,
            { type: 'text', text: 'Extract the statement as JSON.' },
          ],
        },
      ],
    } as Anthropic.MessageCreateParamsNonStreaming);

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();

    return this.parseReply(text);
  }

  /** Parse + hallucination guard: drop items with non-positive amounts or
   * malformed dates; coerce enums; never throw on a bad reply. */
  private parseReply(text: string): ParsedStatement {
    const empty: ParsedStatement = {
      last4: null,
      inferredType: 'bank',
      period: { from: null, to: null },
      summary: { ...EMPTY_SUMMARY },
      items: [],
    };
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      this.logger.warn(`Statement parse: no JSON (${text.slice(0, 120)})`);
      return empty;
    }
    let raw: Record<string, any>;
    try {
      raw = JSON.parse(match[0]);
    } catch {
      this.logger.warn(`Statement parse: bad JSON (${text.slice(0, 120)})`);
      return empty;
    }
    const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);
    const dir = (v: unknown): LineDirection => (v === 'credit' ? 'credit' : 'debit');

    const items: ParsedLineItem[] = Array.isArray(raw.items)
      ? raw.items
          .filter((it: any) => it && isDate(it.date) && typeof it.amount === 'number' && it.amount > 0)
          .map((it: any) => ({
            isoDate: it.date,
            amount: Math.abs(it.amount),
            direction: dir(it.direction),
            descriptor: typeof it.descriptor === 'string' ? it.descriptor : '',
            category: typeof it.category === 'string' ? it.category : null,
          }))
      : [];

    const s = raw.summary ?? {};
    return {
      last4: typeof raw.last4 === 'string' ? raw.last4.replace(/\D/g, '').slice(-4) || null : null,
      inferredType: raw.type === 'card' ? 'card' : 'bank',
      period: { from: isDate(raw.period?.from) ? raw.period.from : null, to: isDate(raw.period?.to) ? raw.period.to : null },
      summary: {
        statementDate: isDate(s.statementDate) ? s.statementDate : null,
        statementBilled: num(s.statementBilled),
        statementMinDue: num(s.statementMinDue),
        statementDueDate: isDate(s.statementDueDate) ? s.statementDueDate : null,
        statementRewards: num(s.statementRewards),
        openingBalance: num(s.openingBalance),
        closingBalance: num(s.closingBalance),
      },
      items,
    };
  }
}
