/**
 * Home — RN port of `project/riddhi/MobileHome.jsx` (the `MobileHome`
 * component, lines 61–175), including its local data constants `MH_WEEK`
 * (lines 3–6) and `MH_RECENT` (lines 8–13).
 *
 * Building blocks reused rather than reimplemented:
 *  - `PageBackground` for the `.m-page` gradient + glow.
 *  - `GlassView` (via the manually-composed topbar/hero/banner/card
 *    surfaces below) for the `.m-topbar.scrolled` / `.m-card-like` glass
 *    treatment — `Topbar`'s `left/title/right` 3-slot shape doesn't fit
 *    the source's 4-item `gap:12` row (avatar, flex-growing 2-line
 *    greeting, search button, bell button) without an extra unwanted
 *    spacer, so the row is composed directly here using the same
 *    `GlassView` primitive `Topbar` uses internally for its scrolled
 *    background — no glass/blur logic is duplicated.
 *  - `IconButton` for search/bell.
 *  - `WeekChart` (src/components/charts.tsx) — already ports this
 *    screen's `WeekChart`/`smoothPath` verbatim; not re-ported here.
 *  - `useCountUp` for the animated daily-spend figure.
 *  - `PullToRefresh` for the pull-to-refresh scroll body (extended with a
 *    new optional `onScroll` passthrough prop so this screen can mirror
 *    the source's `onScroll={e => setScrolled(e.target.scrollTop > 8)}`
 *    — see src/components/PullToRefresh.tsx).
 *
 * Source values transcribed verbatim:
 *  - `MH_WEEK` / `MH_RECENT` data — MobileHome.jsx:3–13.
 *  - `BUDGET`/`SPENT`/`DAYS_LEFT` constants + derived `LEFT`/`DAILY`/
 *    `pctUsed` — MobileHome.jsx:64–73.
 *  - Hero card gradient/border/blur/shadow — MobileHome.jsx:98–125.
 *  - `fmt`/`fmtK` formatters — MobileHome.jsx:70–71.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient as SvgRadialGradient, Stop, Circle } from 'react-native-svg';

import { GlassView } from '../components/Glass';
import { IconButton } from '../components/ui';
import { MI } from '../components/icons';
import { PageBackground } from '../components/PageBackground';
import { PullToRefresh } from '../components/PullToRefresh';
import { WeekChart } from '../components/charts';
import { useCountUp } from '../hooks/useCountUp';
import { useTheme } from '../theme/ThemeProvider';
import { radius, weight } from '../theme/tokens';
import { useNav, type ScreenEntry } from '../app/navContext';
import { api } from '../api';
import { useApiData } from '../api/useApi';

// ── Data (MobileHome.jsx:3–13) ───────────────────────────────────────
const MH_WEEK = [
  { d: 'Mon', v: 1200 },
  { d: 'Tue', v: 3400 },
  { d: 'Wed', v: 800 },
  { d: 'Thu', v: 2600 },
  { d: 'Fri', v: 1500 },
  { d: 'Sat', v: 4200 },
  { d: 'Sun', v: 1800 },
];

interface RecentTx {
  icon: string;
  desc: string;
  cat: string;
  date: string;
  amt: number;
  type: 'exp' | 'inc';
}

const MH_RECENT: RecentTx[] = [
  { icon: '🛒', desc: 'Swiggy Order', cat: 'Food', date: 'Today', amt: -649, type: 'exp' },
  { icon: '💼', desc: 'Salary — April', cat: 'Income', date: 'Today', amt: 118000, type: 'inc' },
  { icon: '⚡', desc: 'BESCOM Bill', cat: 'Utilities', date: 'Yesterday', amt: -1840, type: 'exp' },
  { icon: '🚇', desc: 'Metro Card', cat: 'Transport', date: 'Apr 23', amt: -500, type: 'exp' },
];

// ── Budget constants (MobileHome.jsx:64–73) ──────────────────────────
const BUDGET = 100000;
const SPENT = 91000;
const LEFT = BUDGET - SPENT;
const DAYS_LEFT = 5;
const DAILY = Math.round(LEFT / DAYS_LEFT);
const PCT_USED = SPENT / BUDGET;

function fmt(n: number): string {
  return '₹' + Math.abs(n).toLocaleString('en-IN');
}

function fmtK(n: number): string {
  return n >= 100000 ? `₹${(n / 100000).toFixed(2)}L` : `₹${Math.round(n / 1000)}K`;
}

const PEAK_IDX = MH_WEEK.reduce((mi, d, i, a) => (d.v > a[mi].v ? i : mi), 0);
const WEEK_TOTAL = MH_WEEK.reduce((s, d) => s + d.v, 0);

// ── Section label (MobileHome.jsx Label, lines 75–80) ────────────────
function Label({
  children,
  action,
  onAction,
}: {
  children: string;
  action?: string;
  onAction?: () => void;
}) {
  const { t } = useTheme();
  return (
    <View style={styles.labelRow}>
      <Text style={[styles.labelText, { color: t.text1, fontFamily: weight(700) }]}>{children}</Text>
      {action ? (
        <Text
          onPress={onAction}
          style={[styles.labelAction, { color: t.text2, fontFamily: weight(600) }]}
        >
          {action}
        </Text>
      ) : null}
    </View>
  );
}

export function Home({ entry: _entry }: { entry: ScreenEntry }) {
  const { t, mode } = useTheme();
  const { nav, setProfileOpen } = useNav();
  const [scrolled, setScrolled] = useState(false);

  const { data: recentTx } = useApiData(() => api.transactions.recent(), MH_RECENT);

  const dailyCount = useCountUp(DAILY, 1100);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrolled(e.nativeEvent.contentOffset.y > 8);
  };

  return (
    <View style={styles.page}>
      <PageBackground />

      {/* ── Topbar (MobileHome.jsx:84–92) ── */}
      {scrolled ? (
        <GlassView
          style={[styles.topbar, styles.topbarScrolled, { borderBottomColor: t.topbarScrolledBorder }]}
          radius={0}
          padding={0}
        >
          <TopbarContent onProfile={() => setProfileOpen(true)} onSearch={() => nav('search')} onNotif={() => nav('notifs')} />
        </GlassView>
      ) : (
        <View style={styles.topbar}>
          <TopbarContent onProfile={() => setProfileOpen(true)} onSearch={() => nav('search')} onNotif={() => nav('notifs')} />
        </View>
      )}

      <PullToRefresh onRefresh={() => {}} onScroll={handleScroll} contentStyle={styles.scrollContent}>
        {/* ── Signature hero card (MobileHome.jsx:98–125) ── */}
        <View style={[styles.hero, { borderColor: t.glassBrd2 }]}>
          <BlurView intensity={30} tint={mode === 'light' ? 'light' : 'dark'} style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={['rgba(155,130,238,0.26)', 'rgba(98,80,168,0.17)', 'rgba(60,50,95,0.13)']}
            locations={[0, 0.55, 1]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.75, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* glow blob: top:-70 right:-50 w:220 h:220 radial-gradient(circle, rgba(182,164,243,0.4), transparent 70%) */}
          <Svg
            style={[StyleSheet.absoluteFill, styles.heroGlowSvg]}
            width={220}
            height={220}
            pointerEvents="none"
          >
            <Defs>
              <SvgRadialGradient id="heroGlow" cx="50%" cy="50%" r="50%" gradientUnits="objectBoundingBox">
                <Stop offset="0%" stopColor="rgba(182,164,243,0.4)" stopOpacity={1} />
                <Stop offset="70%" stopColor="rgba(182,164,243,0)" stopOpacity={0} />
                <Stop offset="100%" stopColor="rgba(182,164,243,0)" stopOpacity={0} />
              </SvgRadialGradient>
            </Defs>
            <Circle cx={110} cy={110} r={110} fill="url(#heroGlow)" />
          </Svg>
          <View style={[styles.heroHiLight, { backgroundColor: t.glassHi.slice(t.glassHi.lastIndexOf(' ') + 1) }]} pointerEvents="none" />

          <View style={styles.heroContent}>
            <View style={styles.heroTopRow}>
              <Text style={[styles.heroLabel, { color: t.text2, fontFamily: weight(600) }]}>
                Safe to spend today
              </Text>
              <View style={[styles.daysChip, { backgroundColor: t.glassBg2, borderColor: t.glassBrd }]}>
                <Text style={[styles.daysChipText, { color: t.text1, fontFamily: weight(700) }]}>
                  {DAYS_LEFT} days left
                </Text>
              </View>
            </View>

            <View style={styles.amountRow}>
              <Text style={[styles.amountRupee, { color: t.text2, fontFamily: weight(700) }]}>₹</Text>
              <Text style={[styles.amountValue, { color: t.text1, fontFamily: weight(800) }]}>
                {Math.abs(dailyCount).toLocaleString('en-IN')}
              </Text>
            </View>

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${PCT_USED * 100}%` }]}>
                <LinearGradient
                  colors={[t.em, '#c8b8f7']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
              </View>
            </View>
            <View style={styles.progressLabelsRow}>
              <Text style={[styles.progressLeft, { color: t.text1, fontFamily: weight(700) }]}>
                {fmt(LEFT)} left
              </Text>
              <Text style={[styles.progressSpent, { color: t.text2, fontFamily: weight(600) }]}>
                {fmtK(SPENT)} of {fmtK(BUDGET)}
              </Text>
            </View>
          </View>
        </View>

        {/* ── SMS auto-sync banner (MobileHome.jsx:128–141) ── */}
        <GlassView style={styles.syncBanner} padding={0} radius={radius.lg}>
          <SyncBannerInner onPress={() => nav('sync')} />
        </GlassView>

        {/* ── This week spending (MobileHome.jsx:144–151) ── */}
        <Label action="Stats →" onAction={() => nav('reports')}>
          This week
        </Label>
        <GlassView style={styles.weekCard} padding={0} radius={radius.xl}>
          <View style={styles.weekCardInner}>
            <View style={styles.weekHeaderRow}>
              <Text style={[styles.weekHeaderLabel, { color: t.text3, fontFamily: weight(500) }]}>
                Spent this week
              </Text>
              <Text style={[styles.weekHeaderValue, { color: t.text1, fontFamily: weight(800) }]}>
                {fmt(WEEK_TOTAL)}
              </Text>
            </View>
            <WeekChart data={MH_WEEK} peakIdx={PEAK_IDX} />
          </View>
        </GlassView>

        {/* ── Recent (MobileHome.jsx:154–168) ── */}
        <Label action="See all →" onAction={() => nav('txns')}>
          Recent
        </Label>
        <View style={styles.recentList}>
          {recentTx.map((tx, i) => (
            <RecentRow key={i} tx={tx} onPress={() => nav('txns')} />
          ))}
        </View>

        <View style={{ height: 24 }} />
      </PullToRefresh>
    </View>
  );
}

function TopbarContent({
  onProfile,
  onSearch,
  onNotif,
}: {
  onProfile: () => void;
  onSearch: () => void;
  onNotif: () => void;
}) {
  const { t } = useTheme();
  return (
    <View style={styles.topbarRow}>
      <Pressable onPress={onProfile} style={styles.avatarPressTarget}>
        <LinearGradient colors={[t.em, '#8b5cf6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
          <Text style={styles.avatarLabel}>RD</Text>
        </LinearGradient>
      </Pressable>
      <View style={styles.greetingBlock}>
        <Text style={[styles.greetingLine, { color: t.text2, fontFamily: weight(500) }]}>Good morning</Text>
        <Text style={[styles.greetingName, { color: t.text1, fontFamily: weight(700) }]}>Riddhi Desai</Text>
      </View>
      <IconButton onPress={onSearch}>
        <MI.search size={20} color={t.text1} />
      </IconButton>
      <IconButton onPress={onNotif} dot>
        <MI.bell size={20} color={t.text1} />
      </IconButton>
    </View>
  );
}

function SyncBannerInner({ onPress }: { onPress: () => void }) {
  const { t } = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.syncBannerTouchable}>
      <View style={styles.syncBannerContent}>
        <View style={[styles.syncIconWrap, { backgroundColor: t.emDim }]}>
          <MI.sms size={19} color={t.em} />
        </View>
        <View style={styles.syncTextBlock}>
          <Text style={[styles.syncTitle, { color: t.text1, fontFamily: weight(700) }]}>
            4 transactions from SMS
          </Text>
          <Text style={[styles.syncSubtitle, { color: t.text3, fontFamily: weight(500) }]}>
            Detected from bank messages
          </Text>
        </View>
        <Text style={[styles.syncReview, { color: t.em, fontFamily: weight(700) }]}>Review</Text>
      </View>
    </Pressable>
  );
}

function RecentRow({ tx, onPress }: { tx: RecentTx; onPress: () => void }) {
  const { t } = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.recentRowTouchable}>
      <View style={[styles.recentRow, { backgroundColor: t.glassBg, borderColor: t.glassBrd }]}>
        <View style={[styles.recentIconWrap, { backgroundColor: t.bg3 }]}>
          <Text style={styles.recentIconGlyph}>{tx.icon}</Text>
        </View>
        <View style={styles.recentTextBlock}>
          <Text style={[styles.recentDesc, { color: t.text1, fontFamily: weight(700) }]} numberOfLines={1}>
            {tx.desc}
          </Text>
          <Text style={[styles.recentMeta, { color: t.text3, fontFamily: weight(500) }]}>
            {tx.cat} · {tx.date}
          </Text>
        </View>
        <Text
          style={[
            styles.recentAmt,
            { color: tx.type === 'inc' ? t.em : t.text1, fontFamily: weight(800) },
          ]}
        >
          {tx.amt > 0 ? '+' : '−'}
          {fmt(tx.amt)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },

  // Topbar
  topbar: {
    position: 'relative',
    paddingTop: 14,
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  topbarScrolled: {
    borderBottomWidth: 1,
  },
  topbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarPressTarget: {
    flexShrink: 0,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLabel: {
    fontFamily: weight(800),
    color: '#1a1228',
    fontSize: 15,
  },
  greetingBlock: {
    flex: 1,
    minWidth: 0,
  },
  greetingLine: {
    fontSize: 12,
  },
  greetingName: {
    fontSize: 16,
    letterSpacing: -0.16,
    marginTop: 1,
  },

  // Scroll content
  scrollContent: {
    paddingTop: 8,
    paddingHorizontal: 18,
    paddingBottom: 28,
  },

  // Hero card
  hero: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 30,
    paddingTop: 22,
    paddingHorizontal: 22,
    paddingBottom: 20,
    borderWidth: 1,
  },
  heroGlowSvg: {
    top: -70,
    right: -50,
    left: undefined,
    bottom: undefined,
    width: 220,
    height: 220,
  },
  heroHiLight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  heroContent: {
    position: 'relative',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroLabel: {
    fontSize: 13.5,
  },
  daysChip: {
    fontSize: 11,
    paddingVertical: 4,
    paddingHorizontal: 11,
    borderRadius: 99,
    borderWidth: 1,
  },
  daysChipText: {
    fontSize: 11,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    marginTop: 10,
  },
  amountRupee: {
    fontSize: 26,
    letterSpacing: -0.52,
  },
  amountValue: {
    fontSize: 54,
    letterSpacing: -1.89,
    lineHeight: 49,
  },
  progressTrack: {
    marginTop: 20,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 99,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 99,
    overflow: 'hidden',
  },
  progressLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  progressLeft: {
    fontSize: 12.5,
  },
  progressSpent: {
    fontSize: 12.5,
  },

  // SMS sync banner
  syncBanner: {
    marginTop: 14,
  },
  syncBannerTouchable: {
    width: '100%',
  },
  syncBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  syncIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  syncTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  syncTitle: {
    fontSize: 14,
  },
  syncSubtitle: {
    fontSize: 11.5,
    marginTop: 2,
  },
  syncReview: {
    fontSize: 12.5,
    flexShrink: 0,
  },

  // Labels
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 28,
    marginHorizontal: 4,
    marginBottom: 14,
  },
  labelText: {
    fontSize: 16,
    letterSpacing: -0.16,
  },
  labelAction: {
    fontSize: 13,
  },

  // Week card
  weekCard: {},
  weekCardInner: {
    paddingTop: 18,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  weekHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  weekHeaderLabel: {
    fontSize: 13,
  },
  weekHeaderValue: {
    fontSize: 18,
    letterSpacing: -0.36,
    marginLeft: 'auto',
  },

  // Recent
  recentList: {
    gap: 8,
  },
  recentRowTouchable: {
    width: '100%',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  recentIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  recentIconGlyph: {
    fontSize: 19,
  },
  recentTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  recentDesc: {
    fontSize: 14.5,
  },
  recentMeta: {
    fontSize: 11.5,
    marginTop: 2,
  },
  recentAmt: {
    fontSize: 14.5,
    letterSpacing: -0.145,
    flexShrink: 0,
  },
});
