/**
 * Smoke + logic tests for the LiquidGlass primitive. Follows the repo's
 * react-dom/server rendering convention (see jest.config.js): `react-native`
 * is mocked with host-tag stand-ins, Skia is stubbed, and `useTheme` is
 * mocked so the test needs neither the real ThemeProvider nor AsyncStorage.
 */
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('react-native', () => ({
  View: 'div',
  Text: 'span',
  StyleSheet: { absoluteFill: {}, create: (s: unknown) => s },
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
}));

jest.mock('@shopify/react-native-skia', () => ({
  Canvas: ({ children }: { children?: unknown }) => children,
  Fill: ({ children }: { children?: unknown }) => children,
  Shader: () => null,
  Skia: { RuntimeEffect: { Make: () => ({}) } },
}));

jest.mock('../theme/ThemeProvider', () => {
  const { dark } = jest.requireActual('../theme/tokens');
  return { useTheme: () => ({ t: dark, mode: 'dark' }) };
});

import { Text } from 'react-native';
import { LiquidGlass } from './LiquidGlass';
import { rgba, buildAmbientUniforms } from './liquidGlassShader';

describe('LiquidGlass', () => {
  it('renders its children inside the glass surface', () => {
    const html = renderToStaticMarkup(
      <LiquidGlass>
        <Text>hi</Text>
      </LiquidGlass>,
    );
    expect(html).toContain('hi');
  });
});

describe('rgba parser', () => {
  it('parses #rrggbb to normalized channels', () => {
    expect(rgba('#ffffff')).toEqual([1, 1, 1, 1]);
    expect(rgba('#000000')).toEqual([0, 0, 0, 1]);
  });
  it('parses rgba() including alpha', () => {
    const [r, g, b, a] = rgba('rgba(255,128,0,0.5)');
    expect(r).toBeCloseTo(1);
    expect(g).toBeCloseTo(128 / 255);
    expect(b).toBeCloseTo(0);
    expect(a).toBeCloseTo(0.5);
  });
  it('defaults alpha to 1 for rgb()', () => {
    expect(rgba('rgb(0,0,0)')[3]).toBe(1);
  });
});

describe('buildAmbientUniforms', () => {
  it('maps args to the shader uniform names', () => {
    const u = buildAmbientUniforms({
      size: [100, 40],
      radius: 26,
      offset: [0, 0],
      pageSize: [390, 844],
      gradient: ['#181328', '#100c18', '#08060d'],
      glow: 'rgba(150,120,240,0.28)',
      glowCenter: [46.8, 50.6],
      glowRadius: 370.5,
      tint: 'rgba(255,255,255,0.055)',
      refraction: 0.045,
      specularColor: 'rgba(255,255,255,0.55)',
      specularWidth: 0.12,
      chromatic: 0.006,
    });
    expect(u.uSize).toEqual([100, 40]);
    expect(u.uRadius).toBe(26);
    expect(u.uRefraction).toBe(0.045);
    expect(u.uSpecW).toBe(0.12);
    expect(u.uChroma).toBe(0.006);
    expect((u.uTint as number[])[3]).toBeCloseTo(0.055);
  });
});
