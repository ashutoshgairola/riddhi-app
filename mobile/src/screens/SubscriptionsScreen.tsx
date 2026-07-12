/**
 * SubscriptionsScreen — RN port of `project/riddhi/MobileSubs.jsx`'s
 * `MobileSubs` component (lines 100–249): monthly burn hero, "worth a look"
 * hike/renewal/forgotten flags, an upcoming-charges timeline, and the full
 * subscription list with an All/Active/Paused segmented filter.
 *
 * File is named `SubscriptionsScreen.tsx` (not `Subscriptions.tsx`) because
 * this directory already has a committed `subscriptions.ts` (Task 12's pure
 * helpers — `formatInr`/`payTag`/`filterByTab`); on this filesystem/tsconfig
 * (`forceConsistentCasingInFileNames`, case-insensitive host) a `.tsx` and a
 * `.ts` file whose basenames differ only in case are a hard `tsc` error
 * (TS1149/TS1261), not just a style nit — so the two can't coexist as
 * `Subscriptions.tsx` + `subscriptions.ts`. The exported component itself is
 * still named `Subscriptions` (see `screens.tsx`'s registry import).
 *
 * Building blocks reused rather than reimplemented:
 *  - `MPageShell` for the `.m-page`/`.m-topbar`(back+title+more)/`.m-body`
 *    scaffold (CardDetail.tsx's pattern).
 *  - `AppIconBox`/`AppIcon` for the emoji-tinted icon chips (CardDetail,
 *    TxDetail).
 *  - `GlassCard`/`ListCard`/`ListRow`/`SectionHead` for the hero/flags/
 *    timeline/list cards.
 *  - `MSeg` for the All/Active/Paused control.
 *  - `useFeedback().sheet()` for the header overflow menu (TxDetail.tsx's
 *    `openMoreSheet` pattern) — both options push `'subscriptions-review'`
 *    (that screen isn't registered yet; `SCREEN_REGISTRY` falls back to
 *    Home until a later task adds it — see screens.tsx).
 *  - `useCountUp` for the animated burn figure (Home.tsx's daily-spend
 *    pattern).
 *
 * The burn hero's gradient + glow blob mirrors CardDetail.tsx's simpler
 * `LinearGradient` + flat-blob `cardVisual` treatment (not Home.tsx's
 * heavier Skia/SVG "signature hero" shader, which is reserved for that
 * screen's specific net-worth/daily-spend treatment).
 *
 * Source values transcribed verbatim:
 *  - Hero: "Monthly subscription burn" label, big ₹ figure, Yearly/Active/
 *    This month stat row (MobileSubs.jsx:132–161).
 *  - Flags: 📈 hike / 🗓️ renewal_soon / 💤 forgotten rows, amber/red tinting
 *    (MobileSubs.jsx:163–186; kind split follows this app's 3-way
 *    `SubFlagView` union rather than the web's 2-way hike/unused).
 *  - Upcoming: day/month + icon + name + pay tag + amount rows, "next 35
 *    days" subtitle — matches the backend's `UPCOMING_WINDOW_DAYS = 35`
 *    (MobileSubs.jsx:188–206).
 *  - All subscriptions: segmented filter + card rows with PAUSED badge and
 *    hike/forgotten glyphs (MobileSubs.jsx:208–242).
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { AppIcon, AppIconBox } from '../components/contentIcons';
import { GlassCard } from '../components/Glass';
import { IconButton, ListCard, ListRow, SectionHead, TopbarActions } from '../components/ui';
import { MSeg } from '../components/MSeg';
import { MI } from '../components/icons';
import { useTheme } from '../theme/ThemeProvider';
import { weight, type Tokens } from '../theme/tokens';
import { spacing } from '../theme/spacing';
import { useNav, type ScreenEntry } from '../app/navContext';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useCountUp } from '../hooks/useCountUp';
import { subscriptionsApi, type SubFlagView, type SubListView, type SubView } from '../api/subscriptions';
import { filterByTab, formatInr, payTag } from './subscriptions';
import { SubDetailSheet } from './SubDetailSheet';
import { MPageShell } from './_MPageShell';

/** "Paid via" pill — RN port of `SubPayTag` (MobileSubs.jsx:8–19), following
 * `SourceTag.tsx`'s dot+label convention (this app has no `card`/`bank`/
 * `upi` glyph icons, unlike the web's MI.card/MI.bank/MI.upi). Duplicated in
 * `SubDetailSheet.tsx` rather than exported — same per-file convention as
 * `CardDetail`/`PayBillSheet`'s duplicated `cFmt`/`cFmtDate`, which avoids a
 * circular import between the two sibling screen files. */
function SubPayTag({ tag }: { tag: { label: string; icon: 'card' | 'bank' | 'upi' } }) {
  const { t } = useTheme();
  const dotColor = tag.icon === 'card' ? t.em : tag.icon === 'bank' ? t.amber : t.cyan;
  return (
    <View style={[payTagStyles.pill, { backgroundColor: t.bg3, borderColor: t.border }]}>
      <View style={[payTagStyles.dot, { backgroundColor: dotColor }]} />
      <Text style={[payTagStyles.label, { color: t.text3 }]} numberOfLines={1}>
        {tag.label}
      </Text>
    </View>
  );
}

const payTagStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.xs,
    borderRadius: 99,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 10, fontWeight: '700' },
});

// Flag kind -> (icon, tint) — MobileSubs.jsx:174 (`f.unused ? '💤' : '📈'`)
// extended to this app's 3-way `SubFlagView` union.
function flagVisual(kind: SubFlagView['kind'], t: Tokens) {
  if (kind === 'hike') return { icon: 'trendUp', bg: t.amberDim, border: 'rgba(255,194,75,0.28)', color: t.amber };
  if (kind === 'renewal_soon') return { icon: 'calendar2', bg: t.emDim, border: t.emGlow, color: t.em };
  return { icon: 'moon', bg: t.redDim, border: 'rgba(255,107,133,0.28)', color: t.red };
}

function flagSubtitle(f: SubFlagView): string {
  if (f.kind === 'hike') return `Up ${f.pct}% to ${formatInr(f.to)} · +${formatInr(f.extraYearly)}/yr`;
  if (f.kind === 'renewal_soon') return `Renews in ${f.inDays}d · ${formatInr(f.amount)}`;
  return `Still paying for this? · ${formatInr(f.yearlyCost)}/yr`;
}

export function Subscriptions({ entry: _entry }: { entry: ScreenEntry }) {
  const { t } = useTheme();
  const { nav, pop } = useNav();
  const { sheet } = useFeedback();

  const [data, setData] = useState<SubListView | null>(null);
  const [detail, setDetail] = useState<SubView | null>(null);
  const [tab, setTab] = useState<'all' | 'active' | 'paused'>('all');

  const load = useCallback(async () => {
    setData(await subscriptionsApi.list());
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const subs = data?.subscriptions ?? [];
  const list = filterByTab(subs, tab);
  const subById = new Map(subs.map((s) => [s.id, s]));

  const flags = data?.flags ?? [];
  const upcoming = data?.upcoming ?? [];
  const thisMonthTotal = upcoming.filter((u) => u.inDays <= 30).reduce((s, u) => s + u.amount, 0);
  // Per-sub flag lookup for the "All subscriptions" glyphs (hike/forgotten).
  const flagsBySub = new Map<string, SubFlagView[]>();
  for (const f of flags) {
    flagsBySub.set(f.subId, [...(flagsBySub.get(f.subId) ?? []), f]);
  }

  const monthlyCount = useCountUp(Math.round(data?.monthlyBurn ?? 0), 1100);

  const openMoreMenu = () => {
    sheet({
      title: 'Subscriptions',
      options: [
        { label: 'Add subscription', icon: '➕', onPress: () => nav('subscriptions-review') },
        { label: 'Detect from transactions', icon: '🔎', onPress: () => nav('subscriptions-review') },
      ],
    });
  };

  return (
    <>
      <MPageShell
        title="Subscriptions"
        onBack={pop}
        right={
          <TopbarActions>
            <IconButton onPress={openMoreMenu}>
              <MI.more size={20} color={t.text1} />
            </IconButton>
          </TopbarActions>
        }
      >
        {/* Burn hero (MobileSubs.jsx:132–161) */}
        <View style={[styles.hero, { borderColor: t.glassBrd2 }]}>
          <LinearGradient
            colors={['rgba(167,139,250,0.24)', 'rgba(110,90,200,0.16)', 'rgba(60,50,95,0.12)']}
            locations={[0, 0.6, 1]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.75, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroGlowBlob} pointerEvents="none" />
          <Text style={[styles.heroLabel, { color: t.text2, fontFamily: weight(600) }]}>
            Monthly subscription burn
          </Text>
          <View style={styles.heroAmountRow}>
            <Text style={[styles.heroRupee, { color: t.text2, fontFamily: weight(700) }]}>₹</Text>
            <Text style={[styles.heroValue, { color: t.text1, fontFamily: weight(800) }]}>
              {monthlyCount.toLocaleString('en-IN')}
            </Text>
            <Text style={[styles.heroPerMo, { color: t.text2, fontFamily: weight(600) }]}>/mo</Text>
          </View>
          <View style={[styles.heroStatsRow, { borderTopColor: t.glassBrd }]}>
            <View>
              <Text style={[styles.heroStatLabel, { color: t.text3 }]}>YEARLY</Text>
              <Text style={[styles.heroStatValue, { color: t.text1, fontFamily: weight(700) }]}>
                {formatInr(data?.yearlyProjection ?? 0)}
              </Text>
            </View>
            <View>
              <Text style={[styles.heroStatLabel, { color: t.text3 }]}>ACTIVE</Text>
              <Text style={[styles.heroStatValue, { color: t.text1, fontFamily: weight(700) }]}>
                {data?.activeCount ?? 0}
              </Text>
            </View>
            <View>
              <Text style={[styles.heroStatLabel, { color: t.text3 }]}>THIS MONTH</Text>
              <Text style={[styles.heroStatValue, { color: t.em, fontFamily: weight(700) }]}>
                {formatInr(thisMonthTotal)}
              </Text>
            </View>
          </View>
        </View>

        {/* Worth a look (MobileSubs.jsx:163–186) */}
        {flags.length > 0 ? (
          <>
            <SectionHead title="Worth a look" link={String(flags.length)} />
            <View style={styles.flagsList}>
              {flags.map((f) => {
                const v = flagVisual(f.kind, t);
                const sub = subById.get(f.subId);
                return (
                  <Pressable
                    key={`${f.subId}-${f.kind}`}
                    onPress={() => sub && setDetail(sub)}
                    style={[styles.flagRow, { backgroundColor: v.bg, borderColor: v.border }]}
                  >
                    <AppIcon value={v.icon} size={20} color={v.color} />
                    <View style={styles.flagTextBlock}>
                      <Text style={[styles.flagName, { color: t.text1, fontFamily: weight(700) }]}>
                        {f.name}
                      </Text>
                      <Text style={[styles.flagSubtitle, { color: t.text2 }]}>{flagSubtitle(f)}</Text>
                    </View>
                    <MI.arrow size={16} color={t.text3} />
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {/* Upcoming charges (MobileSubs.jsx:188–206) */}
        <SectionHead title="Upcoming charges" link="next 35 days" />
        {upcoming.length > 0 ? (
          <ListCard>
            {upcoming.map((u, i) => {
              const sub = subById.get(u.subId);
              if (!sub) return null;
              const d = new Date(u.nextRenewalDate);
              return (
                <ListRow key={`${u.subId}-${i}`} onPress={() => setDetail(sub)} last={i === upcoming.length - 1}>
                  <View style={styles.upcomingDateBlock}>
                    <Text
                      style={[
                        styles.upcomingDay,
                        { color: u.inDays <= 3 ? t.em : t.text1, fontFamily: weight(800) },
                      ]}
                    >
                      {d.getDate()}
                    </Text>
                    <Text style={[styles.upcomingMonth, { color: t.text3 }]}>
                      {d.toLocaleDateString('en-IN', { month: 'short' })}
                    </Text>
                  </View>
                  <View style={[styles.upcomingDivider, { backgroundColor: t.border }]} />
                  <AppIconBox value={sub.emoji} color={sub.color} size={38} iconSize={18} />
                  <View style={styles.upcomingTextBlock}>
                    <Text style={[styles.upcomingName, { color: t.text1, fontFamily: weight(600) }]} numberOfLines={1}>
                      {sub.name}
                    </Text>
                    <SubPayTag tag={payTag(sub)} />
                  </View>
                  <Text style={[styles.upcomingAmount, { color: t.text1, fontFamily: weight(700) }]}>
                    {formatInr(u.amount)}
                  </Text>
                </ListRow>
              );
            })}
          </ListCard>
        ) : (
          <GlassCard style={styles.emptyCard}>
            <Text style={[styles.emptyText, { color: t.text3 }]}>No charges in the next 35 days.</Text>
          </GlassCard>
        )}

        {/* All subscriptions (MobileSubs.jsx:208–242) */}
        <SectionHead title="All subscriptions" />
        <View style={styles.segWrap}>
          <MSeg
            options={[
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'paused', label: 'Paused' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </View>
        <View style={styles.subsList}>
          {list.map((s) => {
            const yearly = s.cycle === 'yearly' ? s.amount : s.amount * 12;
            const paused = s.status === 'paused';
            const subFlags = flagsBySub.get(s.id) ?? [];
            const hasHike = subFlags.some((f) => f.kind === 'hike');
            const hasForgotten = subFlags.some((f) => f.kind === 'forgotten');
            return (
              <Pressable
                key={s.id}
                onPress={() => setDetail(s)}
                style={[styles.subCard, { backgroundColor: t.glassBg, borderColor: t.glassBrd, opacity: paused ? 0.6 : 1 }]}
              >
                <AppIconBox value={s.emoji} color={s.color} size={44} iconSize={21} />
                <View style={styles.subTextBlock}>
                  <View style={styles.subNameRow}>
                    <Text style={[styles.subName, { color: t.text1, fontFamily: weight(700) }]} numberOfLines={1}>
                      {s.name}
                    </Text>
                    {paused ? (
                      <View style={[styles.pausedBadge, { backgroundColor: t.amberDim }]}>
                        <Text style={[styles.pausedBadgeText, { color: t.amber }]}>PAUSED</Text>
                      </View>
                    ) : null}
                    {hasHike ? <AppIcon value="trendUp" size={12} color={t.amber} /> : null}
                    {hasForgotten ? <AppIcon value="moon" size={12} color={t.text3} /> : null}
                  </View>
                  <View style={styles.subMetaRow}>
                    <SubPayTag tag={payTag(s)} />
                    <Text style={[styles.subYearly, { color: t.text3 }]}>{formatInr(yearly)}/yr</Text>
                  </View>
                </View>
                <View style={styles.subAmountBlock}>
                  <Text style={[styles.subAmount, { color: t.text1, fontFamily: weight(700) }]}>
                    {formatInr(s.amount)}
                  </Text>
                  <Text style={[styles.subCycle, { color: t.text3 }]}>
                    /{s.cycle === 'yearly' ? 'yr' : 'mo'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          {list.length === 0 ? (
            <GlassCard style={styles.emptyCard}>
              <Text style={[styles.emptyText, { color: t.text3 }]}>No subscriptions here yet.</Text>
            </GlassCard>
          ) : null}
        </View>
      </MPageShell>

      <SubDetailSheet
        sub={detail}
        flags={detail ? flagsBySub.get(detail.id) ?? [] : []}
        onClose={() => setDetail(null)}
        onChanged={load}
      />
    </>
  );
}

const styles = StyleSheet.create({
  // Burn hero (MobileSubs.jsx:133–161)
  hero: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 26,
    padding: spacing.lg,
    paddingTop: spacing.lg,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  heroGlowBlob: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(167,139,250,0.16)',
  },
  heroLabel: {
    fontSize: 13,
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xxs,
    marginTop: spacing.xs,
  },
  heroRupee: {
    fontSize: 24,
  },
  heroValue: {
    fontSize: 46,
    letterSpacing: -1.61, // -0.035em of 46px
    lineHeight: 46,
  },
  heroPerMo: {
    fontSize: 15,
    marginLeft: spacing.xxs,
  },
  heroStatsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  heroStatLabel: {
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: 0.63, // 0.06em of 10.5px
    fontWeight: '600',
  },
  heroStatValue: {
    fontSize: 16,
    marginTop: spacing.xxs,
  },

  // Flags (MobileSubs.jsx:163–186)
  flagsList: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  flagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
  },
  flagTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  flagName: {
    fontSize: 13.5,
  },
  flagSubtitle: {
    fontSize: 11.5,
    marginTop: spacing.xxs,
  },

  // Upcoming (MobileSubs.jsx:188–206)
  upcomingDateBlock: {
    width: 46,
    alignItems: 'center',
    flexShrink: 0,
  },
  upcomingDay: {
    fontSize: 18,
    lineHeight: 18,
  },
  upcomingMonth: {
    fontSize: 9.5,
    textTransform: 'uppercase',
    letterSpacing: 0.48, // 0.05em of 9.5px
    marginTop: spacing.xxs,
  },
  upcomingDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: spacing.xxs,
  },
  upcomingTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  upcomingName: {
    fontSize: 14,
  },
  upcomingAmount: {
    fontSize: 14,
    flexShrink: 0,
  },

  // All subscriptions (MobileSubs.jsx:208–242)
  segWrap: {
    marginBottom: spacing.sm,
  },
  subsList: {
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  subCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 18,
    borderWidth: 1,
  },
  subTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  subNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  subName: {
    fontSize: 14.5,
    flexShrink: 1,
  },
  pausedBadge: {
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.xxs,
    borderRadius: 99,
  },
  pausedBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  subMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  subYearly: {
    fontSize: 11.5,
  },
  subAmountBlock: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  subAmount: {
    fontSize: 15,
  },
  subCycle: {
    fontSize: 10.5,
    marginTop: spacing.xxs,
  },

  // Empty states
  emptyCard: {
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: 13,
  },
});
