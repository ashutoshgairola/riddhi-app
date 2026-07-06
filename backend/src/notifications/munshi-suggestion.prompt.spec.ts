import {
  isNoteworthy,
  parseMunshiSuggestion,
} from './munshi-suggestion.prompt';

describe('munshi suggestion prompt', () => {
  it('is noteworthy when a budget is 75%+ spent', () => {
    expect(
      isNoteworthy({
        budget: { name: 'April', totalAllocated: 10000, totalSpent: 8000, topCategories: [] },
        goals: [],
      }),
    ).toBe(true);
  });

  it('is noteworthy when a goal is between 50 and 100%', () => {
    expect(isNoteworthy({ budget: null, goals: [{ name: 'EF', progressPct: 60 }] })).toBe(true);
  });

  it('is not noteworthy on a quiet snapshot', () => {
    expect(
      isNoteworthy({
        budget: { name: 'April', totalAllocated: 10000, totalSpent: 1000, topCategories: [] },
        goals: [{ name: 'EF', progressPct: 20 }],
      }),
    ).toBe(false);
  });

  it('parses a valid suggestion', () => {
    expect(parseMunshiSuggestion('{"title":"Chai count","body":"Third Swiggy order, beta."}')).toEqual({
      title: 'Chai count',
      body: 'Third Swiggy order, beta.',
    });
  });

  it('returns null on skip', () => {
    expect(parseMunshiSuggestion('{"skip":true}')).toBeNull();
  });

  it('returns null on malformed output', () => {
    expect(parseMunshiSuggestion('not json at all')).toBeNull();
    expect(parseMunshiSuggestion('{"title":"only title"}')).toBeNull();
  });
});
