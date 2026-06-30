/**
 * AppShell — the navigation backbone. RN port of the `<div className="m-shell">`
 * root in `project/riddhi/MobileApp.jsx:319–389`.
 *
 * Renders the top of the nav stack (`useNav().top`) inside a custom
 * Reanimated transition that reproduces the prototype's CSS keyframes
 * exactly, plus the platform-specific chrome: the iOS `<TabBar/>` (with
 * its centre FAB tab) or the Android `<NavBar/>` + floating `<MFab/>`
 * (Task 3.2). The FAB radial speed-dial actions (Task 3.3) and sheets —
 * Add/More/Profile (Task 3.4) — are left as marked integration points;
 * this shell does not render them yet.
 *
 * Transition source of truth:
 *  - iOS: `.m-page-enter` (project/riddhi/mobile.css:173,176–179) —
 *    `translateX(100%) -> translateX(0)`, `opacity .4 -> 1`, 0.32s,
 *    `var(--ease)` = cubic-bezier(.32,.72,0,1) (theme/tokens.ts `ease`).
 *  - Android: `.m-page-enter-md` (project/riddhi/platform.css:86–90) —
 *    `scale(.94) -> scale(1)`, `opacity 0 -> 1`, 0.3s,
 *    cubic-bezier(.2,0,0,1) (theme/tokens.ts uses the same `--ease` token
 *    value for Android per platform.css:39, so the shared `ease` curve is
 *    reused for both — see ANDROID_EASE below for the literal bezier in
 *    case that ever diverges).
 *
 * The prototype only animates the *entering* screen (`m-page-enter`) — the
 * screen beneath it isn't separately animated out on push (MobileApp.jsx
 * remounts a single `<div key={stack.length+'-'+top.kind}>` per top-of-stack
 * change, so the previous screen simply unmounts). `m-page-exit` exists in
 * the CSS but nothing in MobileApp.jsx applies it on this path, so it is
 * intentionally not reproduced here — only the enter transition fires, on
 * every stack-top change (push, pop, or tab reset alike).
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AddTxSheet } from './AddTxSheet';
import { FabActions } from './FabActions';
import { MFab, NavBar } from './NavBar';
import { MoreSheet } from './MoreSheet';
import { ProfileSheet } from './ProfileSheet';
import { TabBar } from './TabBar';
import { renderScreen } from './screens';
import { useNav } from './navContext';

// .m-page-enter: 0.32s var(--ease)
const IOS_ENTER_MS = 320;
// .m-page-enter-md: 0.3s cubic-bezier(.2,0,0,1)
const ANDROID_ENTER_MS = 300;
const ANDROID_EASE = Easing.bezier(0.2, 0, 0, 1);
const IOS_EASE = Easing.bezier(0.32, 0.72, 0, 1);

function StackTransition({ transitionKey, children }: { transitionKey: string; children: React.ReactNode }) {
  const { platform } = useNav();
  const isAndroid = platform === 'android';

  // Driven imperatively (not keyed remount) so the same shell instance can
  // re-trigger the enter animation on every stack-top change, mirroring
  // the prototype's `key={stack.length + '-' + top.kind}` remount.
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: isAndroid ? ANDROID_ENTER_MS : IOS_ENTER_MS,
      easing: isAndroid ? ANDROID_EASE : IOS_EASE,
    });
    // Re-trigger whenever the stack-top identity (transitionKey) or the
    // platform's transition style (isAndroid) changes.
  }, [transitionKey, isAndroid, progress]);

  const style = useAnimatedStyle(() => {
    if (isAndroid) {
      // pageInMd: scale(.94) -> scale(1), opacity 0 -> 1
      const scale = 0.94 + 0.06 * progress.value;
      return {
        opacity: progress.value,
        transform: [{ scale }],
      };
    }
    // pageIn: translateX(100%) -> translateX(0), opacity .4 -> 1
    const translateX = (1 - progress.value) * 100;
    return {
      opacity: 0.4 + 0.6 * progress.value,
      transform: [{ translateX: `${translateX}%` as unknown as number }],
    };
  });

  return <Animated.View style={[styles.pageLayer, style]}>{children}</Animated.View>;
}

export function AppShell() {
  const { top, stack, platform, fabOpen, setFabOpen } = useNav();
  const isAndroid = platform === 'android';
  // Include stack depth so two sequential pushes of the same kind+data still
  // re-trigger the enter animation, matching the prototype's
  // key={stack.length + '-' + top.kind} (MobileApp.jsx:321).
  const transitionKey = `${stack.length}-${top.kind}-${JSON.stringify(top.data ?? null)}`;

  return (
    <View style={styles.shell}>
      <View style={styles.stage}>
        <StackTransition transitionKey={transitionKey}>{renderScreen(top)}</StackTransition>
      </View>

      {/* FAB radial backdrop + speed-dial actions (MobileApp.jsx:325–341).
          Rendered before the tab bar / FAB button below so the backdrop
          covers the screen but the FAB itself (in TabBar/NavBar+MFab)
          stacks on top and stays tappable to close the menu — same DOM
          order as the web (`.m-fab-backdrop`/`.m-fab-action` precede
          `.m-tabbar`/`.m-navbar`/`.m-mfab` in MobileApp.jsx:325–389). */}
      <FabActions />

      {/* Add/More/Profile sheets — siblings of the tab bar, each reading
          its own open flag + setter from useNav() (MobileApp.jsx:382–384). */}
      <AddTxSheet />
      <MoreSheet />
      <ProfileSheet />

      {isAndroid ? (
        <>
          <MFab open={fabOpen} onPress={() => setFabOpen(!fabOpen)} />
          <NavBar />
        </>
      ) : (
        <TabBar />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
  stage: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  pageLayer: {
    flex: 1,
  },
});
