import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
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
import { EventsService } from '../events/events.service';
import { CreditCardService } from '../credit-card/credit-card.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { GoalStatus, AccountType } from '../common/enums';
import {
  buildDynamicPrompt,
  ChatPromptContext,
  PromptBudgetContext,
  PromptCardContext,
  PromptEventContext,
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

export interface RunTurnOptions {
  /** Client-generated turn id used to dedupe retries (see runTurn). */
  clientMsgId?: string;
  /** Aborts the in-flight turn when the client disconnects. */
  signal?: AbortSignal;
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
    private readonly eventsService: EventsService,
    private readonly creditCardService: CreditCardService,
    @Inject(ANTHROPIC_CLIENT) private readonly client: Anthropic | null,
    @InjectRepository(ChatThread)
    private readonly threadRepo: Repository<ChatThread>,
    @InjectRepository(ChatMessage)
    private readonly messageRepo: Repository<ChatMessage>,
    @InjectRepository(PendingAction)
    private readonly actionRepo: Repository<PendingAction>,
    @Optional() private readonly subscriptionsService?: SubscriptionsService,
  ) {}

  private get model(): string {
    return this.configService.get<string>('AI_MODEL') ?? 'claude-sonnet-5';
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
        events: this.eventsService,
        creditCard: this.creditCardService,
        subscriptions: this.subscriptionsService as SubscriptionsService,
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
    options: RunTurnOptions = {},
  ): Promise<TurnResult> {
    const { clientMsgId, signal } = options;
    const thread = await this.findOrCreateThread(userId, threadId, message);

    // ── Turn-level idempotency (Retry) ──────────────────────────────────────
    // If this exact turn already ran (same clientMsgId in this thread), do NOT
    // insert a duplicate user row and do NOT re-run tools. Replay the committed
    // reply, or resume narration over the already-committed tool_result.
    if (clientMsgId) {
      const existing = await this.messageRepo.findOne({
        where: { threadId: thread.id, role: 'user', clientMsgId },
      });
      if (existing) {
        return this.handleRetry(userId, thread.id, existing, emit, signal);
      }
    }

    const userRow = await this.messageRepo.save(
      this.messageRepo.create({
        threadId: thread.id,
        role: 'user',
        blocks: [{ type: 'text', text: message }],
        clientMsgId: clientMsgId ?? null,
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
      await this.agentLoop(userId, thread.id, emit, signal);
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

  /**
   * Handles a retry of an already-seen turn (matched by clientMsgId). No new
   * user row, no tool re-execution.
   *
   * Heuristic (completed vs incomplete) is read from the persisted rows that
   * follow the user row:
   *  - **Replay** when the turn's last row is a terminal assistant message
   *    (has visible text and no unanswered tool_use). Re-emit its persisted
   *    text/widget/confirmation blocks. Numbers come from committed state, so
   *    there is no second log and no wrong total.
   *  - **Resume** otherwise (last row is a tool_result, an assistant tool_use
   *    awaiting a result, or nothing yet). The history already contains any
   *    committed tool_result, so the model narrates from true state without
   *    re-calling the committed tool.
   */
  private async handleRetry(
    userId: string,
    threadId: string,
    userRow: ChatMessage,
    emit: ChatStreamEmitter,
    signal?: AbortSignal,
  ): Promise<TurnResult> {
    const rows = await this.messageRepo.find({
      where: { threadId },
      order: { createdAt: 'ASC' },
    });
    const userIdx = rows.findIndex((r) => r.id === userRow.id);
    const turnRows = userIdx === -1 ? [] : rows.slice(userIdx + 1);
    const last = turnRows[turnRows.length - 1];
    const completed =
      !!last && last.role === 'assistant' && this.isTerminalAssistant(last);

    emit({ type: 'message_start', threadId, messageId: userRow.id });

    if (completed) {
      for (const row of turnRows) {
        if (row.role !== 'assistant') continue;
        for (const block of row.blocks as {
          type?: string;
          text?: string;
          widget?: Widget;
        }[]) {
          if (block?.type === 'text' && block.text) {
            emit({ type: 'text_delta', delta: block.text });
          } else if (block?.type === 'widget' && block.widget) {
            emit({ type: 'widget', widget: block.widget });
          } else if (block?.type === 'confirmation' && block.widget) {
            emit({
              type: 'confirmation_required',
              widget: block.widget as ConfirmationWidget,
            });
          }
        }
      }
      emit({ type: 'message_end', messageId: userRow.id, stopReason: 'end_turn' });
      return { threadId, messageId: userRow.id };
    }

    // Incomplete turn (or no client key path but existing row) → resume.
    try {
      await this.agentLoop(userId, threadId, emit, signal);
      emit({ type: 'message_end', messageId: userRow.id, stopReason: 'end_turn' });
    } catch (err) {
      this.logger.error(
        `Agent turn resume failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      emit({
        type: 'error',
        message: 'Something went wrong talking to the assistant.',
        retryable: true,
      });
    }
    return { threadId, messageId: userRow.id };
  }

  /** A terminal assistant row has visible text and no unanswered tool_use. */
  private isTerminalAssistant(row: ChatMessage): boolean {
    const blocks = row.blocks as { type?: string; text?: string }[];
    const hasToolUse = blocks.some((b) => b?.type === 'tool_use');
    const hasText = blocks.some(
      (b) => b?.type === 'text' && (b.text ?? '').trim().length > 0,
    );
    return hasText && !hasToolUse;
  }

  private async agentLoop(
    userId: string,
    threadId: string,
    emit: ChatStreamEmitter,
    signal?: AbortSignal,
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
      // Client disconnected — stop before the next model call instead of
      // running the loop to completion against a dead socket.
      if (signal?.aborted) return;

      const stream = client.messages.stream(
        {
          model: this.model,
          max_tokens: MAX_TOKENS,
          thinking: { type: 'adaptive' },
          system,
          tools,
          messages,
        },
        { signal },
      );

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
    clientMsgId?: string,
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
    const result = await this.runTurn(userId, threadId, message, push, {
      clientMsgId,
    });
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
    const [budgets, goals, categories, eventsRaw, accountsRaw] =
      await Promise.all([
        this.budgetsService
          .findAll(userId)
          .catch(() => [] as Awaited<ReturnType<BudgetsService['findAll']>>),
        this.goalsService
          .findAll(userId)
          .catch(() => [] as Awaited<ReturnType<GoalsService['findAll']>>),
        this.categoriesService
          .findAll(userId)
          .catch(
            () => [] as Awaited<ReturnType<CategoriesService['findAll']>>,
          ),
        this.eventsService
          .findAll(userId)
          .catch(() => [] as Awaited<ReturnType<EventsService['findAll']>>),
        this.accountsService
          .findAll(userId)
          .catch(() => [] as Awaited<ReturnType<AccountsService['findAll']>>),
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

    const events: PromptEventContext[] = eventsRaw.map((e) => ({
      name: e.name, budget: e.budget, paid: e.paid,
      projected: e.projected, over: e.over,
    }));

    const creditAccounts = accountsRaw.filter(
      (a) => a.type === AccountType.CREDIT,
    );
    const cardSummaries = await Promise.all(
      creditAccounts.map((a) =>
        this.creditCardService.getSummary(a.id, userId).catch(() => null),
      ),
    );
    const cards: PromptCardContext[] = cardSummaries
      .filter(
        (s): s is NonNullable<typeof s> => s !== null && s.outstanding > 0,
      )
      .map((s) => ({
        name: s.name,
        outstanding: s.outstanding,
        dueDate: s.dueDate,
        daysUntilDue: s.daysUntilDue,
      }));

    return {
      budget,
      goals: activeGoals,
      events,
      cards,
      categoryNames: categories.map((c) => c.name),
    };
  }
}
