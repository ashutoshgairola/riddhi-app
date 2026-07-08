import { parseGroups } from './notification-analysis.service';

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

  it('drops groups with no amount', () => {
    const text = JSON.stringify([
      { merchant: 'X', amount: null, type: 'expense', category: null, institution: null, rail: null, confidence: 0.4, sourceKeys: ['k-other'] },
    ]);
    expect(parseGroups(text, keys)).toEqual([]);
  });
});
