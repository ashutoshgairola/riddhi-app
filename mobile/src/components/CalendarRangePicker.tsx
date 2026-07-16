import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { radius, weight } from '../theme/tokens';
import { spacing } from '../theme/spacing';
import {
  type Anchor,
  isSameDay,
  buildMonthMatrix,
} from './CalendarPicker';
import { isBetween, nextRangeState } from './calendarRange';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const CARD_MAX_W = 340;
const CARD_H_EST = 460;
const MARGIN = 12;

export function CalendarRangePicker({
  visible, start, end, anchor, onSelect, onClose,
}: {
  visible: boolean;
  start: Date | null;
  end: Date | null;
  anchor?: Anchor | null;
  onSelect: (start: Date, end: Date) => void;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const win = useWindowDimensions();
  const [sel, setSel] = useState<{ start: Date | null; end: Date | null }>({ start, end });
  const seed = start ?? new Date();
  const [view, setView] = useState({ year: seed.getFullYear(), month: seed.getMonth() });
  const [jump, setJump] = useState(false);

  useEffect(() => {
    if (visible) {
      setSel({ start, end });
      const s = start ?? new Date();
      setView({ year: s.getFullYear(), month: s.getMonth() });
      setJump(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const cardW = Math.min(CARD_MAX_W, win.width - MARGIN * 2);
  const pos = useMemo(() => {
    if (!anchor) {
      return { top: Math.max(MARGIN, (win.height - CARD_H_EST) / 2), left: (win.width - cardW) / 2 };
    }
    let left = anchor.x + anchor.w - cardW;
    left = Math.min(Math.max(MARGIN, left), win.width - cardW - MARGIN);
    let top = anchor.y + anchor.h + 8;
    if (top + CARD_H_EST > win.height - MARGIN) top = Math.max(MARGIN, anchor.y - CARD_H_EST - 8);
    return { top, left };
  }, [anchor, cardW, win.width, win.height]);

  const matrix = useMemo(() => buildMonthMatrix(view.year, view.month), [view]);

  const step = (delta: number) => setView((v) => {
    const m = v.month + delta;
    return { year: v.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
  });

  const pick = (cell: Date) => {
    const next = nextRangeState(sel, cell);
    setSel({ start: next.start, end: next.end });
    if (next.committed && next.start && next.end) {
      onSelect(next.start, next.end);
    }
  };

  const rangeLabel = sel.start
    ? `${sel.start.getDate()} ${MONTHS[sel.start.getMonth()]}${sel.end ? ` – ${sel.end.getDate()} ${MONTHS[sel.end.getMonth()]}` : ' – …'}`
    : 'Pick a start date';

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={[styles.scrim, { backgroundColor: t.sheetBackdropBg }]} onPress={onClose}>
        <Pressable onPress={() => {}} style={[styles.card, { width: cardW, top: pos.top, left: pos.left, backgroundColor: t.sheetBg, borderColor: t.borderStr }]}>
          {jump ? (
            <RangeJumpView
              year={view.year}
              onPickMonth={(month) => { setView((v) => ({ ...v, month })); setJump(false); }}
              onStepYear={(dd) => setView((v) => ({ ...v, year: v.year + dd }))}
            />
          ) : (
            <>
              <View style={styles.header}>
                <Pressable hitSlop={10} onPress={() => step(-1)}><Text style={[styles.arrow, { color: t.em }]}>‹</Text></Pressable>
                <Pressable hitSlop={8} onPress={() => setJump(true)}>
                  <Text style={[styles.title, { color: t.text1, fontFamily: weight(700) }]}>{MONTHS_FULL[view.month]} {view.year}</Text>
                </Pressable>
                <Pressable hitSlop={10} onPress={() => step(1)}><Text style={[styles.arrow, { color: t.em }]}>›</Text></Pressable>
              </View>

              <View style={styles.weekRow}>
                {WEEKDAYS.map((w, i) => (
                  <Text key={i} style={[styles.weekday, { color: t.text3, fontFamily: weight(600) }]}>{w}</Text>
                ))}
              </View>

              {matrix.map((row, ri) => (
                <View key={ri} style={styles.weekRow}>
                  {row.map((cell, ci) => {
                    if (!cell) return <View key={ci} style={styles.cell} />;
                    const isStart = sel.start && isSameDay(cell, sel.start);
                    const isEnd = sel.end && isSameDay(cell, sel.end);
                    const inBand = sel.start && sel.end && isBetween(cell, sel.start, sel.end);
                    const endpoint = isStart || isEnd;
                    return (
                      <Pressable key={ci} style={styles.cell} onPress={() => pick(cell)}>
                        {/* Full-square band bg so adjacent in-range days touch into one span. */}
                        <View style={[styles.cellBand, inBand ? { backgroundColor: t.emDim } : null]}>
                          <View style={[styles.cellInner, endpoint ? { backgroundColor: t.emDim } : null]}>
                            <Text style={{ color: endpoint ? t.em : t.text1, fontFamily: weight(endpoint ? 700 : 600), fontSize: 14 }}>
                              {cell.getDate()}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}

              <Text style={[styles.footer, { color: t.text3, fontFamily: weight(600) }]}>{rangeLabel}</Text>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function RangeJumpView({ year, onPickMonth, onStepYear }: { year: number; onPickMonth: (m: number) => void; onStepYear: (d: number) => void }) {
  const { t } = useTheme();
  return (
    <View>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => onStepYear(-1)}><Text style={[styles.arrow, { color: t.em }]}>‹</Text></Pressable>
        <Text style={[styles.title, { color: t.text1, fontFamily: weight(700) }]}>{year}</Text>
        <Pressable hitSlop={10} onPress={() => onStepYear(1)}><Text style={[styles.arrow, { color: t.em }]}>›</Text></Pressable>
      </View>
      <View style={styles.monthGrid}>
        {MONTHS.map((m, i) => (
          <Pressable key={i} onPress={() => onPickMonth(i)} style={styles.monthCell}>
            <View style={styles.monthInner}><Text style={{ color: t.text1, fontFamily: weight(600), fontSize: 14 }}>{m}</Text></View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1 },
  card: { position: 'absolute', borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs, paddingHorizontal: spacing.xxs },
  arrow: { fontSize: 26, lineHeight: 28, paddingHorizontal: spacing.xs },
  title: { fontSize: 15 },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, paddingVertical: spacing.xs },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cellBand: { alignSelf: 'stretch', flex: 1, alignItems: 'center', justifyContent: 'center' },
  cellInner: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  footer: { fontSize: 12.5, textAlign: 'center', marginTop: spacing.sm },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: { width: '25%', paddingVertical: spacing.xs, alignItems: 'center' },
  monthInner: { paddingVertical: spacing.xs, paddingHorizontal: spacing.xs, borderRadius: radius.sm },
});
