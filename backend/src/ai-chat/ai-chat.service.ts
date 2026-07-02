import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { BudgetsService } from '../budgets/budgets.service';
import { GoalsService } from '../goals/goals.service';
import { TransactionsService } from '../transactions/transactions.service';
import { CategoriesService } from '../categories/categories.service';
import { TransactionType, GoalStatus } from '../common/enums';
import { ChatRequestDto } from './dto/chat.dto';
import {
  buildSystemPrompt,
  ChatPromptContext,
  PromptBudgetContext,
  PromptGoalContext,
} from './prompt';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;
const GRACEFUL_REPLY =
  "I'm having trouble reaching my brain right now, but I've noted what you said. Try again in a moment, or add the entry manually for now.";

export interface ExtractedTransaction {
  merchant: string;
  amount: number;
  category: string;
  time: string;
}

export interface ChatResult {
  reply: string;
  transaction: ExtractedTransaction | null;
}

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);
  private readonly client: Anthropic | null;

  constructor(
    private readonly configService: ConfigService,
    private readonly budgetsService: BudgetsService,
    private readonly goalsService: GoalsService,
    private readonly transactionsService: TransactionsService,
    private readonly categoriesService: CategoriesService,
  ) {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
    if (!this.client) {
      this.logger.warn(
        'ANTHROPIC_API_KEY is not set — /ai-chat will respond with graceful fallbacks only.',
      );
    }
  }

  async chat(userId: string, dto: ChatRequestDto): Promise<ChatResult> {
    if (!this.client) {
      return { reply: GRACEFUL_REPLY, transaction: null };
    }

    let result: ChatResult;
    try {
      const promptContext = await this.buildPromptContext(userId);
      const systemPrompt = buildSystemPrompt(promptContext);

      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: dto.messages.map((m) => ({
          role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
          content: m.text,
        })),
      });

      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text content in Anthropic response');
      }

      result = this.parseAndValidate(textBlock.text);
    } catch (err) {
      this.logger.error(
        `AI chat call failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { reply: GRACEFUL_REPLY, transaction: null };
    }

    if (result.transaction) {
      try {
        await this.persistTransaction(userId, result.transaction);
      } catch (err) {
        this.logger.error(
          `Failed to persist AI-extracted transaction: ${err instanceof Error ? err.message : String(err)}`,
        );
        // Don't fail the whole request just because persistence failed —
        // the user still gets the conversational reply.
      }
    }

    return result;
  }

  /**
   * Slices the JSON object out of the model's raw text (between the first
   * `{` and last `}`), parses it, and validates the shape matches the
   * {reply, transaction} contract.
   */
  private parseAndValidate(raw: string): ChatResult {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) {
      throw new Error('No JSON object found in model response');
    }

    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as { reply?: unknown }).reply !== 'string'
    ) {
      throw new Error('Malformed response: missing "reply" string');
    }

    const obj = parsed as { reply: string; transaction?: unknown };
    const tx = obj.transaction;

    if (tx === null || tx === undefined) {
      return { reply: obj.reply, transaction: null };
    }

    if (
      typeof tx !== 'object' ||
      typeof (tx as { merchant?: unknown }).merchant !== 'string' ||
      typeof (tx as { amount?: unknown }).amount !== 'number' ||
      typeof (tx as { category?: unknown }).category !== 'string' ||
      typeof (tx as { time?: unknown }).time !== 'string'
    ) {
      throw new Error('Malformed response: invalid "transaction" shape');
    }

    const t = tx as ExtractedTransaction;
    return {
      reply: obj.reply,
      transaction: {
        merchant: t.merchant,
        amount: t.amount,
        category: t.category,
        time: t.time,
      },
    };
  }

  /** Maps sign -> type, name -> categoryId (find-or-fallback), and persists via TransactionsService. */
  private async persistTransaction(
    userId: string,
    tx: ExtractedTransaction,
  ): Promise<void> {
    const type =
      tx.amount >= 0 ? TransactionType.INCOME : TransactionType.EXPENSE;
    const amount = Math.abs(tx.amount);

    const categoryId = await this.resolveCategoryId(userId, tx.category);
    if (!categoryId) {
      this.logger.warn(
        `Skipping persistence of AI-extracted transaction — no category available for user ${userId}`,
      );
      return;
    }

    await this.transactionsService.create(userId, {
      date: new Date().toISOString(),
      description: tx.merchant,
      amount,
      type,
      categoryId,
    });
  }

  /** Finds the user's TransactionCategory matching the AI-suggested category name (case-insensitive), else falls back to any existing category. */
  private async resolveCategoryId(
    userId: string,
    categoryName: string,
  ): Promise<string | null> {
    const categories = await this.categoriesService.findAll(userId);
    if (categories.length === 0) return null;

    const match = categories.find(
      (c) => c.name.toLowerCase() === categoryName.toLowerCase(),
    );
    return (match ?? categories[0]).id;
  }

  private async buildPromptContext(userId: string): Promise<ChatPromptContext> {
    const [budgets, goals] = await Promise.all([
      this.budgetsService
        .findAll(userId)
        .catch(() => [] as Awaited<ReturnType<BudgetsService['findAll']>>),
      this.goalsService
        .findAll(userId)
        .catch(() => [] as Awaited<ReturnType<GoalsService['findAll']>>),
    ]);

    const budget: PromptBudgetContext | null = budgets[0]
      ? {
          name: budgets[0].name,
          totalAllocated: budgets[0].totalAllocated,
          totalSpent: budgets[0].totalSpent,
          remaining: budgets[0].remaining,
          topCategories: [...budgets[0].categories]
            .sort((a, b) => b.spent - a.spent)
            .slice(0, 4)
            .map((c) => ({
              name: c.name,
              allocated: c.allocated,
              spent: c.spent,
              overCapBy: c.spent > c.allocated ? c.spent - c.allocated : null,
            })),
        }
      : null;

    const activeGoals: PromptGoalContext[] = goals
      .filter((g) => g.status === GoalStatus.ACTIVE)
      .map((g) => ({
        name: g.name,
        targetAmount: Number(g.targetAmount),
        currentAmount: Number(g.currentAmount),
        progressPct: g.progressPct,
      }));

    return { budget, goals: activeGoals };
  }

  /** Exposed for verification/reporting: builds the exact system prompt for a user with live numbers. */
  async debugBuildSystemPrompt(userId: string): Promise<string> {
    const ctx = await this.buildPromptContext(userId);
    return buildSystemPrompt(ctx);
  }
}
