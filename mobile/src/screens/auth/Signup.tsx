/** Signup — RN port of AuthSignup (project/riddhi/MobileAuth.jsx:193-274). */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { useAuth } from '../../auth/AuthProvider';
import { Btn } from '../../components/ui';
import { useFeedback } from '../../feedback/FeedbackProvider';
import { ApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { weight } from '../../theme/tokens';
import { spacing } from '../../theme/spacing';
import {
  AuthDivider,
  AuthInput,
  AuthShell,
  Field,
  PasswordField,
  SocialRow,
  SpringIn,
  Wordmark,
} from './authUi';
import { useGoogleAuth } from './useGoogleAuth';

/** Password strength 0..4 (MobileAuth.jsx:193-200). */
export function pwStrength(p: string): number {
  let s = 0;
  if (p.length >= 8) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return s;
}

const S_LABELS = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Check({ color = '#1a1228', size = 13, strokeWidth = 3.4 }: { color?: string; size?: number; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

export function Signup({ onBack, onLogin }: { onBack: () => void; onLogin: () => void }) {
  const { t } = useTheme();
  const { toast } = useFeedback();
  const { register } = useAuth();
  const { promptGoogle } = useGoogleAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [pwd, setPwd] = useState('');
  const [agree, setAgree] = useState(false);
  const [pending, setPending] = useState(false);

  const strength = pwStrength(pwd);
  const sColors = [t.red, t.red, t.amber, t.blue, t.em];
  const canSubmit =
    name.trim().length > 0 && EMAIL_RE.test(email.trim()) && phone.length === 10 && strength >= 2 && agree;

  const submit = async () => {
    if (!canSubmit || pending) return;
    setPending(true);
    try {
      await register(name.trim(), email.trim(), pwd);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) toast('Email already in use', '⚠️');
      else toast('Could not reach the server', '📡');
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthShell onBack={onBack}>
      <SpringIn style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>
        <Wordmark size={30} />
        <Text style={[styles.title, { color: t.text1, fontFamily: weight(800) }]}>Create your account</Text>
        <Text style={[styles.sub, { color: t.text2, fontFamily: weight(500) }]}>Two minutes to set up. Free forever to start.</Text>
      </SpringIn>

      <SpringIn delay={50}>
        <Field label="Full name">
          <AuthInput value={name} onChangeText={setName} placeholder="Riddhi Desai" autoComplete="name" />
        </Field>
        <Field label="Email">
          <AuthInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
        </Field>
        <Field label="Mobile number">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <View style={[styles.ccBox, { backgroundColor: t.glassBg, borderColor: t.glassBrd }]}>
              <Text style={{ fontSize: 15, color: t.text2, fontFamily: weight(600) }}>🇮🇳 +91</Text>
            </View>
            <View style={{ flex: 1 }}>
              <AuthInput
                value={phone}
                onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))}
                placeholder="98765 43210"
                keyboardType="phone-pad"
              />
            </View>
          </View>
        </Field>
        <Field label="Password">
          <PasswordField value={pwd} onChange={setPwd} placeholder="Create a password" />
          {pwd ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs }}>
              <View style={{ flex: 1, flexDirection: 'row', gap: spacing.xxs }}>
                {[0, 1, 2, 3].map((i) => (
                  <View
                    key={i}
                    style={{ flex: 1, height: 4, borderRadius: 99, backgroundColor: i < strength ? sColors[strength] : t.bg3 }}
                  />
                ))}
              </View>
              <Text style={{ fontSize: 11.5, fontFamily: weight(700), color: sColors[strength], minWidth: 56, textAlign: 'right' }}>
                {S_LABELS[strength]}
              </Text>
            </View>
          ) : null}
        </Field>

        {/* Terms (MobileAuth.jsx:253-261) */}
        <Pressable onPress={() => setAgree((a) => !a)} style={styles.termsRow}>
          <View
            style={[
              styles.checkbox,
              {
                backgroundColor: agree ? t.em : t.glassBg,
                borderColor: agree ? t.em : t.glassBrd2,
              },
            ]}
          >
            {agree ? <Check /> : null}
          </View>
          <Text style={{ flex: 1, fontSize: 12.5, color: t.text2, lineHeight: 18.75, fontFamily: weight(500) }}>
            I agree to Riddhi's <Text style={{ color: t.em, fontFamily: weight(600) }}>Terms of Service</Text> and{' '}
            <Text style={{ color: t.em, fontFamily: weight(600) }}>Privacy Policy</Text>.
          </Text>
        </Pressable>

        <Btn onPress={submit} disabled={!canSubmit || pending} style={{ height: 54, opacity: canSubmit ? 1 : 0.45 }}>
          <Text style={{ fontSize: 16, color: '#1a1228', fontFamily: weight(600) }}>
            {pending ? 'Creating…' : 'Create account'}
          </Text>
        </Btn>

        <AuthDivider label="or sign up with" />
        <SocialRow onGoogle={promptGoogle} onApple={() => toast('Apple sign-in coming soon', '🍎')} />
      </SpringIn>

      <View style={{ alignItems: 'center', marginTop: spacing.lg, flexDirection: 'row', justifyContent: 'center' }}>
        <Text style={{ fontSize: 14, color: t.text2, fontFamily: weight(500) }}>Already have an account? </Text>
        <Pressable onPress={onLogin}>
          <Text style={{ fontSize: 14, color: t.em, fontFamily: weight(700) }}>Log in</Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 26,
    letterSpacing: -0.78,
    marginTop: spacing.lg,
  },
  sub: {
    fontSize: 14,
    marginTop: spacing.xs,
  },
  ccBox: {
    height: 50,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.xs,
    marginHorizontal: spacing.xxs,
    marginBottom: spacing.lg,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    marginTop: spacing.xxs,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
