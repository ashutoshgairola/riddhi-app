/** Login — RN port of AuthLogin (project/riddhi/MobileAuth.jsx:148-190). */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { useBiometricLabel } from '../../auth/biometricLabel';
import { Btn } from '../../components/ui';
import { useFeedback } from '../../feedback/FeedbackProvider';
import { ApiError } from '../../api/client';
import { authApi, USE_BACKEND } from '../../api';
import { useTheme } from '../../theme/ThemeProvider';
import { weight } from '../../theme/tokens';
import { spacing } from '../../theme/spacing';
import {
  AuthDivider,
  AuthInput,
  AuthShell,
  FaceIdGlyph,
  Field,
  PasswordField,
  PressableScale,
  SocialRow,
  SpringIn,
  Wordmark,
} from './authUi';
import { useGoogleAuth } from './useGoogleAuth';

export function Login({
  onBack,
  onSignup,
  onForgot,
}: {
  onBack: () => void;
  onSignup: () => void;
  onForgot: (email: string) => void;
}) {
  const { t } = useTheme();
  const { toast } = useFeedback();
  const { login, biometricLogin, canBiometricLogin } = useAuth();
  const bioLabel = useBiometricLabel();
  const { promptGoogle } = useGoogleAuth();
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [pending, setPending] = useState(false);

  const canSubmit = email.trim().length > 0 && pwd.trim().length > 0;

  const submit = async () => {
    if (!canSubmit || pending) return;
    setPending(true);
    try {
      await login(email.trim(), pwd);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) toast('Invalid email or password', '⚠️');
      else toast('Could not reach the server', '📡');
    } finally {
      setPending(false);
    }
  };

  const faceId = async () => {
    toast('Authenticating…', '🔒');
    const ok = await biometricLogin();
    if (!ok) toast(`${bioLabel} sign-in failed`, '⚠️');
  };

  const forgotPassword = async () => {
    const target = email.trim();
    if (!/.+@.+\..+/.test(target)) {
      toast('Enter your email above first', '📧');
      return;
    }
    if (!USE_BACKEND) {
      // Mock mode has no auth backend to issue reset codes.
      toast('If that email exists, a reset code is on its way', '📧');
      onForgot(target);
      return;
    }
    try {
      await authApi.forgotPassword(target);
      toast('If that email exists, a reset code is on its way', '📧');
      // Move to the reset screen with the email prefilled so the emailed code
      // can be entered here.
      onForgot(target);
    } catch {
      toast('Could not reach the server', '📡');
    }
  };

  return (
    <AuthShell onBack={onBack}>
      <SpringIn style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>
        <Wordmark size={30} />
        <Text style={[styles.title, { color: t.text1, fontFamily: weight(800) }]}>Welcome back</Text>
        <Text style={[styles.sub, { color: t.text2, fontFamily: weight(500) }]}>Log in to pick up where you left off.</Text>
      </SpringIn>

      <SpringIn delay={50}>
        <Field label="Email or phone">
          <AuthInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
        </Field>
        <Field label="Password">
          <PasswordField value={pwd} onChange={setPwd} />
        </Field>
        <Pressable onPress={() => void forgotPassword()} style={{ alignSelf: 'flex-end', marginTop: -2, marginBottom: spacing.md }}>
          <Text style={{ fontSize: 13, color: t.em, fontFamily: weight(600) }}>Forgot password?</Text>
        </Pressable>

        <Btn onPress={submit} disabled={!canSubmit || pending} style={{ height: 54, opacity: canSubmit ? 1 : 0.45 }}>
          <Text style={{ fontSize: 16, color: '#1a1228', fontFamily: weight(600) }}>
            {pending ? 'Logging in…' : 'Log in'}
          </Text>
        </Btn>

        {canBiometricLogin ? (
          <PressableScale onPress={faceId}>
            <View style={[styles.faceIdBtn, { backgroundColor: t.glassBg, borderColor: t.glassBrd }]}>
              <FaceIdGlyph color={t.text1} />
              <Text style={{ fontSize: 14, color: t.text1, fontFamily: weight(600) }}>{`Use ${bioLabel}`}</Text>
            </View>
          </PressableScale>
        ) : null}

        <AuthDivider label="or" />
        <SocialRow onGoogle={promptGoogle} />
      </SpringIn>

      <View style={{ alignItems: 'center', marginTop: spacing.lg, flexDirection: 'row', justifyContent: 'center' }}>
        <Text style={{ fontSize: 14, color: t.text2, fontFamily: weight(500) }}>New to Riddhi? </Text>
        <Pressable onPress={onSignup}>
          <Text style={{ fontSize: 14, color: t.em, fontFamily: weight(700) }}>Create an account</Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 26,
    letterSpacing: -0.78, // -0.03em of 26px
    marginTop: spacing.lg,
  },
  sub: {
    fontSize: 14,
    marginTop: spacing.xs,
  },
  faceIdBtn: {
    height: 50,
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: 16,
    borderWidth: 1,
  },
});
