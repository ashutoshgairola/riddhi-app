import { dark, light } from './tokens';

// The spacing scale moved to `./spacing` (8pt grid) — see spacing.spec.ts.

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
