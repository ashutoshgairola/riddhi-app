/** Success screen — RN port of OBDone (project/riddhi/MobileOnboard.jsx:311-350). */
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Polyline, RadialGradient, Stop } from 'react-native-svg';

import { Btn } from '../../components/ui';
import { PageBackground } from '../../components/PageBackground';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, weight } from '../../theme/tokens';
import { SpringIn } from '../auth/authUi';

export interface DoneSummaryItem {
  i: string;
  l: string;
  v: string;
}

export function OBDone({
  summary,
  onEnter,
  entering,
}: {
  summary: DoneSummaryItem[];
  onEnter: () => void;
  entering: boolean;
}) {
  const { t } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <PageBackground />
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 26 }}
      >
        <View style={{ paddingTop: 72, alignItems: 'center' }}>
          <SpringIn>
            <View style={{ width: 104, height: 104, marginBottom: 26 }}>
              <View pointerEvents="none" style={styles.doneGlow}>
                <Svg width={152} height={152}>
                  <Defs>
                    <RadialGradient id="doneGlow" cx="50%" cy="50%" r="50%">
                      <Stop offset="0%" stopColor="rgba(182,164,243,0.35)" />
                      <Stop offset="70%" stopColor="rgba(182,164,243,0)" />
                    </RadialGradient>
                  </Defs>
                  <Circle cx={76} cy={76} r={76} fill="url(#doneGlow)" />
                </Svg>
              </View>
              <LinearGradient
                colors={[t.em, '#9d8bd6']}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={styles.doneBadge}
              >
                <Svg width={52} height={52} viewBox="0 0 24 24" fill="none" stroke="#1a1228" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
                  <Polyline points="20 6 9 17 4 12" />
                </Svg>
              </LinearGradient>
            </View>
          </SpringIn>
          <SpringIn delay={60} style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 28, color: t.text1, fontFamily: weight(800), letterSpacing: -0.84 }}>
              You’re all set
            </Text>
            <Text style={[styles.doneSubWrap, { color: t.text2 }]}>
              Riddhi is tuned to your money. Here’s what we set up:
            </Text>
          </SpringIn>
        </View>

        <SpringIn delay={120} style={{ marginTop: 26, gap: 10 }}>
          {summary.map((s) => (
            <View key={s.l} style={[styles.sumRow, { backgroundColor: t.glassBg, borderColor: t.glassBrd }]}>
              <View style={[styles.sumIcon, { backgroundColor: t.emDim }]}>
                <Text style={{ fontSize: 16, color: t.em }}>{s.i}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 11, color: t.text3, fontFamily: weight(600), letterSpacing: 0.66 }}>
                  {s.l.toUpperCase()}
                </Text>
                <Text style={{ fontSize: 14, color: t.text1, fontFamily: weight(700), marginTop: 2 }}>{s.v}</Text>
              </View>
            </View>
          ))}
        </SpringIn>

        <View style={{ marginTop: 'auto', paddingTop: 28, paddingBottom: 20 }}>
          <Btn onPress={onEnter} disabled={entering} style={{ height: 54 }}>
            <Text style={{ fontSize: 16, color: '#1a1228', fontFamily: weight(600) }}>
              {entering ? 'Setting up…' : 'Enter Riddhi'}
            </Text>
          </Btn>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  doneGlow: { position: 'absolute', top: -24, left: -24 },
  doneBadge: {
    width: 104,
    height: 104,
    borderRadius: radius.xl2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(139,108,240,0.4)',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 1,
    shadowRadius: 40,
    elevation: 12,
  },
  doneSubWrap: {
    fontSize: 14.5,
    marginTop: 10,
    lineHeight: 21.75,
    maxWidth: 280,
    textAlign: 'center',
    fontFamily: weight(500),
  },
  sumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 13,
    paddingHorizontal: 15,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  sumIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
