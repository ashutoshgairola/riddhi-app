import { classifyLineItems, ExistingTxn, ParsedLineItem } from './statement-dedup';

const item = (o: Partial<ParsedLineItem> = {}): ParsedLineItem => ({
  isoDate: '2026-06-12', amount: 499, direction: 'debit', descriptor: 'Swiggy', category: null, ...o,
});
const existing = (o: Partial<ExistingTxn> = {}): ExistingTxn => ({
  id: 't1', isoDate: '2026-06-12', amount: 499, direction: 'debit', descriptor: 'SWIGGY', importFingerprint: null, ...o,
});

describe('classifyLineItems', () => {
  it('no candidate → new', () => {
    const [r] = classifyLineItems('acc1', [item()], []);
    expect(r.verdict).toBe('new');
  });
  it('exactly one candidate (amount+date, ±window) → duplicate with matched id', () => {
    const [r] = classifyLineItems('acc1', [item()], [existing({ id: 'tx9', isoDate: '2026-06-14' })]);
    expect(r.verdict).toBe('duplicate');
    expect(r.matchedTransactionId).toBe('tx9');
  });
  it('date outside window → new', () => {
    const [r] = classifyLineItems('acc1', [item({ isoDate: '2026-06-01' })], [existing({ isoDate: '2026-06-12' })], { windowDays: 3 });
    expect(r.verdict).toBe('new');
  });
  it('opposite direction is not a match', () => {
    const [r] = classifyLineItems('acc1', [item({ direction: 'credit' })], [existing({ direction: 'debit' })]);
    expect(r.verdict).toBe('new');
  });
  it('two candidates for one item → possible', () => {
    const r = classifyLineItems('acc1', [item()], [existing({ id: 'a' }), existing({ id: 'b', isoDate: '2026-06-13' })]);
    expect(r[0].verdict).toBe('possible');
  });
  it('twin charges, one existing → first duplicate (consumes it), second new', () => {
    const r = classifyLineItems('acc1', [item(), item()], [existing({ id: 'only' })]);
    expect(r[0].verdict).toBe('duplicate');
    expect(r[0].matchedTransactionId).toBe('only');
    expect(r[1].verdict).toBe('new');
  });
  it('fingerprint match is definitive duplicate even off-window', () => {
    const fp = require('./import-fingerprint').computeImportFingerprint('acc1', 499, '2026-06-12', 'Swiggy');
    const r = classifyLineItems('acc1', [item()], [existing({ id: 'fp', isoDate: '2026-05-01', importFingerprint: fp })]);
    expect(r[0].verdict).toBe('duplicate');
    expect(r[0].matchedTransactionId).toBe('fp');
  });
});
