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

import { AppIcon, AppIconBox } from '../components/contentIcons';
import { GlassView } from '../components/Glass';
import { IconButton, ProgressBar, SearchButton, Topbar, TopbarActions } from '../components/ui';
import { MI } from '../components/icons';
import { PageBackground } from '../components/PageBackground';
import { SpringIn } from '../components/SpringIn';
import { useTheme } from '../theme/ThemeProvider';
import { radius, weight } from '../theme/tokens';
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

// Renders empty while the api loads (or is unreachable) — no mock data.
const EMPTY_GOALS: Goal[] = [];

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
  const { toast, sheet, form } = useFeedback();
  const [scrolled, setScrolled] = useState(false);

  const { data: goals } = useApiData(() => api.goals.list(), EMPTY_GOALS);

  const totalSaved = goals.reduce((s, g) => s + g.current, 0);
  const subtitle = `${goals.length} active goal${goals.length === 1 ? '' : 's'} · ₹${fmtCurrent(totalSaved)} saved`;

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrolled(e.nativeEvent.contentOffset.y > 8);
  };

  const newGoal = (type: 'savings' | 'debt') => {
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    form({
      title: type === 'debt' ? 'New debt payoff goal' : 'New savings goal',
      fields: [
        { key: 'name', label: 'Goal name', placeholder: type === 'debt' ? 'Credit card payoff' : 'Emergency fund' },
        { kind: 'amount', key: 'target', label: 'Target amount (₹)' },
        { kind: 'amount', key: 'current', label: 'Saved so far (₹)', optional: true },
        {
          kind: 'date',
          key: 'targetDate',
          label: 'Target date',
          initial: nextYear.toISOString().slice(0, 10),
        },
      ],
      submitLabel: 'Create goal',
      onSubmit: async (v) => {
        await api.goals.create({
          name: v['name']!,
          type,
          target: Number(v['target']),
          current: v['current'] ? Number(v['current']) : 0,
          targetDate: v['targetDate']!,
        });
        toast(`Goal created: ${v['name']}`, '🎯');
      },
    });
  };

  const openNewGoalSheet = () => {
    sheet({
      title: 'New goal',
      options: [
        { label: 'Savings goal', icon: '🎯', onPress: () => newGoal('savings') },
        { label: 'Debt payoff', icon: '💳', onPress: () => newGoal('debt') },
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
          <TopbarActions>
            <SearchButton />
            <IconButton onPress={openNewGoalSheet}>
              <MI.plus size={20} color={t.text1} />
            </IconButton>
          </TopbarActions>
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
          <Text style={[styles.subtitle, { color: t.text2 }]}>{subtitle}</Text>
        </SpringIn>

        <View style={styles.goalList}>
          {goals.map((g, i) => {
            const pct = Math.round((g.current / g.target) * 100);
            return (
              // animationDelay: `${0.05 + i*0.05}s` (MobileSecondary.jsx:130)
              <SpringIn key={g.name} delay={50 + i * 50}>
                {/* GlassView (not GlassCard) so the accent bar can sit flush
                    at the card's top edge: Yoga offsets absolutely-positioned
                    children by the parent's padding, so inside GlassCard's
                    18px-padded overlay the bar would float 18px down/in. The
                    18px card padding moves to an inner wrapper instead. */}
                <GlassView style={styles.goalCard} intensity={40} radius={radius.xl} padding={0}>
                  <View style={[styles.accentBar, { backgroundColor: g.color }]} />
                  <View style={styles.goalCardBody}>
                  <View style={styles.goalHeaderRow}>
                    <AppIconBox value={g.emoji} color={g.color} size={48} iconSize={22} />
                    <View style={styles.goalTextBlock}>
                      <Text style={[styles.goalName, { color: t.text1, fontFamily: weight(700) }]}>
                        {g.name}
                      </Text>
                      <View style={styles.goalTargetRow}>
                        <AppIcon value="calendar2" size={16} color={t.text3} />
                        <Text style={[styles.goalTarget, { color: t.text3 }]}>Target {g.date}</Text>
                      </View>
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
                  </View>
                </GlassView>
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
    position: 'relative',
    overflow: 'hidden',
  },
  // `.m-card`'s 18px padding, on an inner wrapper so `accentBar` (an
  // absolute sibling) stays flush with the card edge.
  goalCardBody: {
    padding: 18,
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
  goalTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  goalName: {
    fontSize: 16,
  },
  goalTargetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  goalTarget: {
    fontSize: 12,
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
