/**
 * AppShell — the navigation backbone. RN port of the `<div className="m-shell">`
 * root in `project/riddhi/MobileApp.jsx:319–389`.
 *
 * Renders the top of the nav stack (`useNav().top`) inside a custom
 * Reanimated transition that reproduces the prototype's CSS keyframes
 * exactly, plus a temporary bottom tab bar (the real `TabBar`/`NavBar` is
 * Task 3.2). FAB (Task 3.3) and sheets — Add/More/Profile (Task 3.4) — are
 * left as marked integration points; this shell does not render them.
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
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { MI } from '../components/icons';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { renderScreen } from './screens';
import { useNav, type ScreenKind } from './navContext';

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

// ── Temporary bottom tab bar ──────────────────────────────────────────
// Stand-in for the real iOS `.m-tabbar` / Android `.m-navbar` chrome
// (MobileApp.jsx:343–380). Real styled TabBar/NavBar lands in Task 3.2,
// FAB polish in Task 3.3. This just needs to expose 5 slots wired to
// `goTab` so the nav model is exercisable end-to-end.
type TempTabSpec =
  | { id: ScreenKind | 'more'; label: string; icon?: keyof typeof MI; isFab?: false }
  | { id: 'fab'; label: ''; isFab: true };

const TEMP_TABS: TempTabSpec[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'txns', label: 'Activity', icon: 'txns' },
  { id: 'fab', label: '', isFab: true },
  { id: 'budgets', label: 'Budget', icon: 'budget' },
  { id: 'more', label: 'More', icon: 'more' },
];

function TempTabBar() {
  const { t } = useTheme();
  const { activeTab, goTab, openAdd } = useNav();

  return (
    <View style={[styles.tabbar, { backgroundColor: t.tabbarBg, borderTopColor: t.tabbarBorder }]}>
      {TEMP_TABS.map((tab) => {
        if (tab.isFab) {
          // TODO(Task 3.3): replace with the real animated FAB + radial
          // speed-dial actions (MobileApp.jsx:326–341, 343–358/360–380).
          return (
            <Pressable key="fab" style={styles.fabSlot} onPress={openAdd}>
              <View style={[styles.fabCircle, { backgroundColor: t.em }]}>
                <MI.plus size={24} color="#1a1228" />
              </View>
            </Pressable>
          );
        }
        const isActive = activeTab === tab.id || (tab.id === 'more' && activeTab === null);
        const Icon = tab.icon ? MI[tab.icon] : null;
        return (
          <Pressable key={tab.id} style={styles.tabSlot} onPress={() => goTab(tab.id)}>
            {Icon ? <Icon size={22} color={isActive ? t.text1 : t.text3} /> : null}
            <Text
              style={[
                styles.tabLabel,
                { color: isActive ? t.text1 : t.text3, fontFamily: weight(600) },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
// TODO(Task 3.2): replace <TempTabBar/> with the real TabBar (iOS) /
// NavBar (Android, Material 3) components, switched on `platform`.

export function AppShell() {
  const { top } = useNav();
  const transitionKey = `${top.kind}-${JSON.stringify(top.data ?? null)}`;

  return (
    <View style={styles.shell}>
      <View style={styles.stage}>
        <StackTransition transitionKey={transitionKey}>{renderScreen(top)}</StackTransition>
      </View>

      {/* TODO(Task 3.3): FAB radial backdrop + speed-dial actions render
          here, above the tab bar (MobileApp.jsx:325–341). */}
      {/* TODO(Task 3.4): AddTxSheet / MoreSheet / ProfileSheet mount here,
          as siblings of the tab bar (MobileApp.jsx:382–384). */}

      <TempTabBar />
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
  tabbar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 78,
    paddingTop: 8,
    paddingBottom: 14,
    paddingHorizontal: 12,
    gap: 4,
    borderTopWidth: 1,
  },
  tabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tabLabel: {
    fontSize: 10,
  },
  fabSlot: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  fabCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    marginTop: -24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
