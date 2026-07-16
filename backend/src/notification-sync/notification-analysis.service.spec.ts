import {
  parseGroups,
  NotificationAnalysisService,
} from './notification-analysis.service';

describe('parseGroups', () => {
  const keys = new Set(['k-rapido', 'k-hdfc', 'k-other']);

  it('parses a correlated group and keeps only known sourceKeys', () => {
    const text = JSON.stringify([
      {
        merchant: 'Rapido',
        amount: 159,
        type: 'expense',
        category: 'Transport',
        institution: 'HDFC',
        rail: 'upi',
        confidence: 0.9,
        sourceKeys: ['k-rapido', 'k-hdfc', 'k-hallucinated'],
      },
    ]);
    const groups = parseGroups(text, keys);
    expect(groups).toHaveLength(1);
    expect(groups[0].merchant).toBe('Rapido');
    expect(groups[0].amount).toBe(159);
    expect(groups[0].sourceKeys.sort()).toEqual(['k-hdfc', 'k-rapido']);
  });

  it('tolerates code fences and prose around the JSON', () => {
    const text = 'Here you go:\n```json\n[]\n```';
    expect(parseGroups(text, keys)).toEqual([]);
  });

  it('extracts a non-empty group wrapped in code fences and prose', () => {
    const text =
      'Sure, here is the result:\n```json\n' +
      JSON.stringify([
        {
          merchant: 'Zomato',
          amount: 449,
          type: 'expense',
          category: 'Food',
          institution: 'HDFC',
          rail: 'upi',
          confidence: 0.85,
          sourceKeys: ['k-other'],
        },
      ]) +
      '\n```\nHope that helps!';
    const groups = parseGroups(text, keys);
    expect(groups).toHaveLength(1);
    expect(groups[0].merchant).toBe('Zomato');
    expect(groups[0].amount).toBe(449);
    expect(groups[0].sourceKeys).toEqual(['k-other']);
  });

  it('drops groups with no amount', () => {
    const text = JSON.stringify([
      {
        merchant: 'X',
        amount: null,
        type: 'expense',
        category: null,
        institution: null,
        rail: null,
        confidence: 0.4,
        sourceKeys: ['k-other'],
      },
    ]);
    expect(parseGroups(text, keys)).toEqual([]);
  });

  it('drops a group whose every sourceKey is hallucinated', () => {
    const text = JSON.stringify([
      {
        merchant: 'Ghost',
        amount: 99,
        type: 'expense',
        category: null,
        institution: null,
        rail: null,
        confidence: 0.7,
        sourceKeys: ['k-nope', 'k-also-nope'],
      },
    ]);
    expect(parseGroups(text, keys)).toEqual([]);
  });

  it('defaults out-of-range confidence to 0.5 and preserves in-range confidence', () => {
    const base = {
      merchant: 'M',
      amount: 10,
      type: 'expense' as const,
      category: null,
      institution: null,
      rail: null,
      sourceKeys: ['k-other'],
    };
    const text = JSON.stringify([
      { ...base, confidence: 5 },
      { ...base, confidence: -1 },
      { ...base, confidence: 0.8 },
    ]);
    const groups = parseGroups(text, keys);
    expect(groups).toHaveLength(3);
    expect(groups[0].confidence).toBe(0.5);
    expect(groups[1].confidence).toBe(0.5);
    expect(groups[2].confidence).toBe(0.8);
  });

  it('nulls an invalid rail and preserves a valid rail', () => {
    const base = {
      merchant: 'M',
      amount: 10,
      type: 'expense' as const,
      category: null,
      institution: null,
      confidence: 0.6,
      sourceKeys: ['k-other'],
    };
    const text = JSON.stringify([
      { ...base, rail: 'wallet' },
      { ...base, rail: 'card' },
    ]);
    const groups = parseGroups(text, keys);
    expect(groups).toHaveLength(2);
    expect(groups[0].rail).toBeNull();
    expect(groups[1].rail).toBe('card');
  });

  it('extracts and normalizes last4, guarding non-string values to null', () => {
    const base = {
      merchant: 'M',
      amount: 10,
      type: 'expense' as const,
      category: null,
      institution: null,
      rail: 'card' as const,
      confidence: 0.6,
      sourceKeys: ['k-other'],
    };
    const text = JSON.stringify([
      { ...base, last4: '1234' },
      { ...base, last4: 'XX5678' }, // strips non-digits, keeps last 4
      { ...base, last4: 1234 }, // non-string → null
      { ...base }, // missing → null
    ]);
    const groups = parseGroups(text, keys);
    expect(groups).toHaveLength(4);
    expect(groups[0].last4).toBe('1234');
    expect(groups[1].last4).toBe('5678');
    expect(groups[2].last4).toBeNull();
    expect(groups[3].last4).toBeNull();
  });

  it('returns [] for valid JSON that is not a top-level array', () => {
    expect(parseGroups('{"foo": []}', keys)).toEqual([]);
  });

  it('returns [] for an unparseable payload', () => {
    expect(parseGroups('[ {bad json ]', keys)).toEqual([]);
  });
});

describe('NotificationAnalysisService.analyze fallback', () => {
  it('falls back to regex detections when no LLM client is configured', async () => {
    const svc = new NotificationAnalysisService(null, {
      get: () => undefined,
    } as any);
    const groups = await svc.analyze([
      {
        dedupKey: 'k1',
        packageName: 'sms',
        title: 'HDFCBK',
        text: 'Rs.499 spent on HDFC Bank Card xx1234 at SWIGGY',
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      amount: 499,
      type: 'expense',
      sourceKeys: ['k1'],
    });
  });
});
