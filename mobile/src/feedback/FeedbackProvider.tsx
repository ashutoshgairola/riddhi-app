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
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { BottomSheet } from '../components/BottomSheet';
import { FormSheet, type FormConfig } from '../components/FormSheet';
import { useTheme } from '../theme/ThemeProvider';
import { radius, spring, weight } from '../theme/tokens';

/**
 * `toastShadow` is authored the same way as `BottomSheet`'s `sheetShadow` —
 * an `inset 0 1px 0 rgba(...)` highlight clause followed by an ambient
 * `0 10px 30px rgba(...)` drop-shadow clause. Reuses that same parsing
 * approach (see `BottomSheet.tsx`'s `topHighlightColor`/`ambientShadowColor`)
 * so the toast pill's shadow is theme-correct instead of a hardcoded black.
 */
function topHighlightColor(toastShadow: string): string {
  const match = toastShadow.match(/rgba\([^)]*\)/g);
  return match?.[0] ?? 'rgba(255,255,255,0.12)';
}

function ambientShadowColor(toastShadow: string): string {
  const match = toastShadow.match(/rgba\([^)]*\)/g);
  return match?.[1] ?? '#000000';
}

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
  /** Renders the row highlighted with a trailing check — used to mark the
   * currently-applied choice in a filter sheet. */
  selected?: boolean;
  onPress?: () => void;
}

export interface SheetSection {
  header?: string;
  options: SheetOption[];
}

export interface SheetConfig {
  title?: string;
  options?: SheetOption[];
  /** When present, rendered as labelled sections instead of `options`. */
  sections?: SheetSection[];
}

export interface FeedbackContextValue {
  toast(msg: string, icon?: string): void;
  sheet(cfg: SheetConfig): void;
  /** Opens a small bottom-sheet form (components/FormSheet.tsx) at the
   * root, above the tab bar — used by all quick create/edit flows. */
  form(cfg: FormConfig): void;
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
  const [formConfig, setFormConfig] = useState<FormConfig | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  // Monotonic counter rather than `Date.now() + Math.random()` (the web
  // version's id scheme) — avoids any (extremely unlikely) collision and is
  // simpler to reason about under React's strict mode double-invoke.
  const nextId = useRef(0);
  // Outstanding `setTimeout` ids (toast auto-dismiss + sheet-option action
  // delay) — tracked so they can all be cleared on unmount, avoiding any
  // setState-after-unmount if the provider is ever remounted.
  const timeoutIds = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      timeoutIds.current.forEach(clearTimeout);
      timeoutIds.current = [];
    };
  }, []);

  const toast = useCallback((msg: string, icon?: string) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, msg, icon }]);
    const timeoutId = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_DURATION_MS);
    timeoutIds.current.push(timeoutId);
  }, []);

  const sheet = useCallback((cfg: SheetConfig) => {
    setSheetConfig(cfg);
    setSheetOpen(true);
  }, []);

  const form = useCallback((cfg: FormConfig) => {
    setFormConfig(cfg);
    setFormOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
  }, []);

  const selectOption = useCallback((option: SheetOption) => {
    setSheetOpen(false);
    const timeoutId = setTimeout(() => {
      option.onPress?.();
    }, SHEET_ACTION_DELAY_MS);
    timeoutIds.current.push(timeoutId);
  }, []);

  const value = useMemo<FeedbackContextValue>(
    () => ({ toast, sheet, form }),
    [toast, sheet, form],
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <BottomSheet open={sheetOpen} onClose={closeSheet} title={sheetConfig?.title ?? 'Options'}>
        <SheetBody config={sheetConfig} onSelect={selectOption} />
      </BottomSheet>
      <FormSheet
        open={formOpen}
        config={formConfig}
        onClose={() => setFormOpen(false)}
        onError={toast}
      />
      {/* Toasts render last so they stack above both sheets. */}
      <ToastHost toasts={toasts} />
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
  // Mount-only effect (empty deps) — `Toast` consumes `useTheme()`, so kicking
  // the animation off directly in the render body would restart the
  // slide/scale/fade every time the theme context changes (e.g. a dark/light
  // toggle while the toast is visible re-renders this component). An effect
  // with `[]` deps fires exactly once per mount regardless of re-renders.
  useEffect(() => {
    progress.value = withTiming(1, { duration: TOAST_ENTRANCE_MS, easing: spring });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          shadowColor: ambientShadowColor(t.toastShadow),
        },
      ]}
    >
      {/* CSS inset top-highlight half of `toastShadow`, approximated the same
       * way `BottomSheet` approximates `sheetShadow`'s inset clause — a 1px
       * highlight view along the pill's top inner edge. */}
      <View
        style={[styles.toastHiLight, { backgroundColor: topHighlightColor(t.toastShadow) }]}
        pointerEvents="none"
      />
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
          {
            backgroundColor: option.selected ? t.glassBg2 : t.glassBg,
            borderColor: option.selected ? t.glassBrd2 : t.glassBrd,
          },
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
        {option.selected ? (
          <Text style={[styles.optionCheck, { color: t.em, fontFamily: weight(700) }]}>✓</Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

function SheetBody({
  config,
  onSelect,
}: {
  config: SheetConfig | null;
  onSelect: (option: SheetOption) => void;
}) {
  const { t } = useTheme();
  if (config?.sections) {
    return (
      <>
        {config.sections.map((section, si) => (
          <View key={si} style={si > 0 ? styles.sheetSection : undefined}>
            {section.header ? (
              <Text style={[styles.sheetSectionHeader, { color: t.text3, fontFamily: weight(600) }]}>
                {section.header}
              </Text>
            ) : null}
            <View style={styles.sheetOptions}>
              {section.options.map((option, i) => (
                <SheetOptionRow key={i} option={option} onSelect={() => onSelect(option)} />
              ))}
            </View>
          </View>
        ))}
      </>
    );
  }
  return (
    <View style={styles.sheetOptions}>
      {(config?.options ?? []).map((option, i) => (
        <SheetOptionRow key={i} option={option} onSelect={() => onSelect(option)} />
      ))}
    </View>
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
    // Opacity is 1 because `shadowColor` (set inline, per-theme) is itself an
    // rgba string carrying its own alpha — see `ambientShadowColor` (matches
    // the same pattern in `BottomSheet.tsx`'s `sheet` style).
    shadowOpacity: 1,
    shadowRadius: 30,
    elevation: 10,
  },
  toastHiLight: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    height: 1,
    borderRadius: 99,
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
  sheetSection: {
    marginTop: 6,
  },
  sheetSectionHeader: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  optionCheck: {
    marginLeft: 'auto',
    fontSize: 15,
  },
});
