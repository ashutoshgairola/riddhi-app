/**
 * ResetPassword — completes a password reset with the 6-digit code emailed by
 * `POST /auth/forgot-password`. Reached from "Forgot password?" on Login, which
 * prefills the email the request was sent to. The user enters the code, picks a
 * new password, and we call `POST /auth/reset-password`.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Btn } from '../../components/ui';
import { useFeedback } from '../../feedback/FeedbackProvider';
import { ApiError } from '../../api/client';
import { authApi } from '../../api';
import { useTheme } from '../../theme/ThemeProvider';
import { weight } from '../../theme/tokens';
import { AuthInput, AuthShell, Field, PasswordField, SpringIn, Wordmark } from './authUi';

const MIN_PASSWORD = 8;
const CODE_LENGTH = 6;

export function ResetPassword({
  onBack,
  onDone,
  initialEmail = '',
}: {
  onBack: () => void;
  onDone: () => void;
  initialEmail?: string;
}) {
  const { t } = useTheme();
  const { toast } = useFeedback();
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [pwd, setPwd] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (pending) return;
    if (!/.+@.+\..+/.test(email.trim())) {
      toast('Enter the email you requested the code for', '📧');
      return;
    }
    if (code.trim().length !== CODE_LENGTH) {
      toast(`Enter the ${CODE_LENGTH}-digit code from your email`, '🔑');
      return;
    }
    if (pwd.length < MIN_PASSWORD) {
      toast(`Password must be at least ${MIN_PASSWORD} characters`, '⚠️');
      return;
    }
    setPending(true);
    try {
      await authApi.resetPassword(email.trim(), code.trim(), pwd);
      toast('Password updated — log in with it', '✓');
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        toast('That reset code is invalid or expired', '⚠️');
      } else {
        toast('Could not reach the server', '📡');
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthShell onBack={onBack}>
      <SpringIn style={{ marginTop: 8, marginBottom: 24 }}>
        <Wordmark size={30} />
        <Text style={[styles.title, { color: t.text1, fontFamily: weight(800) }]}>Reset password</Text>
        <Text style={[styles.sub, { color: t.text2, fontFamily: weight(500) }]}>
          Enter the 6-digit code we emailed you and choose a new password.
        </Text>
      </SpringIn>

      <SpringIn delay={50}>
        <Field label="Email">
          <AuthInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
          />
        </Field>
        <Field label="Reset code">
          <AuthInput
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, CODE_LENGTH))}
            placeholder="6-digit code from your email"
            keyboardType="number-pad"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={CODE_LENGTH}
          />
        </Field>
        <Field label="New password">
          <PasswordField value={pwd} onChange={setPwd} />
        </Field>

        <Btn onPress={submit} disabled={pending} style={{ height: 54, marginTop: 8 }}>
          <Text style={{ fontSize: 16, color: '#1a1228', fontFamily: weight(600) }}>
            {pending ? 'Updating…' : 'Update password'}
          </Text>
        </Btn>
      </SpringIn>

      <View style={{ alignItems: 'center', marginTop: 28, flexDirection: 'row', justifyContent: 'center' }}>
        <Text style={{ fontSize: 14, color: t.text2, fontFamily: weight(500) }}>Remembered it? </Text>
        <Pressable onPress={onDone}>
          <Text style={{ fontSize: 14, color: t.em, fontFamily: weight(700) }}>Back to log in</Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, marginTop: 14 },
  sub: { fontSize: 15, marginTop: 6, lineHeight: 21 },
});
