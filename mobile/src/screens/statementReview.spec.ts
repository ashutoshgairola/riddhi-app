import { bucketByVerdict, defaultIncluded, buildImportPayload } from './statementReview';

const item = (o: any) => ({ isoDate: '2026-06-01', amount: 499, direction: 'debit', descriptor: 'Swiggy', category: 'Food', verdict: 'new', ...o });

describe('statementReview helpers', () => {
  it('buckets items by verdict', () => {
    const b = bucketByVerdict([item({ verdict: 'new' }), item({ verdict: 'possible' }), item({ verdict: 'duplicate' })]);
    expect(b.new).toHaveLength(1); expect(b.possible).toHaveLength(1); expect(b.duplicate).toHaveLength(1);
  });
  it('defaults new→included, possible/duplicate→excluded', () => {
    expect(defaultIncluded(item({ verdict: 'new' }))).toBe(true);
    expect(defaultIncluded(item({ verdict: 'possible' }))).toBe(false);
    expect(defaultIncluded(item({ verdict: 'duplicate' }))).toBe(false);
  });
  it('buildImportPayload emits only selected items with resolved fields', () => {
    const view = { account: { id: 'c1' }, statementType: 'card', summary: { statementBilled: 100 },
      items: [item({ verdict: 'new' }), item({ verdict: 'duplicate', descriptor: 'dup' })] };
    const selection = new Set([0]); // include only the first
    const payload = buildImportPayload(view as any, selection, { applySummary: true, setBalance: undefined });
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].descriptor).toBe('Swiggy');
    expect(payload.accountId).toBe('c1');
    expect(payload.summary).toEqual({ statementBilled: 100 });
  });
});
