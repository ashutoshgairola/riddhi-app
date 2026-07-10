import { useState, type PropsWithChildren } from 'react';
import { Dimensions, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Canvas, Fill, Shader } from '@shopify/react-native-skia';

import { useTheme } from '../theme/ThemeProvider';
import { radius as R } from '../theme/tokens';
import { AMBIENT_SHADER, buildAmbientUniforms } from './liquidGlassShader';

export interface LiquidGlassProps extends PropsWithChildren {
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  radius?: number;
  padding?: number;
  specular?: boolean;
  chromatic?: boolean;
  tint?: string;
  /** Pass-through for `pointerEvents` on the outer wrapper. */
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
}

export function LiquidGlass({
  children, style, contentStyle, radius: r = R.xl, padding = 0,
  specular = true, chromatic = true, tint, pointerEvents,
}: LiquidGlassProps) {
  const { t } = useTheme();
  const [size, setSize] = useState<[number, number]>([0, 0]);
  const [offset, setOffset] = useState<[number, number]>([0, 0]);
  const page: [number, number] = [Dimensions.get('window').width, Dimensions.get('window').height];

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize([width, height]);
    const target = e.currentTarget as unknown as { measureInWindow?: (cb: (x: number, y: number) => void) => void };
    target.measureInWindow?.((x, y) => setOffset([x, y]));
  };

  const uniforms = buildAmbientUniforms({
    size,
    radius: r,
    offset,
    pageSize: page,
    gradient: [t.pageGradient[0], t.pageGradient[1], t.pageGradient[2]],
    glow: t.pageGlow[0],
    glowCenter: [page[0] * 0.12, page[1] * 0.06],
    glowRadius: page[0] * 0.95,
    tint: tint ?? t.glassBg,
    refraction: t.refraction,
    specularColor: specular ? t.specularColor : 'rgba(0,0,0,0)',
    specularWidth: t.specularWidth,
    chromatic: chromatic ? t.chromatic : 0,
  });

  return (
    <View
      style={[{ borderRadius: r, borderWidth: 1, borderColor: t.glassBrd, overflow: 'hidden' }, style]}
      onLayout={onLayout}
      pointerEvents={pointerEvents}
    >
      {size[0] > 0 && (
        <Canvas style={StyleSheet.absoluteFill}>
          <Fill>
            <Shader source={AMBIENT_SHADER} uniforms={uniforms} />
          </Fill>
        </Canvas>
      )}
      <View style={[{ borderRadius: r, padding }, contentStyle]}>{children}</View>
    </View>
  );
}
