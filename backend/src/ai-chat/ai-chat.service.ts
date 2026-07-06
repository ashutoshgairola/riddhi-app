import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import { BudgetsService } from '../budgets/budgets.service';
import { GoalsService } from '../goals/goals.service';
import { TransactionsService } from '../transactions/transactions.service';
import { CategoriesService } from '../categories/categories.service';
import { AccountsService } from '../accounts/accounts.service';
import { InvestmentsService } from '../investments/investments.service';
import { ReportsService } from '../reports/reports.service';
import { GoalStatus } from '../common/enums';
import {
  buildDynamicPrompt,
  ChatPromptContext,
  PromptBudgetContext,
  PromptGoalContext,
  STATIC_SYSTEM_PROMPT,
} from './prompt';
import { ChatStreamEmitter, ChatStreamEvent } from './stream-events';
import { ConfirmationWidget, Widget } from './widgets';
import { ChatThread } from './entities/chat-thread.entity';
import { ChatMessage } from './entities/chat-message.entity';
import {
  PendingAction,
  PendingActionStatus,
  PENDING_ACTION_TTL_MS,
} from './entities/pending-action.entity';
import { rebuildHistory } from './history';
import { TOOL_REGISTRY, TOOLS_BY_NAME, resolveRisk, ToolCtx } from './tools';

export const ANTHROPIC_CLIENT = 'ANTHROPIC_CLIENT';

const MAX_TOKENS = 4096;
const MAX_AGENT_ITERATIONS = 10;
const GRACEFUL_REPLY =
  "I'm having trouble reaching my brain right now, but I've noted what you said. Try again in a moment, or add the entry manually for now.";

// ── Chat surface types ───────────────────────────────────────────────────────

export interface TurnResult {
  threadId: string;
  messageId: string;
}

export interface BufferedBlock {
  type: 'text' | 'widget' | 'confirmation';
  text?: string;
  widget?: Widget;
}

export interface ActionResolution {
  status: PendingActionStatus;
  widgets: Widget[];
}

@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly budgetsService: BudgetsService,
    private readonly goalsService: GoalsService,
    private readonly transactionsService: TransactionsService,
    private readonly categoriesService: CategoriesService,
    private readonly accountsService: AccountsService,
    private readonly investmentsService: InvestmentsService,
    private readonly reportsService: ReportsService,
    @Inject(ANTHROPIC_CLIENT) private readonly client: Anthropic | null,
    @InjectRepository(ChatThread)
    private readonly threadRepo: Repository<ChatThread>,
    @InjectRepository(ChatMessage)
    private readonly messageRepo: Repository<ChatMessage>,
    @InjectRepository(PendingAction)
    private readonly actionRepo: Repository<PendingAction>,
  ) {}

  private get model(): string {
    return this.configService.get<string>('AI_MODEL') ?? 'claude-opus-4-8';
  }

  private toolCtx(userId: string): ToolCtx {
    return {
      userId,
      svc: {
        tx: this.transactionsService,
        budgets: this.budgetsService,
        goals: this.goalsService,
        accounts: this.accountsService,
        categories: this.categoriesService,
        investments: this.investmentsService,
        reports: this.reportsService,
      },
    };
  }

  // ── Agent turn ─────────────────────────────────────────────────────────────

  /**
   * Runs one user turn through the tool-use agent loop, emitting stream
   * events as they happen. All state (thread, messages, pending actions) is
   * persisted as the turn progresses, so a dropped connection loses nothing.
   */
  async runTurn(
    userId: string,
    threadId: string | null,
    message: string,
    emit: ChatStreamEmitter,
  ): Promise<TurnResult> {
    const thread = await this.findOrCreateThread(userId, threadId, message);

    const userRow = await this.messageRepo.save(
      this.messageRepo.create({
        threadId: thread.id,
        role: 'user',
        blocks: [{ type: 'text', text: message }],
      }),
    );
    thread.lastMessageAt = new Date();
    await this.threadRepo.save(thread);

    emit({ type: 'message_start', threadId: thread.id, messageId: userRow.id });

    if (!this.client) {
      emit({ type: 'text_delta', delta: GRACEFUL_REPLY });
      await this.messageRepo.save(
        this.messageRepo.create({
          threadId: thread.id,
          role: 'assistant',
          blocks: [{ type: 'text', text: GRACEFUL_REPLY }],
        }),
      );
      emit({ type: 'message_end', messageId: userRow.id, stopReason: 'error' });
      return { threadId: thread.id, messageId: userRow.id };
    }

    try {
      await this.agentLoop(userId, thread.id, emit);
      emit({
        type: 'message_end',
        messageId: userRow.id,
        stopReason: 'end_turn',
      });
    } catch (err) {
      this.logger.error(
        `Agent turn failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      emit({
        type: 'error',
        message: 'Something went wrong talking to the assistant.',
        retryable: true,
      });
    }

    return { threadId: thread.id, messageId: userRow.id };
  }

  private async agentLoop(
    userId: string,
    threadId: string,
    emit: ChatStreamEmitter,
  ): Promise<void> {
    const client = this.client!;
    const promptContext = await this.buildPromptContext(userId);
    const rows = await this.messageRepo.find({
      where: { threadId },
      order: { createdAt: 'ASC' },
    });
    const messages = rebuildHistory(rows);

    // Strict mode is budgeted by the API (max 20 strict tools AND max 24
    // optional params across them). Spend it on the delete tools — one
    // required id, zero optionals, and the worst place for a malformed
    // input. Everything else relies on handler-side coercion + service
    // validation.
    const tools = TOOL_REGISTRY.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
      strict: /^delete_/.test(t.name),
    })) as unknown as Anthropic.Tool[];

    const system = [
      {
        type: 'text' as const,
        text: STATIC_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' as const },
      },
      { type: 'text' as const, text: buildDynamicPrompt(promptContext) },
    ];

    for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
      const stream = client.messages.stream({
        model: this.model,
        max_tokens: MAX_TOKENS,
        thinking: { type: 'adaptive' },
        system,
        tools,
        messages,
      });

      stream.on('text', (delta) => emit({ type: 'text_delta', delta }));

      const response = await stream.finalMessage();

      messages.push({
        role: 'assistant',
        content: response.content,
      });
      const assistantRow = await this.messageRepo.save(
        this.messageRepo.create({
          threadId,
          role: 'assistant',
          blocks: response.content as unknown[],
        }),
      );

      if (response.stop_reason === 'pause_turn') {
        continue;
      }

      if (response.stop_reason !== 'tool_use') {
        return;
      }

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      const renderBlocks: unknown[] = [];
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUses) {
        const result = await this.executeToolUse(
          userId,
          threadId,
          toolUse,
          emit,
          renderBlocks,
        );
        toolResults.push(result);
      }

      // All tool_results go back in ONE user message (parallel-tool-use rule).
      messages.push({ role: 'user', content: toolResults });
      await this.messageRepo.save(
        this.messageRepo.create({
          threadId,
          role: 'tool',
          blocks: toolResults as unknown[],
        }),
      );

      // Attach render-only blocks to the assistant row so thread hydration
      // replays widgets in place; rebuildHistory strips them for the model.
      if (renderBlocks.length > 0) {
        assistantRow.blocks = [...assistantRow.blocks, ...renderBlocks];
        await this.messageRepo.save(assistantRow);
      }
    }

    this.logger.warn(
      `Agent loop hit MAX_AGENT_ITERATIONS for thread ${threadId}`,
    );
  }

  private async executeToolUse(
    userId: string,
    threadId: string,
    toolUse: Anthropic.ToolUseBlock,
    emit: ChatStreamEmitter,
    renderBlocks: unknown[],
  ): Promise<Anthropic.ToolResultBlockParam> {
    const tool = TOOLS_BY_NAME.get(toolUse.name);
    const input = (toolUse.input ?? {}) as Record<string, unknown>;

    if (!tool) {
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: `Unknown tool "${toolUse.name}".`,
        is_error: true,
      };
    }

    emit({
      type: 'tool_start',
      toolUseId: toolUse.id,
      name: tool.name,
      label: tool.label,
    });

    if (resolveRisk(tool, input) === 'confirm') {
      const summary = tool.confirmSummary?.(input) ?? {
        title: `Confirm ${tool.name}?`,
        summary: `Run ${tool.name} with the shown values.`,
        fields: [],
      };
      const action = await this.actionRepo.save(
        this.actionRepo.create({
          userId,
          threadId,
          toolName: tool.name,
          input,
          summary: summary.summary,
        }),
      );
      const widget: ConfirmationWidget = {
        kind: 'confirmation',
        actionId: action.id,
        title: summary.title,
        summary: summary.summary,
        fields: summary.fields,
        status: 'pending',
      };
      renderBlocks.push({ type: 'confirmation', widget });
      emit({ type: 'confirmation_required', widget });
      emit({
        type: 'tool_end',
        toolUseId: toolUse.id,
        name: tool.name,
        ok: true,
      });
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify({
          status: 'pending_confirmation',
          actionId: action.id,
          note: 'Do not retry this tool; tell the user to use the confirmation card.',
        }),
      };
    }

    try {
      const result = await tool.handler(this.toolCtx(userId), input);
      for (const widget of result.widgets ?? []) {
        renderBlocks.push({ type: 'widget', widget });
        emit({ type: 'widget', widget });
      }
      emit({
        type: 'tool_end',
        toolUseId: toolUse.id,
        name: tool.name,
        ok: true,
      });
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: JSON.stringify(result.data ?? null),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Tool ${tool.name} failed: ${msg}`);
      emit({
        type: 'tool_end',
        toolUseId: toolUse.id,
        name: tool.name,
        ok: false,
      });
      return {
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: msg,
        is_error: true,
      };
    }
  }

  /** Non-streaming fallback: same turn, events buffered into blocks. */
  async runTurnBuffered(
    userId: string,
    threadId: string | null,
    message: string,
  ): Promise<{ threadId: string; messageId: string; blocks: BufferedBlock[] }> {
    const blocks: BufferedBlock[] = [];
    const push = (event: ChatStreamEvent): void => {
      switch (event.type) {
        case 'text_delta': {
          const last = blocks[blocks.length - 1];
          if (last?.type === 'text')
            last.text = (last.text ?? '') + event.delta;
          else blocks.push({ type: 'text', text: event.delta });
          break;
        }
        case 'widget':
          blocks.push({ type: 'widget', widget: event.widget });
          break;
        case 'confirmation_required':
          blocks.push({ type: 'confirmation', widget: event.widget });
          break;
      }
    };
    const result = await this.runTurn(userId, threadId, message, push);
    return { ...result, blocks };
  }

  // ── Threads ────────────────────────────────────────────────────────────────

  private async findOrCreateThread(
    userId: string,
    threadId: string | null,
    firstMessage: string,
  ): Promise<ChatThread> {
    if (threadId) {
      const thread = await this.threadRepo.findOne({
        where: { id: threadId, userId },
      });
      if (!thread) throw new NotFoundException('Thread not found');
      return thread;
    }
    return this.threadRepo.save(
      this.threadRepo.create({
        userId,
        title: firstMessage.slice(0, 60),
        lastMessageAt: new Date(),
      }),
    );
  }

  async listThreads(
    userId: string,
  ): Promise<Pick<ChatThread, 'id' | 'title' | 'lastMessageAt'>[]> {
    const threads = await this.threadRepo.find({
      where: { userId },
      order: { lastMessageAt: 'DESC' },
      take: 50,
    });
    return threads.map(({ id, title, lastMessageAt }) => ({
      id,
      title,
      lastMessageAt,
    }));
  }

  async getThread(
    userId: string,
    threadId: string,
  ): Promise<{
    id: string;
    title: string;
    messages: { id: string; role: string; blocks: unknown[] }[];
  }> {
    const thread = await this.threadRepo.findOne({
      where: { id: threadId, userId },
    });
    if (!thread) throw new NotFoundException('Thread not found');
    const rows = await this.messageRepo.find({
      where: { threadId },
      order: { createdAt: 'ASC' },
    });
    return {
      id: thread.id,
      title: thread.title,
      messages: rows
        .filter((r) => r.role === 'user' || r.role === 'assistant')
        .map((r) => ({ id: r.id, role: r.role, blocks: r.blocks })),
    };
  }

  async deleteThread(userId: string, threadId: string): Promise<void> {
    const thread = await this.threadRepo.findOne({
      where: { id: threadId, userId },
    });
    if (!thread) throw new NotFoundException('Thread not found');
    await this.threadRepo.remove(thread);
  }

  // ── Pending actions (confirm / cancel) ─────────────────────────────────────

  async confirmAction(
    userId: string,
    actionId: string,
  ): Promise<ActionResolution> {
    const action = await this.loadPendingAction(userId, actionId);

    const tool = TOOLS_BY_NAME.get(action.toolName);
    if (!tool) {
      throw new BadRequestException('Tool no longer exists');
    }

    const result = await tool.handler(this.toolCtx(userId), action.input);

    action.status = PendingActionStatus.EXECUTED;
    action.resultData = result.data ?? null;
    action.resolvedAt = new Date();
    await this.actionRepo.save(action);

    await this.persistEventRow(
      action.threadId,
      `The user confirmed: ${action.summary} Result: ${result.summary ?? 'done'}.`,
    );

    return { status: action.status, widgets: result.widgets ?? [] };
  }

  async cancelAction(
    userId: string,
    actionId: string,
  ): Promise<ActionResolution> {
    const action = await this.loadPendingAction(userId, actionId);

    action.status = PendingActionStatus.CANCELLED;
    action.resolvedAt = new Date();
    await this.actionRepo.save(action);

    await this.persistEventRow(
      action.threadId,
      `The user cancelled: ${action.summary} Nothing was changed.`,
    );

    return { status: action.status, widgets: [] };
  }

  private async loadPendingAction(
    userId: string,
    actionId: string,
  ): Promise<PendingAction> {
    const action = await this.actionRepo.findOne({
      where: { id: actionId, userId },
    });
    if (!action) throw new NotFoundException('Action not found');
    if (action.status !== PendingActionStatus.PENDING) {
      throw new BadRequestException(`Action already ${action.status}`);
    }
    if (Date.now() - action.createdAt.getTime() > PENDING_ACTION_TTL_MS) {
      action.status = PendingActionStatus.EXPIRED;
      action.resolvedAt = new Date();
      await this.actionRepo.save(action);
      throw new BadRequestException('Action expired — ask me again.');
    }
    return action;
  }

  private async persistEventRow(threadId: string, text: string): Promise<void> {
    await this.messageRepo.save(
      this.messageRepo.create({
        threadId,
        role: 'event',
        blocks: [{ type: 'event_note', text }],
      }),
    );
  }

  // ── Shared prompt context ──────────────────────────────────────────────────

  private async buildPromptContext(userId: string): Promise<ChatPromptContext> {
    const [budgets, goals, categories] = await Promise.all([
      this.budgetsService
        .findAll(userId)
        .catch(() => [] as Awaited<ReturnType<BudgetsService['findAll']>>),
      this.goalsService
        .findAll(userId)
        .catch(() => [] as Awaited<ReturnType<GoalsService['findAll']>>),
      this.categoriesService
        .findAll(userId)
        .catch(() => [] as Awaited<ReturnType<CategoriesService['findAll']>>),
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

    return {
      budget,
      goals: activeGoals,
      categoryNames: categories.map((c) => c.name),
    };
  }
}
