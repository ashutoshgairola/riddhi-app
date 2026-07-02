/** Welcome — RN port of AuthWelcome (project/riddhi/MobileAuth.jsx:91-143). */
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { Btn } from '../../components/ui';
import { PageBackground } from '../../components/PageBackground';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, weight } from '../../theme/tokens';
import { PressableScale, SpringIn, Wordmark } from './authUi';

const FEATS = [
  { i: '🔄', c: '#7faf93', l: 'Auto-sync from bank SMS', d: 'Transactions logged on-device' },
  { i: '◎', c: '#c9a86a', l: 'Smart budgets & goals', d: 'Know what\'s safe to spend' },
  { i: '💬', c: '#9d8bd6', l: 'Ask Riddhi anything', d: 'Plan and log by chatting' },
];

export function Welcome({ onSignup, onLogin }: { onSignup: () => void; onLogin: () => void }) {
  const { t } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <PageBackground />
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 26 }}
      >
        {/* Hero (MobileAuth.jsx:102-113): 280px radial glow behind wordmark */}
        <View style={{ paddingTop: 64, paddingBottom: 24 }}>
          <View pointerEvents="none" style={styles.heroGlow}>
            <Svg width={280} height={280}>
              <Defs>
                <RadialGradient id="heroGlow" cx="50%" cy="50%" r="50%">
                  <Stop offset="0%" stopColor="rgba(182,164,243,0.32)" />
                  <Stop offset="68%" stopColor="rgba(182,164,243,0)" />
                </RadialGradient>
              </Defs>
              <Circle cx={140} cy={140} r={140} fill="url(#heroGlow)" />
            </Svg>
          </View>
          <SpringIn>
            <Wordmark size={52} />
            <Text style={[styles.heroTitle, { color: t.text1, fontFamily: weight(700) }]}>
              Money, clear as day.
            </Text>
            <Text style={[styles.heroSub, { color: t.text2, fontFamily: weight(500) }]}>
              India's calmest way to track spending, budget with intent, and grow what you keep.
            </Text>
          </SpringIn>
        </View>

        {/* Feature list (MobileAuth.jsx:116-129) */}
        <View style={{ gap: 10, marginTop: 6 }}>
          {FEATS.map((f, i) => (
            <SpringIn key={f.l} delay={60 + i * 60}>
              <View style={[styles.featCard, { backgroundColor: t.glassBg, borderColor: t.glassBrd }]}>
                <View style={[styles.featIcon, { backgroundColor: f.c + '22' }]}>
                  <Text style={{ fontSize: 19, color: f.c }}>{f.i}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 14, color: t.text1, fontFamily: weight(700) }}>{f.l}</Text>
                  <Text style={{ fontSize: 11.5, color: t.text3, marginTop: 2, fontFamily: weight(500) }}>{f.d}</Text>
                </View>
              </View>
            </SpringIn>
          ))}
        </View>

        {/* CTAs (MobileAuth.jsx:132-138) */}
        <View style={{ marginTop: 'auto', paddingTop: 28, paddingBottom: 8 }}>
          <Btn onPress={onSignup} style={{ height: 54 }}>
            <Text style={{ fontSize: 16, color: '#1a1228', fontFamily: weight(600) }}>Create account</Text>
          </Btn>
          <PressableScale onPress={onLogin}>
            <View style={[styles.ghostBtn, { borderColor: t.glassBrd }]}>
              <Text style={{ fontSize: 15, color: t.text1, fontFamily: weight(600) }}>I already have an account</Text>
            </View>
          </PressableScale>
          <Text style={[styles.terms, { color: t.text3, fontFamily: weight(500) }]}>
            By continuing you agree to our Terms & Privacy Policy
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  heroGlow: {
    position: 'absolute',
    top: -20,
    alignSelf: 'center',
  },
  heroTitle: {
    fontSize: 20,
    letterSpacing: -0.4, // -0.02em of 20px
    marginTop: 22,
    lineHeight: 25,
  },
  heroSub: {
    fontSize: 14.5,
    marginTop: 8,
    lineHeight: 21.75,
    maxWidth: 280,
  },
  featCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 14,
    paddingHorizontal: 15,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  featIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtn: {
    height: 52,
    marginTop: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  terms: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 16.5,
  },
});
