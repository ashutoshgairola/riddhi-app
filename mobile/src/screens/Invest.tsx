/**
 * Invest — RN port of `project/riddhi/MobileSecondary.jsx` (the
 * `MobileInvest` component, lines 171–235), including its local data
 * constant `MV_HOLDINGS` (lines 163–169).
 *
 * Building blocks reused rather than reimplemented:
 *  - `PageBackground` for the `.m-page` gradient + glow.
 *  - `Topbar` for the `.m-topbar` title + plus icon button.
 *  - `IconButton` for the plus button.
 *  - `GlassCard` (`.m-card`) as the portfolio hero card's outer shell —
 *    its own `LinearGradient`/border overrides the card's default glass
 *    tint per the source's bespoke gradient (MobileSecondary.jsx:190–194).
 *  - `SectionHead` (`.m-section-head`) for the "Holdings" section label.
 *  - `ListCard`/`ListRow` (`.m-list-card`/`.m-list-row`) for the holdings
 *    list.
 *  - `MSparkline` (src/components/charts.tsx) for the portfolio sparkline
 *    (MobileSecondary.jsx:202–204).
 *  - `useCountUp` for the animated portfolio total (MobileSecondary.jsx:174).
 *
 * Source values transcribed verbatim:
 *  - `MV_HOLDINGS` — MobileSecondary.jsx:163–169.
 *  - Portfolio hero gradient `linear-gradient(135deg, #241a4a 0%, #18122e
 *    60%, #0e0b15 100%)` + border `1px solid rgba(182,164,243,0.2)` —
 *    MobileSecondary.jsx:192–193.
 *  - `dummyChart` data + sparkline color `#7faf93` / height 56 —
 *    MobileSecondary.jsx:175, 203.
 *  - Gain chip "↑ ₹38,200 (12.4%)" (hardcoded in source, not derived) —
 *    MobileSecondary.jsx:199–201.
 *  - `₹{(totalCount/100000).toFixed(2)}L` total formatting —
 *    MobileSecondary.jsx:197.
 *  - Holdings row: 2-char symbol initials box, name/sym, ₹val, return %
 *    with ↑/↓ + em/red color — MobileSecondary.jsx:213–229.
 */
import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { MSparkline } from '../components/charts';
import { IconButton, ListCard, ListRow, SectionHead, Topbar } from '../components/ui';
import { MI } from '../components/icons';
import { PageBackground } from '../components/PageBackground';
import { SpringIn } from '../components/SpringIn';
import { useTheme } from '../theme/ThemeProvider';
import { radius, weight } from '../theme/tokens';
import { useFeedback } from '../feedback/FeedbackProvider';
import type { ScreenEntry } from '../app/navContext';
import { useCountUp } from '../hooks/useCountUp';
import { api } from '../api';
import { useApiData } from '../api/useApi';

// ── Data (MobileSecondary.jsx:163–169) ───────────────────────────────
interface Holding {
  name: string;
  sym: string;
  val: number;
  ret: number;
  color: string;
}

const MV_HOLDINGS: Holding[] = [
  { name: 'Nifty 50 ETF', sym: 'NIFTYBEES', val: 145000, ret: 12.8, color: '#7faf93' },
  { name: 'HDFC Bank', sym: 'HDFCBANK', val: 62000, ret: 7.4, color: '#8197c4' },
  { name: 'Tata Motors', sym: 'TATAMOTORS', val: 38000, ret: -3.2, color: '#c97d8c' },
  { name: 'Reliance', sym: 'RELIANCE', val: 48000, ret: 9.1, color: '#9d8bd6' },
  { name: 'Gold ETF', sym: 'GOLDBEES', val: 25000, ret: 5.6, color: '#c9a86a' },
];

// MobileSecondary.jsx:175
const DUMMY_CHART = [82, 85, 84, 88, 91, 89, 93, 98, 95, 102, 108, 112, 118];

export function Invest({ entry: _entry }: { entry: ScreenEntry }) {
  const { t } = useTheme();
  const { toast, sheet } = useFeedback();
  const [scrolled, setScrolled] = useState(false);

  const { data: holdings } = useApiData(() => api.investments.list(), MV_HOLDINGS);

  const total = holdings.reduce((s, h) => s + h.val, 0);
  const totalCount = useCountUp(total, 1200);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrolled(e.nativeEvent.contentOffset.y > 8);
  };

  const openAddHoldingSheet = () => {
    sheet({
      title: 'Add holding',
      options: [
        { label: 'Stocks / ETF', icon: '📈', onPress: () => toast('Holding added', '📈') },
        { label: 'Mutual fund', icon: '🏦', onPress: () => toast('Holding added', '📈') },
        { label: 'Crypto', icon: '🪙', onPress: () => toast('Holding added', '📈') },
      ],
    });
  };

  return (
    <View style={styles.page}>
      <PageBackground />

      <Topbar
        title="Investments"
        scrolled={scrolled}
        right={
          <IconButton onPress={openAddHoldingSheet}>
            <MI.plus size={20} color={t.text1} />
          </IconButton>
        }
      />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {/* Portfolio hero (MobileSecondary.jsx:189–205) */}
        <SpringIn style={styles.heroCard}>
          <LinearGradient
            colors={['#241a4a', '#18122e', '#0e0b15']}
            locations={[0, 0.6, 1]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.75, y: 1 }}
            style={[styles.heroGradient, { borderColor: 'rgba(182,164,243,0.2)' }]}
          >
            <Text style={styles.heroLabel}>Portfolio Value</Text>
            <Text style={styles.heroValue}>₹{(totalCount / 100000).toFixed(2)}L</Text>
            <View style={styles.gainChip}>
              <Text style={styles.gainChipText}>↑ ₹38,200 (12.4%)</Text>
            </View>
            <View style={styles.sparklineWrap}>
              <MSparkline data={DUMMY_CHART} color="#7faf93" height={56} />
            </View>
          </LinearGradient>
        </SpringIn>

        {/* Holdings (MobileSecondary.jsx:207–230) */}
        <View style={styles.sectionWrap}>
          <SectionHead title="Holdings" link={String(holdings.length)} />
        </View>
        <ListCard>
          {holdings.map((h, i) => (
            // animationDelay: `${0.05 + i*0.04}s` (MobileSecondary.jsx:214)
            <SpringIn key={h.sym} delay={50 + i * 40}>
              <ListRow last={i === holdings.length - 1}>
                <View style={[styles.symBox, { backgroundColor: h.color + '22' }]}>
                  <Text style={[styles.symBoxText, { color: h.color, fontFamily: weight(700) }]}>
                    {h.sym.slice(0, 2)}
                  </Text>
                </View>
                <View style={styles.holdingTextBlock}>
                  <Text style={[styles.holdingName, { color: t.text1, fontFamily: weight(600) }]}>
                    {h.name}
                  </Text>
                  <Text style={[styles.holdingSym, { color: t.text3 }]}>{h.sym}</Text>
                </View>
                <View style={styles.holdingRight}>
                  <Text style={[styles.holdingVal, { color: t.text1, fontFamily: weight(700) }]}>
                    ₹{h.val.toLocaleString('en-IN')}
                  </Text>
                  <Text
                    style={[
                      styles.holdingRet,
                      { color: h.ret >= 0 ? t.em : t.red, fontFamily: weight(600) },
                    ]}
                  >
                    {h.ret >= 0 ? '↑' : '↓'} {Math.abs(h.ret)}%
                  </Text>
                </View>
              </ListRow>
            </SpringIn>
          ))}
        </ListCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 4,
    paddingHorizontal: 18,
    paddingBottom: 24,
  },

  // Portfolio hero
  heroCard: {
    marginTop: 8,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  heroGradient: {
    padding: 20,
    borderWidth: 1,
    borderRadius: radius.xl,
  },
  heroLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase',
    letterSpacing: 1.1, // 0.1em of 11px
    fontFamily: weight(600),
  },
  heroValue: {
    fontSize: 32,
    color: '#fff',
    marginTop: 6,
    letterSpacing: -0.96, // -0.03em of 32px
    fontFamily: weight(700),
  },
  gainChip: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 99,
    backgroundColor: 'rgba(182,164,243,0.18)',
  },
  gainChipText: {
    fontSize: 12,
    color: '#b6a4f3',
    fontFamily: weight(600),
  },
  sparklineWrap: {
    marginTop: 12,
    marginHorizontal: -8,
  },

  // Holdings
  sectionWrap: {
    marginTop: 22,
  },
  symBox: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  symBoxText: {
    fontSize: 14,
  },
  holdingTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  holdingName: {
    fontSize: 14,
  },
  holdingSym: {
    fontSize: 11,
    marginTop: 2,
  },
  holdingRight: {
    alignItems: 'flex-end',
  },
  holdingVal: {
    fontSize: 14,
  },
  holdingRet: {
    fontSize: 11.5,
    marginTop: 2,
  },
});
