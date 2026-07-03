/**
 * Goals — RN port of `project/riddhi/MobileSecondary.jsx` (the
 * `MobileGoals` component, lines 108–161), including its local data
 * constant `MG_GOALS` (lines 101–106).
 *
 * Building blocks reused rather than reimplemented:
 *  - `PageBackground` for the `.m-page` gradient + glow.
 *  - `Topbar` for the `.m-topbar` title + plus icon button.
 *  - `IconButton` for the plus button.
 *  - `GlassCard` (`.m-card`) for each goal card.
 *  - `ProgressBar` (`.m-pbar`/`.m-pfill`, height 8) for each goal's fill.
 *  - `useFeedback().sheet`/`.toast` for the "+" action sheet
 *    (MobileSecondary.jsx:115–118).
 *
 * Source values transcribed verbatim:
 *  - `MG_GOALS` — MobileSecondary.jsx:101–106.
 *  - "4 active goals · ₹4.05L saved" subtitle — MobileSecondary.jsx:123
 *    (a hardcoded string in source, not derived from `MG_GOALS`).
 *  - Per-goal pct math — MobileSecondary.jsx:127.
 *  - Top accent bar (`g.color`, height 3) — MobileSecondary.jsx:133.
 *  - "🗓 Target {date}" — MobileSecondary.jsx:138.
 *  - L/K current/target formatting — MobileSecondary.jsx:146–151 (current:
 *    >=100000 -> `(n/100000).toFixed(2)}L`, else `(n/1000).toFixed(0)}K`;
 *    target: >=100000 -> `.toFixed(1)}L`, else `.toFixed(0)}K` — note the
 *    differing decimal precision between current (2dp) and target (1dp),
 *    preserved exactly as in source).
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

import { GlassCard } from '../components/Glass';
import { IconButton, ProgressBar, Topbar } from '../components/ui';
import { MI } from '../components/icons';
import { PageBackground } from '../components/PageBackground';
import { SpringIn } from '../components/SpringIn';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { useFeedback } from '../feedback/FeedbackProvider';
import type { ScreenEntry } from '../app/navContext';
import { api } from '../api';
import { useApiData } from '../api/useApi';

// ── Data (MobileSecondary.jsx:101–106) ───────────────────────────────
interface Goal {
  name: string;
  emoji: string;
  color: string;
  current: number;
  target: number;
  date: string;
}

const MG_GOALS: Goal[] = [
  { name: 'Emergency Fund', emoji: '🐖', color: '#7faf93', current: 185000, target: 300000, date: 'Dec 2026' },
  { name: 'Goa Trip', emoji: '✈️', color: '#6fb3ad', current: 32000, target: 50000, date: 'Jun 2026' },
  { name: 'MacBook Pro', emoji: '💻', color: '#9d8bd6', current: 68000, target: 200000, date: 'Mar 2027' },
  { name: 'House Down Pay', emoji: '🏡', color: '#c9a86a', current: 120000, target: 1500000, date: 'Dec 2028' },
];

// Current/target formatting (MobileSecondary.jsx:146–151) — note the
// differing decimal precision between current (2dp) and target (1dp).
function fmtCurrent(n: number): string {
  return n >= 100000 ? `${(n / 100000).toFixed(2)}L` : `${(n / 1000).toFixed(0)}K`;
}

function fmtTarget(n: number): string {
  return n >= 100000 ? `${(n / 100000).toFixed(1)}L` : `${(n / 1000).toFixed(0)}K`;
}

export function Goals({ entry: _entry }: { entry: ScreenEntry }) {
  const { t } = useTheme();
  const { toast, sheet } = useFeedback();
  const [scrolled, setScrolled] = useState(false);

  const { data: goals } = useApiData(() => api.goals.list(), MG_GOALS);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrolled(e.nativeEvent.contentOffset.y > 8);
  };

  const openNewGoalSheet = () => {
    sheet({
      title: 'New goal',
      options: [
        { label: 'Savings goal', icon: '🎯', onPress: () => toast('Goal created', '🎯') },
        { label: 'Debt payoff', icon: '💳', onPress: () => toast('Goal created', '🎯') },
      ],
    });
  };

  return (
    <View style={styles.page}>
      <PageBackground />

      <Topbar
        title="Goals"
        scrolled={scrolled}
        right={
          <IconButton onPress={openNewGoalSheet}>
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
        <SpringIn>
          <Text style={[styles.subtitle, { color: t.text2 }]}>4 active goals · ₹4.05L saved</Text>
        </SpringIn>

        <View style={styles.goalList}>
          {goals.map((g, i) => {
            const pct = Math.round((g.current / g.target) * 100);
            return (
              // animationDelay: `${0.05 + i*0.05}s` (MobileSecondary.jsx:130)
              <SpringIn key={g.name} delay={50 + i * 50}>
                <GlassCard style={styles.goalCard}>
                  <View style={[styles.accentBar, { backgroundColor: g.color }]} />
                  <View style={styles.goalHeaderRow}>
                    <View style={[styles.goalIconBox, { backgroundColor: g.color + '22' }]}>
                      <Text style={styles.goalIconGlyph}>{g.emoji}</Text>
                    </View>
                    <View style={styles.goalTextBlock}>
                      <Text style={[styles.goalName, { color: t.text1, fontFamily: weight(700) }]}>
                        {g.name}
                      </Text>
                      <Text style={[styles.goalTarget, { color: t.text3 }]}>🗓 Target {g.date}</Text>
                    </View>
                    <Text style={[styles.goalPct, { color: g.color, fontFamily: weight(700) }]}>
                      {pct}%
                    </Text>
                  </View>
                  <ProgressBar pct={pct} color={g.color} height={8} />
                  <View style={styles.goalAmountRow}>
                    <Text style={[styles.goalCurrent, { color: t.text1, fontFamily: weight(700) }]}>
                      ₹{fmtCurrent(g.current)}
                    </Text>
                    <Text style={[styles.goalTargetAmount, { color: t.text3 }]}>
                      of ₹{fmtTarget(g.target)}
                    </Text>
                  </View>
                </GlassCard>
              </SpringIn>
            );
          })}
        </View>
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
  subtitle: {
    fontSize: 13,
    marginTop: 8,
    marginBottom: 14,
  },
  goalList: {
    flexDirection: 'column',
    gap: 14,
  },
  goalCard: {
    padding: 18,
    position: 'relative',
    overflow: 'hidden',
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  goalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  goalIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalIconGlyph: {
    fontSize: 22,
  },
  goalTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  goalName: {
    fontSize: 16,
  },
  goalTarget: {
    fontSize: 12,
    marginTop: 2,
  },
  goalPct: {
    fontSize: 18,
  },
  goalAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 10,
  },
  goalCurrent: {
    fontSize: 18,
  },
  goalTargetAmount: {
    fontSize: 12,
  },
});
