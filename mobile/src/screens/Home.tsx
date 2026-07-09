/**
 * Home — RN port of `project/riddhi/MobileHome.jsx` (the `MobileHome`
 * component, lines 61–175), including its local data constants `MH_WEEK`
 * (lines 3–6) and `MH_RECENT` (lines 8–13).
 *
 * Building blocks reused rather than reimplemented:
 *  - `PageBackground` for the `.m-page` gradient + glow.
 *  - The topbar row is composed directly here (avatar, flex-growing 2-line
 *    greeting, search button, bell button) — `Topbar`'s `left/title/right`
 *    3-slot shape doesn't fit the source's 4-item `gap:12` row without an
 *    extra unwanted spacer. The bar overlays the scroller (absolute, content
 *    scrolls under it) and `TopbarChrome` fades the `.m-topbar.scrolled`
 *    blur/tint/hairline in with scroll, mirroring the CSS 0.25s background
 *    transition.
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
import { useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
  Defs,
  RadialGradient as SvgRadialGradient,
  Stop,
  Circle,
} from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../auth/AuthProvider";
import { GlassView } from "../components/Glass";
import { InlineRetry } from "../components/InlineRetry";
import { IconButton } from "../components/ui";
import { MASKED_AMOUNT, usePrefs } from "../prefs/PrefsProvider";
import { MI } from "../components/icons";
import { PageBackground } from "../components/PageBackground";
import { PullToRefresh } from "../components/PullToRefresh";
import { SourceTag } from "../components/SourceTag";
import { SpringIn } from "../components/SpringIn";
import { WeekChart } from "../components/charts";
import { useCountUp } from "../hooks/useCountUp";
import { useTheme } from "../theme/ThemeProvider";
import { radius, weight } from "../theme/tokens";
import { useNav, type ScreenEntry } from "../app/navContext";
import { api } from "../api";
import { useApiData } from "../api/useApi";
import type { NotificationView, WeekDataPoint } from "../api/types";
import type { TxSource } from "../api/paymentSource";
import { AiInsightsStrip } from "./home/AiInsightsStrip";

interface RecentTx {
  icon: string;
  desc: string;
  cat: string;
  date: string;
  amt: number;
  type: "exp" | "inc";
  source?: TxSource;
}

// Empty-but-renderable fallbacks while the api loads (or is unreachable).
const EMPTY_WEEK: WeekDataPoint[] = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
].map((d) => ({ d, v: 0 }));
const EMPTY_RECENT: RecentTx[] = [];
const EMPTY_NOTIFS: NotificationView[] = [];

function fmt(n: number): string {
  return "₹" + Math.abs(n).toLocaleString("en-IN");
}

function fmtK(n: number): string {
  return n >= 100000
    ? `₹${(n / 100000).toFixed(2)}L`
    : `₹${Math.round(n / 1000)}K`;
}

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
      <Text
        style={[styles.labelText, { color: t.text1, fontFamily: weight(700) }]}
      >
        {children}
      </Text>
      {action ? (
        <Text
          onPress={onAction}
          style={[
            styles.labelAction,
            { color: t.text2, fontFamily: weight(600) },
          ]}
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
  const insets = useSafeAreaInsets();
  const { prefs } = usePrefs();
  const [scrolled, setScrolled] = useState(false);

  // Hide-balances (Settings → Privacy & Security) masks every ₹ figure here.
  const hide = prefs.hideBalances;
  const masked = (formatted: string) => (hide ? MASKED_AMOUNT : formatted);

  const {
    data: recentTx,
    error: recentTxError,
    refetch: refetchRecentTx,
  } = useApiData(() => api.transactions.recent(), EMPTY_RECENT);
  const {
    data: week,
    error: weekError,
    refetch: refetchWeek,
  } = useApiData(() => api.reports.weekSpend(), EMPTY_WEEK);
  const {
    data: summary,
    error: summaryError,
    refetch: refetchSummary,
  } = useApiData(() => api.budgets.currentSummary(), null);
  const {
    data: notifs,
    error: notifsError,
    refetch: refetchNotifs,
  } = useApiData(() => api.notifications.list(), EMPTY_NOTIFS);
  const hasUnread = notifs.some((n) => n.unread);

  // Refetch every Home query — used by both pull-to-refresh and the inline
  // retry banner below.
  const refetchAll = () => {
    refetchRecentTx();
    refetchWeek();
    refetchSummary();
    refetchNotifs();
  };

  // Only show the "couldn't load" banner when *nothing* on the screen is
  // real yet — if any query has last-good data, prefer a stale-but-real
  // screen over an error wall (fallbacks are stable module-level
  // constants/`null`, so this identity check is reliable across renders).
  const hasError = Boolean(
    recentTxError || weekError || summaryError || notifsError,
  );
  const allFallback =
    recentTx === EMPTY_RECENT &&
    week === EMPTY_WEEK &&
    summary === null &&
    notifs === EMPTY_NOTIFS;
  const showRetry = hasError && allFallback;

  // "Safe to spend today" — current budget's remainder spread over the
  // days left in its period; zeros until a budget exists.
  const budgetTotal = summary?.allocated ?? 0;
  const spent = summary?.spent ?? 0;
  const left = Math.max(0, budgetTotal - spent);
  const daysLeft = summary?.daysLeft ?? 1;
  const daily = Math.round(left / daysLeft);
  const pctUsed = budgetTotal > 0 ? Math.min(1, spent / budgetTotal) : 0;

  const weekTotal = week.reduce((s, d) => s + d.v, 0);
  const peakIdx = week.reduce((mi, d, i, a) => (d.v > a[mi]!.v ? i : mi), 0);

  const dailyCount = useCountUp(daily, 1100);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrolled(e.nativeEvent.contentOffset.y > 8);
  };

  // Deterministic bar height (safe area + 14 top pad + 44 avatar row +
  // 12 bottom pad) so the scroller can reserve the space without onLayout.
  const topbarHeight = insets.top + 14 + 44 + 12;

  return (
    <View style={styles.page}>
      <PageBackground />

      <PullToRefresh
        onRefresh={refetchAll}
        onScroll={handleScroll}
        topInset={topbarHeight}
        contentStyle={[styles.scrollContent, { paddingTop: topbarHeight + 8 }]}
      >
        {/* ── Signature hero card (MobileHome.jsx:98–125) ── */}
        <SpringIn style={[styles.hero, { borderColor: t.glassBrd2 }]}>
          <BlurView
            intensity={30}
            tint={mode === "light" ? "light" : "dark"}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={[
              "rgba(155,130,238,0.26)",
              "rgba(98,80,168,0.17)",
              "rgba(60,50,95,0.13)",
            ]}
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
              {/* Alpha must go in stopOpacity — react-native-svg does not
                  reliably honour rgba() alpha inside stopColor, which rendered
                  the blob near-solid. The extra mid stop + fade running to
                  100% (vs the CSS's hard cut at 70%) stands in for the web's
                  `filter: blur(10px)` softening. */}
              <SvgRadialGradient
                id="heroGlow"
                cx="50%"
                cy="50%"
                r="50%"
                gradientUnits="objectBoundingBox"
              >
                <Stop offset="0%" stopColor="#b6a4f3" stopOpacity={0.35} />
                <Stop offset="45%" stopColor="#b6a4f3" stopOpacity={0.16} />
                <Stop offset="100%" stopColor="#b6a4f3" stopOpacity={0} />
              </SvgRadialGradient>
            </Defs>
            <Circle cx={110} cy={110} r={110} fill="url(#heroGlow)" />
          </Svg>
          <View
            style={[
              styles.heroHiLight,
              {
                backgroundColor: t.glassHi.slice(
                  t.glassHi.lastIndexOf(" ") + 1,
                ),
              },
            ]}
            pointerEvents="none"
          />

          <View style={styles.heroContent}>
            <View style={styles.heroTopRow}>
              <Text
                style={[
                  styles.heroLabel,
                  { color: t.text2, fontFamily: weight(600) },
                ]}
              >
                Safe to spend today
              </Text>
              <View
                style={[
                  styles.daysChip,
                  { backgroundColor: t.glassBg2, borderColor: t.glassBrd },
                ]}
              >
                <Text
                  style={[
                    styles.daysChipText,
                    { color: t.text1, fontFamily: weight(700) },
                  ]}
                >
                  {daysLeft} days left
                </Text>
              </View>
            </View>

            <View style={styles.amountRow}>
              <Text
                style={[
                  styles.amountRupee,
                  { color: t.text2, fontFamily: weight(700) },
                ]}
              >
                ₹
              </Text>
              <Text
                style={[
                  styles.amountValue,
                  { color: t.text1, fontFamily: weight(800) },
                ]}
              >
                {masked(Math.abs(dailyCount).toLocaleString("en-IN"))}
              </Text>
            </View>

            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${pctUsed * 100}%` }]}
              >
                <LinearGradient
                  colors={[t.em, "#c8b8f7"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
              </View>
            </View>
            <View style={styles.progressLabelsRow}>
              <Text
                style={[
                  styles.progressLeft,
                  { color: t.text1, fontFamily: weight(700) },
                ]}
              >
                {masked(fmt(left))} left
              </Text>
              <Text
                style={[
                  styles.progressSpent,
                  { color: t.text2, fontFamily: weight(600) },
                ]}
              >
                {hide
                  ? MASKED_AMOUNT
                  : `${fmtK(spent)} of ${fmtK(budgetTotal)}`}
              </Text>
            </View>
          </View>
        </SpringIn>

        {/* ── Read-path error state (nothing real to show yet) ── */}
        {showRetry ? (
          <View style={styles.retryWrap}>
            <InlineRetry onRetry={refetchAll} />
          </View>
        ) : null}

        {/* ── SMS auto-sync banner (MobileHome.jsx:128–141, animationDelay: .03s) ── */}
        <SpringIn delay={30}>
          <GlassView style={styles.syncBanner} padding={0} radius={radius.lg}>
            <SyncBannerInner onPress={() => nav("sync")} />
          </GlassView>
        </SpringIn>

        {/* ── This week spending (MobileHome.jsx:144–151, animationDelay: .06s) ── */}
        <Label action="Stats →" onAction={() => nav("reports")}>
          This week
        </Label>
        <SpringIn delay={60}>
          <GlassView style={styles.weekCard} padding={0} radius={radius.xl}>
            <View style={styles.weekCardInner}>
              <View style={styles.weekHeaderRow}>
                <Text
                  style={[
                    styles.weekHeaderLabel,
                    { color: t.text3, fontFamily: weight(500) },
                  ]}
                >
                  Spent this week
                </Text>
                <Text
                  style={[
                    styles.weekHeaderValue,
                    { color: t.text1, fontFamily: weight(800) },
                  ]}
                >
                  {masked(fmt(weekTotal))}
                </Text>
              </View>
              <WeekChart data={week} peakIdx={peakIdx} />
            </View>
          </GlassView>
        </SpringIn>

        {/* ── AI insights (rule-based cards deep-linking into chat) ── */}
        <Label action="Ask Munshi ji →" onAction={() => nav("chat")}>
          Munshi ji's insights
        </Label>
        <SpringIn delay={80}>
          <AiInsightsStrip />
        </SpringIn>

        {/* ── Recent (MobileHome.jsx:154–168, animationDelay: .1s) ── */}
        <Label action="See all →" onAction={() => nav("txns")}>
          Recent
        </Label>
        <SpringIn delay={100} style={styles.recentList}>
          {recentTx.map((tx, i) => (
            <RecentRow
              key={i}
              tx={tx}
              hideAmount={hide}
              onPress={() => nav("txns")}
            />
          ))}
        </SpringIn>

        <View style={{ height: 24 }} />
      </PullToRefresh>

      {/* ── Topbar (MobileHome.jsx:84–92) — overlays the scroller so content
          slides under the glass; the chrome fades in with scroll, mirroring
          the CSS `transition: background .25s` on `.m-topbar.scrolled`. ── */}
      <View
        style={[styles.topbar, { paddingTop: insets.top + 14 }]}
        pointerEvents="box-none"
      >
        <TopbarChrome visible={scrolled} />
        <TopbarContent
          onProfile={() => setProfileOpen(true)}
          onSearch={() => nav("search")}
          onNotif={() => nav("notifs")}
          notifDot={hasUnread}
        />
      </View>
    </View>
  );
}

/** `.m-topbar.scrolled` glass (mobile.css:198–203): blur + darker tint +
 * bottom hairline only — not the 4-side GlassView card recipe. Fades
 * in/out so the transition matches the web's 0.25s background fade. */
function TopbarChrome({ visible }: { visible: boolean }) {
  const { t, mode } = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, { duration: 250 });
  }, [visible, progress]);

  const fade = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, fade]} pointerEvents="none">
      <BlurView
        intensity={mode === "light" ? 40 : 45}
        tint={mode === "light" ? "light" : "dark"}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: t.topbarScrolledBg },
        ]}
      />
      <View
        style={[
          styles.topbarHairline,
          { backgroundColor: t.topbarScrolledBorder },
        ]}
      />
    </Animated.View>
  );
}

function TopbarContent({
  onProfile,
  onSearch,
  onNotif,
  notifDot,
}: {
  onProfile: () => void;
  onSearch: () => void;
  onNotif: () => void;
  /** True when any notification is unread — drives the bell's red dot. */
  notifDot: boolean;
}) {
  const { t } = useTheme();
  const { user } = useAuth();
  const displayName = user?.name ?? "Riddhi Desai";
  const initials = displayName
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <View style={styles.topbarRow}>
      <Pressable onPress={onProfile} style={styles.avatarPressTarget}>
        <LinearGradient
          colors={[t.em, "#8b5cf6"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatar}
        >
          <Text style={styles.avatarLabel}>{initials}</Text>
        </LinearGradient>
      </Pressable>
      <View style={styles.greetingBlock}>
        <Text
          style={[
            styles.greetingLine,
            { color: t.text2, fontFamily: weight(500) },
          ]}
        >
          {greeting}
        </Text>
        <Text
          style={[
            styles.greetingName,
            { color: t.text1, fontFamily: weight(700) },
          ]}
        >
          {displayName}
        </Text>
      </View>
      <IconButton onPress={onSearch}>
        <MI.search size={20} color={t.text1} />
      </IconButton>
      <IconButton onPress={onNotif} dot={notifDot}>
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
          <Text
            style={[
              styles.syncTitle,
              { color: t.text1, fontFamily: weight(700) },
            ]}
          >
            SMS auto-sync
          </Text>
          <Text
            style={[
              styles.syncSubtitle,
              { color: t.text3, fontFamily: weight(500) },
            ]}
          >
            Log transactions from bank messages
          </Text>
        </View>
        <Text
          style={[styles.syncReview, { color: t.em, fontFamily: weight(700) }]}
        >
          Open
        </Text>
      </View>
    </Pressable>
  );
}

function RecentRow({
  tx,
  hideAmount = false,
  onPress,
}: {
  tx: RecentTx;
  hideAmount?: boolean;
  onPress: () => void;
}) {
  const { t } = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.recentRowTouchable}>
      <View
        style={[
          styles.recentRow,
          { backgroundColor: t.glassBg, borderColor: t.glassBrd },
        ]}
      >
        <View style={[styles.recentIconWrap, { backgroundColor: t.bg3 }]}>
          <Text style={styles.recentIconGlyph}>{tx.icon}</Text>
        </View>
        <View style={styles.recentTextBlock}>
          <Text
            style={[
              styles.recentDesc,
              { color: t.text1, fontFamily: weight(700) },
            ]}
            numberOfLines={1}
          >
            {tx.desc}
          </Text>
          <View style={styles.recentMetaRow}>
            <Text
              style={[
                styles.recentMeta,
                { color: t.text3, fontFamily: weight(500) },
              ]}
              numberOfLines={1}
            >
              {tx.cat} · {tx.date}
            </Text>
            {tx.source ? <SourceTag source={tx.source} /> : null}
          </View>
        </View>
        <Text
          style={[
            styles.recentAmt,
            {
              color: tx.type === "inc" ? t.em : t.text1,
              fontFamily: weight(800),
            },
          ]}
        >
          {hideAmount
            ? MASKED_AMOUNT
            : `${tx.amt > 0 ? "+" : "−"}${fmt(tx.amt)}`}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },

  // Topbar — absolute so the scroller runs under it (liquid glass).
  topbar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingTop: 14,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  topbarHairline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  topbarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarPressTarget: {
    flexShrink: 0,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLabel: {
    fontFamily: weight(800),
    color: "#1a1228",
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

  // Scroll content — paddingTop is set inline (topbar height + 8, the
  // web's 8px body padding) since the bar overlays the scroller.
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 28,
  },

  // Hero card
  hero: {
    position: "relative",
    overflow: "hidden",
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
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  heroContent: {
    position: "relative",
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
    marginTop: 10,
  },
  amountRupee: {
    fontSize: 26,
    letterSpacing: -0.52,
  },
  // The web's 0.9 leading (line-height: 49) clips glyph tops in RN, which
  // crops the line box instead of letting it overflow; full-size line box,
  // single line so the tight leading had no visual effect anyway.
  amountValue: {
    fontSize: 54,
    letterSpacing: -1.89,
    lineHeight: 54,
  },
  progressTrack: {
    marginTop: 20,
    height: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 99,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 99,
    overflow: "hidden",
  },
  progressLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  progressLeft: {
    fontSize: 12.5,
  },
  progressSpent: {
    fontSize: 12.5,
  },

  // Read-path error banner
  retryWrap: {
    marginTop: 14,
  },

  // SMS sync banner
  syncBanner: {
    marginTop: 14,
  },
  syncBannerTouchable: {
    width: "100%",
  },
  syncBannerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  syncIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
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
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
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
    flexDirection: "row",
    alignItems: "baseline",
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
    marginLeft: "auto",
  },

  // Recent
  recentList: {
    gap: 8,
  },
  recentRowTouchable: {
    width: "100%",
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
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
    alignItems: "center",
    justifyContent: "center",
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
  recentMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  recentMeta: {
    fontSize: 11.5,
    flexShrink: 1,
  },
  recentAmt: {
    fontSize: 14.5,
    letterSpacing: -0.145,
    flexShrink: 0,
  },
});
