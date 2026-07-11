/**
 * Shared UI atoms — RN port of the small reusable building blocks every
 * screen composes from in the web prototype.
 *
 * Source of truth: project/riddhi/mobile.css (class names noted per atom
 * below) plus project/riddhi/MobileScreens.jsx:552–563 for `Toggle` (which
 * has no standalone CSS class — it's authored as inline styles).
 *
 * Conventions follow the existing components (`Glass.tsx`, `MSeg.tsx`,
 * `BottomSheet.tsx`): theme via `useTheme()`, radii/easing from
 * `theme/tokens`, fonts via `weight(n)`, and `:active` press feedback via
 * `Pressable`'s `style={({ pressed }) => ...}` form (a plain transform
 * swap is visually equivalent to the CSS `transition: transform .12s` for
 * such a short, small-amplitude scale and avoids a Reanimated dependency
 * for every atom that only needs a press-state scale).
 */
import { useEffect } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  type GestureResponderEvent,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassView } from './Glass';
import { useTheme } from '../theme/ThemeProvider';
import { ease, radius, spring, weight } from '../theme/tokens';
import { spacing } from '../theme/spacing';
import { MI } from './icons';
import { useNav } from '../app/navContext';

// ── Topbar ──────────────────────────────────────────────────────────
// .m-topbar (mobile.css:186–197) + .m-topbar.scrolled (198–203) +
// .m-topbar-title (204–210)
export interface TopbarProps {
  title?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  /** Mirrors the `.scrolled` class toggle: glass blur background + bottom
   * border once the page body has scrolled past the top. */
  scrolled?: boolean;
}

export function Topbar({ title, left, right, scrolled = false }: TopbarProps) {
  const { t, mode } = useTheme();
  // The web prototype rendered inside an iOS frame mock that owned the
  // status bar; on device the bar must clear the real status bar/notch.
  const insets = useSafeAreaInsets();

  const content = (
    <View style={styles.topbarRow}>
      {left}
      {title ? (
        <Text style={[styles.topbarTitle, { color: t.text1, fontFamily: weight(700) }]} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={styles.topbarSpacer} />
      )}
      {right}
    </View>
  );

  if (!scrolled) {
    return <View style={[styles.topbar, { paddingTop: insets.top + spacing.md }]}>{content}</View>;
  }

  // `.m-topbar.scrolled` (mobile.css:198–203) is NOT the glass-card recipe:
  // it wants only a bottom hairline and its own darker tint — GlassView's
  // 4-side border + top highlight read as a boxed band here. Compose the
  // blur + tint directly instead.
  return (
    <View
      style={[
        styles.topbar,
        styles.topbarScrolled,
        { paddingTop: insets.top + spacing.md, borderBottomColor: t.topbarScrolledBorder },
      ]}
    >
      <BlurView
        intensity={mode === 'light' ? 40 : 30}
        tint={mode === 'light' ? 'light' : 'dark'}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: t.topbarScrolledBg }]}
        pointerEvents="none"
      />
      {content}
    </View>
  );
}

// ── IconButton ──────────────────────────────────────────────────────
// .m-iconbtn uses a literal `border-radius: 14px` (mobile.css:215), which is
// not on the `--r-*` token scale, so it's a named local constant.
const ICONBTN_RADIUS = 14;
// .m-iconbtn (mobile.css:212–231) + .m-iconbtn-dot (233–241)
export interface IconButtonProps {
  children: React.ReactNode;
  onPress?: (e: GestureResponderEvent) => void;
  /** Renders the `.m-iconbtn-dot` red notification dot, top-right. */
  dot?: boolean;
  /** Button edge length. Defaults to 40 (`.m-iconbtn` width/height). */
  size?: number;
}

export function IconButton({ children, onPress, dot = false, size = 40 }: IconButtonProps) {
  const { t, mode } = useTheme();

  return (
    <Pressable onPress={onPress} style={[styles.iconBtnWrap, { width: size, height: size }]}>
      {({ pressed }) => (
        <GlassView
          // No alignItems/justifyContent here: on the wrapper they'd shrink
          // the tinted overlay to the icon's width (a vertical "pill" of
          // glass tint). `iconBtnInner` centers the icon instead.
          style={{ width: size, height: size, transform: [{ scale: pressed ? 0.92 : 1 }] }}
          // Overlay doesn't flex-fill by default (see Glass.tsx); the wrapper
          // is fixed-size here, so flex-fill the content box it leaves inside
          // its 1px border (a fixed size x size would overflow it by 2px).
          contentStyle={{ flex: 1 }}
          intensity={mode === 'light' ? 40 : 30}
          radius={ICONBTN_RADIUS}
          padding={0}
        >
          <View
            style={[
              styles.iconBtnInner,
              { backgroundColor: pressed ? t.glassBg2 : 'transparent' },
            ]}
          >
            {children}
          </View>
          {dot && <View style={[styles.iconBtnDot, { backgroundColor: t.red, borderColor: t.bg2 }]} />}
        </GlassView>
      )}
    </Pressable>
  );
}

// ── Chip ────────────────────────────────────────────────────────────
// .m-chip (mobile.css:477–493) + .m-chip.on (494–498)
export interface ChipProps {
  children: React.ReactNode;
  on?: boolean;
  onPress?: (e: GestureResponderEvent) => void;
}

export function Chip({ children, on = false, onPress }: ChipProps) {
  const { t } = useTheme();

  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <View
          style={[
            styles.chip,
            {
              backgroundColor: on ? t.emDim : t.bg2,
              borderColor: on ? t.emGlow : t.border,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            },
          ]}
        >
          {typeof children === 'string' ? (
            <Text
              style={{ color: on ? t.em : t.text2, fontSize: 12, fontFamily: weight(600) }}
              numberOfLines={1}
            >
              {children}
            </Text>
          ) : (
            children
          )}
        </View>
      )}
    </Pressable>
  );
}

// ── SectionHead ─────────────────────────────────────────────────────
// .m-section-head (mobile.css:501–506) + .m-section-title (507–512) +
// .m-section-link (513–518)
export interface SectionHeadProps {
  title: string;
  link?: string;
  onLink?: (e: GestureResponderEvent) => void;
}

export function SectionHead({ title, link, onLink }: SectionHeadProps) {
  const { t } = useTheme();

  return (
    <View style={styles.sectionHead}>
      <Text
        style={[styles.sectionTitle, { color: t.text1, fontFamily: weight(700) }]}
        numberOfLines={1}
      >
        {title}
      </Text>
      {link ? (
        <Pressable onPress={onLink}>
          <Text style={[styles.sectionLink, { color: t.em, fontFamily: weight(600) }]}>{link}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Btn ─────────────────────────────────────────────────────────────
// .m-btn (mobile.css:601–616) + .m-btn-em (617–618) + .m-btn-ghost (619) +
// .m-btn-danger (620)
export type BtnVariant = 'em' | 'ghost' | 'danger';

export interface BtnProps {
  children: React.ReactNode;
  variant?: BtnVariant;
  onPress?: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Btn({ children, variant = 'em', onPress, disabled = false, style }: BtnProps) {
  const { t } = useTheme();

  let bg = t.em;
  let color = '#1a1228';
  let borderColor: string | undefined;
  if (variant === 'ghost') {
    bg = t.bg2;
    color = t.text1;
    borderColor = t.border;
  } else if (variant === 'danger') {
    bg = t.red;
    color = '#fff';
  }

  return (
    <Pressable onPress={onPress} disabled={disabled}>
      {({ pressed }) => (
        <View
          style={[
            styles.btn,
            {
              backgroundColor: bg,
              borderColor,
              borderWidth: borderColor ? 1 : 0,
              opacity: disabled ? 0.45 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            },
            style,
          ]}
        >
          {typeof children === 'string' ? (
            <Text style={{ color, fontSize: 15, fontFamily: weight(600) }}>{children}</Text>
          ) : (
            children
          )}
        </View>
      )}
    </Pressable>
  );
}

// ── ProgressBar ─────────────────────────────────────────────────────
// .m-pbar (mobile.css:588–593) + .m-pfill (594–598, `transition: width .8s
// var(--ease)` — animated here via Reanimated `withTiming`)
const PFILL_DURATION_MS = 800;

export interface ProgressBarProps {
  /** Fill percentage, 0–100. */
  pct: number;
  color: string;
  /** Track height. Defaults to 6 (`.m-pbar` height). */
  height?: number;
}

export function ProgressBar({ pct, color, height = 6 }: ProgressBarProps) {
  const { t } = useTheme();
  const clamped = Math.max(0, Math.min(100, pct));
  const width = useSharedValue(clamped);

  useEffect(() => {
    width.value = withTiming(clamped, { duration: PFILL_DURATION_MS, easing: ease });
  }, [clamped, width]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
  }));

  return (
    <View style={[styles.pbar, { height, backgroundColor: t.bg3 }]}>
      <Animated.View style={[styles.pfill, fillStyle, { backgroundColor: color }]} />
    </View>
  );
}

// ── Toggle ──────────────────────────────────────────────────────────
// project/riddhi/MobileScreens.jsx:552–563 (inline-styled `Toggle`, no
// standalone CSS class): 42x25 pill track, 21x21 white knob sliding
// left: 2 -> 19 with `transition: left .2s var(--spring)`.
const TOGGLE_TRACK_WIDTH = 42;
const TOGGLE_TRACK_HEIGHT = 25;
const TOGGLE_KNOB_SIZE = 21;
const TOGGLE_KNOB_OFF = 2;
const TOGGLE_KNOB_ON = 19;

export interface ToggleProps {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ on, onChange, disabled = false }: ToggleProps) {
  const { t } = useTheme();
  const knobLeft = useSharedValue(on ? TOGGLE_KNOB_ON : TOGGLE_KNOB_OFF);

  useEffect(() => {
    knobLeft.value = withSpring(on ? TOGGLE_KNOB_ON : TOGGLE_KNOB_OFF, {
      // Matches CSS `--spring: cubic-bezier(.34, 1.56, .64, 1)` closely
      // enough for a 17px knob slide — RN's spring physics aren't a 1:1
      // match for a CSS bezier curve, but this reads the same: a quick
      // motion with a slight overshoot settle.
      damping: 14,
      stiffness: 220,
      mass: 0.6,
    });
  }, [on, knobLeft]);

  const knobStyle = useAnimatedStyle(() => ({
    left: knobLeft.value,
  }));

  return (
    <Pressable
      onPress={() => onChange(!on)}
      disabled={disabled}
      style={[styles.toggleTrack, { backgroundColor: on ? t.em : t.bg3, opacity: disabled ? 0.4 : 1 }]}
    >
      <Animated.View style={[styles.toggleKnob, knobStyle]} />
    </Pressable>
  );
}

// ── ListCard / ListRow ──────────────────────────────────────────────
// .m-list-card (mobile.css:453–461) + .m-list-row (463–474)
export interface ListCardProps {
  children: React.ReactNode;
}

export function ListCard({ children }: ListCardProps) {
  return (
    <GlassView style={styles.listCard} radius={radius.xl} padding={0}>
      {children}
    </GlassView>
  );
}

export interface ListRowProps {
  children: React.ReactNode;
  onPress?: (e: GestureResponderEvent) => void;
  /** Suppresses the bottom border (`:last-child { border-bottom: none }`). */
  last?: boolean;
}

export function ListRow({ children, onPress, last = false }: ListRowProps) {
  const { t } = useTheme();

  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <View
          style={[
            styles.listRow,
            {
              borderBottomColor: last ? 'transparent' : t.border,
              borderBottomWidth: last ? 0 : 1,
              backgroundColor: pressed ? t.glassBg2 : 'transparent',
            },
          ]}
        >
          {children}
        </View>
      )}
    </Pressable>
  );
}

// ── HScroll ─────────────────────────────────────────────────────────
// .m-hscroll (mobile.css:645–656): horizontal flex row, 12px gap, hidden
// scrollbar, 4px/18px padding, -18px horizontal margins (offsetting the
// padding so children align with the page's own 18px gutters).
export interface HScrollProps {
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}

export function HScroll({ children, contentStyle }: HScrollProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.hscroll}
      contentContainerStyle={[styles.hscrollContent, contentStyle]}
    >
      {children}
    </ScrollView>
  );
}

/** Standard topbar search button — navigates to the full-screen Search
 * palette. `search` is not a primary tab, so `nav` pushes it and its back
 * button pops (navContext.tsx). */
export function SearchButton() {
  const { t } = useTheme();
  const { nav } = useNav();
  return (
    <IconButton onPress={() => nav('search')}>
      <MI.search size={20} color={t.text1} />
    </IconButton>
  );
}

/** Horizontal row for a topbar's right slot when it holds more than one
 * action (e.g. SearchButton + a plus/filter/more IconButton). Search goes
 * first. Values mirror the former per-screen `topbarActions` style. */
export function TopbarActions({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 0 }}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // Topbar
  topbar: {
    position: 'relative',
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  topbarScrolled: {
    borderBottomWidth: 1,
  },
  topbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  topbarTitle: {
    fontSize: 19,
    letterSpacing: -0.38, // -0.02em of 19px
    flex: 1,
  },
  topbarSpacer: {
    flex: 1,
  },

  // IconButton
  iconBtnWrap: {
    flexShrink: 0,
  },
  iconBtnInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: ICONBTN_RADIUS,
  },
  iconBtnDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 99,
    borderWidth: 2,
  },

  // Chip
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 99,
    borderWidth: 1,
    flexShrink: 0,
    alignSelf: 'flex-start',
  },

  // SectionHead
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xxs,
    paddingHorizontal: spacing.xxs,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 15,
    letterSpacing: -0.15, // -0.01em of 15px
  },
  sectionLink: {
    fontSize: 13,
  },

  // Btn
  btn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },

  // ProgressBar
  pbar: {
    borderRadius: 99,
    overflow: 'hidden',
  },
  pfill: {
    height: '100%',
    borderRadius: 99,
  },

  // Toggle
  toggleTrack: {
    width: TOGGLE_TRACK_WIDTH,
    height: TOGGLE_TRACK_HEIGHT,
    borderRadius: 99,
    flexShrink: 0,
  },
  toggleKnob: {
    position: 'absolute',
    top: 2,
    width: TOGGLE_KNOB_SIZE,
    height: TOGGLE_KNOB_SIZE,
    borderRadius: 99,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 2,
  },

  // ListCard / ListRow
  listCard: {
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },

  // HScroll
  hscroll: {
    marginHorizontal: -18,
  },
  hscrollContent: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.xxs,
    paddingHorizontal: spacing.md,
  },
});
