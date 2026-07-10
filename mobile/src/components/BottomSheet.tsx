/**
 * BottomSheet — modal sheet with a frosted-glass surface, fade-in backdrop,
 * and drag-to-dismiss via a handle zone.
 *
 * Source of truth: project/riddhi/MobileCore.jsx:27–79 (`BottomSheet`) +
 * `.m-sheet*` / `.m-sheet-backdrop` styles (project/riddhi/mobile.css:376–440).
 *
 * Behavior parity with the web component:
 *  - Backdrop fades in/out (opacity, `.25s`) and is tappable-to-close.
 *  - Sheet slides from `translateY(100%)` to `translateY(0)` on open
 *    (`.35s` ease — `tokens.ease`), and slides back out on close.
 *  - A "handle zone" at the top of the sheet is the drag target: dragging
 *    down follows the finger 1:1 (`dy` clamped to >= 0 — no upward drag,
 *    matching the web's `if (dy > 0) setDrag(dy)`); releasing past 100px
 *    of vertical drag calls `onClose`, otherwise the sheet springs back to 0.
 *  - While dragging, the transform tracks the gesture with no easing (web:
 *    `transition: drag > 0 ? 'none' : ...`); on release it animates (spring
 *    back) or the parent unmounts/hides it via `open=false` (close).
 *
 * Surface: frosted glass via `expo-blur`'s `BlurView` (`intensity` tuned up
 * for the heavier `blur(40px) saturate(180%)` the web sheet uses, vs.
 * `GlassView`'s lighter card blur) layered under the theme's `sheetBg` tint,
 * `sheetBorder` top border, rounded top corners (`radius.xl2` = 32, matching
 * `border-radius: 32px 32px 0 0`), and `sheetShadow` translated to RN's
 * `shadow*`/`elevation` props (the CSS inset highlight has no RN box-shadow
 * equivalent — see `Glass.tsx`'s `hiLight` for the same workaround, reused
 * here as a 1px top highlight).
 *
 * `max-height: 92%` is reproduced via a percentage `maxHeight` on the
 * outermost sheet container; the bottom safe-area inset is added as
 * additional bottom padding inside the body so content/CTAs clear the home
 * indicator, same intent as the web's `env(safe-area-inset-bottom)` usage
 * elsewhere in the app.
 */
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';
import { ease, radius, weight } from '../theme/tokens';
import { LiquidGlass } from './LiquidGlass';
import { MI } from './icons';

/**
 * `sheetShadow` is authored as a two-part CSS shadow string, e.g.
 * `"inset 0 1px 0 rgba(255,255,255,0.12), 0 -12px 48px rgba(0,0,0,0.5)"` — an
 * inset top highlight (now supplied by LiquidGlass's specular rim) plus an
 * ambient drop shadow. RN has no inset-shadow primitive; the ambient clause's
 * color is pulled out here and approximated via the `sheet` style's
 * `shadow*`/`elevation` props.
 *
 * Second `rgba(...)` in `sheetShadow` belongs to the ambient `0 -12px 48px
 * rgba(...)` clause.
 */
function ambientShadowColor(sheetShadow: string): string {
  const match = sheetShadow.match(/rgba\([^)]*\)/g);
  return match?.[1] ?? '#000000';
}

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
  headerRight?: ReactNode;
}

/** Drag distance (px) past which a release dismisses the sheet — web parity (`drag > 100`). */
const DISMISS_THRESHOLD = 100;
/** Open/close slide duration — web's `.m-sheet { transition: transform .35s var(--ease); }`. */
const SLIDE_DURATION_MS = 350;
/** Backdrop fade duration — web's `.m-sheet-backdrop { transition: opacity .25s var(--ease); }`. */
const BACKDROP_DURATION_MS = 250;

export function BottomSheet({ open, onClose, title, children, headerRight }: BottomSheetProps) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const screenHeight = Dimensions.get('window').height;

  // 0 = fully open (translateY 0); `screenHeight` is a safe "fully offscreen"
  // distance, standing in for the web's `translateY(100%)` (sheet height is
  // intrinsic/unknown ahead of layout, so we slide by the full screen height
  // instead — visually identical, since the sheet itself is clipped to
  // `max-height: 92%` and anything beyond its own height is just blank
  // overscroll of the translation).
  const translateY = useSharedValue(screenHeight);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (open) {
      translateY.value = withTiming(0, { duration: SLIDE_DURATION_MS, easing: ease });
      backdropOpacity.value = withTiming(1, { duration: BACKDROP_DURATION_MS, easing: ease });
    } else {
      translateY.value = withTiming(screenHeight, { duration: SLIDE_DURATION_MS, easing: ease });
      backdropOpacity.value = withTiming(0, { duration: BACKDROP_DURATION_MS, easing: ease });
    }
    // `screenHeight`/`translateY`/`backdropOpacity` are stable (shared values,
    // dimension snapshot) — only `open` should retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pan = Gesture.Pan()
    .onChange((e) => {
      // Web parity: `if (dy > 0) setDrag(dy)` — ignore upward drags entirely
      // (clamp at 0, the fully-open position) rather than letting the sheet
      // overshoot above its resting point.
      const next = translateY.value + e.changeY;
      translateY.value = Math.max(0, next);
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_THRESHOLD) {
        translateY.value = withTiming(screenHeight, { duration: SLIDE_DURATION_MS, easing: ease });
        backdropOpacity.value = withTiming(0, { duration: BACKDROP_DURATION_MS, easing: ease });
        runOnJS(onClose)();
      } else {
        translateY.value = withTiming(0, { duration: SLIDE_DURATION_MS, easing: ease });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  return (
    // zIndex 200 lifts the whole sheet (backdrop + surface) ABOVE the tab bar
    // (TabBar capsule is zIndex 70) — otherwise on iOS the navbar's explicit
    // zIndex beats this sheet's source order and clips the sheet's bottom rows.
    // Mirrors the web's `.m-sheet-backdrop`/`.m-sheet` z-index 200/201 vs
    // `.m-tabbar`'s 70. (Android already lifts via the sheet's elevation 24.)
    <View style={[StyleSheet.absoluteFill, styles.root]} pointerEvents={open ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]} pointerEvents={open ? 'auto' : 'none'}>
        <Pressable
          style={[styles.backdropFill, { backgroundColor: t.sheetBackdropBg }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheet,
          sheetStyle,
          {
            maxHeight: '92%',
            shadowColor: ambientShadowColor(t.sheetShadow),
          },
        ]}
      >
        {/* Border radius + overflow clip live on this inner wrapper rather
         * than the outer `sheet` View so the ambient drop shadow (set on
         * `sheet`) isn't clipped along with the blur/content — `overflow:
         * hidden` and `shadow*` don't compose on the same RN View. */}
        <View style={[styles.surfaceClip, { borderTopColor: t.sheetBorder }]}>
          <LiquidGlass radius={radius.xl2} border={false} tint={t.sheetBg} intensity={40} contentStyle={styles.surface}>
            <GestureDetector gesture={pan}>
              <View style={styles.handleZone}>
                <View style={[styles.handle, { backgroundColor: t.borderStr }]} />
              </View>
            </GestureDetector>

            {title ? (
              <View style={styles.head}>
                <Text style={[styles.title, { color: t.text1, fontFamily: weight(700) }]} numberOfLines={1}>
                  {title}
                </Text>
                {headerRight ?? (
                  <Pressable
                    onPress={onClose}
                    style={[styles.iconBtn, { backgroundColor: t.glassBg, borderColor: t.glassBrd }]}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <MI.close size={17} color={t.text1} />
                  </Pressable>
                )}
              </View>
            ) : null}

            <ScrollView
              style={styles.body}
              contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          </LiquidGlass>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Above the tab bar (zIndex 70) so an open sheet covers the navbar.
  root: {
    zIndex: 200,
  },
  backdropFill: {
    flex: 1,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    shadowOffset: { width: 0, height: -12 },
    // Opacity is 1 because `shadowColor` (set inline, per-theme) is itself an
    // rgba string carrying its own alpha — see `ambientShadowColor`.
    shadowOpacity: 1,
    shadowRadius: 48,
    elevation: 24,
  },
  surfaceClip: {
    borderTopLeftRadius: radius.xl2,
    borderTopRightRadius: radius.xl2,
    borderTopWidth: 1,
    overflow: 'hidden',
  },
  surface: {
    flexShrink: 1,
  },
  hiLight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  handleZone: {
    paddingTop: 10,
    paddingBottom: 4,
    alignItems: 'center',
    flexShrink: 0,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 99,
  },
  head: {
    paddingHorizontal: 22,
    paddingTop: 6,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
    gap: 12,
  },
  title: {
    fontSize: 19,
    letterSpacing: -0.4,
    flex: 1,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  body: {
    flexGrow: 0,
    flexShrink: 1,
    paddingHorizontal: 22,
  },
});
