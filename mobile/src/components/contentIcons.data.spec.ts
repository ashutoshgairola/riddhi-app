import { ICON_NAMES, M_EMOJI, ICON_LIST, resolveIconName } from './contentIcons.data';

describe('resolveIconName', () => {
  it('returns a known name unchanged', () => {
    expect(resolveIconName('food')).toBe('food');
  });
  it('maps a legacy emoji via M_EMOJI', () => {
    expect(resolveIconName('🏷')).toBe('tag');
    expect(resolveIconName('💰')).toBe('coins');
  });
  it('strips the U+FE0F variation selector before matching', () => {
    expect(resolveIconName('⚠️')).toBe('warn');
  });
  it('returns null for an unknown / empty value', () => {
    expect(resolveIconName('🦄')).toBeNull();
    expect(resolveIconName('')).toBeNull();
    expect(resolveIconName(null)).toBeNull();
  });
});

describe('icon reference integrity', () => {
  const names = new Set<string>(ICON_NAMES);
  it('has no duplicate names', () => {
    expect(names.size).toBe(ICON_NAMES.length);
  });
  it('every M_EMOJI target is a real icon name', () => {
    for (const target of Object.values(M_EMOJI)) expect(names.has(target)).toBe(true);
  });
  it('every ICON_LIST entry references a real icon name', () => {
    for (const [name] of ICON_LIST) expect(names.has(name)).toBe(true);
  });
});
