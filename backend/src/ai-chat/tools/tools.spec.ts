import 'reflect-metadata';
import { TOOL_REGISTRY, TOOLS_BY_NAME } from './index';
import { resolveRisk, ToolCtx } from './types';

describe('tool registry', () => {
  it('has unique, name-sorted tool names (prompt-cache determinism)', () => {
    const names = TOOL_REGISTRY.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('every schema satisfies strict mode (additionalProperties:false + required)', () => {
    for (const tool of TOOL_REGISTRY) {
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(Array.isArray(tool.inputSchema.required)).toBe(true);
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('every update_*/delete_* tool requires confirmation', () => {
    for (const tool of TOOL_REGISTRY) {
      if (/^(update|delete)_/.test(tool.name)) {
        expect(resolveRisk(tool, {})).toBe('confirm');
      }
    }
  });

  it('every confirm-capable tool has a confirmSummary', () => {
    for (const tool of TOOL_REGISTRY) {
      const canConfirm =
        typeof tool.risk === 'function' || tool.risk === 'confirm';
      if (canConfirm) {
        expect(tool.confirmSummary).toBeDefined();
        const summary = tool.confirmSummary!({ id: 'abc', amount: 99999 });
        expect(summary.title.length).toBeGreaterThan(0);
        expect(summary.summary.length).toBeGreaterThan(0);
      }
    }
  });

  it('reads are safe', () => {
    for (const tool of TOOL_REGISTRY) {
      if (/^(list|get)_/.test(tool.name)) {
        expect(resolveRisk(tool, {})).toBe('safe');
      }
    }
  });
});

describe('create_transaction', () => {
  const tool = TOOLS_BY_NAME.get('create_transaction')!;

  it('is safe below the amount threshold and confirm above it', () => {
    expect(resolveRisk(tool, { amount: 500 })).toBe('safe');
    expect(resolveRisk(tool, { amount: 60_000 })).toBe('confirm');
  });

  it('resolves the category by name (case-insensitive) and creates via the service', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'tx1',
      date: new Date('2026-07-05'),
      description: 'Pizza Hut',
      amount: 450,
      type: 'expense',
      categoryId: 'cat-food',
      accountId: null,
      notes: null,
    });
    const findAll = jest.fn().mockResolvedValue([
      { id: 'cat-other', name: 'Other' },
      { id: 'cat-food', name: 'Food' },
    ]);
    const ctx = {
      userId: 'u1',
      svc: {
        tx: { create },
        categories: { findAll },
      },
    } as unknown as ToolCtx;

    const result = await tool.handler(ctx, {
      description: 'Pizza Hut',
      amount: 450,
      type: 'expense',
      category: 'food',
    });

    expect(create).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ categoryId: 'cat-food', amount: 450 }),
    );
    const widget = result.widgets?.[0];
    expect(widget?.kind).toBe('transaction');
    if (widget?.kind === 'transaction') {
      expect(widget.tx.description).toBe('Pizza Hut');
      expect(widget.tx.categoryName).toBe('Food');
    }
  });

  it('errors clearly when the user has no categories', async () => {
    const ctx = {
      userId: 'u1',
      svc: {
        tx: { create: jest.fn() },
        categories: { findAll: jest.fn().mockResolvedValue([]) },
      },
    } as unknown as ToolCtx;

    await expect(
      tool.handler(ctx, { description: 'x', amount: 1, type: 'expense' }),
    ).rejects.toThrow(/no categories/i);
  });
});
