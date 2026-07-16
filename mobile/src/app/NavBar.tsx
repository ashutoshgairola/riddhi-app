/**
 * NavBar — Android Material 3 bottom navigation bar + floating FAB.
 *
 * RN port of `.m-navbar` / `.m-navdest` / `.m-mfab`
 * (project/riddhi/platform.css:95–157) and the Android-branch render in
 * `project/riddhi/MobileApp.jsx:363–375`.
 *
 * Unlike the iOS tab bar, Android has no centre FAB slot in the bar
 * itself: the 4 destinations (Home, Activity, Budget, More) sit in
 * `.m-navbar`, each with a pill-shaped active indicator
 * (`.m-navpill`, 64x32) that fills with `emDim`/`em` when active. The
 * FAB (`.m-mfab`, 56x56, rounded-square) floats independently,
 * absolutely positioned bottom-right above the bar — rendered as a
 * sibling here too, not inside `.m-navbar`.
 *
 * `navLabels` mirrors the `navLabels` prop on the web `MobileApp`
 * (default `true`) — `.m-navbar.no-labels` hides the `<span>` labels
 * and removes the row gap (platform.css:133–134).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MI, type IconName } from '../components/icons';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { spacing } from '../theme/spacing';
import { useNav, type ScreenKind } from './navContext';

// MTabs filtered to non-FAB entries (MobileApp.jsx:3–9, android branch
// filters out `isFab` — platform.css has no centre FAB slot).
interface DestSpec {
  id: ScreenKind | 'more';
  label: string;
  icon: IconName;
}

const DESTS: DestSpec[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'txns', label: 'Activity', icon: 'txns' },
  { id: 'budgets', label: 'Budget', icon: 'budget' },
  { id: 'more', label: 'More', icon: 'more' },
];

export interface NavBarProps {
  /** Show destination labels. Defaults to `true` — `.m-navbar.no-labels`
   * (platform.css:133–134) when `false`. */
  navLabels?: boolean;
}

export function NavBar({ navLabels = true }: NavBarProps) {
  const { t } = useTheme();
  const { activeTab, goTab } = useNav();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.navbar,
        { backgroundColor: t.bg1, borderTopColor: t.border, paddingBottom: spacing.sm + insets.bottom },
      ]}
    >
      {DESTS.map((dest) => {
        const isActive = activeTab === dest.id || (dest.id === 'more' && activeTab === null);
        const Icon = MI[dest.icon];
        return (
          <Pressable
            key={dest.id}
            style={[styles.navdest, !navLabels && styles.navdestNoLabels]}
            onPress={() => goTab(dest.id)}
          >
            {({ pressed }) => (
              <>
                <View
                  style={[
                    styles.navpill,
                    isActive && { backgroundColor: t.emDim },
                    // .m-navdest:active .m-navpill { background: rgba(255,255,255,0.10) }
                    // (platform.css:130) — only when not already the active-tint pill.
                    pressed && !isActive && { backgroundColor: 'rgba(255,255,255,0.10)' },
                  ]}
                >
                  <Icon size={22} color={isActive ? t.em : t.text2} strokeWidth={isActive ? 2.4 : 1.9} />
                </View>
                {navLabels && (
                  <Text
                    style={[
                      styles.label,
                      { color: isActive ? t.em : t.text2, fontFamily: weight(500) },
                    ]}
                  >
                    {dest.label}
                  </Text>
                )}
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export interface MFabProps {
  open: boolean;
  onPress: () => void;
}

/** `.m-mfab` (platform.css:138–157) — Material 3 floating action button,
 * absolutely positioned bottom-right above the nav bar. Rendered as a
 * sibling of `<NavBar/>` by `AppShell`, not nested inside it (matching
 * the web DOM, where `.m-mfab` and `.m-navbar` are sibling children of
 * `.m-shell`). */
export function MFab({ open, onPress }: MFabProps) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add"
      style={{ position: 'absolute', right: 16, bottom: 96 + insets.bottom }}
      onPress={onPress}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.mfab,
            {
              backgroundColor: t.em,
              // .m-mfab.open: rotate(45deg) (platform.css:157) +
              // .m-mfab:active { transform: scale(0.94) } (platform.css:156)
              // — combined into one transform array so both can apply at once.
              transform: [{ scale: pressed ? 0.94 : 1 }, { rotate: open ? '45deg' : '0deg' }],
            },
          ]}
        >
          <MI.plus size={26} color="#060810" strokeWidth={2.4} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // .m-navbar (platform.css:95–106)
  navbar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    height: 80,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderTopWidth: 1,
    // Lift the bar above the FabActions dim backdrop (elevation 4) so it stays
    // crisp/unblurred and tappable while the stage above it dims. The MFab
    // floats above the bar with a gap so its own elevation is unaffected.
    zIndex: 70,
    elevation: 12,
  },
  // .m-navdest (platform.css:107–118)
  navdest: {
    flex: 1,
    maxWidth: 96,
    alignItems: 'center',
    gap: spacing.xxs,
  },
  // .m-navdest .m-navpill (platform.css:120–131)
  navpill: {
    width: 64,
    height: 32,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  // .m-navbar.no-labels .m-navdest (platform.css:134) — gap: 0
  navdestNoLabels: {
    gap: 0,
  },
  // .m-navdest span (platform.css:133)
  label: {
    fontSize: 11,
    letterSpacing: 0.02 * 11,
  },
  // .m-mfab (platform.css:138–157) — position/right/bottom now live on the
  // outer `Pressable` (see `MFab`) so the `pressed` scale transform below
  // doesn't fight with absolute-positioning styles.
  mfab: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(0,0,0,0.4)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 6,
  },
});
