import Anthropic from '@anthropic-ai/sdk';
import { AiChatService } from './ai-chat.service';
import { ChatStreamEvent } from './stream-events';
import { PendingActionStatus } from './entities/pending-action.entity';

type AnyRecord = Record<string, unknown>;

function mockRepo() {
  let seq = 0;
  return {
    create: jest.fn((x: AnyRecord) => ({ ...x })),
    save: jest.fn((x: AnyRecord) =>
      Promise.resolve({
        id: x.id ?? `row-${++seq}`,
        createdAt: x.createdAt ?? new Date(),
        ...x,
      }),
    ),
    find: jest.fn(() => Promise.resolve([])),
    findOne: jest.fn(() => Promise.resolve(null)),
    remove: jest.fn(() => Promise.resolve()),
  };
}

/** Scripted stand-in for client.messages.stream(...). */
function scriptedClient(responses: AnyRecord[]) {
  let call = 0;
  const streamCalls: AnyRecord[] = [];
  const client = {
    messages: {
      stream: jest.fn((params: AnyRecord) => {
        // Snapshot: the loop mutates the same messages array between calls.
        streamCalls.push({
          ...params,
          messages: [...(params.messages as unknown[])],
        });
        const response = responses[Math.min(call++, responses.length - 1)];
        const handlers: Record<string, (arg: string) => void> = {};
        return {
          on: (event: string, cb: (arg: string) => void) => {
            handlers[event] = cb;
          },
          finalMessage: () => {
            const texts = (response.content as AnyRecord[]).filter(
              (b) => b.type === 'text',
            );
            for (const t of texts) handlers['text']?.(t.text as string);
            return Promise.resolve(response);
          },
        };
      }),
    },
  };
  return { client: client as unknown as Anthropic, streamCalls };
}

function makeService(client: Anthropic | null) {
  const config = { get: jest.fn(() => undefined) };
  const budgets = { findAll: jest.fn().mockResolvedValue([]) };
  const goals = {
    findAll: jest.fn().mockResolvedValue([
      {
        id: 'g1',
        name: 'Trip',
        targetAmount: 100000,
        currentAmount: 25000,
        progressPct: 25,
        remaining: 75000,
        targetDate: new Date('2026-12-01'),
        projectedCompletionDate: null,
        status: 'active',
      },
    ]),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const tx = {};
  const categories = { findAll: jest.fn().mockResolvedValue([]) };
  const accounts = { findAll: jest.fn().mockResolvedValue([]) };
  const investments = {};
  const reports = {};
  const events = { findAll: jest.fn().mockResolvedValue([]) };
  const creditCard = { getSummary: jest.fn() };
  const threadRepo = mockRepo();
  const messageRepo = mockRepo();
  const actionRepo = mockRepo();

  const service = new AiChatService(
    config as never,
    budgets as never,
    goals as never,
    tx as never,
    categories as never,
    accounts as never,
    investments as never,
    reports as never,
    events as never,
    creditCard as never,
    client,
    threadRepo as never,
    messageRepo as never,
    actionRepo as never,
  );

  return {
    service,
    threadRepo,
    messageRepo,
    actionRepo,
    goals,
    accounts,
    creditCard,
    budgets,
  };
}

function collect() {
  const events: ChatStreamEvent[] = [];
  return { events, emit: (e: ChatStreamEvent) => void events.push(e) };
}

describe('AiChatService agent loop', () => {
  it('runs tool_use → tool_result → end_turn and streams the right events', async () => {
    const { client, streamCalls } = scriptedClient([
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'tu1', name: 'list_goals', input: {} },
        ],
      },
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'You have 1 goal.' }],
      },
    ]);
    const { service, messageRepo, goals } = makeService(client);
    const { events, emit } = collect();

    const result = await service.runTurn('u1', null, 'show my goals', emit);

    expect(result.threadId).toBeDefined();
    expect(goals.findAll).toHaveBeenCalledWith('u1');

    const types = events.map((e) => e.type);
    expect(types[0]).toBe('message_start');
    expect(types).toContain('tool_start');
    expect(types).toContain('widget');
    expect(types).toContain('tool_end');
    expect(types).toContain('text_delta');
    expect(types[types.length - 1]).toBe('message_end');

    // user + assistant(tool_use) + tool + assistant(update w/ widgets) + assistant(final)
    const savedRoles = messageRepo.save.mock.calls.map((c) => c[0].role);
    expect(savedRoles).toContain('user');
    expect(savedRoles).toContain('assistant');
    expect(savedRoles).toContain('tool');

    // Second model call must carry all tool_results in ONE user message.
    const secondCallMessages = streamCalls[1].messages as {
      role: string;
      content: unknown[];
    }[];
    const lastMsg = secondCallMessages[secondCallMessages.length - 1];
    expect(lastMsg.role).toBe('user');
    expect(
      (lastMsg.content as AnyRecord[]).every((b) => b.type === 'tool_result'),
    ).toBe(true);
  });

  it('pauses risky tools behind a confirmation instead of executing', async () => {
    const { client } = scriptedClient([
      {
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'tu1',
            name: 'delete_goal',
            input: { id: 'g1' },
          },
        ],
      },
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Confirm on the card to delete.' }],
      },
    ]);
    const { service, actionRepo, goals } = makeService(client);
    const { events, emit } = collect();

    await service.runTurn('u1', null, 'delete my trip goal', emit);

    // DB untouched; a PendingAction row exists instead.
    expect(goals.remove).not.toHaveBeenCalled();
    expect(actionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: 'delete_goal', userId: 'u1' }),
    );

    const confirmation = events.find((e) => e.type === 'confirmation_required');
    expect(confirmation).toBeDefined();
    if (confirmation?.type === 'confirmation_required') {
      expect(confirmation.widget.status).toBe('pending');
      expect(confirmation.widget.actionId).toBeDefined();
    }
  });

  it('replies gracefully when no API key is configured', async () => {
    const { service } = makeService(null);
    const { events, emit } = collect();

    await service.runTurn('u1', null, 'hello', emit);

    const types = events.map((e) => e.type);
    expect(types).toEqual(['message_start', 'text_delta', 'message_end']);
  });

  it('includes the card-dues line in the dynamic prompt when a credit account has outstanding due', async () => {
    const { client, streamCalls } = scriptedClient([
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] },
    ]);
    const { service, accounts, creditCard } = makeService(client);
    accounts.findAll.mockResolvedValue([
      { id: 'acc1', type: 'credit', name: 'ICICI Card' },
    ]);
    creditCard.getSummary.mockResolvedValue({
      name: 'ICICI Card',
      outstanding: 12000,
      dueDate: '2026-07-15',
      daysUntilDue: 7,
    });
    const { emit } = collect();

    await service.runTurn('u1', null, 'how much do I owe?', emit);

    expect(creditCard.getSummary).toHaveBeenCalledWith('acc1', 'u1');
    const systemText = (
      streamCalls[0].system as { text: string }[]
    )[1].text;
    expect(systemText).toContain(
      'Card dues: ₹12,000 across 1 card; soonest ICICI Card due in 7 days (₹12,000).',
    );
  });

  it('omits the card-dues line when no credit account has an outstanding balance', async () => {
    const { client, streamCalls } = scriptedClient([
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] },
    ]);
    const { service, accounts, creditCard } = makeService(client);
    accounts.findAll.mockResolvedValue([
      { id: 'acc1', type: 'credit', name: 'ICICI Card' },
    ]);
    creditCard.getSummary.mockResolvedValue({
      name: 'ICICI Card',
      outstanding: 0,
      dueDate: '2026-07-15',
      daysUntilDue: 7,
    });
    const { emit } = collect();

    await service.runTurn('u1', null, 'how much do I owe?', emit);

    const systemText = (
      streamCalls[0].system as { text: string }[]
    )[1].text;
    expect(systemText).toContain('No card dues.');
  });

  it('stops before the next model call once the client disconnects mid-turn, leaving already-committed tool work intact', async () => {
    // Two-iteration script: a tool call, then a narration turn that would run
    // only if the loop kept going after the client dropped.
    const { client, streamCalls } = scriptedClient([
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'tu1', name: 'list_goals', input: {} },
        ],
      },
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'You have 1 goal.' }],
      },
    ]);
    const { service, messageRepo } = makeService(client);
    const { emit } = collect();
    const controller = new AbortController();

    // Simulate an SSE drop landing right after the tool's result is
    // persisted (the DB write already committed) but before the next
    // model round-trip would fire.
    const baseSave = messageRepo.save.getMockImplementation()!;
    messageRepo.save.mockImplementation((x: AnyRecord) => {
      if (x.role === 'tool') controller.abort();
      return baseSave(x);
    });

    await service.runTurn('u1', null, 'show my goals', emit, {
      signal: controller.signal,
    });

    // The committed tool result was persisted...
    expect(
      messageRepo.save.mock.calls.some((c) => c[0].role === 'tool'),
    ).toBe(true);
    // ...but the loop never made the second model call against a dead socket.
    expect(streamCalls).toHaveLength(1);
  });
});

describe('AiChatService turn idempotency (retry)', () => {
  it('runs a normal turn for a first-time clientMsgId and persists it on the user row', async () => {
    const { client, streamCalls } = scriptedClient([
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done.' }] },
    ]);
    const { service, messageRepo } = makeService(client);
    const { emit } = collect();

    await service.runTurn('u1', null, 'hi', emit, { clientMsgId: 'c-new' });

    // Idempotency lookup found nothing → fresh turn.
    expect(streamCalls).toHaveLength(1);
    const userCreate = messageRepo.create.mock.calls.find(
      (c) => c[0].role === 'user',
    );
    expect(userCreate).toBeDefined();
    expect(userCreate?.[0].clientMsgId).toBe('c-new');
  });

  it('replays persisted blocks on a retry — no new user row, no model or tool call', async () => {
    const userRow = {
      id: 'urow1',
      threadId: 't1',
      role: 'user',
      clientMsgId: 'c-dup',
      blocks: [{ type: 'text', text: 'log a ₹1,000 pizza' }],
      createdAt: new Date(1),
    };
    const assistantRow = {
      id: 'arow1',
      threadId: 't1',
      role: 'assistant',
      blocks: [
        { type: 'text', text: 'Logged one ₹1,000 pizza. Food is now ₹1,450.' },
      ],
      createdAt: new Date(2),
    };

    const { client, streamCalls } = scriptedClient([
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'unused' }] },
    ]);
    const { service, threadRepo, messageRepo, goals } = makeService(client);
    threadRepo.findOne.mockResolvedValue({ id: 't1', userId: 'u1' } as never);
    messageRepo.findOne.mockResolvedValue(userRow as never);
    messageRepo.find.mockResolvedValue([userRow, assistantRow] as never);

    const { events, emit } = collect();
    await service.runTurn('u1', 't1', 'log a ₹1,000 pizza', emit, {
      clientMsgId: 'c-dup',
    });

    // No second turn ran: no model call, no tool executed.
    expect(streamCalls).toHaveLength(0);
    expect(goals.remove).not.toHaveBeenCalled();
    // No duplicate user row was inserted.
    expect(
      messageRepo.save.mock.calls.filter((c) => c[0].role === 'user'),
    ).toHaveLength(0);
    // Persisted assistant text was re-emitted.
    const types = events.map((e) => e.type);
    expect(types).toEqual(['message_start', 'text_delta', 'message_end']);
    const delta = events.find((e) => e.type === 'text_delta');
    expect(delta?.type === 'text_delta' && delta.delta).toBe(
      'Logged one ₹1,000 pizza. Food is now ₹1,450.',
    );
  });

  it('resumes narration over a committed tool_result when the prior turn was interrupted', async () => {
    const userRow = {
      id: 'urow2',
      threadId: 't1',
      role: 'user',
      clientMsgId: 'c-inc',
      blocks: [{ type: 'text', text: 'log a ₹1,000 pizza' }],
      createdAt: new Date(1),
    };
    const assistantToolUse = {
      id: 'arow2',
      threadId: 't1',
      role: 'assistant',
      blocks: [{ type: 'tool_use', id: 'tu1', name: 'list_goals', input: {} }],
      createdAt: new Date(2),
    };
    const toolRow = {
      id: 'trow1',
      threadId: 't1',
      role: 'tool',
      blocks: [{ type: 'tool_result', tool_use_id: 'tu1', content: '{}' }],
      createdAt: new Date(3),
    };

    // One response: the model narrates from the already-committed tool_result
    // and does NOT re-issue the tool.
    const { client, streamCalls } = scriptedClient([
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Already logged — Food is ₹1,450.' }],
      },
    ]);
    const { service, threadRepo, messageRepo } = makeService(client);
    threadRepo.findOne.mockResolvedValue({ id: 't1', userId: 'u1' } as never);
    messageRepo.findOne.mockResolvedValue(userRow as never);
    messageRepo.find.mockResolvedValue([
      userRow,
      assistantToolUse,
      toolRow,
    ] as never);

    const { events, emit } = collect();
    await service.runTurn('u1', 't1', 'log a ₹1,000 pizza', emit, {
      clientMsgId: 'c-inc',
    });

    // Exactly one model call (the resumed narration), no duplicate user row.
    expect(streamCalls).toHaveLength(1);
    expect(
      messageRepo.save.mock.calls.filter((c) => c[0].role === 'user'),
    ).toHaveLength(0);
    // History fed to the model already carried the committed tool_result.
    const sentMessages = streamCalls[0].messages as {
      role: string;
      content: { type: string }[];
    }[];
    const hasToolResult = sentMessages.some((m) =>
      m.content.some((b) => b.type === 'tool_result'),
    );
    expect(hasToolResult).toBe(true);
    const types = events.map((e) => e.type);
    expect(types).toContain('text_delta');
    expect(types[types.length - 1]).toBe('message_end');
  });

  it('rebuilds the prompt from live DB state on resume, so quoted totals reflect the true committed spend — not a phantom second log', async () => {
    const userRow = {
      id: 'urow3',
      threadId: 't1',
      role: 'user',
      clientMsgId: 'c-acc',
      blocks: [{ type: 'text', text: 'log a ₹1,000 pizza' }],
      createdAt: new Date(1),
    };
    const assistantToolUse = {
      id: 'arow3',
      threadId: 't1',
      role: 'assistant',
      blocks: [
        {
          type: 'tool_use',
          id: 'tu1',
          name: 'create_transaction',
          input: { amount: 1000 },
        },
      ],
      createdAt: new Date(2),
    };
    const toolRow = {
      id: 'trow2',
      threadId: 't1',
      role: 'tool',
      blocks: [
        { type: 'tool_result', tool_use_id: 'tu1', content: '{"id":"tx1"}' },
      ],
      createdAt: new Date(3),
    };

    const { client, streamCalls } = scriptedClient([
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Logged. Food is ₹1,450.' }],
      },
    ]);
    const { service, threadRepo, messageRepo, budgets } = makeService(client);
    threadRepo.findOne.mockResolvedValue({ id: 't1', userId: 'u1' } as never);
    messageRepo.findOne.mockResolvedValue(userRow as never);
    messageRepo.find.mockResolvedValue([
      userRow,
      assistantToolUse,
      toolRow,
    ] as never);
    // Live DB state AFTER the pizza tool already committed exactly once —
    // this is the true total the retried turn must quote.
    budgets.findAll.mockResolvedValue([
      {
        name: 'Monthly',
        totalAllocated: 20000,
        totalSpent: 1450,
        remaining: 18550,
        categories: [{ name: 'Food', spent: 1450, allocated: 5000 }],
      },
    ] as never);

    const { emit } = collect();
    await service.runTurn('u1', 't1', 'log a ₹1,000 pizza', emit, {
      clientMsgId: 'c-acc',
    });

    // Exactly one model call (resumed narration) — no re-execution of the
    // already-committed tool.
    expect(streamCalls).toHaveLength(1);
    expect(
      messageRepo.save.mock.calls.some((c) => c[0].role === 'tool'),
    ).toBe(false);

    // The dynamic system prompt fed to the model must reflect the TRUE
    // committed total (₹1,450 spent), not a stale pre-commit figure and not
    // a doubled ₹2,450 phantom second pizza.
    const systemText = (streamCalls[0].system as { text: string }[])[1].text;
    expect(systemText).toContain('spent ₹1,450');
    expect(systemText).not.toContain('₹2,450');
  });
});

describe('AiChatService pending actions', () => {
  it('confirmAction executes the tool and persists an event row', async () => {
    const { service, actionRepo, messageRepo, goals } = makeService(
      scriptedClient([]).client,
    );
    actionRepo.findOne.mockResolvedValue({
      id: 'a1',
      userId: 'u1',
      threadId: 't1',
      toolName: 'delete_goal',
      input: { id: 'g1' },
      summary: 'Permanently delete goal g1…',
      status: PendingActionStatus.PENDING,
      createdAt: new Date(),
    } as never);

    const result = await service.confirmAction('u1', 'a1');

    expect(goals.remove).toHaveBeenCalledWith('g1', 'u1');
    expect(result.status).toBe(PendingActionStatus.EXECUTED);
    const eventRow = messageRepo.create.mock.calls.find(
      (c) => c[0].role === 'event',
    );
    expect(eventRow).toBeDefined();
  });

  it('cancelAction leaves data untouched and records the outcome', async () => {
    const { service, actionRepo, goals } = makeService(
      scriptedClient([]).client,
    );
    actionRepo.findOne.mockResolvedValue({
      id: 'a1',
      userId: 'u1',
      threadId: 't1',
      toolName: 'delete_goal',
      input: { id: 'g1' },
      summary: 'Permanently delete goal g1…',
      status: PendingActionStatus.PENDING,
      createdAt: new Date(),
    } as never);

    const result = await service.cancelAction('u1', 'a1');

    expect(goals.remove).not.toHaveBeenCalled();
    expect(result.status).toBe(PendingActionStatus.CANCELLED);
  });

  it('rejects expired actions', async () => {
    const { service, actionRepo } = makeService(scriptedClient([]).client);
    actionRepo.findOne.mockResolvedValue({
      id: 'a1',
      userId: 'u1',
      threadId: 't1',
      toolName: 'delete_goal',
      input: { id: 'g1' },
      summary: 's',
      status: PendingActionStatus.PENDING,
      createdAt: new Date(Date.now() - 16 * 60 * 1000),
    } as never);

    await expect(service.confirmAction('u1', 'a1')).rejects.toThrow(/expired/i);
  });

  it('rejects double-confirmation', async () => {
    const { service, actionRepo } = makeService(scriptedClient([]).client);
    actionRepo.findOne.mockResolvedValue({
      id: 'a1',
      userId: 'u1',
      threadId: 't1',
      toolName: 'delete_goal',
      input: { id: 'g1' },
      summary: 's',
      status: PendingActionStatus.EXECUTED,
      createdAt: new Date(),
    } as never);

    await expect(service.confirmAction('u1', 'a1')).rejects.toThrow(
      /already executed/i,
    );
  });
});
