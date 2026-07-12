import { dark, light, space } from './tokens';

describe('spacing scale', () => {
  it('is a 2px grid with pixel-valued keys', () => {
    for (const [k, v] of Object.entries(space)) {
      expect(Number(k)).toBe(v); // key === value
      expect(v % 2).toBe(0); // every step on the 2px grid
    }
  });
  it('covers the authored rhythm without the off-grid midpoints 22/26', () => {
    expect(space).toMatchObject({ 6: 6, 10: 10, 14: 14, 18: 18, 20: 20, 24: 24 });
    expect(space).not.toHaveProperty('22');
    expect(space).not.toHaveProperty('26');
  });
});

describe('liquid glass tokens', () => {
  it('dark theme exposes refraction/specular/chromatic knobs', () => {
    expect(dark.refraction).toBeGreaterThan(0);
    expect(dark.specularColor).toMatch(/^(#|rgba?\()/);
    expect(dark.specularWidth).toBeGreaterThan(0);
    expect(dark.chromatic).toBeGreaterThanOrEqual(0);
  });
  it('light theme exposes the same knobs', () => {
    expect(light.refraction).toBeGreaterThan(0);
    expect(light.specularColor).toMatch(/^(#|rgba?\()/);
    expect(light.specularWidth).toBeGreaterThan(0);
    expect(light.chromatic).toBeGreaterThanOrEqual(0);
  });
});
