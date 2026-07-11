/**
 * CalendarPicker — a themed, cross-platform date picker rendered as a floating
 * popover over a scrim. Replaces the native @react-native-community/datetimepicker
 * so the picker matches the app palette (tokens.ts) and honors the app `mode`
 * instead of the OS colour scheme.
 *
 * Speaks only in `Date`; callers adapt to/from their own storage format.
 * Layering: a transparent RN Modal (same pattern as AuthFlow.tsx) floats above
 * the FormSheet's in-tree sheet overlay (the sheet is NOT a native Modal).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { Chip } from './ui';
import { useTheme } from '../theme/ThemeProvider';
import { radius, weight } from '../theme/tokens';
import { spacing } from '../theme/spacing';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export type Anchor = { x: number; y: number; w: number; h: number };

// ── Pure date helpers ────────────────────────────────────────────────
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
/** true when `a` falls on a strictly later calendar day than `b`. */
export function isAfterDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() > startOfDay(b).getTime();
}
/** 6×7 grid, Sunday-first; null marks a cell outside `month` (0-11). */
export function buildMonthMatrix(year: number, month: number): (Date | null)[][] {
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length < 42) cells.push(null);
  const rows: (Date | null)[][] = [];
  for (let r = 0; r < 6; r++) rows.push(cells.slice(r * 7, r * 7 + 7));
  return rows;
}

// ── Layout constants ─────────────────────────────────────────────────
const CARD_MAX_W = 340;
const CARD_H_EST = 430;
const MARGIN = 12;

export function CalendarPicker({
  visible,
  value,
  maxDate,
  anchor,
  onSelect,
  onClose,
}: {
  visible: boolean;
  value: Date;
  maxDate?: Date;
  anchor?: Anchor | null;
  onSelect: (d: Date) => void;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const win = useWindowDimensions();
  const [view, setView] = useState<{ year: number; month: number }>({
    year: value.getFullYear(),
    month: value.getMonth(),
  });
  const [jump, setJump] = useState(false);

  // Re-sync to `value` and leave the jump grid each time the picker reopens —
  // the component stays mounted across opens, so the useState initializers
  // (which run only on first mount) would otherwise show a stale month/view.
  useEffect(() => {
    if (visible) {
      setView({ year: value.getFullYear(), month: value.getMonth() });
      setJump(false);
    }
    // Intentionally keyed on `visible` only: we snapshot `value` at open time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const cardW = Math.min(CARD_MAX_W, win.width - MARGIN * 2);
  const pos = useMemo(() => {
    if (!anchor) {
      return {
        top: Math.max(MARGIN, (win.height - CARD_H_EST) / 2),
        left: (win.width - cardW) / 2,
      };
    }
    let left = anchor.x + anchor.w - cardW;
    left = Math.min(Math.max(MARGIN, left), win.width - cardW - MARGIN);
    let top = anchor.y + anchor.h + 8;
    if (top + CARD_H_EST > win.height - MARGIN) {
      top = Math.max(MARGIN, anchor.y - CARD_H_EST - 8);
    }
    return { top, left };
  }, [anchor, cardW, win.width, win.height]);

  const today = useMemo(() => startOfDay(new Date()), []);
  const matrix = useMemo(() => buildMonthMatrix(view.year, view.month), [view]);

  const canGoNext =
    !maxDate ||
    view.year < maxDate.getFullYear() ||
    (view.year === maxDate.getFullYear() && view.month < maxDate.getMonth());

  const step = (delta: number) => {
    setView((v) => {
      const m = v.month + delta;
      const year = v.year + Math.floor(m / 12);
      const month = ((m % 12) + 12) % 12;
      return { year, month };
    });
  };

  const pick = (d: Date) => {
    if (maxDate && isAfterDay(d, maxDate)) return;
    onSelect(d);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // statusBarTranslucent is required: it makes the Modal's origin the physical
      // top of the screen, matching the window-absolute coords from measureInWindow
      // (the anchor). Removing it shifts the popover down by the status-bar height on Android.
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={[styles.scrim, { backgroundColor: t.sheetBackdropBg }]} onPress={onClose}>
        {/* Inner press swallows taps so touching the card doesn't dismiss. */}
        <Pressable
          onPress={() => {}}
          style={[
            styles.card,
            {
              width: cardW,
              top: pos.top,
              left: pos.left,
              backgroundColor: t.sheetBg,
              borderColor: t.borderStr,
            },
          ]}
        >
          {jump ? (
            <JumpView
              year={view.year}
              maxDate={maxDate}
              onPickMonth={(month) => {
                setView((v) => ({ ...v, month }));
                setJump(false);
              }}
              onStepYear={(d) => setView((v) => ({ ...v, year: v.year + d }))}
            />
          ) : (
            <>
              <View style={styles.chipsRow}>
                <Chip onPress={() => pick(today)}>Today</Chip>
                <Chip onPress={() => pick(addDays(today, -1))}>Yesterday</Chip>
              </View>

              <View style={styles.header}>
                <Pressable hitSlop={10} onPress={() => step(-1)}>
                  <Text style={[styles.arrow, { color: t.em }]}>‹</Text>
                </Pressable>
                <Pressable hitSlop={8} onPress={() => setJump(true)}>
                  <Text style={[styles.title, { color: t.text1, fontFamily: weight(700) }]}>
                    {MONTHS_FULL[view.month]} {view.year}
                  </Text>
                </Pressable>
                <Pressable hitSlop={10} onPress={() => canGoNext && step(1)} disabled={!canGoNext}>
                  <Text style={[styles.arrow, { color: canGoNext ? t.em : t.text3 }]}>›</Text>
                </Pressable>
              </View>

              <View style={styles.weekRow}>
                {WEEKDAYS.map((w, i) => (
                  <Text
                    key={i}
                    style={[styles.weekday, { color: t.text3, fontFamily: weight(600) }]}
                  >
                    {w}
                  </Text>
                ))}
              </View>

              {matrix.map((row, ri) => (
                <View key={ri} style={styles.weekRow}>
                  {row.map((cell, ci) => {
                    if (!cell) return <View key={ci} style={styles.cell} />;
                    const selected = isSameDay(cell, value);
                    const isToday = isSameDay(cell, today);
                    const disabled = !!maxDate && isAfterDay(cell, maxDate);
                    return (
                      <Pressable
                        key={ci}
                        style={styles.cell}
                        disabled={disabled}
                        onPress={() => pick(cell)}
                        accessibilityRole="button"
                        accessibilityLabel={`${cell.getDate()} ${MONTHS[cell.getMonth()]} ${cell.getFullYear()}`}
                        accessibilityState={{ selected, disabled }}
                      >
                        <View
                          style={[
                            styles.cellInner,
                            selected && { backgroundColor: t.emDim },
                            isToday && !selected ? { borderColor: t.em, borderWidth: 1 } : null,
                          ]}
                        >
                          <Text
                            style={{
                              color: disabled ? t.text3 : selected ? t.em : t.text1,
                              fontFamily: weight(selected ? 700 : 600),
                              fontSize: 14,
                            }}
                          >
                            {cell.getDate()}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function JumpView({
  year,
  maxDate,
  onPickMonth,
  onStepYear,
}: {
  year: number;
  maxDate?: Date;
  onPickMonth: (month: number) => void;
  onStepYear: (delta: number) => void;
}) {
  const { t } = useTheme();
  const canGoNextYear = !maxDate || year < maxDate.getFullYear();
  const monthDisabled = (m: number) =>
    !!maxDate &&
    (year > maxDate.getFullYear() || (year === maxDate.getFullYear() && m > maxDate.getMonth()));

  return (
    <View>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => onStepYear(-1)}>
          <Text style={[styles.arrow, { color: t.em }]}>‹</Text>
        </Pressable>
        <Text style={[styles.title, { color: t.text1, fontFamily: weight(700) }]}>{year}</Text>
        <Pressable
          hitSlop={10}
          onPress={() => canGoNextYear && onStepYear(1)}
          disabled={!canGoNextYear}
        >
          <Text style={[styles.arrow, { color: canGoNextYear ? t.em : t.text3 }]}>›</Text>
        </Pressable>
      </View>
      <View style={styles.monthGrid}>
        {MONTHS.map((m, i) => {
          const disabled = monthDisabled(i);
          return (
            <Pressable
              key={i}
              disabled={disabled}
              onPress={() => onPickMonth(i)}
              style={styles.monthCell}
            >
              <View style={styles.monthInner}>
                <Text
                  style={{
                    color: disabled ? t.text3 : t.text1,
                    fontFamily: weight(600),
                    fontSize: 14,
                  }}
                >
                  {m}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1 },
  card: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  chipsRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xxs,
  },
  arrow: { fontSize: 26, lineHeight: 28, paddingHorizontal: spacing.xs },
  title: { fontSize: 15 },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, paddingVertical: spacing.xs },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cellInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: { width: '25%', paddingVertical: spacing.xs, alignItems: 'center' },
  monthInner: { paddingVertical: spacing.xs, paddingHorizontal: spacing.xs, borderRadius: radius.sm },
});
