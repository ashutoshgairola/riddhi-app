/**
 * Shared auth UI atoms — RN port of project/riddhi/MobileAuth.jsx:1-86
 * plus .m-input/.m-label (mobile.css:521-549), .m-spring (634-642) and
 * .m-press (712-713). Design-handoff fidelity is a hard requirement:
 * dimensions/copy match the mockup exactly.
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { IconButton } from '../../components/ui';
import { MI } from '../../components/icons';
import { PageBackground } from '../../components/PageBackground';
import { useTheme } from '../../theme/ThemeProvider';
import { spring, weight } from '../../theme/tokens';

// ── .m-spring: springIn .5s var(--spring) backwards ────────────────
const SPRING_MS = 500;

export function SpringIn({ delay = 0, style, children }: { delay?: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: SPRING_MS, easing: spring }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const a = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * 14 }, { scale: 0.96 + p.value * 0.04 }],
  }));
  return <Animated.View style={[a, style]}>{children}</Animated.View>;
}

// ── .m-press ────────────────────────────────────────────────────────
export function PressableScale({
  onPress,
  disabled = false,
  style,
  children,
}: {
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled}>
      {({ pressed }) => (
        <View style={[style, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>{children}</View>
      )}
    </Pressable>
  );
}

// ── Brand wordmark (MobileAuth.jsx:4-11) ────────────────────────────
export function Wordmark({ size = 40 }: { size?: number }) {
  const { t } = useTheme();
  const ls = -0.035 * size;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      <Text style={{ fontSize: size, color: t.em, fontFamily: weight(800), letterSpacing: ls, lineHeight: size * 1.05 }}>₹</Text>
      <Text style={{ fontSize: size, color: t.text1, fontFamily: weight(800), letterSpacing: ls, lineHeight: size * 1.05 }}>iddhi</Text>
    </View>
  );
}

// ── Google / Apple glyphs (MobileAuth.jsx:14-19) ────────────────────
export function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

export function AppleG({ size = 17, color }: { size?: number; color?: string }) {
  const { t } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color ?? t.text1}>
      <Path d="M17.05 12.53c-.02-2.02 1.65-2.99 1.72-3.04-.94-1.37-2.4-1.56-2.92-1.58-1.24-.13-2.42.73-3.05.73-.63 0-1.6-.71-2.63-.69-1.35.02-2.6.79-3.29 2-1.4 2.43-.36 6.03 1.01 8 .67.96 1.47 2.04 2.51 2 1.01-.04 1.39-.65 2.61-.65 1.22 0 1.56.65 2.63.63 1.09-.02 1.77-.98 2.44-1.95.77-1.12 1.09-2.2 1.1-2.26-.02-.01-2.11-.81-2.13-3.2zM15.05 6.3c.56-.68.94-1.62.84-2.56-.81.03-1.79.54-2.37 1.21-.52.6-.97 1.56-.85 2.48.9.07 1.82-.46 2.38-1.13z" />
    </Svg>
  );
}

// ── SocialRow (MobileAuth.jsx:21-32): two 50px glass buttons ────────
export function SocialRow({ onGoogle, onApple }: { onGoogle: () => void; onApple: () => void }) {
  const { t } = useTheme();
  const btn = [styles.socialBtn, { backgroundColor: t.glassBg, borderColor: t.glassBrd }];
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <PressableScale onPress={onGoogle} style={{ flex: 1 }}>
        <View style={btn}>
          <GoogleG />
          <Text style={[styles.socialLabel, { color: t.text1, fontFamily: weight(600) }]}>Google</Text>
        </View>
      </PressableScale>
      <PressableScale onPress={onApple} style={{ flex: 1 }}>
        <View style={btn}>
          <AppleG />
          <Text style={[styles.socialLabel, { color: t.text1, fontFamily: weight(600) }]}>Apple</Text>
        </View>
      </PressableScale>
    </View>
  );
}

// ── Divider (MobileAuth.jsx:34-42) ──────────────────────────────────
export function AuthDivider({ label }: { label: string }) {
  const { t } = useTheme();
  return (
    <View style={styles.divider}>
      <View style={[styles.dividerLine, { backgroundColor: t.border }]} />
      <Text style={[styles.dividerLabel, { color: t.text3, fontFamily: weight(600) }]}>{label.toUpperCase()}</Text>
      <View style={[styles.dividerLine, { backgroundColor: t.border }]} />
    </View>
  );
}

// ── .m-input (mobile.css:521-537) ───────────────────────────────────
export function AuthInput(props: TextInputProps) {
  const { t } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={t.text3}
      {...props}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      style={[
        styles.input,
        {
          backgroundColor: focused ? t.glassBg2 : t.glassBg,
          borderColor: focused ? t.emGlow : t.glassBrd,
          color: t.text1,
          fontFamily: weight(500),
        },
        props.style,
      ]}
    />
  );
}

// ── Field (MobileAuth.jsx:45-52) + .m-label (mobile.css:541-549) ────
export function Field({ label, children }: { label: string; children: ReactNode }) {
  const { t } = useTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.label, { color: t.text3, fontFamily: weight(700) }]}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

// ── PasswordField (MobileAuth.jsx:54-68) ────────────────────────────
export function PasswordField({
  value,
  onChange,
  placeholder = '••••••••',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const { t } = useTheme();
  const [show, setShow] = useState(false);
  return (
    <View style={{ position: 'relative' }}>
      <AuthInput
        secureTextEntry={!show}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        autoCapitalize="none"
        style={{ paddingRight: 48 }}
      />
      <Pressable onPress={() => setShow((s) => !s)} style={styles.eyeBtn}>
        {show ? <MI.eye size={18} color={t.text3} /> : <MI.eyeOff size={18} color={t.text3} />}
      </Pressable>
    </View>
  );
}

// ── AuthShell (MobileAuth.jsx:71-86) ────────────────────────────────
export function AuthShell({ onBack, children }: { onBack?: () => void; children: ReactNode }) {
  const { t } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <PageBackground />
      {onBack ? (
        <View style={styles.topbar}>
          <IconButton onPress={onBack}>
            <MI.back size={20} color={t.text1} />
          </IconButton>
        </View>
      ) : null}
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: onBack ? 8 : 30,
          paddingHorizontal: 26,
          paddingBottom: onBack ? 30 : 30,
        }}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  socialBtn: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 16,
    borderWidth: 1,
  },
  socialLabel: {
    fontSize: 14,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerLabel: {
    fontSize: 11.5,
    letterSpacing: 0.69, // 0.06em of 11.5px
  },
  input: {
    width: '100%',
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  label: {
    fontSize: 11,
    letterSpacing: 0.88, // 0.08em of 11px
    marginBottom: 8,
  },
  eyeBtn: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topbar: {
    paddingTop: 14,
    paddingHorizontal: 18,
    paddingBottom: 0,
  },
});
