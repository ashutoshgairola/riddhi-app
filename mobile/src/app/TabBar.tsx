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
  const { t } = useTheme();
  const { activeTab, goTab, fabOpen, setFabOpen } = useNav();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.tabbar,
        {
          backgroundColor: t.tabbarBg,
          borderTopColor: t.tabbarBorder,
          paddingBottom: 14 + insets.bottom,
        },
      ]}
    >
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
                <LinearGradient
                  colors={FAB_GRADIENT}
                  start={{ x: 0.15, y: 0 }}
                  end={{ x: 0.85, y: 1 }}
                  style={[
                    styles.fab,
                    // .m-fab:active { transform: scale(0.92) rotate(45deg) }
                    // (mobile.css:325) — pressed keeps the open rotation too.
                    { transform: [{ scale: pressed ? 0.92 : 1 }, { rotate: fabOpen || pressed ? '45deg' : '0deg' }] },
                  ]}
                >
                  <MI.plus size={26} color="#241a40" strokeWidth={2.4} />
                </LinearGradient>
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
  // .m-tabbar (mobile.css:254–269)
  tabbar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 78,
    paddingTop: 8,
    paddingHorizontal: 12,
    gap: 4,
    borderTopWidth: 1,
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
  // .m-tab.active::before (mobile.css:288–297)
  activePill: {
    position: 'absolute',
    top: 2,
    width: 50,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    alignSelf: 'center',
  },
  // .m-tab.active svg: translateY(-1px) scale(1.06) (mobile.css:286)
  iconActive: {
    transform: [{ translateY: -1 }, { scale: 1.06 }],
  },
  label: {
    fontSize: 10,
    zIndex: 1,
  },
  // .m-fab-tab (mobile.css:302–308)
  fabTab: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  // .m-fab (mobile.css:310–325)
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    marginTop: -24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(139,108,240,0.45)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 26,
    elevation: 8,
  },
});
