/**
 * ExpenseDragList — the multi-day expense list with drag-to-reschedule.
 *
 * Renders the same day sections as `EventDetail`'s Task 10 multi-day block
 * (per-`dayGroups` header + subtotal + `ExpenseRow`s), but each row is a
 * long-press-to-lift, pan-to-drag target. Dragging a row over a different
 * day section highlights it; releasing over it fires `onMove(id, dayDate)`.
 *
 * Gesture stack (hand-rolled on the app's existing gesture-handler 2.31 +
 * reanimated 4.3, matching `SwipeRow`/`PullToRefresh`/`BottomSheet` usage —
 * no new dependency):
 *  - Each row owns one `Gesture.Pan().activateAfterLongPress(200)`. This is
 *    the idiomatic gesture-handler recipe for "hold, then drag": the pan
 *    only claims the touch after a ~200ms stationary hold, so (a) a plain
 *    tap still falls through to the row's inner `Pressable`s (edit / toggle
 *    paid), and (b) the enclosing `MPageShell` `ScrollView` keeps normal
 *    scrolling until a deliberate long-press begins. `onStart` fires at the
 *    moment the hold completes (the "lift"); `onUpdate` tracks the finger;
 *    `onEnd` settles/commits.
 *  - Section hit-testing is done in **window coordinates**: on lift we
 *    `measureInWindow` every section View into `framesRef` ({top,bottom} per
 *    key). The pan's `absoluteY` is already in window space, so a hit test is
 *    a simple top<=y<=bottom scan — no container-origin math, and re-measuring
 *    on each lift keeps it correct regardless of prior scroll offset.
 *  - Per-frame hit-testing and drop commit hop to JS via `runOnJS`; the lift
 *    transform (translateY/scale/elevation) stays on the UI thread.
 *
 * Drop targets are section-level (a whole day), so the active-target
 * highlight and the dim-others state are plain React state (they change on
 * lift/enter/release, not per frame) — only the lifted row's translate is a
 * per-frame shared value.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../../theme/ThemeProvider';
import { ease, weight } from '../../theme/tokens';
import { formatDayShort } from './eventDates';
import { evFmt } from './ExpenseRow';
import type { EventDayGroup, EventExpenseView } from '../../api/types';

/** Hold duration (ms) before a row lifts into a drag — brief's ≈200ms. */
const LIFT_HOLD_MS = 200;
/** Scale bump applied to the lifted row (brief: scale 1.03). */
const LIFT_SCALE = 0.03;
const LIFT_SPRING = { damping: 18, stiffness: 240, mass: 0.7 };

const keyFor = (dayDate: string | null): string => dayDate ?? 'unscheduled';

export interface ExpenseDragListProps {
  groups: EventDayGroup[];
  expenses: EventExpenseView[];
  renderRow: (x: EventExpenseView) => React.ReactNode;
  /** Fired on drop into a section whose day differs from the row's current day. */
  onMove: (expenseId: string, toDayDate: string | null) => void;
}

interface SectionFrame {
  top: number;
  bottom: number;
  dayDate: string | null;
}

export function ExpenseDragList({ groups, expenses, renderRow, onMove }: ExpenseDragListProps) {
  const { t } = useTheme();

  // id of the currently-lifted row (null when idle) — drives dimming of the
  // other rows. Changes once per drag, so plain state is fine.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // key of the section the finger is currently over — drives its highlight.
  const [activeDropKey, setActiveDropKey] = useState<string | null>(null);

  // Section View handles, keyed by keyFor(dayDate). Populated via `ref`.
  const sectionRefs = useRef<Record<string, View | null>>({});
  // Measured window-space frames, refreshed on every lift.
  const framesRef = useRef<Record<string, SectionFrame>>({});

  // Re-measure every section into window coordinates. Called on lift so the
  // frames are current for the whole drag regardless of scroll position.
  // Rebuilds `framesRef` from scratch keyed off the CURRENT `groups`, so a day
  // that emptied (and whose section unmounted) after a move can't leave a
  // stale frame behind — a lingering frame could overlap another day's new
  // on-screen position and fire a spurious wrong-day move.
  const measureSections = () => {
    const next: Record<string, SectionFrame> = {};
    for (const g of groups) {
      const key = keyFor(g.dayDate);
      const node = sectionRefs.current[key];
      if (!node) continue; // unmounted/null ref contributes nothing
      node.measureInWindow((_x, y, _w, h) => {
        next[key] = { top: y, bottom: y + h, dayDate: g.dayDate };
      });
    }
    framesRef.current = next;
  };

  // Which section (by key) does this window-space Y fall in? null = none.
  const hitTestKey = (absoluteY: number): string | null => {
    for (const key of Object.keys(framesRef.current)) {
      const f = framesRef.current[key];
      if (absoluteY >= f.top && absoluteY <= f.bottom) return key;
    }
    return null;
  };

  const onLiftStart = (expenseId: string) => {
    measureSections();
    setDraggingId(expenseId);
  };

  const onDragMove = (absoluteY: number) => {
    const key = hitTestKey(absoluteY);
    setActiveDropKey((prev) => (prev === key ? prev : key));
  };

  const onDragEnd = (expenseId: string, fromDayDate: string | null, absoluteY: number) => {
    const key = hitTestKey(absoluteY);
    const target = key ? framesRef.current[key] : null;
    setDraggingId(null);
    setActiveDropKey(null);
    if (target && target.dayDate !== fromDayDate) {
      onMove(expenseId, target.dayDate);
    }
  };

  return (
    <View style={styles.expenseList}>
      {groups.map((g) => {
        const key = keyFor(g.dayDate);
        const rows = expenses.filter((x) => (x.dayDate ?? null) === g.dayDate);
        const active = activeDropKey === key;
        return (
          <View
            key={key}
            ref={(el) => {
              sectionRefs.current[key] = el;
            }}
            style={[
              styles.section,
              active ? { borderColor: t.em, backgroundColor: t.em + '14' } : null,
            ]}
          >
            <View style={styles.dayHeader}>
              <Text style={[styles.dayHeaderTitle, { color: t.text2, fontFamily: weight(700) }]}>
                {g.dayDate === null ? 'Unscheduled' : formatDayShort(g.dayDate)}
              </Text>
              <Text style={[styles.dayHeaderSub, { color: t.text3 }]}>
                {evFmt(g.paid)} / {evFmt(g.planned)}
              </Text>
            </View>
            <View style={styles.dayRows}>
              {rows.map((x) => (
                <DraggableRow
                  key={x.id}
                  expense={x}
                  dimmed={draggingId !== null && draggingId !== x.id}
                  onLiftStart={onLiftStart}
                  onDragMove={onDragMove}
                  onDragEnd={onDragEnd}
                >
                  {renderRow(x)}
                </DraggableRow>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function DraggableRow({
  expense,
  dimmed,
  onLiftStart,
  onDragMove,
  onDragEnd,
  children,
}: {
  expense: EventExpenseView;
  dimmed: boolean;
  onLiftStart: (expenseId: string) => void;
  onDragMove: (absoluteY: number) => void;
  onDragEnd: (expenseId: string, fromDayDate: string | null, absoluteY: number) => void;
  children: React.ReactNode;
}) {
  const translateY = useSharedValue(0);
  // 0 = at rest, 1 = fully lifted; drives scale/elevation/shadow together.
  const lift = useSharedValue(0);

  // Latest handlers + expense held in a ref so the memoized gesture below can
  // stay built-once (keyed on row identity) yet always call through to fresh
  // closures — no stale `onMove`/`expense` capture from an earlier render.
  const latest = useRef({ onLiftStart, onDragMove, onDragEnd, expense });
  latest.current = { onLiftStart, onDragMove, onDragEnd, expense };

  const jsLiftStart = useCallback(() => {
    latest.current.onLiftStart(latest.current.expense.id);
  }, []);
  const jsDragMove = useCallback((absoluteY: number) => {
    latest.current.onDragMove(absoluteY);
  }, []);
  const jsDragEnd = useCallback((absoluteY: number) => {
    const { onDragEnd: end, expense: x } = latest.current;
    end(x.id, x.dayDate ?? null, absoluteY);
  }, []);

  // Build the gesture once per row identity (`expense.id`/`dayDate`) — matches
  // how SwipeRow constructs its gesture, avoiding a fresh Gesture.Pan() on the
  // per-frame re-renders that setActiveDropKey/setDraggingId trigger mid-drag.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(LIFT_HOLD_MS)
        .onStart(() => {
          lift.value = withTiming(1, { duration: 120, easing: ease });
          runOnJS(jsLiftStart)();
        })
        .onUpdate((e) => {
          translateY.value = e.translationY;
          runOnJS(jsDragMove)(e.absoluteY);
        })
        .onEnd((e) => {
          runOnJS(jsDragEnd)(e.absoluteY);
          translateY.value = withSpring(0, LIFT_SPRING);
          lift.value = withTiming(0, { duration: 160, easing: ease });
        }),
    // js* callbacks + shared values are stable; rebuild only if the row's
    // identity/day changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expense.id, expense.dayDate],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: 1 + lift.value * LIFT_SCALE }],
    zIndex: lift.value > 0 ? 100 : 0,
    elevation: lift.value * 10,
    shadowColor: '#000',
    shadowOpacity: lift.value * 0.28,
    shadowRadius: lift.value * 14,
    shadowOffset: { width: 0, height: lift.value * 6 },
    opacity: withTiming(dimmed ? 0.42 : 1, { duration: 140 }),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  expenseList: {
    flexDirection: 'column',
    gap: 9,
  },
  section: {
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 14,
    padding: 4,
    marginHorizontal: -4,
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
});
