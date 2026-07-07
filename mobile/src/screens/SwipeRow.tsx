/**
 * SwipeRow — swipeable transaction row.
 *
 * Source of truth: project/riddhi/MobileTxns.jsx:33–85 (`SwipeRow`).
 *
 * Web behavior: a touch-tracked `drag` value (px) is clamped to [-90, 90]
 * while dragging. On release: drag < -50 settles to -80 (open, revealing the
 * right/red delete action underneath); drag > 50 settles to 80 (open,
 * revealing the left/blue edit action); otherwise settles to 0 (closed). The
 * foreground row (`.m-list-row`, `background: var(--bg-1)`) translateX's by
 * `drag`, with `transition: transform .3s var(--spring)` whenever not
 * actively dragging (i.e. only on the release settle, not mid-drag). Tapping
 * the foreground while open (`open !== 0`) just closes it; tapping while
 * closed pushes `{ kind:'tx-detail', data: tx }`.
 *
 * RN port: `Gesture.Pan()` drives a shared `drag` value 1:1 with web's
 * `onTouchMove` math (`dx` clamped to ±90). `onEnd` applies the same ±50
 * threshold and settles via `withSpring` (visual analogue of the CSS
 * `.3s var(--spring)` cubic-bezier transition). Tap-to-close / tap-to-push is
 * handled with `Gesture.Tap()` composed via `Gesture.Race` against the pan so
 * a tap (no meaningful movement) still fires reliably alongside the drag.
 */
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { MI } from '../components/icons';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { useNav } from '../app/navContext';

export interface SwipeTx {
  id: number | string;
  icon: string;
  desc: string;
  cat: string;
  cCol: string;
  date: string;
  amount: number;
  type: 'inc' | 'exp';
  note?: string;
  eventId?: string | null;
}

/** Drag clamp range (web: `Math.max(-90, Math.min(90, dx))`). */
const DRAG_CLAMP = 90;
/** Settle-open offset once past the open threshold (web: `setDrag(-80)`/`setDrag(80)`). */
const SETTLE_OPEN = 80;
/** Release threshold past which the row settles open (web: `drag < -50` / `drag > 50`). */
const OPEN_THRESHOLD = 50;
/** Width of each reveal action zone (web: `.m-list-row` action `div` `width:80`). */
const ACTION_WIDTH = 80;

const SPRING_CONFIG = { damping: 16, stiffness: 220, mass: 0.7 };

export interface SwipeRowProps {
  tx: SwipeTx;
  fmt: (n: number) => string;
  onDelete?: (tx: SwipeTx) => void;
  onEdit?: (tx: SwipeTx) => void;
}

export function SwipeRow({ tx, fmt, onDelete, onEdit }: SwipeRowProps) {
  const { t } = useTheme();
  const { push } = useNav();

  const drag = useSharedValue(0);
  // 0 = closed, -1 = open left (delete revealed), 1 = open right (edit revealed).
  const open = useSharedValue<0 | 1 | -1>(0);
  const dragStart = useSharedValue(0);

  const closeRow = useCallback(() => {
    drag.value = withSpring(0, SPRING_CONFIG);
    open.value = 0;
  }, [drag, open]);

  const pushDetail = useCallback(() => {
    push({ kind: 'tx-detail', data: tx });
  }, [push, tx]);

  const handleTap = useCallback(() => {
    if (open.value !== 0) {
      closeRow();
      return;
    }
    pushDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeRow, pushDetail]);

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onStart(() => {
      dragStart.value = drag.value;
    })
    .onChange((e) => {
      const next = dragStart.value + e.translationX;
      drag.value = Math.max(-DRAG_CLAMP, Math.min(DRAG_CLAMP, next));
    })
    .onEnd(() => {
      if (drag.value < -OPEN_THRESHOLD) {
        drag.value = withSpring(-SETTLE_OPEN, SPRING_CONFIG);
        open.value = -1;
      } else if (drag.value > OPEN_THRESHOLD) {
        drag.value = withSpring(SETTLE_OPEN, SPRING_CONFIG);
        open.value = 1;
      } else {
        drag.value = withSpring(0, SPRING_CONFIG);
        open.value = 0;
      }
    });

  const tap = Gesture.Tap().onEnd(() => {
    runOnJS(handleTap)();
  });

  const composed = Gesture.Race(pan, tap);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value }],
  }));

  return (
    <View style={styles.wrap}>
      {/* Right action (revealed by swipe left) — MobileTxns.jsx:55–58 */}
      <Pressable
        style={[styles.action, styles.actionRight, { backgroundColor: t.red }]}
        onPress={() => onDelete?.(tx)}
      >
        <MI.trash size={20} color="#fff" />
      </Pressable>

      {/* Left action (revealed by swipe right) — MobileTxns.jsx:60–63 */}
      <Pressable
        style={[styles.action, styles.actionLeft, { backgroundColor: t.blue }]}
        onPress={() => onEdit?.(tx)}
      >
        <MI.edit size={20} color="#fff" />
      </Pressable>

      <GestureDetector gesture={composed}>
        <Animated.View style={[styles.row, rowStyle, { backgroundColor: t.bg1 }]}>
          <View style={[styles.iconBox, { backgroundColor: tx.cCol + '22' }]}>
            <Text style={styles.iconGlyph}>{tx.icon}</Text>
          </View>
          <View style={styles.textBlock}>
            <Text style={[styles.desc, { color: t.text1, fontFamily: weight(600) }]} numberOfLines={1}>
              {tx.desc}
            </Text>
            <Text style={[styles.catLine, { color: t.text3, fontFamily: weight(500) }]}>
              <Text style={{ color: tx.cCol, fontFamily: weight(600) }}>{tx.cat}</Text>
            </Text>
          </View>
          <Text
            style={[
              styles.amount,
              { color: tx.type === 'inc' ? t.em : t.red, fontFamily: weight(700) },
            ]}
          >
            {tx.amount > 0 ? '+' : ''}
            {fmt(tx.amount)}
          </Text>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    overflow: 'hidden',
  },
  action: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRight: {
    right: 0,
  },
  actionLeft: {
    left: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconGlyph: {
    fontSize: 18,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  desc: {
    fontSize: 14,
  },
  catLine: {
    fontSize: 11.5,
    marginTop: 2,
  },
  amount: {
    fontSize: 14.5,
    flexShrink: 0,
  },
});
