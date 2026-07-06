/**
 * Onboarding scaffold — RN port of OBProgress/OBStep/OBKeypad + the footer
 * factory (project/riddhi/MobileOnboard.jsx:6-47, 85-101, 382-387).
 */
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn, IconButton } from '../../components/ui';
import { MI } from '../../components/icons';
import { PageBackground } from '../../components/PageBackground';
import { useTheme } from '../../theme/ThemeProvider';
import { weight } from '../../theme/tokens';
import { PressableScale, SpringIn } from '../auth/authUi';

// ── Progress bar (MobileOnboard.jsx:6-19) ───────────────────────────
export function OBProgress({ step, total }: { step: number; total: number }) {
  const { t } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6, paddingVertical: 2 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[styles.progressTrack, { backgroundColor: t.bg3 }]}>
          <View
            style={{
              height: '100%',
              borderRadius: 99,
              backgroundColor: t.em,
              width: i <= step ? '100%' : '0%',
              opacity: i <= step ? 1 : 0,
            }}
          />
        </View>
      ))}
    </View>
  );
}

// ── Step scaffold (MobileOnboard.jsx:22-47) ─────────────────────────
export function OBStep({
  step,
  total,
  onBack,
  kicker,
  title,
  sub,
  children,
  footer,
}: {
  step: number;
  total: number;
  onBack: () => void;
  kicker?: string;
  title: string;
  sub?: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <PageBackground />
      <View style={[styles.topbar, { paddingTop: insets.top + 14 }]}>
        <IconButton onPress={onBack}>
          <MI.back size={20} color={t.text1} />
        </IconButton>
        <View style={{ flex: 1 }}>
          <OBProgress step={step} total={total} />
        </View>
        <Text style={{ fontSize: 12.5, color: t.text3, fontFamily: weight(700) }}>
          {step + 1}/{total}
        </Text>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 10, paddingHorizontal: 26, paddingBottom: 24 }}
      >
        <SpringIn>
          {kicker ? (
            <Text style={[styles.kicker, { color: t.em, fontFamily: weight(700) }]}>{kicker.toUpperCase()}</Text>
          ) : null}
          <Text style={[styles.title, { color: t.text1, fontFamily: weight(800) }]}>{title}</Text>
          {sub ? <Text style={[styles.sub, { color: t.text2, fontFamily: weight(500) }]}>{sub}</Text> : null}
        </SpringIn>
        <SpringIn delay={50} style={{ marginTop: 22 }}>
          {children}
        </SpringIn>
      </ScrollView>
      {/* Sticky footer (MobileOnboard.jsx:40-44): border-top + frosted bg. */}
      <View
        style={[
          styles.footer,
          {
            borderTopColor: t.border,
            backgroundColor: t.tabbarBg,
            paddingBottom: insets.bottom + 20,
          },
        ]}
      >
        {footer}
      </View>
    </View>
  );
}

// ── Footer factory (MobileOnboard.jsx:382-387) ──────────────────────
export function OBFooter({
  canNext,
  label,
  onNext,
  onSkip,
}: {
  canNext: boolean;
  label: string;
  onNext: () => void;
  onSkip?: () => void;
}) {
  const { t } = useTheme();
  return (
    <View>
      <Btn onPress={onNext} disabled={!canNext} style={{ height: 54, opacity: canNext ? 1 : 0.45 }}>
        <Text style={{ fontSize: 16, color: '#1a1228', fontFamily: weight(600) }}>{label}</Text>
      </Btn>
      {onSkip ? (
        <Pressable onPress={onSkip} style={{ paddingVertical: 8, marginTop: 10, alignItems: 'center' }}>
          <Text style={{ fontSize: 13.5, color: t.text3, fontFamily: weight(600) }}>Skip for now</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Numeric keypad (MobileOnboard.jsx:85-101) ───────────────────────
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

function DelIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
      <Line x1={18} y1={9} x2={12} y2={15} />
      <Line x1={12} y1={9} x2={18} y2={15} />
    </Svg>
  );
}

export function OBKeypad({ onKey }: { onKey: (k: string) => void }) {
  const { t } = useTheme();
  return (
    <View style={styles.keypad}>
      {KEYS.map((k) => (
        <PressableScale key={k} onPress={() => onKey(k)} style={styles.keyWrap}>
          <View style={[styles.key, { backgroundColor: t.glassBg, borderColor: t.glassBrd }]}>
            {k === 'del' ? (
              <DelIcon color={t.text1} />
            ) : (
              <Text style={{ fontSize: 22, color: t.text1, fontFamily: weight(600) }}>{k}</Text>
            )}
          </View>
        </PressableScale>
      ))}
    </View>
  );
}

/** Shared amount reducer (MobileOnboard.jsx:105-111 / 231-237). */
export function amountKey(a: string, k: string): string {
  if (k === 'del') return a.slice(0, -1);
  if (k === '.') return a;
  if (a.replace(/\D/g, '').length >= 9) return a;
  if (a === '0') return k;
  return a + k;
}

const styles = StyleSheet.create({
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 99,
    overflow: 'hidden',
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 14,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  kicker: {
    fontSize: 11.5,
    letterSpacing: 1.15, // 0.1em of 11.5px
    marginBottom: 10,
  },
  title: {
    fontSize: 25,
    letterSpacing: -0.75, // -0.03em of 25px
    lineHeight: 28.75,
  },
  sub: {
    fontSize: 14,
    marginTop: 8,
    lineHeight: 21,
  },
  footer: {
    paddingTop: 12,
    paddingHorizontal: 26,
    borderTopWidth: 1,
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  keyWrap: {
    flexBasis: '31%',
    flexGrow: 1,
  },
  key: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
