import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserPrompt } from './analysis.prompt';

/** DI token for the (optional) Anthropic client used by notification analysis.
 * Defined here (not in the module) so the module→service and service→token
 * imports don't form a cycle — mirrors RECEIPTS_ANTHROPIC_CLIENT. */
export const NOTIFICATION_ANTHROPIC_CLIENT = 'NOTIFICATION_ANTHROPIC_CLIENT';

export interface DetectedGroup {
  merchant: string | null;
  amount: number | null;
  type: 'income' | 'expense';
  category: string | null;
  institution: string | null;
  rail: 'upi' | 'card' | 'netbanking' | 'autopay' | null;
  last4: string | null;
  confidence: number;
  sourceKeys: string[];
}

const RAILS = ['upi', 'card', 'netbanking', 'autopay'] as const;

/** Parse the model's JSON array, dropping malformed / amount-less groups and
 *  any hallucinated sourceKeys not present in the batch. */
export function parseGroups(text: string, validKeys: Set<string>): DetectedGroup[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: DetectedGroup[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    const amount =
      typeof r['amount'] === 'number' && isFinite(r['amount']) && r['amount'] > 0
        ? Math.abs(r['amount'])
        : null;
    if (amount === null) continue; // not a real transaction
    const sourceKeys = Array.isArray(r['sourceKeys'])
      ? (r['sourceKeys'] as unknown[]).filter(
          (k): k is string => typeof k === 'string' && validKeys.has(k),
        )
      : [];
    if (sourceKeys.length === 0) continue; // nothing to attribute it to
    const rail =
      typeof r['rail'] === 'string' && (RAILS as readonly string[]).includes(r['rail'])
        ? (r['rail'] as DetectedGroup['rail'])
        : null;
    out.push({
      merchant: typeof r['merchant'] === 'string' ? r['merchant'] : null,
      amount,
      type: r['type'] === 'income' ? 'income' : 'expense',
      category: typeof r['category'] === 'string' ? r['category'] : null,
      institution: typeof r['institution'] === 'string' ? r['institution'] : null,
      rail,
      last4:
        typeof r['last4'] === 'string' ? r['last4'].replace(/\D/g, '').slice(-4) || null : null,
      confidence:
        typeof r['confidence'] === 'number' && r['confidence'] >= 0 && r['confidence'] <= 1
          ? r['confidence']
          : 0.5,
      sourceKeys: Array.from(new Set(sourceKeys)),
    });
  }
  return out;
}

@Injectable()
export class NotificationAnalysisService {
  private readonly logger = new Logger(NotificationAnalysisService.name);

  constructor(
    @Inject(NOTIFICATION_ANTHROPIC_CLIENT) private readonly client: Anthropic | null,
    private readonly config: ConfigService,
  ) {}

  private get model(): string {
    return this.config.get<string>('AI_MODEL') ?? 'claude-sonnet-5';
  }

  async analyze(
    captures: { dedupKey: string; packageName: string; title: string | null; text: string }[],
  ): Promise<DetectedGroup[]> {
    if (!this.client || captures.length === 0) return [];
    const validKeys = new Set(captures.map((c) => c.dedupKey));
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: ANALYSIS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildAnalysisUserPrompt(captures) }],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    return parseGroups(text, validKeys);
  }
}
