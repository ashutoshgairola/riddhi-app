import {
  isNoteworthy,
  parseMunshiSuggestion,
  munshiDeepLink,
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
    expect(isNoteworthy({ budget: null, goals: [{ id: 'g1', name: 'EF', progressPct: 60 }] })).toBe(true);
  });

  it('is not noteworthy on a quiet snapshot', () => {
    expect(
      isNoteworthy({
        budget: { name: 'April', totalAllocated: 10000, totalSpent: 1000, topCategories: [] },
        goals: [{ id: 'g1', name: 'EF', progressPct: 20 }],
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

describe('parseMunshiSuggestion focus', () => {
  it('parses focus and focusGoal for a goal nudge', () => {
    const r = parseMunshiSuggestion('{"title":"t","body":"b","focus":"goal","focusGoal":"Emergency fund"}');
    expect(r).toEqual({ title: 't', body: 'b', focus: 'goal', focusGoal: 'Emergency fund' });
  });
  it('parses budget focus and ignores focusGoal', () => {
    const r = parseMunshiSuggestion('{"title":"t","body":"b","focus":"budget","focusGoal":"x"}');
    expect(r).toEqual({ title: 't', body: 'b', focus: 'budget' });
  });
  it('drops an invalid focus', () => {
    const r = parseMunshiSuggestion('{"title":"t","body":"b","focus":"nonsense"}');
    expect(r).toEqual({ title: 't', body: 'b' });
  });
  it('returns null on skip', () => {
    expect(parseMunshiSuggestion('{"skip":true}')).toBeNull();
  });
});

describe('munshiDeepLink', () => {
  const goals = [{ id: 'g1', name: 'Emergency fund' }, { id: 'g2', name: 'Car' }];
  it('maps budget focus to budgets', () => {
    expect(munshiDeepLink({ title: 't', body: 'b', focus: 'budget' }, goals)).toEqual({ screen: 'budgets' });
  });
  it('maps a matched goal (case-insensitive) to goal-detail + id', () => {
    expect(munshiDeepLink({ title: 't', body: 'b', focus: 'goal', focusGoal: 'emergency FUND' }, goals))
      .toEqual({ screen: 'goal-detail', id: 'g1' });
  });
  it('maps an unmatched goal name to the goals list', () => {
    expect(munshiDeepLink({ title: 't', body: 'b', focus: 'goal', focusGoal: 'Vacation' }, goals))
      .toEqual({ screen: 'goals' });
  });
  it('defaults to chat with no focus', () => {
    expect(munshiDeepLink({ title: 't', body: 'b' }, goals)).toEqual({ screen: 'chat' });
  });
});
