/**
 * DetectedCard — RN port of `project/riddhi/MobileSync.jsx:45–99`.
 *
 * Renders one SMS-detected transaction awaiting confirmation: a parsed
 * result row (icon, merchant, category chip + account, amount + time), the
 * raw SMS source line, and an Ignore / Add transaction action row.
 *
 * State machine (MobileSync.jsx:46, 49–52): 'idle' | 'confirmed' | 'dismissed'.
 * Tapping an action button sets state immediately (driving the slide +
 * collapse animation below), then after 360ms calls `onConfirm(tx.id)` /
 * `onDismiss(tx.id)` — letting the animation play out before the parent
 * removes the item from `pending` and unmounts this card.
 *
 * Animation (MobileSync.jsx:54–62, CSS `transition: all .36s var(--ease)`):
 *  - idle: maxHeight 320, opacity 1, translateX 0, marginBottom 12.
 *  - confirmed: translateX +40 immediately, then (same transition) collapse
 *    to maxHeight 0 / opacity 0 / marginBottom 0.
 *  - dismissed: translateX -40, then the same collapse.
 * All four properties animate together under one 360ms ease curve in the
 * source (a single CSS `transition: all`), so the RN port drives all four
 * from one shared `withTiming` per state via `ease` (theme/tokens.ts,
 * matching `--ease`).
 *
 * Editing (optional onEdit/onEditCategory props): card body tap or the Edit action button opens the full edit form; the category chip opens a category picker.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { GlassView } from '../components/Glass';
import { AppIcon, AppIconBox } from '../components/contentIcons';
import { MI } from '../components/icons';
import { useTheme } from '../theme/ThemeProvider';
import { ease, radius, weight } from '../theme/tokens';
import { spacing } from '../theme/spacing';
import type { SyncDetected } from './Sync';

const TRANSITION_MS = 360;
const IDLE_MAX_HEIGHT = 320;
const IDLE_MARGIN_BOTTOM = spacing.sm;
const SLIDE_DISTANCE = 40;

const fmtR = (n: number) => '₹' + Math.abs(n).toLocaleString('en-IN');

export type DetectedState = 'idle' | 'confirmed' | 'dismissed';

export interface DetectedCardProps {
  tx: SyncDetected;
  onConfirm: (id: string) => void;
  onDismiss: (id: string) => void;
  /** Opens the full edit form (card body tap and the Edit action button). */
  onEdit?: (id: string) => void;
  /** Opens the category picker (category chip tap). */
  onEditCategory?: (id: string) => void;
}

export function DetectedCard({ tx, onConfirm, onDismiss, onEdit, onEditCategory }: DetectedCardProps) {
  const { t } = useTheme();
  const isInc = tx.amount > 0;

  // 0 = idle, 1 = confirmed/dismissed (collapsed). Drives maxHeight/opacity/
  // marginBottom together, matching the source's single `transition: all`.
  const progress = useSharedValue(0);
  // -1 = dismissed (slide left), 0 = idle, 1 = confirmed (slide right).
  const slide = useSharedValue(0);

  const act = (next: 'confirmed' | 'dismissed') => {
    slide.value = withTiming(next === 'confirmed' ? 1 : -1, { duration: TRANSITION_MS, easing: ease });
    progress.value = withTiming(1, { duration: TRANSITION_MS, easing: ease });
    setTimeout(() => {
      if (next === 'confirmed') onConfirm(tx.id);
      else onDismiss(tx.id);
    }, TRANSITION_MS);
  };

  const wrapStyle = useAnimatedStyle(() => ({
    maxHeight: IDLE_MAX_HEIGHT * (1 - progress.value),
    opacity: 1 - progress.value,
    marginBottom: IDLE_MARGIN_BOTTOM * (1 - progress.value),
    transform: [{ translateX: slide.value * SLIDE_DISTANCE }],
  }));

  return (
    <Animated.View style={[styles.wrap, wrapStyle]}>
      <GlassView style={styles.card} radius={radius.xl} padding={0}>
        <Pressable onPress={onEdit ? () => onEdit(tx.id) : undefined}>
          {/* parsed result */}
          <View style={styles.resultRow}>
            <AppIconBox value={tx.icon} color={tx.catCol} size={44} />
            <View style={styles.resultText}>
              <Text style={[styles.merchant, { color: t.text1, fontFamily: weight(600) }]} numberOfLines={1}>
                {tx.merchant}
              </Text>
              <View style={styles.metaRow}>
                <Pressable
                  onPress={onEditCategory ? () => onEditCategory(tx.id) : undefined}
                  hitSlop={6}
                  style={[styles.catChip, { backgroundColor: tx.catCol + '1e' }]}
                >
                  <Text style={[styles.catChipText, { color: tx.catCol, fontFamily: weight(600) }]}>{tx.cat}</Text>
                </Pressable>
                <Text style={[styles.accountText, { color: t.text3 }]}>{tx.account}</Text>
              </View>
            </View>
            <View style={styles.amountCol}>
              <Text
                style={[
                  styles.amount,
                  { color: isInc ? t.em : t.text1, fontFamily: weight(700) },
                ]}
              >
                {isInc ? '+' : ''}
                {fmtR(tx.amount)}
              </Text>
              <Text style={[styles.time, { color: t.text3 }]}>{tx.time}</Text>
            </View>
          </View>

          {/* raw SMS source */}
          <View style={styles.rawWrap}>
            <View style={[styles.rawRow, { backgroundColor: t.bg, borderColor: t.border }]}>
              <View style={[styles.rawIconBox, { backgroundColor: t.bg3 }]}>
                <AppIcon value="mail" size={16} color={tx.catCol} />
              </View>
              <Text style={[styles.rawText, { color: t.text3 }]} numberOfLines={1}>
                {tx.raw}
              </Text>
            </View>
          </View>
        </Pressable>

        {/* actions */}
        <View style={[styles.actionsRow, { borderTopColor: t.border }]}>
          <Pressable onPress={() => act('dismissed')} style={[styles.ignoreBtn, { borderRightColor: t.border }]}>
            <Text style={[styles.ignoreLabel, { color: t.text3, fontFamily: weight(600) }]}>Ignore</Text>
          </Pressable>
          {onEdit ? (
            <Pressable onPress={() => onEdit(tx.id)} style={[styles.editBtn, { borderRightColor: t.border }]}>
              <MI.edit size={14} color={t.text2} />
              <Text style={[styles.editLabel, { color: t.text2, fontFamily: weight(600) }]}>Edit</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => act('confirmed')} style={styles.addBtn}>
            <MI.check size={16} color={t.em} strokeWidth={2.6} />
            <Text style={[styles.addLabel, { color: t.em, fontFamily: weight(700) }]}>Add transaction</Text>
          </Pressable>
        </View>
      </GlassView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
  card: {
    overflow: 'hidden',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  resultText: {
    flex: 1,
    minWidth: 0,
  },
  merchant: {
    fontSize: 14.5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  catChip: {
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.xs,
    borderRadius: 99,
  },
  catChipText: {
    fontSize: 11,
  },
  accountText: {
    fontSize: 11,
  },
  amountCol: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  amount: {
    fontSize: 15.5,
  },
  time: {
    fontSize: 10.5,
    marginTop: spacing.xxs,
  },
  rawWrap: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  rawRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 11,
    borderWidth: 1,
  },
  rawIconBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rawText: {
    flex: 1,
    fontSize: 10.5,
    lineHeight: 14.7,
  },
  actionsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  ignoreBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
  },
  ignoreLabel: {
    fontSize: 13,
  },
  editBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    borderRightWidth: 1,
  },
  editLabel: {
    fontSize: 13,
  },
  addBtn: {
    flex: 2,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  addLabel: {
    fontSize: 13.5,
  },
});
