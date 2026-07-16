import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StatementParserService, STATEMENTS_ANTHROPIC_CLIENT } from './statement-parser.service';

function clientReturning(text: string) {
  return { messages: { create: jest.fn().mockResolvedValue({ content: [{ type: 'text', text }] }) } };
}

async function build(client: any) {
  const mod = await Test.createTestingModule({
    providers: [
      StatementParserService,
      { provide: STATEMENTS_ANTHROPIC_CLIENT, useValue: client },
      { provide: ConfigService, useValue: { get: () => 'claude-sonnet-5' } },
    ],
  }).compile();
  return mod.get(StatementParserService);
}

describe('StatementParserService.parse', () => {
  it('maps a well-formed reply and drops non-positive / malformed items', async () => {
    const svc = await build(clientReturning(JSON.stringify({
      last4: '1234', type: 'card',
      period: { from: '2026-05-13', to: '2026-06-12' },
      summary: { statementBilled: 15230.5, statementMinDue: 800, statementDueDate: '2026-07-02', statementDate: '2026-06-12', statementRewards: 120 },
      items: [
        { date: '2026-06-01', amount: 499, direction: 'debit', descriptor: 'Swiggy', category: 'Food' },
        { date: '2026-06-02', amount: -5, direction: 'debit', descriptor: 'bad' },      // dropped: non-positive
        { date: 'nope', amount: 100, direction: 'debit', descriptor: 'baddate' },        // dropped: bad date
        { date: '2026-06-03', amount: 200, direction: 'credit', descriptor: 'Refund', category: null },
      ],
    })));
    const r = await svc.parse({ pdf: 'BASE64' });
    expect(r.last4).toBe('1234');
    expect(r.inferredType).toBe('card');
    expect(r.summary.statementBilled).toBe(15230.5);
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({ isoDate: '2026-06-01', amount: 499, direction: 'debit' });
    expect(r.items[1].direction).toBe('credit');
  });

  it('returns an empty-but-valid statement when the model emits no JSON', async () => {
    const svc = await build(clientReturning('sorry, cannot read this'));
    const r = await svc.parse({ pdf: 'BASE64' });
    expect(r.items).toEqual([]);
    expect(r.inferredType).toBe('bank'); // default
  });

  it('throws when the client is not configured', async () => {
    const svc = await build(null);
    await expect(svc.parse({ pdf: 'BASE64' })).rejects.toThrow();
  });
});
