/**
 * SubDetailSheet — RN port of `project/riddhi/MobileSubs.jsx`'s
 * `SubDetailSheet` (lines 22–98): cost grid, next charge/cycle rows,
 * hike/renewal/forgotten flags for the selected sub, and pause/resume ·
 * remind · cancel actions.
 *
 * Mirrors `PayBillSheet.tsx` for the bottom-sheet chrome (`BottomSheet`,
 * ghost/danger `Btn`s) — but unlike `PayBillSheet`'s always-non-null `card`
 * prop, `SubscriptionsScreen.tsx`'s `detail` state is genuinely `SubView | null`
 * (nothing selected by default), so this sheet takes a nullable `sub` and
 * follows `EventItemSheet.tsx`'s nullable-entity convention instead: the
 * sheet itself always renders `<BottomSheet open={!!sub}>` so
 * open/close still animates, and an early `if (!sub) return ...` (after all
 * hooks, same as `CardDetail.tsx`'s `!summary` guard) narrows `sub` to
 * non-null for the rest of the body.
 *
 * The "opened" stamp (`markDetailOpened`) fires once per sub the moment the
 * sheet mounts with unset `detailOpenedAt`, clearing the "forgotten" flag
 * server-side on next `list()` — MobileSubs.jsx has no equivalent (the web
 * store computes "unused" from local `lastOpened` bookkeeping the API here
 * replaces).
 *
 * Source values transcribed verbatim:
 *  - Header: icon chip + name + "since {month year}" + PAUSED badge
 *    (MobileSubs.jsx:33–42).
 *  - Cost grid: "Per {month|year}" + "Yearly cost" (MobileSubs.jsx:45–54).
 *  - Next charge / billing cycle / monthly equivalent rows
 *    (MobileSubs.jsx:56–71).
 *  - Hike (amber) / forgotten (red) flag banners (MobileSubs.jsx:74–85) —
 *    extended with a renewal_soon (em) banner for this app's 3-way
 *    `SubFlagView` union.
 *  - Pause/Resume + Remind me + Cancel actions + their toasts
 *    (MobileSubs.jsx:88–94). Cancel additionally confirms via
 *    `useFeedback().sheet()` first — this app's established
 *    destructive-action pattern (see `TxDetail.tsx`'s `deleteTx`); the web
 *    source cancels immediately with no confirmation.
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppIcon, AppIconBox } from '../components/contentIcons';
import { BottomSheet } from '../components/BottomSheet';
import { Btn } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { spacing } from '../theme/spacing';
import { useFeedback } from '../feedback/FeedbackProvider';
import { subscriptionsApi, type SubFlagView, type SubView } from '../api/subscriptions';
import { formatInr, payTag } from './subscriptions';

function subDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** "Paid via" pill — duplicated from `SubscriptionsScreen.tsx`'s `SubPayTag`
 * rather than imported, to avoid a circular import between the two sibling
 * screen files (same per-file duplication convention as `CardDetail`/
 * `PayBillSheet`'s `cFmt`/`cFmtDate`). */
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

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

function flagVisual(kind: SubFlagView['kind']) {
  if (kind === 'hike') return { icon: 'trendUp', kindLabel: 'amber' as const };
  if (kind === 'renewal_soon') return { icon: 'calendar2', kindLabel: 'em' as const };
  return { icon: 'moon', kindLabel: 'red' as const };
}

function flagMessage(f: SubFlagView): string {
  if (f.kind === 'hike') {
    return `Price rose from ${formatInr(f.from)} to ${formatInr(f.to)} — up ${f.pct}%.`;
  }
  if (f.kind === 'renewal_soon') {
    return `Renews in ${f.inDays} day${f.inDays === 1 ? '' : 's'} · ${formatInr(f.amount)}.`;
  }
  return `Still paying for this? Cancelling saves ~${formatInr(f.yearlyCost)}/yr.`;
}

export interface SubDetailSheetProps {
  sub: SubView | null;
  /** Flags from `SubListView.flags` matching `sub.id` (empty when none),
   * computed by the caller from the already-loaded summary. */
  flags: SubFlagView[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}

export function SubDetailSheet({ sub, flags, onClose, onChanged }: SubDetailSheetProps) {
  const { t } = useTheme();
  const { toast, sheet } = useFeedback();

  // Stamp "opened" once per sub — clears the possibly-forgotten flag
  // server-side. Guarded so it never re-fires for a sub already marked, and
  // safe to call unconditionally (hooks can't be gated behind the `!sub`
  // early return below).
  useEffect(() => {
    if (!sub || sub.detailOpenedAt) return;
    subscriptionsApi.update(sub.id, { markDetailOpened: true }).catch(() => {});
  }, [sub]);

  if (!sub) {
    return <BottomSheet open={false} onClose={onClose} title="" />;
  }

  const yearly = sub.cycle === 'yearly' ? sub.amount : sub.amount * 12;
  const monthlyEquiv = sub.cycle === 'yearly' ? sub.amount / 12 : sub.amount;
  const inDays = daysUntil(sub.nextRenewalDate);
  const since = new Date(sub.firstSeenDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

  const pauseResume = async () => {
    const resuming = sub.status !== 'active';
    await subscriptionsApi.update(sub.id, { status: sub.status === 'active' ? 'paused' : 'active' });
    toast(resuming ? 'Subscription resumed' : 'Subscription paused', resuming ? '▶️' : '⏸');
    await onChanged();
    onClose();
  };

  const cancel = async () => {
    await subscriptionsApi.update(sub.id, { status: 'cancelled' });
    toast('Subscription cancelled', '🗑');
    await onChanged();
    onClose();
  };

  const confirmCancel = () => {
    sheet({
      title: 'Cancel this subscription?',
      options: [
        { label: 'Cancel subscription', icon: '🗑', danger: true, onPress: () => void cancel() },
        { label: 'Keep subscription', onPress: () => {} },
      ],
    });
  };

  const toggleRemind = async () => {
    const enabling = sub.reminderDays == null;
    await subscriptionsApi.update(sub.id, { reminderDays: enabling ? 2 : null });
    toast(enabling ? 'Reminder set 2 days before renewal' : 'Reminder turned off', '🔔');
    await onChanged();
  };

  return (
    <BottomSheet open onClose={onClose} title="">
      <View style={styles.headerRow}>
        <AppIconBox value={sub.emoji} color={sub.color} size={56} iconSize={28} />
        <View style={styles.headerTextBlock}>
          <Text style={[styles.name, { color: t.text1, fontFamily: weight(700) }]}>{sub.name}</Text>
          <View style={styles.headerMetaRow}>
            <SubPayTag tag={payTag(sub)} />
            <Text style={[styles.sinceText, { color: t.text3 }]}>since {since}</Text>
          </View>
        </View>
        {sub.status === 'paused' ? (
          <View style={[styles.pausedBadge, { backgroundColor: t.amberDim }]}>
            <Text style={[styles.pausedBadgeText, { color: t.amber }]}>PAUSED</Text>
          </View>
        ) : null}
      </View>

      {/* Cost grid (MobileSubs.jsx:45–54) */}
      <View style={styles.costGrid}>
        <View style={[styles.costCard, { backgroundColor: t.glassBg, borderColor: t.glassBrd }]}>
          <Text style={[styles.costLabel, { color: t.text3 }]}>
            Per {sub.cycle === 'yearly' ? 'year' : 'month'}
          </Text>
          <Text style={[styles.costValue, { color: t.text1, fontFamily: weight(700) }]}>
            {formatInr(sub.amount)}
          </Text>
        </View>
        <View style={[styles.costCard, { backgroundColor: t.glassBg, borderColor: t.glassBrd }]}>
          <Text style={[styles.costLabel, { color: t.text3 }]}>Yearly cost</Text>
          <Text style={[styles.costValue, { color: t.em, fontFamily: weight(700) }]}>{formatInr(yearly)}</Text>
        </View>
      </View>

      {/* Next charge / cycle rows (MobileSubs.jsx:56–71) */}
      <View style={[styles.detailCard, { backgroundColor: t.glassBg, borderColor: t.glassBrd }]}>
        <View style={styles.detailRow}>
          <Text style={[styles.detailKey, { color: t.text3 }]}>Next charge</Text>
          <Text style={[styles.detailValue, { color: t.text1, fontFamily: weight(600) }]}>
            {subDate(sub.nextRenewalDate)} · in {inDays}d
          </Text>
        </View>
        <View style={[styles.detailRow, styles.detailRowBorder, { borderTopColor: t.border }]}>
          <Text style={[styles.detailKey, { color: t.text3 }]}>Billing cycle</Text>
          <Text style={[styles.detailValue, { color: t.text1, fontFamily: weight(600) }]}>
            {sub.cycle === 'yearly' ? 'Yearly' : 'Monthly'}
          </Text>
        </View>
        {sub.cycle === 'yearly' ? (
          <View style={[styles.detailRow, styles.detailRowBorder, { borderTopColor: t.border }]}>
            <Text style={[styles.detailKey, { color: t.text3 }]}>Monthly equivalent</Text>
            <Text style={[styles.detailValue, { color: t.text1, fontFamily: weight(600) }]}>
              {formatInr(monthlyEquiv)}/mo
            </Text>
          </View>
        ) : null}
      </View>

      {/* Flags (MobileSubs.jsx:74–85) */}
      {flags.map((f) => {
        const v = flagVisual(f.kind);
        const bg = v.kindLabel === 'amber' ? t.amberDim : v.kindLabel === 'em' ? t.emDim : t.redDim;
        const border =
          v.kindLabel === 'amber' ? 'rgba(255,194,75,0.28)' : v.kindLabel === 'em' ? t.emGlow : 'rgba(255,107,133,0.28)';
        const color = v.kindLabel === 'amber' ? t.amber : v.kindLabel === 'em' ? t.em : t.red;
        return (
          <View key={f.kind} style={[styles.flagBanner, { backgroundColor: bg, borderColor: border }]}>
            <AppIcon value={v.icon} size={17} color={color} />
            <Text style={[styles.flagText, { color: t.text2 }]}>{flagMessage(f)}</Text>
          </View>
        );
      })}

      {/* Actions (MobileSubs.jsx:88–94) */}
      <View style={styles.actionsRow}>
        <Btn variant="ghost" onPress={() => void pauseResume()} style={styles.actionBtn}>
          {sub.status === 'active' ? 'Pause' : 'Resume'}
        </Btn>
        <Btn variant="ghost" onPress={() => void toggleRemind()} style={styles.actionBtn}>
          {sub.reminderDays == null ? 'Remind me' : 'Turn off reminder'}
        </Btn>
      </View>
      <Btn variant="ghost" onPress={confirmCancel} style={styles.cancelBtn}>
        <Text style={{ color: t.red, fontSize: 15, fontFamily: weight(600) }}>Cancel subscription</Text>
      </Btn>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  headerTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 19,
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  sinceText: {
    fontSize: 12,
  },
  pausedBadge: {
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.xxs,
    borderRadius: 99,
  },
  pausedBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },

  costGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  costCard: {
    flex: 1,
    padding: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
  },
  costLabel: {
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: 0.63, // 0.06em of 10.5px
    fontWeight: '600',
  },
  costValue: {
    fontSize: 20,
    marginTop: spacing.xxs,
  },

  detailCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  detailRowBorder: {
    borderTopWidth: 1,
  },
  detailKey: {
    fontSize: 13,
  },
  detailValue: {
    fontSize: 13,
  },

  flagBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  flagText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },

  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  actionBtn: {
    flex: 1,
  },
  cancelBtn: {
    marginTop: spacing.sm,
  },
});
