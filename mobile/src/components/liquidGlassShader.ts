import { Skia } from '@shopify/react-native-skia';

/**
 * Ambient liquid-glass shader. Reconstructs the app's page backdrop
 * (linear violet gradient + one dominant glow blob) procedurally from
 * uniforms, so it can refract "what's behind" without capturing any
 * native view. Coordinates are surface-local pixels; uOffset/uPageSize
 * place the surface within the full page so the sampled gradient lines
 * up with PageBackground.
 */
export const AMBIENT_SKSL = `
uniform float2 uSize;
uniform float  uRadius;
uniform float2 uOffset;
uniform float2 uPageSize;
uniform float4 uG0;
uniform float4 uG1;
uniform float4 uG2;
uniform float4 uGlow;
uniform float2 uGlowC;
uniform float  uGlowR;
uniform float4 uTint;
uniform float  uRefraction;
uniform float4 uSpec;
uniform float  uSpecW;
uniform float  uChroma;

float sdRoundRect(float2 p, float2 b, float r) {
  float2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

float4 backdrop(float2 pagePt) {
  float ty = clamp(pagePt.y / max(uPageSize.y, 1.0), 0.0, 1.0);
  float4 base = ty < 0.5
    ? mix(uG0, uG1, ty / 0.5)
    : mix(uG1, uG2, (ty - 0.5) / 0.5);
  float d = distance(pagePt, uGlowC) / max(uGlowR, 1.0);
  float g = uGlow.a * (1.0 - smoothstep(0.0, 1.0, d));
  return float4(mix(base.rgb, uGlow.rgb, g), 1.0);
}

vec4 main(vec2 pos) {
  float2 halfSize = uSize * 0.5;
  float2 p = pos - halfSize;
  float hm = min(halfSize.x, halfSize.y);
  float dist = sdRoundRect(p, halfSize, uRadius);

  float aa = 1.0 - smoothstep(-1.0, 1.0, dist);
  if (aa <= 0.0) return vec4(0.0);

  float edge = smoothstep(-hm * 0.9, 0.0, dist);
  float2 dir = length(p) > 0.0 ? normalize(p) : float2(0.0);

  float2 disp = dir * edge * uRefraction * hm;
  float2 base = pos + uOffset;
  float2 chroma = dir * edge * uChroma * hm;

  float4 col;
  col.r = backdrop(base + disp + chroma).r;
  col.g = backdrop(base + disp).g;
  col.b = backdrop(base + disp - chroma).b;
  col.a = 1.0;

  col.rgb = mix(col.rgb, uTint.rgb, uTint.a);

  float rim = 1.0 - smoothstep(0.0, uSpecW * hm, abs(dist));
  float topbias = clamp(0.5 - (p.y / uSize.y) - (p.x / uSize.x) * 0.3, 0.0, 1.0);
  float spec = rim * topbias * uSpec.a;
  col.rgb += uSpec.rgb * spec;

  return col * aa;
}`;

export const AMBIENT_SHADER = Skia.RuntimeEffect.Make(AMBIENT_SKSL)!;

/** Parse a `#rrggbb` or `rgb()/rgba()` string to normalized [r,g,b,a]. Exported for reuse. */
export function rgba(str: string): [number, number, number, number] {
  const m = str.trim().match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
  }
  const r = str.match(/rgba?\(([^)]+)\)/i);
  if (!r) return [0, 0, 0, 0];
  const parts = r[1].split(',').map((s) => parseFloat(s.trim()));
  return [parts[0] / 255, parts[1] / 255, parts[2] / 255, parts[3] ?? 1];
}

export interface AmbientUniformArgs {
  size: [number, number];
  radius: number;
  offset: [number, number];
  pageSize: [number, number];
  gradient: [string, string, string];
  glow: string;
  glowCenter: [number, number];
  glowRadius: number;
  tint: string;
  refraction: number;
  specularColor: string;
  specularWidth: number;
  chromatic: number;
}

export function buildAmbientUniforms(a: AmbientUniformArgs): Record<string, number | number[]> {
  return {
    uSize: a.size,
    uRadius: a.radius,
    uOffset: a.offset,
    uPageSize: a.pageSize,
    uG0: rgba(a.gradient[0]),
    uG1: rgba(a.gradient[1]),
    uG2: rgba(a.gradient[2]),
    uGlow: rgba(a.glow),
    uGlowC: a.glowCenter,
    uGlowR: a.glowRadius,
    uTint: rgba(a.tint),
    uRefraction: a.refraction,
    uSpec: rgba(a.specularColor),
    uSpecW: a.specularWidth,
    uChroma: a.chromatic,
  };
}
