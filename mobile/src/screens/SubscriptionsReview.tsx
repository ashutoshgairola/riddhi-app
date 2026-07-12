/**
 * SubscriptionsReview — Task 14: detection review + manual add screen for
 * Slice D "Subscriptions". Reachable from `SubscriptionsScreen.tsx`'s
 * overflow menu (both "Add subscription" and "Detect from transactions"
 * already `nav('subscriptions-review')`, see its `openMoreMenu`) and from
 * `MoreSheet.tsx`'s new "Subscriptions" row (via the `Subscriptions` list
 * screen itself).
 *
 * On mount, calls `subscriptionsApi.detect()` and renders one animated
 * confirm/dismiss card per candidate — the same slide+collapse treatment
 * `DetectedCard.tsx` uses for Sync.tsx's SMS-detected review list (the
 * "review then add" pattern `StatementReviewScreen.tsx` also mirrors for
 * its own line items, there via a bulk Toggle-driven import; here each
 * candidate is its own POST so a per-row remove fits better).
 *
 * Aggregator candidates (a Google Play/App Store charge bucketing several
 * unrelated subs under one descriptor) often arrive with a generic name —
 * each card's name is an editable `TextInput` prefilled with `c.name`, with
 * a small hint chip showing the original descriptor + amount/cycle (e.g.
 * "Google Play · ₹99/yr") so the user knows which charge they're renaming
 * (e.g. to "Truecaller"). The edited name flows into the create payload.
 *
 * "Add manually" opens `useFeedback().form()` (components/FormSheet.tsx)
 * with name/amount/cycle/next-date/account fields — the same declarative
 * quick-create convention every other flow in this app uses. `cycle` and
 * `account` are FormSheet `kind: 'select'` chip rows; `nextRenewalDate` is
 * a `kind: 'date'` field. Category/emoji/color are omitted — the backend
 * (`SubscriptionsService.create`) already defaults categoryId to the
 * user's "Subscriptions" category and emoji/color to generic fallbacks
 * when absent (see `dto.categoryId ?? …`, `dto.emoji ?? '🔁'`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { api } from '../api';
import type { AccountView } from '../api/types';
import { useApiData } from '../api/useApi';
import { subscriptionsApi, type SubCandidateView, type SubCycle } from '../api/subscriptions';
import { AppIconBox } from '../components/contentIcons';
import { GlassCard, GlassView } from '../components/Glass';
import { Btn, SectionHead, TopbarActions } from '../components/ui';
import { MI } from '../components/icons';
import { useTheme } from '../theme/ThemeProvider';
import { ease, radius, weight } from '../theme/tokens';
import { spacing } from '../theme/spacing';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useNav, type ScreenEntry } from '../app/navContext';
import { MPageShell } from './_MPageShell';
import { candidateToCreatePayload, formatInr, payTag } from './subscriptions';

const EMPTY_ACCOUNTS: AccountView[] = [];

// Slide+collapse timing/distances — matches `DetectedCard.tsx`'s constants
// (Sync.tsx's SMS-detected review cards) so both review flows feel the same.
const TRANSITION_MS = 360;
const IDLE_MAX_HEIGHT = 260;
const IDLE_MARGIN_BOTTOM = 12;
const SLIDE_DISTANCE = 40;

function since(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function CandidateCard({
  c,
  onConfirm,
  onDismiss,
  onNameChange,
}: {
  c: SubCandidateView;
  onConfirm: (c: SubCandidateView, name: string) => Promise<boolean>;
  onDismiss: (c: SubCandidateView) => Promise<boolean>;
  onNameChange?: (descriptor: string, name: string) => void;
}) {
  const { t } = useTheme();
  const [name, setName] = useState(c.name);
  const [acting, setActing] = useState(false);

  // 0 = idle, 1 = confirmed/dismissed (collapsed) — same two-value drive as
  // `DetectedCard`'s `progress`/`slide` pair.
  const progress = useSharedValue(0);
  const slide = useSharedValue(0);

  const act = (next: 'confirmed' | 'dismissed') => {
    if (acting) return;
    setActing(true);
    slide.value = withTiming(next === 'confirmed' ? 1 : -1, { duration: TRANSITION_MS, easing: ease });
    progress.value = withTiming(1, { duration: TRANSITION_MS, easing: ease });
    setTimeout(async () => {
      const ok = next === 'confirmed' ? await onConfirm(c, name.trim() || c.name) : await onDismiss(c);
      if (!ok) {
        slide.value = withTiming(0);
        progress.value = withTiming(0);
        setActing(false);
      }
    }, TRANSITION_MS);
  };

  const wrapStyle = useAnimatedStyle(() => ({
    maxHeight: IDLE_MAX_HEIGHT * (1 - progress.value),
    opacity: 1 - progress.value,
    marginBottom: IDLE_MARGIN_BOTTOM * (1 - progress.value),
    transform: [{ translateX: slide.value * SLIDE_DISTANCE }],
  }));

  const tag = payTag(c);
  const dotColor = tag.icon === 'card' ? t.em : tag.icon === 'bank' ? t.amber : t.cyan;
  const amountHint = `${c.name} · ${formatInr(c.amount)}/${c.cycle === 'yearly' ? 'yr' : 'mo'}`;

  return (
    <Animated.View style={[styles.cardWrap, wrapStyle]}>
      <GlassView style={styles.card} contentStyle={styles.cardContent} radius={radius.xl} padding={0}>
        <View style={styles.headerRow}>
          <AppIconBox value={c.emoji} color={c.color} size={44} iconSize={21} />
          <View style={styles.nameBlock}>
            <TextInput
              value={name}
              onChangeText={(text) => {
                setName(text);
                onNameChange?.(c.merchantDescriptor, text);
              }}
              placeholder={c.name}
              placeholderTextColor={t.text3}
              style={[
                styles.nameInput,
                { color: t.text1, borderColor: t.border, backgroundColor: t.bg2, fontFamily: weight(700) },
              ]}
            />
            <View style={[styles.hintChip, { backgroundColor: t.bg3, borderColor: t.border }]}>
              <Text style={[styles.hintChipText, { color: t.text3 }]} numberOfLines={1}>
                {amountHint}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.detailsRow}>
          <Text style={[styles.detailText, { color: t.text3 }]} numberOfLines={1}>
            {c.occurrences} charge{c.occurrences === 1 ? '' : 's'} seen · since {since(c.firstSeenDate)}
          </Text>
          <View style={[styles.payPill, { backgroundColor: t.bg3, borderColor: t.border }]}>
            <View style={[styles.payDot, { backgroundColor: dotColor }]} />
            <Text style={[styles.payLabel, { color: t.text3 }]}>{tag.label}</Text>
          </View>
        </View>

        <View style={[styles.actionsRow, { borderTopColor: t.border }]}>
          <Pressable onPress={() => act('dismissed')} style={[styles.dismissBtn, { borderRightColor: t.border }]}>
            <Text style={[styles.dismissLabel, { color: t.text3, fontFamily: weight(600) }]}>Dismiss</Text>
          </Pressable>
          <Pressable onPress={() => act('confirmed')} style={styles.confirmBtn}>
            <MI.check size={16} color={t.em} strokeWidth={2.6} />
            <Text style={[styles.confirmLabel, { color: t.em, fontFamily: weight(700) }]}>Confirm</Text>
          </Pressable>
        </View>
      </GlassView>
    </Animated.View>
  );
}

export function SubscriptionsReview({ entry: _entry }: { entry: ScreenEntry }) {
  const { t } = useTheme();
  const { pop } = useNav();
  const { toast, form } = useFeedback();

  const [candidates, setCandidates] = useState<SubCandidateView[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [editedNames, setEditedNames] = useState<Record<string, string>>({});
  const submitting = useRef<Set<string>>(new Set());

  const { data: accounts } = useApiData(() => api.accounts.list(), EMPTY_ACCOUNTS);

  useEffect(() => {
    subscriptionsApi
      .detect()
      .then(setCandidates)
      .catch(() => setCandidates([]))
      .finally(() => setLoading(false));
  }, []);

  const confirm = useCallback(
    async (c: SubCandidateView, editedName: string): Promise<boolean> => {
      if (submitting.current.has(c.merchantDescriptor)) return false;
      submitting.current.add(c.merchantDescriptor);
      try {
        await subscriptionsApi.create({ ...candidateToCreatePayload(c, null), name: editedName });
        setCandidates((prev) => prev.filter((x) => x.merchantDescriptor !== c.merchantDescriptor));
        toast(`Added ${editedName}`, '✅');
        return true;
      } catch {
        toast("Couldn't add — try again", '📡');
        submitting.current.delete(c.merchantDescriptor);
        return false;
      }
    },
    [toast],
  );

  const dismiss = useCallback(async (c: SubCandidateView): Promise<boolean> => {
    try {
      await subscriptionsApi.dismiss(c.merchantDescriptor);
    } catch {
      // Best-effort — still drop the row locally so it doesn't linger
      // this session even if the dismiss write failed to persist.
    }
    setCandidates((prev) => prev.filter((x) => x.merchantDescriptor !== c.merchantDescriptor));
    return true;
  }, []);

  const confirmAll = async () => {
    const targets = candidates.filter((c) => !submitting.current.has(c.merchantDescriptor));
    if (targets.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    targets.forEach((c) => submitting.current.add(c.merchantDescriptor));
    try {
      const results = await Promise.allSettled(
        targets.map((c) =>
          subscriptionsApi.create({
            ...candidateToCreatePayload(c, null),
            name: editedNames[c.merchantDescriptor]?.trim() || c.name,
          }),
        ),
      );
      const succeeded: string[] = [];
      let failedCount = 0;
      results.forEach((r, i) => {
        const descriptor = targets[i]!.merchantDescriptor;
        if (r.status === 'fulfilled') {
          succeeded.push(descriptor);
        } else {
          failedCount += 1;
          // Keep the row visible and unlock it so a retry can re-submit.
          submitting.current.delete(descriptor);
        }
      });
      if (succeeded.length > 0) {
        setCandidates((prev) => prev.filter((x) => !succeeded.includes(x.merchantDescriptor)));
        toast(`Added ${succeeded.length} subscription${succeeded.length === 1 ? '' : 's'}`, '✅');
      }
      if (failedCount > 0) {
        toast("Some subscriptions couldn't be added — try again", '📡');
      }
    } finally {
      setBulkBusy(false);
    }
  };

  const openManualAdd = () => {
    const accountOptions = [
      { label: 'No account', value: '' },
      ...accounts.map((a) => ({ label: a.name, value: String(a.id) })),
    ];
    form({
      title: 'Add subscription',
      submitLabel: 'Add subscription',
      fields: [
        { key: 'name', label: 'Name', placeholder: 'e.g. Netflix' },
        { key: 'amount', label: 'Amount', kind: 'amount', placeholder: '499' },
        {
          key: 'cycle',
          label: 'Billing cycle',
          kind: 'select',
          initial: 'monthly',
          options: [
            { label: 'Monthly', value: 'monthly' },
            { label: 'Yearly', value: 'yearly' },
          ],
        },
        { key: 'nextRenewalDate', label: 'Next charge', kind: 'date', placeholder: 'Select date' },
        { key: 'accountId', label: 'Account', kind: 'select', initial: '', options: accountOptions },
      ],
      onSubmit: async (values) => {
        const name = values['name']!;
        const amount = Number(values['amount']);
        const cycle: SubCycle = values['cycle'] === 'yearly' ? 'yearly' : 'monthly';
        const nextRenewalDate = values['nextRenewalDate'] || new Date().toISOString().slice(0, 10);
        await subscriptionsApi.create({
          name,
          merchantDescriptor: name,
          amount,
          cycle,
          nextRenewalDate,
          firstSeenDate: nextRenewalDate,
          accountId: values['accountId'] ? values['accountId'] : null,
          transactionIds: [],
        });
        toast(`Added ${name}`, '✅');
      },
    });
  };

  return (
    <MPageShell
      title="Review subscriptions"
      onBack={pop}
      right={
        candidates.length > 1 ? (
          <TopbarActions>
            <Pressable onPress={() => void confirmAll()} disabled={bulkBusy} hitSlop={8}>
              <Text style={[styles.confirmAllText, { color: t.em, fontFamily: weight(700) }]}>
                {bulkBusy ? 'Adding…' : 'Confirm all'}
              </Text>
            </Pressable>
          </TopbarActions>
        ) : undefined
      }
    >
      <SectionHead title="Detected" link={candidates.length > 0 ? String(candidates.length) : undefined} />
      {loading ? (
        <GlassCard style={styles.emptyCard}>
          <Text style={[styles.emptyText, { color: t.text3 }]}>Scanning your transactions…</Text>
        </GlassCard>
      ) : candidates.length > 0 ? (
        <View style={styles.list}>
          {candidates.map((c) => (
            <CandidateCard
              key={c.merchantDescriptor}
              c={c}
              onConfirm={confirm}
              onDismiss={dismiss}
              onNameChange={(d, n) => setEditedNames((m) => ({ ...m, [d]: n }))}
            />
          ))}
        </View>
      ) : (
        <GlassCard style={styles.emptyCard}>
          <Text style={[styles.emptyText, { color: t.text3 }]}>
            No new subscriptions detected. Add one manually below.
          </Text>
        </GlassCard>
      )}

      <Btn variant="ghost" onPress={openManualAdd} style={styles.manualBtn}>
        + Add manually
      </Btn>
    </MPageShell>
  );
}

const styles = StyleSheet.create({
  confirmAllText: {
    fontSize: 13.5,
  },
  list: {
    marginBottom: spacing.xxs,
  },
  cardWrap: {
    overflow: 'hidden',
  },
  card: {
    overflow: 'hidden',
  },
  cardContent: {
    padding: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  nameInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: 14.5,
  },
  hintChip: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.xs,
    borderRadius: 99,
    borderWidth: 1,
  },
  hintChipText: {
    fontSize: 10.5,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  detailText: {
    flex: 1,
    fontSize: 11.5,
  },
  payPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.xs,
    borderRadius: 99,
    borderWidth: 1,
    flexShrink: 0,
  },
  payDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  payLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  dismissBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
  },
  dismissLabel: {
    fontSize: 13,
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  confirmLabel: {
    fontSize: 13.5,
  },
  emptyCard: {
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
  manualBtn: {
    marginTop: spacing.xs,
  },
});
