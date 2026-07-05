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
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as LocalAuthentication from 'expo-local-authentication';

import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { useBiometricLabel } from '../auth/biometricLabel';
import { hasPin, savePin, setBiometricEnabled, verifyPin } from '../auth/tokenStore';
import { GlassCard } from '../components/Glass';
import { MI } from '../components/icons';
import { MSeg } from '../components/MSeg';
import { IconButton, ListCard, ListRow, SectionHead, Toggle } from '../components/ui';
import { useFeedback } from '../feedback/FeedbackProvider';
import { shareTxCsv } from '../lib/exportCsv';
import { usePrefs } from '../prefs/PrefsProvider';
import { useNav, type ScreenEntry } from '../app/navContext';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { MPageShell } from './_MPageShell';

// ── Preference option sets ──────────────────────────────────────────
const LANGUAGES = [
  { code: 'en', label: 'English (India)' },
  { code: 'hi', label: 'हिन्दी Hindi' },
  { code: 'gu', label: 'ગુજરાતી Gujarati' },
  { code: 'kn', label: 'ಕನ್ನಡ Kannada' },
] as const;

const CURRENCIES = [
  { code: 'INR', label: '₹ Indian Rupee (INR)', sub: 'INR · Indian Rupee' },
  { code: 'USD', label: '$ US Dollar (USD)', sub: 'USD · US Dollar' },
  { code: 'EUR', label: '€ Euro (EUR)', sub: 'EUR · Euro' },
  { code: 'GBP', label: '£ Pound (GBP)', sub: 'GBP · British Pound' },
] as const;

const DATE_FORMATS = ['DD MMM YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const;

// Product/legal pages opened in the in-app browser.
const HELP_URL = 'https://riddhi.app/help';
const PRIVACY_URL = 'https://riddhi.app/privacy';
const TERMS_URL = 'https://riddhi.app/terms';

// App version from app.json (single source of truth for the About row).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const appVersion: string = (require('../../app.json') as { expo: { version: string } }).expo
  .version;

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
  const { toast, sheet, form } = useFeedback();
  const { user, updateProfile, logout } = useAuth();
  const { prefs, set: setPrefs } = usePrefs();
  const bioLabel = useBiometricLabel();
  // Hide the biometric row entirely on devices without enrolled biometrics
  // (spec § Settings).
  const [bioAvailable, setBioAvailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]).then(([hw, enrolled]) => {
      if (!cancelled) setBioAvailable(hw && enrolled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = user?.name ?? 'Riddhi Desai';
  const email = user?.email ?? 'riddhi@example.com';
  const initials = displayName
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // Theme row — live app-wide switch (MobileScreens.jsx:545–549's setTheme,
  // minus the DOM/localStorage calls which ThemeProvider.setMode already
  // performs via AsyncStorage on every call).
  const handleThemeChange = (v: 'light' | 'dark') => {
    setMode(v);
    toast(v === 'light' ? 'Light mode on' : 'Dark mode on', v === 'light' ? '☀️' : '🌙');
  };

  const setPref = (patch: Parameters<typeof setPrefs>[0], msg: string, icon?: string) => {
    setPrefs(patch)
      .then(() => toast(msg, icon))
      .catch(() => toast("Couldn't save that setting", '📡'));
  };

  const editProfile = () => {
    form({
      title: 'Edit profile',
      fields: [{ key: 'name', label: 'Name', initial: displayName }],
      submitLabel: 'Save',
      onSubmit: async (v) => {
        await updateProfile(v['name']!);
        toast('Profile updated', '✏️');
      },
    });
  };

  const toggleBiometric = async (v: boolean) => {
    if (v) {
      // Prove the biometric works before trusting it as an unlock method,
      // mirroring the onboarding Secure step.
      const auth = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Confirm to enable app lock',
      });
      if (!auth.success) {
        toast(`${bioLabel} check failed`, '⚠️');
        return;
      }
    }
    await setBiometricEnabled(v);
    setPref({ biometricEnabled: v }, v ? `${bioLabel} unlock on` : `${bioLabel} unlock off`, '🔒');
  };

  const changePin = async () => {
    const exists = await hasPin();
    form({
      title: exists ? 'Change PIN' : 'Set PIN',
      fields: [
        ...(exists ? [{ key: 'current', label: 'Current PIN' } as const] : []),
        { key: 'pin', label: 'New PIN (4–6 digits)' },
        { key: 'confirm', label: 'Confirm new PIN' },
      ],
      submitLabel: exists ? 'Change PIN' : 'Set PIN',
      onSubmit: async (v) => {
        if (exists && !(await verifyPin(v['current'] ?? ''))) {
          throw new Error('Current PIN is incorrect');
        }
        if (!/^\d{4,6}$/.test(v['pin'] ?? '')) throw new Error('PIN must be 4–6 digits');
        if (v['pin'] !== v['confirm']) throw new Error("PINs don't match");
        await savePin(v['pin']!);
        toast('PIN updated', '🔑');
      },
    });
  };

  const exportCsv = async () => {
    try {
      await shareTxCsv('all');
    } catch {
      toast("Couldn't export data", '📡');
    }
  };

  const deleteAccount = async () => {
    try {
      await api.users.deleteAccount();
    } catch {
      toast("Couldn't delete the account — try again", '📡');
      return;
    }
    toast('Account deleted');
    await logout();
  };

  const currencySub = CURRENCIES.find((c) => c.code === prefs.currency)?.sub ?? prefs.currency;
  const languageSub = LANGUAGES.find((l) => l.code === prefs.language)?.label ?? prefs.language;

  return (
    <MPageShell title="Settings" onBack={pop}>
      {/* Profile card (MobileScreens.jsx:587–595) */}
      <GlassCard style={styles.profileCard} contentStyle={styles.profileCardContent}>
        <LinearGradient
          colors={[t.em, '#9d8bd6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatar}
        >
          <Text style={styles.avatarText}>{initials}</Text>
        </LinearGradient>
        <View style={styles.profileInfo}>
          <Text style={[styles.profileName, { color: t.text1, fontFamily: weight(700) }]}>{displayName}</Text>
          <Text style={[styles.profileEmail, { color: t.text3 }]}>{email}</Text>
          <View style={[styles.proBadge, { backgroundColor: t.emDim }]}>
            <Text style={[styles.proBadgeText, { color: t.em, fontFamily: weight(700) }]}>PRO MEMBER</Text>
          </View>
        </View>
        <IconButton onPress={editProfile}>
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
                // Inline in a list row — stretching would balloon the
                // control across the row and crush the "Theme" label.
                stretch={false}
              />
            }
          />
          <Row
            icon="🌐"
            color={t.blue}
            title="Language"
            sub={languageSub}
            onPress={() =>
              sheet({
                title: 'Language',
                options: LANGUAGES.map((l) => ({
                  label: l.label,
                  onPress: () => setPref({ language: l.code }, `Language: ${l.label}`, '🌐'),
                })),
              })
            }
          />
          <Row
            icon="₹"
            color={t.em}
            title="Currency"
            sub={currencySub}
            onPress={() =>
              sheet({
                title: 'Currency',
                options: CURRENCIES.map((c) => ({
                  label: c.label,
                  onPress: () => setPref({ currency: c.code }, `Currency: ${c.code}`, '💱'),
                })),
              })
            }
          />
          <Row
            icon="📅"
            color={t.amber}
            title="Date format"
            sub={prefs.dateFormat}
            last
            onPress={() =>
              sheet({
                title: 'Date format',
                options: DATE_FORMATS.map((f) => ({
                  label: f,
                  onPress: () => setPref({ dateFormat: f }, `Date format: ${f}`, '📅'),
                })),
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
                on={prefs.hideBalances}
                onChange={(v) =>
                  setPref({ hideBalances: v }, v ? 'Balances hidden' : 'Balances visible', '👁')
                }
              />
            }
          />
          {bioAvailable ? (
            <Row
              icon="🔒"
              color={t.red}
              title="Biometric login"
              sub={prefs.biometricEnabled ? `${bioLabel} enabled` : `${bioLabel} off`}
              right={
                <Toggle on={prefs.biometricEnabled} onChange={(v) => void toggleBiometric(v)} />
              }
            />
          ) : null}
          <Row icon="🔑" color={t.amber} title="Change PIN" onPress={() => void changePin()} />
          <Row
            icon="📱"
            color={t.cyan}
            title="Active sessions"
            sub="This device"
            last
            onPress={() =>
              sheet({
                title: 'Active sessions',
                options: [
                  { label: 'This device · current session', icon: '📱', onPress: () => {} },
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
                on={prefs.notificationsEnabled}
                onChange={(v) =>
                  setPref(
                    { notificationsEnabled: v },
                    v ? 'Notifications on' : 'Notifications off',
                    '🔔',
                  )
                }
              />
            }
          />
          <Row
            icon="📊"
            color={t.blue}
            title="Budget alerts"
            sub="At 75% & 100%"
            right={
              <Toggle
                on={prefs.budgetAlertsEnabled}
                onChange={(v) =>
                  setPref({ budgetAlertsEnabled: v }, v ? 'Budget alerts on' : 'Budget alerts off', '📊')
                }
              />
            }
          />
          <Row
            icon="🎯"
            color={t.violet}
            title="Goal milestones"
            right={
              <Toggle
                on={prefs.goalMilestonesEnabled}
                onChange={(v) =>
                  setPref(
                    { goalMilestonesEnabled: v },
                    v ? 'Milestone alerts on' : 'Milestone alerts off',
                    '🎯',
                  )
                }
              />
            }
          />
          <Row
            icon="💰"
            color={t.amber}
            title="Large transactions"
            sub="> ₹10,000"
            last
            right={
              <Toggle
                on={prefs.largeTxAlertsEnabled}
                onChange={(v) =>
                  setPref(
                    { largeTxAlertsEnabled: v },
                    v ? 'Large-transaction alerts on' : 'Large-transaction alerts off',
                    '💰',
                  )
                }
              />
            }
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
            sub="Share as CSV"
            onPress={() =>
              sheet({
                title: 'Export data',
                options: [
                  { label: 'Export as CSV', icon: '📄', onPress: () => void exportCsv() },
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
                title: 'Delete account? This permanently erases all your data.',
                options: [
                  {
                    label: 'Yes, delete everything',
                    icon: '🗑',
                    danger: true,
                    onPress: () => void deleteAccount(),
                  },
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
          <Row icon="❓" color={t.blue} title="Help center" onPress={() => void WebBrowser.openBrowserAsync(HELP_URL)} />
          <Row icon="📜" color={t.text3} title="Privacy policy" onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL)} />
          <Row icon="📋" color={t.text3} title="Terms of service" onPress={() => void WebBrowser.openBrowserAsync(TERMS_URL)} />
          <Row icon="✨" color={t.em} title="Version" sub={`v${appVersion}`} right={null} last />
        </ListCard>
      </View>

      {/* Sign out (MobileScreens.jsx:656–661) */}
      <Pressable
        onPress={() =>
          sheet({
            title: 'Sign out?',
            options: [
              { label: 'Sign out', icon: '🚪', danger: true, onPress: () => void logout() },
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
    marginBottom: 18,
  },
  // Content layout must target GlassCard's inner overlay (contentStyle) —
  // on `style` it lands on the outer wrapper and the card stacks vertically.
  profileCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
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
