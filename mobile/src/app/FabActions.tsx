/**
 * FabActions — the FAB radial backdrop + 4 staggered speed-dial action
 * cards. RN port of `.m-fab-backdrop` / `.m-fab-action`
 * (project/riddhi/mobile.css:329–373), the Android right-aligned override
 * (project/riddhi/platform.css:159–167), and the `fabActions` array +
 * render in `project/riddhi/MobileApp.jsx:280–285,325–341`.
 *
 * This renders the BACKDROP and the 4 ACTION cards only — the FAB *button*
 * itself lives in `<TabBar/>` (iOS) / `<MFab/>` (Android), both of which
 * already toggle `fabOpen` via `useNav()`. `AppShell` mounts `<FabActions/>`
 * above (before, in JSX-order terms) the tab bar / nav bar + FAB, exactly
 * like the web DOM order in MobileApp.jsx:325–361 — the backdrop+actions
 * are earlier siblings of the FAB-bearing tab bar, so the FAB visually sits
 * on top and stays tappable to close the menu, matching `z-index: 60/61`
 * (backdrop/actions) vs. the tab bar's own stacking in the web version.
 *
 * Each action's entrance is opacity + translateY + scale, driven by
 * `fabOpen` via Reanimated `withDelay`/`withTiming`, mirroring the CSS
 * `transition: transform .3s var(--spring), opacity .25s` with
 * `transitionDelay: i*0.04s` (only applied on open — MobileApp.jsx:332 sets
 * `transitionDelay: fabOpen ? '${i*0.04}s' : '0s'`, so closing reverses with
 * no stagger).
 *
 * Tapping the backdrop or an action card closes the menu: 'chat' navigates
 * and then explicitly closes the FAB (the web's `nav()` does NOT clear
 * `fabOpen` — only `openAdd()` does, MobileApp.jsx:273); the other 3
 * actions call `openAdd()`, which already closes the FAB itself.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';

import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { useNav } from './navContext';

// fabActions (MobileApp.jsx:280–285).
interface FabAction {
  label: string;
  desc: string;
  icon: string;
  /** Token key into `Tokens`, resolved against the active theme below. */
  colorToken: 'violet' | 'red' | 'em' | 'blue';
  action?: 'chat';
}

const FAB_ACTIONS: FabAction[] = [
  { label: 'Ask Munshi', desc: 'Log or plan by chat', icon: '💬', colorToken: 'violet', action: 'chat' },
  { label: 'Add Expense', desc: 'Quick log a spend', icon: '💸', colorToken: 'red' },
  { label: 'Add Income', desc: 'Salary, freelance…', icon: '💰', colorToken: 'em' },
  { label: 'Transfer', desc: 'Move between accounts', icon: '🔄', colorToken: 'blue' },
];

// .m-fab-backdrop: opacity .22s var(--ease) (mobile.css:339).
const BACKDROP_DURATION_MS = 220;
// .m-fab-action: transform .3s var(--spring), opacity .25s (mobile.css:361).
const ACTION_TRANSFORM_MS = 300;
const ACTION_OPACITY_MS = 250;
// transitionDelay: i*0.04s, only on open (MobileApp.jsx:332).
const STAGGER_STEP_MS = 40;
// Android speed-dial actions stack upward from the FAB (MobileApp.jsx:317).
const androidActionBottom = (i: number) => 96 + 56 + 12 + i * 64;

function FabActionCard({ item, index, isAndroid }: { item: FabAction; index: number; isAndroid: boolean }) {
  const { t, mode } = useTheme();
  const { fabOpen, setFabOpen, nav, openAdd } = useNav();
  const color = t[item.colorToken];

  const progress = useSharedValue(0);

  useEffect(() => {
    if (fabOpen) {
      progress.value = withDelay(
        index * STAGGER_STEP_MS,
        withTiming(1, { duration: ACTION_TRANSFORM_MS }),
      );
    } else {
      progress.value = withTiming(0, { duration: ACTION_OPACITY_MS });
    }
  }, [fabOpen, index, progress]);

  const style = useAnimatedStyle(() => {
    // .m-fab-action: translateY(20px) scale(0.5) opacity 0 -> translateY(0) scale(1) opacity 1
    // (mobile.css:347,365). Android scales from 0.6 instead of 0.5 (platform.css:163).
    const fromScale = isAndroid ? 0.6 : 0.5;
    const scale = fromScale + (1 - fromScale) * progress.value;
    const translateY = 20 * (1 - progress.value);
    return {
      opacity: progress.value,
      transform: [{ translateY }, { scale }],
    };
  });

  const handlePress = () => {
    if (item.action === 'chat') {
      nav('chat');
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
        { bottom: isAndroid ? androidActionBottom(index) : 100 + index * 64 },
        style,
      ]}
      pointerEvents={fabOpen ? 'auto' : 'none'}
    >
      <Pressable
        style={[styles.actionInner, { backgroundColor: t.fabActionBg, borderColor: t.fabActionBorder }]}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={item.label}
      >
        <BlurView intensity={30} tint={mode === 'light' ? 'light' : 'dark'} style={StyleSheet.absoluteFill} />
        <View style={[styles.icon, { backgroundColor: `${color}22` }]}>
          <Text style={styles.iconGlyph}>{item.icon}</Text>
        </View>
        <View>
          <Text style={[styles.label, { color: t.text1, fontFamily: weight(600) }]}>{item.label}</Text>
          <Text style={[styles.desc, { color: t.text2 }]}>{item.desc}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function FabActions() {
  const { fabOpen, setFabOpen, platform } = useNav();
  const isAndroid = platform === 'android';

  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    backdropOpacity.value = withTiming(fabOpen ? 1 : 0, { duration: BACKDROP_DURATION_MS });
  }, [fabOpen, backdropOpacity]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  return (
    <>
      <Animated.View style={[styles.backdrop, backdropStyle]} pointerEvents={fabOpen ? 'auto' : 'none'}>
        <Pressable
          style={styles.backdropFill}
          onPress={() => setFabOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[styles.backdropTint, { backgroundColor: 'rgba(0,0,0,0.65)' }]} />
        </Pressable>
      </Animated.View>

      {FAB_ACTIONS.map((item, i) => (
        <FabActionCard key={item.label} item={item} index={i} isAndroid={isAndroid} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  // .m-fab-backdrop (mobile.css:330–341)
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 60,
    // Android paints by elevation independent of zIndex: keep the backdrop
    // below the action cards (5) and the FAB (MFab 6 / TabBar fab 8) so the
    // FAB stays visible/tappable over the dimmed backdrop deterministically.
    elevation: 4,
  },
  backdropFill: {
    flex: 1,
  },
  backdropTint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // .m-fab-action (mobile.css:343–365)
  action: {
    position: 'absolute',
    zIndex: 61,
    // Above the backdrop (4), below the FAB (6/8) on Android's elevation plane.
    elevation: 5,
  },
  actionIos: {
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  actionAndroid: {
    right: 16,
    alignItems: 'flex-end',
  },
  actionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingRight: 18,
    paddingLeft: 14,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  // .m-fab-action .ico (mobile.css:366–371)
  icon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyph: {
    fontSize: 18,
  },
  // .m-fab-action .lbl (mobile.css:372)
  label: {
    fontSize: 14,
  },
  // .m-fab-action .desc (mobile.css:373)
  desc: {
    fontSize: 11,
    marginTop: 2,
  },
});
