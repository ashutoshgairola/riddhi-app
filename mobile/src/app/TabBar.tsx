/**
 * TabBar — iOS floating bottom tab bar with centre FAB tab.
 *
 * RN port of `.m-tabbar` / `.m-tab` / `.m-fab-tab` / `.m-fab`
 * (project/riddhi/mobile.css:257–332) and the `MTabs` array +
 * iOS-branch render in `project/riddhi/MobileApp.jsx:3–9,461–…`.
 *
 * The handover redesigned `.m-tabbar` from a flat edge-attached bar into a
 * floating rounded glass capsule: `margin: 0 14px calc(safe-area + 12px)`,
 * `border-radius: 30px`, a full 1px border on all sides, and a
 * `0 12px 40px rgba(0,0,0,0.45)` drop shadow with inset top/bottom sheens.
 * It is still a `flex-shrink: 0` sibling in the `.m-shell` column (not
 * absolutely positioned), so it reserves its own row and does not overlap
 * page content — `AppShell` mirrors that (stage `flex:1`, then `<TabBar/>`),
 * so this stays contained to this file. Design:
 * docs/superpowers/specs/2026-07-10-floating-tabbar-design.md.
 *
 * Layering (see the design doc's "crux"): three RN constraints collide —
 * the blur/tint must be clipped to the 30px radius, the centre FAB must
 * protrude above the top edge, and the drop shadow must render. On iOS
 * `overflow:'hidden'` (masksToBounds) clips shadows and `BlurView` samples
 * ancestor backgrounds, so these can't share one view. Resolution:
 *   - outer `tabbar` is overflow-visible  → the FAB escapes the top edge
 *   - `blur` is absoluteFill + radius + overflow-hidden → clips the glass
 *   - `chrome` (tint colour + 1px border + shadow) is overflow-visible so
 *     its own drop shadow isn't clipped; its translucent body gives iOS a
 *     silhouette to derive the shadow from
 *   - `glow` sits in its own clipped layer above the tint
 *
 * Safe area: the design's bottom gap is `calc(env(safe-area-inset-bottom) +
 * 12px)` (mobile.css:262). RN adds the device inset to a 12px margin
 * literally — the whole capsule lifts off the home indicator.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiquidGlass } from '../components/LiquidGlass';
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

// .m-fab gradient (mobile.css:320)
const FAB_GRADIENT = ['rgba(198,184,247,0.92)', 'rgba(155,134,238,0.92)'] as const;

export function TabBar() {
  const { t, mode } = useTheme();
  const { activeTab, goTab, fabOpen, setFabOpen } = useNav();
  const insets = useSafeAreaInsets();

  // Top inset-sheen colour, pulled from the box-shadow token
  // (dark `rgba(255,255,255,0.16)` / light `rgba(255,255,255,0.95)`).
  const sheen = t.tabbarShadow.match(/rgba\([^)]*\)/)?.[0];

  return (
    <View
      style={[
        styles.tabbar,
        // Handover is `margin-bottom: calc(env(safe-area-inset-bottom) + 12px)`
        // (mobile.css:262), but env() ≈ 0 in the web mockup, so the capsule sits
        // ~12px off the bottom there. On device the full 34pt inset pushes it up
        // into a dead band; the home indicator only occupies the bottom ~13pt,
        // so tuck the capsule partway into the safe area (same reasoning the flat
        // bar used) to keep it near the bottom while clearing the indicator.
        { marginBottom: insets.bottom ? Math.max(insets.bottom - 14, 12) : 12 },
      ]}
    >
      {/* Real refractive glass fill (replaces the frosted BlurView). Clipped to
          the 30px radius; the FAB (a sibling in the row below) is not a child, so
          this clip doesn't touch it. Borderless + untinted here — the `chrome`
          layer rendered over it owns the tint/border/shadow, so the shader just
          refracts the page backdrop through the capsule. */}
      <LiquidGlass
        style={styles.blur}
        radius={RADIUS}
        border={false}
        tint="rgba(0,0,0,0)"
        specular
        chromatic
        pointerEvents="none"
      />
      {/* Tint + 1px rim border + drop shadow, all on one overflow-visible layer.
          The translucent body (t.tabbarBg) tints the blur and gives iOS a
          silhouette for the shadow; box-shadow 0 12px 40px rgba(0,0,0,0.45)
          (mobile.css:269) → discrete shadow* props (verify strength on device —
          a translucent caster renders lighter; bump shadowOpacity if faint). */}
      <View
        style={[
          styles.chrome,
          { backgroundColor: t.tabbarBg, borderColor: t.tabbarBorder },
        ]}
        pointerEvents="none"
      />
      {/* Radial glow pooled behind the centre FAB, clipped to the rounded pill.
          stopOpacity carries the intensity (react-native-svg discards alpha
          baked into stopColor — see PageBackground). */}
      <View style={styles.glowClip} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="fabGlow" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset={0} stopColor="rgb(150,120,240)" stopOpacity={mode === 'light' ? 0.44 : 0.2} />
              <Stop offset={0.9} stopColor="rgb(150,120,240)" stopOpacity={0} />
              <Stop offset={1} stopColor="rgb(150,120,240)" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx="50%" cy="100%" rx="55%" ry="100%" fill="url(#fabGlow)" />
        </Svg>
      </View>
      {/* Inset sheens: bright top (mobile.css:269 `inset 0 1.5px 0 …`) + faint
          bottom (`inset 0 -1px 0 rgba(255,255,255,0.04)`). RN has no inset
          box-shadow, so per-side borders on a rounded-rect follow the corners. */}
      <View
        style={[styles.sheen, sheen ? { borderTopColor: sheen } : null]}
        pointerEvents="none"
      />
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
                // (mobile.css:327) — the dark halo that seats the FAB into
                // the bar; a padded wrapper stands in for the box-shadow.
                <View
                  style={[
                    styles.fabRing,
                    // .m-fab:active { transform: scale(0.92) rotate(45deg) }
                    // (mobile.css:330) — pressed keeps the open rotation too.
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
              // .m-tab:active { transform: scale(0.92) } (mobile.css:291)
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

const RADIUS = 30;

const styles = StyleSheet.create({
  // .m-tabbar (mobile.css:257–273) — floating rounded capsule.
  // overflow is left visible (default) so the centre FAB can protrude above
  // the top edge; the glass fill is clipped by `blur`/`glowClip` instead.
  tabbar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 70,
    marginHorizontal: 14,
    marginTop: 0,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: RADIUS,
    gap: 4,
    position: 'relative',
    // Lift the whole capsule (incl. the centre FAB) above the FabActions dim
    // backdrop (zIndex 60) so the navbar stays crisp/unblurred and tappable
    // while the stage above it dims.
    zIndex: 70,
  },
  // Clipped glass fill (backdrop blur). masksToBounds via overflow:'hidden'.
  blur: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: RADIUS,
    overflow: 'hidden',
  },
  // Tint colour + 1px rim border + drop shadow. Overflow visible so the shadow
  // (which draws outside the pill bounds) isn't clipped. background/border set
  // inline from the theme.
  chrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: RADIUS,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
  },
  // Holds the radial glow, clipped to the rounded pill so it can't escape.
  glowClip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: RADIUS,
    overflow: 'hidden',
  },
  // Inset sheens approximated as per-side borders that follow the corner
  // radius: bright top (colour from token, set inline) + faint bottom.
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: RADIUS,
    borderTopWidth: 1.5,
    borderBottomWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.16)',
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  // Wraps `.m-tab` — the flex slot itself; press-scale is applied to the
  // inner `tab` View instead (Pressable's own layout must stay unscaled so
  // the 5-slot row doesn't reflow on press).
  tabPressable: {
    flex: 1,
  },
  // .m-tab (mobile.css:274–288)
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 14,
    position: 'relative',
  },
  // Fixed slot the pill fills and the icon centres in. The CSS pins the pill
  // vertically centred over the whole tab (mobile.css:294–305), which put its
  // bottom edge through the label on device; anchoring it to the icon's own
  // box keeps the same pill size without the collision.
  iconSlot: {
    width: 52,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // .m-tab.active::before (mobile.css:294–305) — 52×42, radius 16.
  activePill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    borderWidth: 1,
  },
  // .m-tab.active svg: translateY(-1px) scale(1.06) (mobile.css:293)
  iconActive: {
    transform: [{ translateY: -1 }, { scale: 1.06 }],
  },
  label: {
    fontSize: 10,
    lineHeight: 13,
    zIndex: 1,
  },
  // .m-fab-tab (mobile.css:308–314)
  fabTab: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  // .m-fab box-shadow ring: 0 0 0 5px rgba(24,19,34,0.6) (mobile.css:327).
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
  // .m-fab (mobile.css:315–332); the `inset 0 1px 0 rgba(255,255,255,0.5)`
  // sheen has no clean RN equivalent on a circle and is omitted.
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
