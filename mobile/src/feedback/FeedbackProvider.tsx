/**
 * Feedback bus — toast + action-sheet, replacing the prototype's
 * `window.dispatchEvent`/`CustomEvent` global bus with React Context (RN has
 * no `window`).
 *
 * Source of truth: project/riddhi/MobileCore.jsx:207–261
 *  - `mToast(msg, icon)` / `MToastHost` -> `toast()` here. Stacked toasts,
 *    positioned `bottom:104`, centered, `pointerEvents:none` on the host so
 *    touches pass through to the app underneath; each auto-dismisses after
 *    2200ms. Styled per `.m-toast` (project/riddhi/mobile.css:687–704): pill
 *    shape, frosted glass (`toastBg`/`toastBorder`/`toastShadow` tokens),
 *    13.5px/600 text, `max-width: 78%`, with a spring entrance (`toastIn`
 *    keyframe: `translateY(16px) scale(0.94)` + opacity 0 -> resting state)
 *    reproduced here via Reanimated (`withTiming` + the token `spring`
 *    easing curve, ~400ms to match `.4s var(--spring)`).
 *  - `mSheet(cfg)` / `MActionSheetHost` -> `sheet()` here, rendered through
 *    the already-ported `BottomSheet` (src/components/BottomSheet.tsx). Each
 *    option renders icon + label (danger -> `t.red`), and tapping one closes
 *    the sheet then fires the callback after a 60ms delay (matching the
 *    source's `setOpen(false); setTimeout(() => o.onClick && o.onClick(), 60)`)
 *    so the sheet's close animation isn't interrupted by whatever the
 *    callback does. Web's `onClick` is renamed `onPress` per RN convention.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { BottomSheet } from '../components/BottomSheet';
import { useTheme } from '../theme/ThemeProvider';
import { radius, spring, weight } from '../theme/tokens';

/** `.m-toast` auto-dismiss delay — mobile.css:687–700 has no explicit timer,
 * the 2200ms lives in the web's `MToastHost` (MobileCore.jsx:217). */
const TOAST_DURATION_MS = 2200;
/** `toastIn .4s var(--spring)` (mobile.css:699). */
const TOAST_ENTRANCE_MS = 400;
/** Delay between closing the sheet and firing the selected option's
 * callback — MobileCore.jsx:246 (`setTimeout(..., 60)`). */
const SHEET_ACTION_DELAY_MS = 60;

export interface SheetOption {
  label: string;
  /** Emoji/glyph shown before the label, matching the web's `o.icon` (a
   * plain string, e.g. an emoji) — not one of the `MI` SVG icon names. */
  icon?: string;
  danger?: boolean;
  onPress?: () => void;
}

export interface SheetConfig {
  title?: string;
  options: SheetOption[];
}

export interface FeedbackContextValue {
  toast(msg: string, icon?: string): void;
  sheet(cfg: SheetConfig): void;
}

interface ToastItem {
  id: number;
  msg: string;
  icon?: string;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [sheetConfig, setSheetConfig] = useState<SheetConfig | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Monotonic counter rather than `Date.now() + Math.random()` (the web
  // version's id scheme) — avoids any (extremely unlikely) collision and is
  // simpler to reason about under React's strict mode double-invoke.
  const nextId = useRef(0);

  const toast = useCallback((msg: string, icon?: string) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, msg, icon }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_DURATION_MS);
  }, []);

  const sheet = useCallback((cfg: SheetConfig) => {
    setSheetConfig(cfg);
    setSheetOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
  }, []);

  const selectOption = useCallback((option: SheetOption) => {
    setSheetOpen(false);
    setTimeout(() => {
      option.onPress?.();
    }, SHEET_ACTION_DELAY_MS);
  }, []);

  const value = useMemo<FeedbackContextValue>(() => ({ toast, sheet }), [toast, sheet]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <ToastHost toasts={toasts} />
      <BottomSheet open={sheetOpen} onClose={closeSheet} title={sheetConfig?.title ?? 'Options'}>
        <View style={styles.sheetOptions}>
          {(sheetConfig?.options ?? []).map((option, i) => (
            <SheetOptionRow key={i} option={option} onSelect={() => selectOption(option)} />
          ))}
        </View>
      </BottomSheet>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error('useFeedback must be used within a FeedbackProvider');
  }
  return ctx;
}

function ToastHost({ toasts }: { toasts: ToastItem[] }) {
  return (
    <View style={styles.toastHost} pointerEvents="none">
      {toasts.map((t) => (
        <Toast key={t.id} msg={t.msg} icon={t.icon} />
      ))}
    </View>
  );
}

function Toast({ msg, icon }: { msg: string; icon?: string }) {
  const { t } = useTheme();
  // `toastIn`: from { opacity:0, translateY(16px) scale(0.94) } to resting —
  // animate progress 0 -> 1 once on mount and derive both transform
  // components from it.
  const progress = useSharedValue(0);
  // `useSharedValue`'s initializer runs once per mount; since this component
  // is only ever mounted fresh (one `Toast` per stacked item, never reused),
  // kicking the animation off directly during render is equivalent to a
  // mount effect without needing `useEffect` + `runOnJS` ceremony.
  progress.value = withTiming(1, { duration: TOAST_ENTRANCE_MS, easing: spring });

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: (1 - progress.value) * 16 },
      { scale: 0.94 + progress.value * 0.06 },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.toast,
        animatedStyle,
        {
          backgroundColor: t.toastBg,
          borderColor: t.toastBorder,
          shadowColor: '#000',
        },
      ]}
    >
      {icon ? <Text style={styles.toastIcon}>{icon}</Text> : null}
      <Text style={[styles.toastMsg, { color: t.text1, fontFamily: weight(600) }]} numberOfLines={2}>
        {msg}
      </Text>
    </Animated.View>
  );
}

function SheetOptionRow({ option, onSelect }: { option: SheetOption; onSelect: () => void }) {
  const { t } = useTheme();
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.02 }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onSelect}
        onPressIn={() => {
          pressed.value = 1;
        }}
        onPressOut={() => {
          pressed.value = 0;
        }}
        style={[
          styles.optionRow,
          { backgroundColor: t.glassBg, borderColor: t.glassBrd },
        ]}
      >
        {option.icon ? <Text style={styles.optionIcon}>{option.icon}</Text> : null}
        <Text
          style={[
            styles.optionLabel,
            { color: option.danger ? t.red : t.text1, fontFamily: weight(600) },
          ]}
        >
          {option.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toastHost: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 104,
    alignItems: 'center',
    gap: 8,
    zIndex: 400,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 99,
    borderWidth: 1,
    maxWidth: '78%',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 30,
    elevation: 10,
  },
  toastIcon: {
    fontSize: 15,
  },
  toastMsg: {
    fontSize: 13.5,
  },
  sheetOptions: {
    flexDirection: 'column',
    gap: 8,
    paddingBottom: 10,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  optionIcon: {
    fontSize: 18,
    width: 24,
    textAlign: 'center',
  },
  optionLabel: {
    flex: 1,
    fontSize: 15,
  },
});
