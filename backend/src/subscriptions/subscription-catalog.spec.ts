import { resolveFromCatalog, resolveName, isAggregator, extractServiceName } from './subscription-catalog';

describe('resolveFromCatalog', () => {
  it('resolves a known merchant', () => {
    expect(resolveFromCatalog('netflix.com')?.name).toBe('Netflix');
  });
  it('resolves an aggregator to a generic name', () => {
    expect(resolveFromCatalog('google play')?.name).toBe('Google Play');
  });
  it('returns null for an unknown descriptor', () => {
    expect(resolveFromCatalog('zzz random merchant')).toBeNull();
  });
});

describe('isAggregator', () => {
  it('flags aggregator descriptors', () => {
    expect(isAggregator('google play')).toBe(true);
    expect(isAggregator('netflix.com')).toBe(false);
  });
});

describe('extractServiceName', () => {
  it('pulls the real service out of a Google Play receipt notification', () => {
    const text = 'Your Google Play Order Receipt. Your subscription from True Software Scandinavia AB on Google Play has renewed.';
    expect(extractServiceName(text)).toBe('True Software Scandinavia AB');
  });
  it('returns null when no service phrase is present', () => {
    expect(extractServiceName('Payment of Rs.99 to Google Play was successful')).toBeNull();
  });
});

describe('resolveName', () => {
  it('prefers the catalog over the hint and LLM', async () => {
    const r = await resolveName('netflix.com', { hint: 'WRONG', llm: async () => ({ name: 'WRONG2', emoji: '❌' }) });
    expect(r.name).toBe('Netflix');
  });
  it('uses the notification hint for an aggregator (catalog is generic)', async () => {
    const r = await resolveName('google play', { hint: 'Truecaller' });
    expect(r.name).toBe('Truecaller');
  });
  it('uses the LLM for an unknown descriptor with no hint', async () => {
    const r = await resolveName('acme cloud pro', { llm: async () => ({ name: 'Acme Cloud', emoji: '☁️' }) });
    expect(r.name).toBe('Acme Cloud');
    expect(r.emoji).toBe('☁️');
  });
  it('falls back to a title-cased descriptor when nothing resolves', async () => {
    const r = await resolveName('acme cloud pro', { llm: async () => null });
    expect(r.name).toBe('Acme Cloud Pro');
    expect(r.emoji).toBe('🔁');
  });
  it('falls back gracefully with no opts', async () => {
    const r = await resolveName('acme cloud pro');
    expect(r.name).toBe('Acme Cloud Pro');
  });
  it('ignores a hint for a non-aggregator unknown descriptor (hint is aggregators-only)', async () => {
    const r = await resolveName('acme cloud pro', { hint: 'Should Be Ignored', llm: async () => ({ name: 'Acme Cloud', emoji: '☁️' }) });
    expect(r.name).toBe('Acme Cloud');
  });
});
