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

  return { service, threadRepo, messageRepo, actionRepo, goals, accounts, creditCard };
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
