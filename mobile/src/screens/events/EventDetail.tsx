/**
 * EventDetail — RN port of `project/riddhi/MobileEvents.jsx` (the
 * `EventDetail` component, lines 223–389), reading `entry.data` (`{ id }`,
 * pushed by the Events list's `push({kind:'event-detail', data:{id}})`) and
 * loading the full event via `api.events.get(id)` (Task 6's
 * `EventDetailView`, which carries the server-computed
 * planned/paid/projected/over/paidCount/count/remaining totals — no
 * client-side `evTotals()` re-derivation needed here).
 *
 * Building blocks reused rather than reimplemented:
 *  - `MPageShell` for the `.m-page`/`.m-topbar`(back+title+more)/`.m-body`
 *    scaffold (matches `AccountDetail.tsx`'s pushed-screen shape).
 *  - `GlassCard` (`.m-card`) for the hero/stats/empty-state/expense-row
 *    cards, `SpringIn` for their staggered entrance (MobileEvents.jsx's
 *    `m-spring` + `animationDelay`).
 *  - `SectionHead` for "Expenses" + the "{paidCount}/{count} paid" link
 *    slot (MobileEvents.jsx:317–320).
 *  - `Btn` (ghost) for the dashed "Add expense" button.
 *  - `useFeedback().sheet`/`.toast` for the more-button action sheet and
 *    save/delete confirmations; `useNav().pop`/`.nav` for back and the
 *    sheet's "View in Activity" / "Ask Munshi" destinations.
 *  - `EventItemSheet` (Task 8) for add/edit, in both add (`item=null`) and
 *    edit (`item=x`) modes.
 *  - `react-native-svg` for the budget ring, following the same
 *    single-arc-over-track recipe as `MDonut` in `components/charts.tsx`
 *    (a static track `Circle` + an `AnimatedCircle` whose `strokeDasharray`
 *    is driven by a Reanimated `withTiming` count-up, rotated -90° so the
 *    arc starts at 12 o'clock) — one slice instead of many, and no on-ring
 *    label since the emoji/pct sit in the center overlay instead.
 *
 * Source values transcribed verbatim:
 *  - Ring geometry: 104×104 viewBox, r=44, strokeWidth=9,
 *    circumference≈276.5, ring color = over ? red : pct>=85 ? amber :
 *    ev.color, 900ms count-up fill (MobileEvents.jsx:229–232, 275–284).
 *  - Stats row labels/values: Planned / Paid (em) / "Over by" or "Left"
 *    (red when over, else em) — MobileEvents.jsx:250–255, 298–305.
 *  - Over-budget banner copy: "Projected spend {evFmt(projected)} exceeds
 *    your {evFmt(budget)} budget. Trim or raise the budget." —
 *    MobileEvents.jsx:307–314.
 *  - Checklist row: checkbox toggles paid, icon/color/categoryName box,
 *    label with strike-through when paid, "on budget"/"±{evFmt(delta)} vs
 *    plan" (amber "to pay" when unpaid) sub-label, amount (strike-through
 *    planned shown below when paid and it differs) — MobileEvents.jsx:330–370.
 *  - Empty state: 🧾 "No expenses yet" / "Add your first line item to start
 *    planning." — MobileEvents.jsx:322–327.
 *  - Footer note: "Ticking an expense logs a real transaction to Activity,
 *    noted "For {ev.name}"." — MobileEvents.jsx:379–381.
 *  - `evFmt`/`evFmtK` — MobileStore.jsx:45–46, ported as local helpers (no
 *    shared money-formatting module exists in `mobile/src/lib/` yet).
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { GlassCard } from '../../components/Glass';
import { Btn, IconButton, SectionHead, TopbarActions } from '../../components/ui';
import { MI } from '../../components/icons';
import { SpringIn } from '../../components/SpringIn';
import { useTheme } from '../../theme/ThemeProvider';
import { ease, weight } from '../../theme/tokens';
import { useFeedback } from '../../feedback/FeedbackProvider';
import { useNav, type ScreenEntry } from '../../app/navContext';
import { api } from '../../api';
import { useApiData } from '../../api/useApi';
import { MPageShell } from '../_MPageShell';
import { EventItemSheet, type EventItemSaved } from './EventItemSheet';
import { formatDayShort, formatRange } from './eventDates';
import type { EventDetailView, EventExpenseView } from '../../api/types';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// evFmt/evFmtK — MobileStore.jsx:45–46.
function evFmt(n: number): string {
  return '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');
}
function evFmtK(n: number): string {
  const a = Math.abs(n);
  if (a >= 100000) return `₹${(a / 100000).toFixed(2)}L`;
  if (a >= 1000) return `₹${(a / 1000).toFixed(a % 1000 ? 1 : 0)}K`;
  return `₹${a}`;
}

// Ring geometry (MobileEvents.jsx:274–280).
const RING_SIZE = 104;
const RING_R = 44;
const RING_STROKE = 9;
const RING_C = 2 * Math.PI * RING_R; // ≈ 276.46, source rounds to 276.5
const RING_DURATION_MS = 900;

function BudgetRing({ pct, color, trackColor }: { pct: number; color: string; trackColor: string }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(Math.min(pct, 100), { duration: RING_DURATION_MS, easing: ease });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct]);

  const animatedProps = useAnimatedProps(() => {
    const dash = (progress.value / 100) * RING_C;
    return { strokeDasharray: [dash, RING_C - dash] };
  });

  return (
    <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
      <Circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_R}
        stroke={trackColor}
        strokeWidth={RING_STROKE}
        fill="none"
      />
      <AnimatedCircle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_R}
        stroke={color}
        strokeWidth={RING_STROKE}
        fill="none"
        strokeLinecap="round"
        transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        animatedProps={animatedProps}
      />
    </Svg>
  );
}

// Stat cell (MobileEvents.jsx:250–255).
function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  const { t } = useTheme();
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, { color: color ?? t.text1, fontFamily: weight(700) }]}>
        {evFmtK(value)}
      </Text>
      <Text style={[styles.statLabel, { color: t.text3, fontFamily: weight(600) }]}>{label}</Text>
    </View>
  );
}

// One checklist row (MobileEvents.jsx:330–370).
function ExpenseRow({
  x,
  onToggle,
  onPress,
}: {
  x: EventExpenseView;
  onToggle: () => void;
  onPress: () => void;
}) {
  const { t } = useTheme();
  const shown = x.paid ? x.actual : x.planned;
  const delta = x.paid ? x.actual - x.planned : 0;
  const deltaColor = delta > 0 ? t.red : delta < 0 ? t.em : t.text3;

  return (
    <GlassCard style={[styles.expenseCard, { opacity: x.paid ? 0.82 : 1 }]} contentStyle={styles.expenseCardContent}>
      <Pressable onPress={onPress}>
        {({ pressed }) => (
          <View style={[styles.expenseRow, { backgroundColor: pressed ? t.glassBg2 : 'transparent' }]}>
            {/* checkbox — a separate Pressable nested inside the row's own
                press target, matching the source's `e.stopPropagation()`
                split between "toggle paid" and "open edit sheet"; RN's
                responder system routes a tap here to this inner Pressable
                only, so the outer row's onPress never fires for it. */}
            <Pressable onPress={onToggle} hitSlop={8} style={styles.checkboxBtn}>
              <View
                style={[
                  styles.checkbox,
                  {
                    backgroundColor: x.paid ? t.em : 'transparent',
                    borderColor: x.paid ? t.em : t.text3,
                  },
                ]}
              >
                {x.paid ? <MI.check size={14} color="#1a1228" strokeWidth={3.5} /> : null}
              </View>
            </Pressable>

            <View style={[styles.expenseIconBox, { backgroundColor: x.color + '22' }]}>
              <Text style={styles.expenseIconGlyph}>{x.icon}</Text>
            </View>

            <View style={styles.expenseTextBlock}>
              <Text
                style={[
                  styles.expenseLabel,
                  {
                    color: t.text1,
                    fontFamily: weight(600),
                    textDecorationLine: x.paid ? 'line-through' : 'none',
                  },
                ]}
                numberOfLines={1}
              >
                {x.label}
              </Text>
              <View style={styles.expenseSubRow}>
                <Text style={[styles.expenseSubText, { color: t.text3 }]}>{x.categoryName}</Text>
                {x.paid ? (
                  <Text style={[styles.expenseSubText, { color: deltaColor }]}>
                    {delta === 0 ? 'on budget' : `${delta > 0 ? '+' : ''}${evFmt(delta)} vs plan`}
                  </Text>
                ) : (
                  <Text style={[styles.expenseSubText, { color: t.amber }]}>to pay</Text>
                )}
              </View>
            </View>

            <View style={styles.expenseAmountBlock}>
              <Text style={[styles.expenseAmount, { color: t.text1, fontFamily: weight(700) }]}>
                {evFmt(shown)}
              </Text>
              {x.paid && x.planned !== x.actual ? (
                <Text style={[styles.expensePlannedStrike, { color: t.text3 }]}>{evFmt(x.planned)}</Text>
              ) : null}
            </View>
          </View>
        )}
      </Pressable>
    </GlassCard>
  );
}

export function EventDetail({ entry }: { entry: ScreenEntry }) {
  const { id, autoAddExpense } = entry.data as { id: string; autoAddExpense?: boolean };
  const { t } = useTheme();
  const { pop, nav } = useNav();
  const { toast, sheet } = useFeedback();

  const { data: ev } = useApiData(() => api.events.get(id), null as any as EventDetailView, [id]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editItem, setEditItem] = useState<EventExpenseView | null>(null);

  const openNew = () => {
    setEditItem(null);
    setSheetOpen(true);
  };
  const openEdit = (x: EventExpenseView) => {
    setEditItem(x);
    setSheetOpen(true);
  };

  // Honor a FAB "add expense" intent (MobileEvents.jsx:238).
  useEffect(() => {
    if (autoAddExpense) openNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAddExpense]);

  const togglePaid = (x: EventExpenseView) => {
    api.events
      .updateExpense(id, x.id, { paid: !x.paid })
      .catch(() => toast("Couldn't update — try again", '📡'));
  };

  const saveItem = (patch: EventItemSaved) => {
    const isEdit = !!editItem;
    const run = isEdit
      ? api.events.updateExpense(id, editItem!.id, patch)
      : api.events.addExpense(id, patch);
    run
      .then(() => toast(patch.paid ? 'Saved · logged to Activity' : isEdit ? 'Expense updated' : 'Expense added', '✓'))
      .catch(() => toast("Couldn't save — try again", '📡'));
  };

  const deleteItem = () => {
    if (!editItem) return;
    api.events
      .removeExpense(id, editItem.id)
      .then(() => toast('Expense removed'))
      .catch(() => toast("Couldn't remove — try again", '📡'));
  };

  const deleteEvent = () => {
    api.events
      .remove(id)
      .then(() => {
        toast('Event deleted', '🗑');
        pop();
      })
      .catch(() => toast("Couldn't delete — try again", '📡'));
  };

  const openMoreSheet = () => {
    if (!ev) return;
    sheet({
      title: ev.name,
      options: [
        { label: 'Add expense', icon: '➕', onPress: openNew },
        { label: 'View in Activity', icon: '📑', onPress: () => nav('txns') },
        { label: 'Ask Munshi', icon: '📒', onPress: () => nav('chat') },
        { label: 'Delete event', icon: '🗑', danger: true, onPress: deleteEvent },
      ],
    });
  };

  // Guard render until the event has loaded — no placeholder mock to fall
  // back to (useApiData's `null` fallback while the first fetch is in flight).
  if (!ev) return null;

  const pct = ev.budget > 0 ? Math.round((ev.paid / ev.budget) * 100) : 0;
  const ringColor = ev.over ? t.red : pct >= 85 ? t.amber : ev.color;
  const leftOrOver = ev.over ? ev.projected - ev.budget : ev.budget - ev.paid;

  return (
    <MPageShell
      title={ev.name}
      onBack={pop}
      right={
        <TopbarActions>
          <IconButton onPress={openMoreSheet}>
            <MI.more size={20} color={t.text1} />
          </IconButton>
        </TopbarActions>
      }
    >
      {/* Hero: budget ring (MobileEvents.jsx:273–296) */}
      <SpringIn>
        <GlassCard style={styles.heroCard} contentStyle={styles.heroCardContent}>
          <View style={styles.ringWrap}>
            <BudgetRing pct={pct} color={ringColor} trackColor={t.bg3} />
            <View style={styles.ringCenter} pointerEvents="none">
              <Text style={styles.ringEmoji}>{ev.emoji}</Text>
              <Text style={[styles.ringPct, { color: ringColor, fontFamily: weight(700) }]}>{pct}%</Text>
            </View>
          </View>
          <View style={styles.heroTextBlock}>
            <Text style={[styles.heroLabel, { color: t.text3, fontFamily: weight(600) }]}>
              Spent of budget
            </Text>
            <Text style={[styles.heroValue, { color: t.text1, fontFamily: weight(700) }]}>
              {evFmtK(ev.paid)} <Text style={[styles.heroValueOf, { color: t.text3 }]}>/ {evFmtK(ev.budget)}</Text>
            </Text>
            <View style={styles.heroChipsRow}>
              {ev.multiDay && ev.date && ev.endDate ? (
                <Text style={[styles.heroChip, { color: t.text2 }]}>🗓 {formatRange(ev.date, ev.endDate)}</Text>
              ) : ev.date ? (
                <Text style={[styles.heroChip, { color: t.text2 }]}>🗓 {formatDayShort(ev.date)}</Text>
              ) : null}
              {ev.guests > 0 ? (
                <Text style={[styles.heroChip, { color: t.text2 }]}>👥 {ev.guests} guests</Text>
              ) : null}
            </View>
          </View>
        </GlassCard>
      </SpringIn>

      {/* Stats row (MobileEvents.jsx:298–305) */}
      <SpringIn delay={50}>
        <GlassCard style={styles.statsCard} contentStyle={styles.statsCardContent}>
          <Stat label="Planned" value={ev.planned} />
          <View style={[styles.statDivider, { backgroundColor: t.border }]} />
          <Stat label="Paid" value={ev.paid} color={t.em} />
          <View style={[styles.statDivider, { backgroundColor: t.border }]} />
          <Stat label={ev.over ? 'Over by' : 'Left'} value={leftOrOver} color={ev.over ? t.red : t.em} />
        </GlassCard>
      </SpringIn>

      {/* Over-budget banner (MobileEvents.jsx:307–314) */}
      {ev.over ? (
        <SpringIn delay={80}>
          <View style={[styles.overBanner, { backgroundColor: t.redDim, borderColor: t.red }]}>
            <Text style={styles.overBannerIcon}>⚠️</Text>
            <Text style={[styles.overBannerText, { color: t.red, fontFamily: weight(600) }]}>
              Projected spend {evFmt(ev.projected)} exceeds your {evFmt(ev.budget)} budget. Trim or raise the
              budget.
            </Text>
          </View>
        </SpringIn>
      ) : null}

      {/* Checklist (MobileEvents.jsx:316–372) */}
      <SectionHead title="Expenses" link={`${ev.paidCount}/${ev.count} paid`} />

      {ev.expenses.length === 0 ? (
        <GlassCard contentStyle={styles.emptyCard}>
          <Text style={styles.emptyIcon}>🧾</Text>
          <Text style={[styles.emptyTitle, { color: t.text1, fontFamily: weight(600) }]}>No expenses yet</Text>
          <Text style={[styles.emptySubtitle, { color: t.text3 }]}>
            Add your first line item to start planning.
          </Text>
        </GlassCard>
      ) : ev.multiDay ? (
        <View style={styles.expenseList}>
          {ev.dayGroups.map((g) => {
            const rows = ev.expenses.filter((x) => (x.dayDate ?? null) === g.dayDate);
            return (
              <View key={g.dayDate ?? 'unscheduled'}>
                <View style={styles.dayHeader}>
                  <Text style={[styles.dayHeaderTitle, { color: t.text2, fontFamily: weight(700) }]}>
                    {g.dayDate === null ? 'Unscheduled' : formatDayShort(g.dayDate)}
                  </Text>
                  <Text style={[styles.dayHeaderSub, { color: t.text3 }]}>
                    {evFmt(g.paid)} / {evFmt(g.planned)}
                  </Text>
                </View>
                <View style={styles.dayRows}>
                  {rows.map((x, i) => (
                    <SpringIn key={x.id} delay={40 + i * 20}>
                      <ExpenseRow x={x} onToggle={() => togglePaid(x)} onPress={() => openEdit(x)} />
                    </SpringIn>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.expenseList}>
          {ev.expenses.map((x, i) => (
            <SpringIn key={x.id} delay={50 + i * 30}>
              <ExpenseRow x={x} onToggle={() => togglePaid(x)} onPress={() => openEdit(x)} />
            </SpringIn>
          ))}
        </View>
      )}

      {/* Add item (MobileEvents.jsx:375–377) */}
      <Btn variant="ghost" onPress={openNew} style={styles.addBtn}>
        <View style={styles.addBtnRow}>
          <MI.plus size={18} color={t.text1} />
          <Text style={{ color: t.text1, fontSize: 15, fontFamily: weight(600) }}>Add expense</Text>
        </View>
      </Btn>

      <Text style={[styles.footerNote, { color: t.text3 }]}>
        Ticking an expense logs a real transaction to Activity, noted “For {ev.name}”.
      </Text>

      <EventItemSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        item={editItem}
        onSave={saveItem}
        onDelete={deleteItem}
        multiDay={ev.multiDay}
        rangeStart={ev.date}
        rangeEnd={ev.endDate}
      />
    </MPageShell>
  );
}

const styles = StyleSheet.create({
  // Hero
  heroCard: {
    marginTop: 8,
  },
  heroCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    flexShrink: 0,
  },
  ringCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringEmoji: {
    fontSize: 26,
    lineHeight: 28,
  },
  ringPct: {
    fontSize: 13,
    marginTop: 4,
  },
  heroTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  heroLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.88,
  },
  heroValue: {
    fontSize: 24,
    marginTop: 4,
    letterSpacing: -0.48,
  },
  heroValueOf: {
    fontSize: 14,
  },
  heroChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  heroChip: {
    fontSize: 11.5,
  },

  // Stats row
  statsCard: {
    marginTop: 12,
  },
  statsCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
  },
  statLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 3,
  },
  statDivider: {
    width: 1,
    height: 34,
  },

  // Over banner
  overBanner: {
    marginTop: 12,
    padding: 14,
    paddingHorizontal: 14,
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  overBannerIcon: {
    fontSize: 16,
  },
  overBannerText: {
    flex: 1,
    fontSize: 12.5,
  },

  // Empty state
  emptyCard: {
    paddingVertical: 28,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 30,
  },
  emptyTitle: {
    fontSize: 14,
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },

  // Expense list/rows
  expenseList: {
    flexDirection: 'column',
    gap: 9,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  dayHeaderTitle: { fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.6 },
  dayHeaderSub: { fontSize: 11.5 },
  dayRows: { gap: 9 },
  expenseCard: {
    padding: 0,
  },
  expenseCardContent: {
    padding: 0,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  checkboxBtn: {
    flexShrink: 0,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expenseIconBox: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  expenseIconGlyph: {
    fontSize: 16,
  },
  expenseTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  expenseLabel: {
    fontSize: 14,
  },
  expenseSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  expenseSubText: {
    fontSize: 11,
  },
  expenseAmountBlock: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  expenseAmount: {
    fontSize: 14.5,
  },
  expensePlannedStrike: {
    fontSize: 11,
    textDecorationLine: 'line-through',
    marginTop: 1,
  },

  // Add button + footer
  addBtn: {
    marginTop: 14,
    borderStyle: 'dashed',
    borderWidth: 1,
  },
  addBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  footerNote: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 16.5,
  },
});
