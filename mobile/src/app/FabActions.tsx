/**
 * FabActions — the FAB dim backdrop + speed-dial action pills that "fan"
 * out of the FAB on open and fold back into it on close.
 *
 * This renders the BACKDROP and the action PILLS only — the FAB *button*
 * itself lives in `<TabBar/>` (iOS) / `<MFab/>` (Android), both of which
 * toggle `fabOpen` via `useNav()`. `AppShell` mounts `<FabActions/>` above
 * (before, in JSX-order terms) the tab bar / nav bar + FAB.
 *
 * Fan motion: every pill runs off a single Reanimated `progress` value with
 * the FAB as its origin. When closed each pill is collapsed at the FAB's
 * vertical point (translated down onto it, scaled to ~0.3, opacity 0); on
 * open it rises to its resting slot, scales to 1 and fades in. The stagger
 * runs BOTH ways — bottom-first on open (unfurls upward), farthest-first on
 * close (folds back in) — so the group reads as emanating from / retracting
 * into the FAB button.
 *
 * Unblurred navbar: the tab bar / nav bar are stacked ABOVE this backdrop
 * (see TabBar/NavBar), so the dim only covers the stage above them; the
 * navbar (and the FAB) stay crisp and tappable.
 *
 * Tapping the backdrop or a pill closes the menu: 'chat'/'plan-event'
 * navigate then explicitly close the FAB; the other pills call `openAdd()`,
 * which already closes it.
 */
import {
  Image,
  type ImageSourcePropType,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useEffect } from "react";

import { LiquidGlass } from "../components/LiquidGlass";
import { AppIcon } from "../components/contentIcons";
import { useTheme } from "../theme/ThemeProvider";
import { space, weight } from "../theme/tokens";
import { useNav } from "./navContext";

interface FabAction {
  label: string;
  icon: string;
  /** Image badge (e.g. the Munshi avatar) shown instead of the emoji glyph. */
  image?: ImageSourcePropType;
  /** Token key into `Tokens`, resolved against the active theme below. */
  colorToken: "violet" | "red" | "em" | "blue";
  action?: "chat" | "plan-event";
}

// Ordered FAB-outward: index 0 is the pill nearest the FAB (bottom-most),
// index 4 is farthest (top-most). Read top→bottom the list is
// Ask Munshi ji/ Plan a big event / Log an expense / Add income / Transfer.
const FAB_ACTIONS: FabAction[] = [
  { label: "Transfer", icon: "🔄", colorToken: "blue" },
  { label: "Add income", icon: "💰", colorToken: "em" },
  { label: "Log an expense", icon: "💸", colorToken: "red" },
  {
    label: "Plan a big event",
    icon: "🎉",
    colorToken: "violet",
    action: "plan-event",
  },
  {
    label: "Ask Munshi ji anything",
    icon: "💬",
    image: require("../../assets/munshi.png"),
    colorToken: "violet",
    action: "chat",
  },
];

const TOTAL = FAB_ACTIONS.length;

const BACKDROP_DURATION_MS = 220;
// transform/opacity of each pill.
const PILL_DURATION_MS = 320;
// Stagger between consecutive pills (both directions).
const STAGGER_STEP_MS = 40;
const FAN_EASE = Easing.bezier(0.32, 0.72, 0, 1);

// Resting `bottom` of pill `i`. iOS pills centre over the tab-bar FAB; Android
// pills stack above the bottom-right MFab (96 = MFab bottom, +56 height +12 gap).
const iosPillBottom = (i: number) => 100 + i * 64;
const androidPillBottom = (i: number) => 96 + 56 + 12 + i * 64;
// Approx. bottom offset of the FAB centre — the point pills collapse onto.
const IOS_FAB_BOTTOM = 60;
const ANDROID_FAB_BOTTOM = 96 + 28; // MFab bottom + half its 56px height.

// Resting size hierarchy: the farthest pill (top) is full size, each step
// toward the FAB shrinks so the stack funnels into a triangle. index 0 is
// nearest the FAB (smallest), index TOTAL-1 is farthest (largest).
const MIN_REST_SCALE = 0.78;
const restScale = (i: number) =>
  MIN_REST_SCALE + (i / (TOTAL - 1)) * (1 - MIN_REST_SCALE);

function FabActionCard({
  item,
  index,
  isAndroid,
}: {
  item: FabAction;
  index: number;
  isAndroid: boolean;
}) {
  const { t } = useTheme();
  const { fabOpen, setFabOpen, nav, openAdd } = useNav();
  const color = t[item.colorToken];

  const restBottom = isAndroid
    ? androidPillBottom(index)
    : iosPillBottom(index);
  const fabBottom = isAndroid ? ANDROID_FAB_BOTTOM : IOS_FAB_BOTTOM;
  // Distance the pill sits below its slot when collapsed onto the FAB.
  const collapseY = restBottom - fabBottom;
  // Resting scale — smaller nearer the FAB for the triangular funnel.
  const openScale = restScale(index);

  const progress = useSharedValue(0);

  useEffect(() => {
    if (fabOpen) {
      // Bottom-first: nearest pill (index 0) unfurls first, upward.
      progress.value = withDelay(
        index * STAGGER_STEP_MS,
        withTiming(1, { duration: PILL_DURATION_MS, easing: FAN_EASE }),
      );
    } else {
      // Farthest-first: top pill folds back into the FAB first.
      progress.value = withDelay(
        (TOTAL - 1 - index) * STAGGER_STEP_MS,
        withTiming(0, { duration: PILL_DURATION_MS, easing: FAN_EASE }),
      );
    }
  }, [fabOpen, index, progress]);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    // Collapsed (p=0): translated down onto the FAB, scaled small, invisible.
    const translateY = (1 - p) * collapseY;
    const scale = 0.3 + (openScale - 0.3) * p;
    // Fade a touch faster than the transform so pills don't linger faint.
    const opacity = Math.min(1, p * 1.8);
    return {
      opacity,
      transform: [{ translateY }, { scale }],
    };
  });

  const handlePress = () => {
    if (item.action === "chat") {
      nav("chat");
      setFabOpen(false);
    } else if (item.action === "plan-event") {
      nav("events", { autoCreate: true });
      setFabOpen(false);
    } else {
      openAdd();
    }
  };

  return (
    <Animated.View
      style={[
        styles.action,
        isAndroid ? styles.actionAndroid : styles.actionIos,
        { bottom: restBottom },
        style,
      ]}
      pointerEvents={fabOpen ? "auto" : "none"}
    >
      <Pressable
        style={[styles.pill, { borderColor: t.fabActionBorder }]}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={item.label}
      >
        <LiquidGlass
          radius={999}
          border={false}
          tint={t.fabActionBg}
          intensity={22}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={[styles.icon, { backgroundColor: `${color}22` }]}>
          {item.image ? (
            <Image source={item.image} style={styles.iconImage} />
          ) : (
            <AppIcon value={item.icon} size={19} color={color} />
          )}
        </View>
        <Text
          style={[styles.label, { color: t.text1, fontFamily: weight(600) }]}
        >
          {item.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function FabActions() {
  const { fabOpen, setFabOpen, platform } = useNav();
  const isAndroid = platform === "android";

  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    backdropOpacity.value = withTiming(fabOpen ? 1 : 0, {
      duration: BACKDROP_DURATION_MS,
    });
  }, [fabOpen, backdropOpacity]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  return (
    <>
      <Animated.View
        style={[styles.backdrop, backdropStyle]}
        pointerEvents={fabOpen ? "auto" : "none"}
      >
        <Pressable
          style={styles.backdropFill}
          onPress={() => setFabOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <BlurView
            intensity={20}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              styles.backdropTint,
              { backgroundColor: "rgba(0,0,0,0.65)" },
            ]}
          />
        </Pressable>
      </Animated.View>

      {FAB_ACTIONS.map((item, i) => (
        <FabActionCard
          key={item.label}
          item={item}
          index={i}
          isAndroid={isAndroid}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 60,
    // Keep below the pills (5) and the FAB (MFab 6 / TabBar fab 8) on Android's
    // elevation plane; the nav bars are lifted above this (see TabBar/NavBar).
    elevation: 4,
  },
  backdropFill: {
    flex: 1,
  },
  backdropTint: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  action: {
    position: "absolute",
    // Android base plane: below the MFab (6) so pills read as emerging from
    // behind it. iOS overrides zIndex in `actionIos` to sit ABOVE the tab bar.
    zIndex: 61,
    elevation: 5,
  },
  actionIos: {
    left: 0,
    right: 0,
    alignItems: "center",
    // Float the fan ABOVE the tab bar (TabBar capsule is zIndex 70) so the
    // bottom-most pill isn't clipped by the navbar's top edge, while the dim
    // backdrop (60) stays below the navbar — backdrop < navbar < pills. Mirrors
    // the web, where `.m-fab-fan` stacks above `.m-tabbar`. (iOS honours
    // zIndex; elevation is a no-op there, so Android's plane is unaffected.)
    zIndex: 80,
  },
  actionAndroid: {
    right: 16,
    alignItems: "flex-end",
  },
  // Content-width, fully-rounded glass pill.
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[12],
    paddingVertical: space[10],
    paddingRight: space[24],
    paddingLeft: space[12],
    borderRadius: 999,
    borderWidth: 1,
    overflow: "hidden",
  },
  // Circular icon badge.
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  // Munshi avatar fills the circular badge.
  iconImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    resizeMode: "cover",
  },
  label: {
    fontSize: 16,
  },
});
