/**
 * TabBar — iOS bottom tab bar with centre FAB tab.
 *
 * RN port of `.m-tabbar` / `.m-tab` / `.m-fab-tab` / `.m-fab`
 * (project/riddhi/mobile.css:254–327) and the `MTabs` array +
 * iOS-branch render in `project/riddhi/MobileApp.jsx:3–9,343–361`.
 *
 * Layout: 5 flex slots — Home, Activity, [centre FAB], Budget, More.
 * The active tab gets a glass "pill" behind its icon/label
 * (`.m-tab.active::before`, mobile.css:288–297) and the icon nudges up
 * + scales slightly (`.m-tab.active svg`, mobile.css:286). The centre
 * slot is the 58x58 gradient FAB circle that overlaps the bar
 * (`margin-top: -24px`) — tapping it only toggles `fabOpen` here; the
 * radial speed-dial actions it reveals are Task 3.3.
 *
 * The web version has no safe-area handling (browser chrome owns
 * that); RN needs the device's bottom inset added to the bar's
 * bottom padding, mirroring `calc(env(safe-area-inset-bottom, 0px) + 14px)`
 * (mobile.css:259) literally.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MI, type IconName } from '../components/icons';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { useNav, type ScreenKind } from './navContext';

// MTabs (MobileApp.jsx:3–9) — `fab` is a sentinel for the centre slot.
type TabSpec =
  | { id: ScreenKind | 'more'; label: string; icon: IconName }
  | { id: 'fab'; label: ''; icon: null };

const TABS: TabSpec[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'txns', label: 'Activity', icon: 'txns' },
  { id: 'fab', label: '', icon: null },
  { id: 'budgets', label: 'Budget', icon: 'budget' },
  { id: 'more', label: 'More', icon: 'more' },
];

// .m-fab gradient (mobile.css:316)
const FAB_GRADIENT = ['rgba(198,184,247,0.92)', 'rgba(155,134,238,0.92)'] as const;

export function TabBar() {
  const { t, mode } = useTheme();
  const { activeTab, goTab, fabOpen, setFabOpen } = useNav();
  const insets = useSafeAreaInsets();

  // `inset 0 1px 0 rgba(...)` (t.tabbarShadow) — only the color is needed;
  // it's rendered as a 1px strip under the top border.
  const highlight = t.tabbarShadow.match(/rgba\([^)]*\)/)?.[0];

  // The design's 14px bottom pad stands in for the home-indicator inset on
  // the web mockup (env() = 0 there). The full 34pt inset still reads as a
  // dead band under the labels, so tuck the row partway into the safe area —
  // the home indicator itself only occupies the bottom ~13pt.
  const padBottom = insets.bottom ? Math.max(insets.bottom - 14, 12) : 14;

  return (
    <View
      style={[
        styles.tabbar,
        {
          borderTopColor: t.tabbarBorder,
          // 8 (top pad) + 56 (slot row, mobile.css content box) + padBottom;
          // = the design's 78 when there is no inset.
          height: 64 + padBottom,
          paddingBottom: padBottom,
        },
      ]}
    >
      {/* backdrop-filter: blur(34px) saturate(180%) + rgba bg (mobile.css:261–262) —
          BlurView underneath, tint overlay on top. */}
      <BlurView
        intensity={60}
        tint={mode === 'light' ? 'light' : 'dark'}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: t.tabbarBg }]}
        pointerEvents="none"
      />
      {highlight && (
        <View style={[styles.topHighlight, { backgroundColor: highlight }]} pointerEvents="none" />
      )}
      {TABS.map((tab) => {
        if (tab.id === 'fab') {
          return (
            <Pressable
              key="fab"
              accessibilityRole="button"
              accessibilityLabel="Add"
              style={styles.fabTab}
              onPress={() => setFabOpen(!fabOpen)}
            >
              {({ pressed }) => (
                // .m-fab's `0 0 0 5px rgba(24,19,34,0.6)` spread ring
                // (mobile.css:322) — the dark halo that seats the FAB into
                // the bar; a padded wrapper stands in for the box-shadow.
                <View
                  style={[
                    styles.fabRing,
                    // .m-fab:active { transform: scale(0.92) rotate(45deg) }
                    // (mobile.css:325) — pressed keeps the open rotation too.
                    { transform: [{ scale: pressed ? 0.92 : 1 }, { rotate: fabOpen || pressed ? '45deg' : '0deg' }] },
                  ]}
                >
                  <LinearGradient
                    colors={FAB_GRADIENT}
                    start={{ x: 0.15, y: 0 }}
                    end={{ x: 0.85, y: 1 }}
                    style={styles.fab}
                  >
                    <MI.plus size={26} color="#241a40" strokeWidth={2.4} />
                  </LinearGradient>
                </View>
              )}
            </Pressable>
          );
        }

        const isActive = activeTab === tab.id || (tab.id === 'more' && activeTab === null);
        const Icon = MI[tab.icon];

        return (
          <Pressable key={tab.id} style={styles.tabPressable} onPress={() => goTab(tab.id)}>
            {({ pressed }) => (
              // .m-tab:active { transform: scale(0.92) } (mobile.css:287)
              <View style={[styles.tab, { transform: [{ scale: pressed ? 0.92 : 1 }] }]}>
                <View style={styles.iconSlot}>
                  {isActive && (
                    <View
                      style={[
                        styles.activePill,
                        { backgroundColor: t.glassBg2, borderColor: t.glassBrd },
                      ]}
                      pointerEvents="none"
                    />
                  )}
                  <View style={isActive && styles.iconActive}>
                    <Icon size={22} color={isActive ? t.text1 : t.text3} strokeWidth={1.8} />
                  </View>
                </View>
                <Text
                  style={[
                    styles.label,
                    { color: isActive ? t.text1 : t.text3, fontFamily: weight(600) },
                  ]}
                >
                  {tab.label}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // .m-tabbar (mobile.css:254–269) — height set inline (78 + safe-area).
  tabbar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingTop: 8,
    paddingHorizontal: 12,
    gap: 4,
    borderTopWidth: 1,
  },
  // box-shadow: inset 0 1px 0 <highlight> (mobile.css:264) — 1px strip
  // just below the hairline top border.
  topHighlight: {
    position: 'absolute',
    top: 1,
    left: 0,
    right: 0,
    height: 1,
  },
  // Wraps `.m-tab` — the flex slot itself; press-scale is applied to the
  // inner `tab` View instead (Pressable's own layout must stay unscaled so
  // the 5-slot row doesn't reflow on press).
  tabPressable: {
    flex: 1,
  },
  // .m-tab (mobile.css:270–285)
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 14,
    position: 'relative',
  },
  // Fixed 50x38 slot the pill fills and the icon centres in. The CSS pins
  // the pill at `top: 2` over the whole tab (mobile.css:289–292), which put
  // its bottom edge through the label on device; anchoring it to the icon's
  // own box keeps the same pill size without the collision.
  iconSlot: {
    width: 50,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // .m-tab.active::before (mobile.css:288–297)
  activePill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 14,
    borderWidth: 1,
  },
  // .m-tab.active svg: translateY(-1px) scale(1.06) (mobile.css:286)
  iconActive: {
    transform: [{ translateY: -1 }, { scale: 1.06 }],
  },
  label: {
    fontSize: 10,
    lineHeight: 13,
    zIndex: 1,
  },
  // .m-fab-tab (mobile.css:302–308)
  fabTab: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  // .m-fab box-shadow ring: 0 0 0 5px rgba(24,19,34,0.6) (mobile.css:322).
  // marginTop -29 keeps the 58px gradient circle at the design's -24 offset
  // once the 5px ring padding is added. Ring color is literal in the CSS
  // (no light-theme override).
  fabRing: {
    width: 68,
    height: 68,
    borderRadius: 34,
    padding: 5,
    marginTop: -29,
    backgroundColor: 'rgba(24,19,34,0.6)',
    shadowColor: 'rgba(139,108,240,0.45)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 26,
    elevation: 8,
  },
  // .m-fab (mobile.css:310–325); the `inset 0 1px 0 rgba(255,255,255,0.5)`
  // sheen has no clean RN equivalent on a circle and is omitted.
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
