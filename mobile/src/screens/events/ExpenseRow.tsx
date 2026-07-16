/**
 * ExpenseRow — one event-expense checklist row (MobileEvents.jsx:330–370).
 *
 * Extracted verbatim from `EventDetail.tsx` so both the single-day flat list
 * (in `EventDetail`) and the multi-day drag list (`ExpenseDragList`) render
 * identical rows. Behaviour is unchanged from the pre-extraction inline
 * component:
 *  - checkbox toggles paid, icon/color/categoryName box, label with
 *    strike-through when paid, "on budget"/"±{evFmt(delta)} vs plan" (amber
 *    "to pay" when unpaid) sub-label, amount (strike-through planned shown
 *    below when paid and it differs).
 *
 * `evFmt` (MobileStore.jsx:45) is exported here as the single owner used by
 * `EventDetail` (banner) and `ExpenseDragList` (day subtotals) too, so the
 * money-formatting stays in one place alongside the row that most uses it.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '../../components/Glass';
import { MI } from '../../components/icons';
import { useTheme } from '../../theme/ThemeProvider';
import { weight } from '../../theme/tokens';
import { spacing } from '../../theme/spacing';
import type { EventExpenseView } from '../../api/types';

// evFmt — MobileStore.jsx:45.
export function evFmt(n: number): string {
  return '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');
}

export function ExpenseRow({
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

const styles = StyleSheet.create({
  expenseCard: {
    padding: 0,
  },
  expenseCardContent: {
    padding: 0,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
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
    gap: spacing.xs,
    marginTop: spacing.xxs,
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
    marginTop: spacing.xxs,
  },
});
