/**
 * Settings — RN port of `project/riddhi/MobileScreens.jsx` (the
 * `MobileSettings` component, lines 540–665).
 *
 * Building blocks reused rather than reimplemented:
 *  - `MPageShell` for the `.m-page`/`.m-topbar`(back+title)/`.m-body`
 *    scaffold.
 *  - `GlassCard` for the profile card (`.m-card`, MobileScreens.jsx:587).
 *  - `IconButton` for the profile edit button.
 *  - `MSeg` for the Theme row's light/dark segmented control
 *    (MobileScreens.jsx:599).
 *  - `Toggle` (src/components/ui.tsx — already a 1:1 port of the source's
 *    inline `Toggle`, MobileScreens.jsx:552–563) for Hide balances /
 *    Biometric login / Push notifications.
 *  - `ListCard`/`ListRow` for each `.m-list-card` section
 *    (MobileScreens.jsx:565–581's local `Section`/`Row` helpers).
 *  - `SectionHead` for each section title.
 *  - `MI.arrow` for the row chevron (source's `Row`'s default `right`,
 *    MobileScreens.jsx:579).
 *  - `useTheme()` for the **live** theme switch: the Theme row's `MSeg`
 *    `onChange` calls `setMode` directly — `ThemeProvider` (src/theme/
 *    ThemeProvider.tsx) re-themes the whole app and persists to
 *    AsyncStorage on every `setMode` call, mirroring the source's
 *    `document.documentElement.setAttribute` + `localStorage.setItem`
 *    (MobileScreens.jsx:545–549). No local theme state is kept here.
 *  - `useNav().pop`/`.nav` for the back button and "Sync accounts" row
 *    (MobileScreens.jsx:642 — `window.RiddhiApp?.nav('sync')`).
 *  - `useFeedback().toast`/`.sheet` for every action (Language/Currency/
 *    Date format/Active sessions/Export data/Delete account/Sign out
 *    sheets; all other rows toast directly).
 *
 * Source values transcribed verbatim:
 *  - Profile: "Riddhi Desai" / "riddhi@example.com" / "PRO MEMBER" badge,
 *    "RD" gradient avatar — MobileScreens.jsx:588–594.
 *  - All row icons/colors/titles/subs and sheet option labels —
 *    MobileScreens.jsx:597–661.
 *  - Local toggle state (`hideBalances` off, `biometric` on, `notifsAll`
 *    on) — MobileScreens.jsx:541–543.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { GlassCard } from '../components/Glass';
import { MI } from '../components/icons';
import { MSeg } from '../components/MSeg';
import { IconButton, ListCard, ListRow, SectionHead, Toggle } from '../components/ui';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useNav, type ScreenEntry } from '../app/navContext';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { MPageShell } from './_MPageShell';

// ── Row ─────────────────────────────────────────────────────────────
// MobileScreens.jsx:572–581 (local `Row` helper) — icon box + title/sub +
// right slot (defaulting to the `MI.arrow` chevron).
interface RowProps {
  icon: string;
  color: string;
  title: string;
  sub?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
}

function Row({ icon, color, title, sub, right, onPress, last }: RowProps) {
  const { t } = useTheme();

  return (
    <ListRow onPress={onPress} last={last}>
      <View style={[styles.iconBox, { backgroundColor: color + '22' }]}>
        <Text style={[styles.iconGlyph, { color }]}>{icon}</Text>
      </View>
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: t.text1, fontFamily: weight(600) }]} numberOfLines={1}>
          {title}
        </Text>
        {sub ? (
          <Text style={[styles.sub, { color: t.text3 }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {right !== undefined ? right : <MI.arrow size={18} color={t.text3} />}
    </ListRow>
  );
}

export function Settings({ entry: _entry }: { entry: ScreenEntry }) {
  const { t, mode, setMode } = useTheme();
  const { pop, nav } = useNav();
  const { toast, sheet } = useFeedback();

  // Local toggle state (MobileScreens.jsx:541–543).
  const [hideBalances, setHideBalances] = useState(false);
  const [biometric, setBiometric] = useState(true);
  const [notifsAll, setNotifsAll] = useState(true);

  // Theme row — live app-wide switch (MobileScreens.jsx:545–549's setTheme,
  // minus the DOM/localStorage calls which ThemeProvider.setMode already
  // performs via AsyncStorage on every call).
  const handleThemeChange = (v: 'light' | 'dark') => {
    setMode(v);
    toast(v === 'light' ? 'Light mode on' : 'Dark mode on', v === 'light' ? '☀️' : '🌙');
  };

  return (
    <MPageShell title="Settings" onBack={pop}>
      {/* Profile card (MobileScreens.jsx:587–595) */}
      <GlassCard style={styles.profileCard}>
        <LinearGradient
          colors={[t.em, '#9d8bd6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>RD</Text>
        </LinearGradient>
        <View style={styles.profileInfo}>
          <Text style={[styles.profileName, { color: t.text1, fontFamily: weight(700) }]}>Riddhi Desai</Text>
          <Text style={[styles.profileEmail, { color: t.text3 }]}>riddhi@example.com</Text>
          <View style={[styles.proBadge, { backgroundColor: t.emDim }]}>
            <Text style={[styles.proBadgeText, { color: t.em, fontFamily: weight(700) }]}>PRO MEMBER</Text>
          </View>
        </View>
        <IconButton onPress={() => toast('Edit profile', '✏️')}>
          <MI.arrow size={18} color={t.text1} />
        </IconButton>
      </GlassCard>

      {/* Preferences (MobileScreens.jsx:597–618) */}
      <View style={styles.section}>
        <SectionHead title="Preferences" />
        <ListCard>
          <Row
            icon="🌙"
            color={t.violet}
            title="Theme"
            sub={mode === 'light' ? 'Light mode' : 'Dark mode'}
            right={
              <MSeg<'light' | 'dark'>
                options={[
                  { value: 'light', label: '☀' },
                  { value: 'dark', label: '☾' },
                ]}
                value={mode}
                onChange={handleThemeChange}
              />
            }
          />
          <Row
            icon="🌐"
            color={t.blue}
            title="Language"
            sub="English (India)"
            onPress={() =>
              sheet({
                title: 'Language',
                options: [
                  { label: 'English (India)', onPress: () => toast('Language: English') },
                  { label: 'हिन्दी Hindi', onPress: () => toast('भाषा: हिन्दी') },
                  { label: 'ગુજરાતી Gujarati', onPress: () => toast('Language: Gujarati') },
                  { label: 'ನನ್ನ Kannada', onPress: () => toast('Language: Kannada') },
                ],
              })
            }
          />
          <Row
            icon="₹"
            color={t.em}
            title="Currency"
            sub="INR · Indian Rupee"
            onPress={() =>
              sheet({
                title: 'Currency',
                options: [
                  { label: '₹ Indian Rupee (INR)', onPress: () => toast('Currency: INR') },
                  { label: '$ US Dollar (USD)', onPress: () => toast('Currency: USD') },
                  { label: '€ Euro (EUR)', onPress: () => toast('Currency: EUR') },
                  { label: '£ Pound (GBP)', onPress: () => toast('Currency: GBP') },
                ],
              })
            }
          />
          <Row
            icon="📅"
            color={t.amber}
            title="Date format"
            sub="DD MMM YYYY"
            last
            onPress={() =>
              sheet({
                title: 'Date format',
                options: [
                  { label: 'DD MMM YYYY', onPress: () => toast('25 Apr 2026') },
                  { label: 'MM/DD/YYYY', onPress: () => toast('04/25/2026') },
                  { label: 'YYYY-MM-DD', onPress: () => toast('2026-04-25') },
                ],
              })
            }
          />
        </ListCard>
      </View>

      {/* Privacy & Security (MobileScreens.jsx:620–628) */}
      <View style={styles.section}>
        <SectionHead title="Privacy & Security" />
        <ListCard>
          <Row
            icon="👁"
            color={t.blue}
            title="Hide balances"
            sub="Mask amounts on home"
            right={
              <Toggle
                on={hideBalances}
                onChange={(v) => {
                  setHideBalances(v);
                  toast(v ? 'Balances hidden' : 'Balances visible');
                }}
              />
            }
          />
          <Row
            icon="🔒"
            color={t.red}
            title="Biometric login"
            sub="Face ID enabled"
            right={
              <Toggle
                on={biometric}
                onChange={(v) => {
                  setBiometric(v);
                  toast(v ? 'Biometric on' : 'Biometric off');
                }}
              />
            }
          />
          <Row icon="🔑" color={t.amber} title="Change PIN" onPress={() => toast('Verify current PIN to continue', '🔑')} />
          <Row
            icon="📱"
            color={t.cyan}
            title="Active sessions"
            sub="2 devices"
            last
            onPress={() =>
              sheet({
                title: 'Active sessions',
                options: [
                  { label: 'iPhone 15 · this device', onPress: () => toast('Current device') },
                  { label: 'Chrome · MacOS — log out', danger: true, onPress: () => toast('Signed out other device') },
                ],
              })
            }
          />
        </ListCard>
      </View>

      {/* Notifications (MobileScreens.jsx:630–635) */}
      <View style={styles.section}>
        <SectionHead title="Notifications" />
        <ListCard>
          <Row
            icon="🔔"
            color={t.em}
            title="Push notifications"
            right={
              <Toggle
                on={notifsAll}
                onChange={(v) => {
                  setNotifsAll(v);
                  toast(v ? 'Notifications on' : 'Notifications off');
                }}
              />
            }
          />
          <Row icon="📊" color={t.blue} title="Budget alerts" sub="At 75% & 100%" onPress={() => toast('Budget alerts configured')} />
          <Row icon="🎯" color={t.violet} title="Goal milestones" onPress={() => toast('Goal milestone alerts on')} />
          <Row
            icon="💰"
            color={t.amber}
            title="Large transactions"
            sub="> ₹10,000"
            last
            onPress={() => toast('Large-transaction alerts on')}
          />
        </ListCard>
      </View>

      {/* Data (MobileScreens.jsx:637–647) */}
      <View style={styles.section}>
        <SectionHead title="Data" />
        <ListCard>
          <Row
            icon="📤"
            color={t.blue}
            title="Export data"
            sub="CSV, PDF"
            onPress={() =>
              sheet({
                title: 'Export data',
                options: [
                  { label: 'Export as CSV', icon: '📄', onPress: () => toast('CSV exported', '📤') },
                  { label: 'Export as PDF', icon: '📑', onPress: () => toast('PDF exported', '📤') },
                ],
              })
            }
          />
          <Row icon="🔄" color={t.em} title="Sync accounts" sub="Last sync 2m ago" onPress={() => nav('sync')} />
          <Row
            icon="🗑"
            color={t.red}
            title="Delete account"
            last
            onPress={() =>
              sheet({
                title: 'Delete account?',
                options: [
                  { label: 'Yes, delete everything', icon: '🗑', danger: true, onPress: () => toast('Account scheduled for deletion') },
                  { label: 'Cancel', onPress: () => {} },
                ],
              })
            }
          />
        </ListCard>
      </View>

      {/* About (MobileScreens.jsx:649–654) */}
      <View style={styles.section}>
        <SectionHead title="About" />
        <ListCard>
          <Row icon="❓" color={t.blue} title="Help center" onPress={() => toast('Opening Help center', '❓')} />
          <Row icon="📜" color={t.text3} title="Privacy policy" onPress={() => toast('Opening Privacy policy')} />
          <Row icon="📋" color={t.text3} title="Terms of service" onPress={() => toast('Opening Terms of service')} />
          <Row icon="✨" color={t.em} title="Version" sub="2.4.1 (build 246)" right={null} last />
        </ListCard>
      </View>

      {/* Sign out (MobileScreens.jsx:656–661) */}
      <Pressable
        onPress={() =>
          sheet({
            title: 'Sign out?',
            options: [
              { label: 'Sign out', icon: '🚪', danger: true, onPress: () => toast('Signed out') },
              { label: 'Cancel', onPress: () => {} },
            ],
          })
        }
        style={({ pressed }) => [
          styles.signOutBtn,
          { backgroundColor: t.bg2, borderColor: t.border, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={[styles.signOutText, { color: t.red, fontFamily: weight(600) }]}>Sign out</Text>
      </Pressable>
    </MPageShell>
  );
}

const styles = StyleSheet.create({
  // Profile card (MobileScreens.jsx:587–595)
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 18,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: weight(700),
    fontSize: 22,
    color: '#060810',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 17,
  },
  profileEmail: {
    fontSize: 12,
    marginTop: 3,
  },
  proBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 99,
    marginTop: 6,
  },
  proBadgeText: {
    fontSize: 10.5,
  },

  // Section
  section: {
    marginBottom: 18,
  },

  // Row
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyph: {
    fontSize: 15,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
  },
  sub: {
    fontSize: 11.5,
    marginTop: 2,
  },

  // Sign out (.m-btn .m-btn-ghost, mobile.css:601–619)
  signOutBtn: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 8,
  },
  signOutText: {
    fontSize: 15,
  },
});
