/** Login — RN port of AuthLogin (project/riddhi/MobileAuth.jsx:148-190). */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useAuth } from '../../auth/AuthProvider';
import { Btn } from '../../components/ui';
import { useFeedback } from '../../feedback/FeedbackProvider';
import { ApiError } from '../../api/client';
import { useTheme } from '../../theme/ThemeProvider';
import { weight } from '../../theme/tokens';
import {
  AuthDivider,
  AuthInput,
  AuthShell,
  Field,
  PasswordField,
  PressableScale,
  SocialRow,
  SpringIn,
  Wordmark,
} from './authUi';
import { useGoogleAuth } from './useGoogleAuth';

/** Face-ID glyph (MobileAuth.jsx:177). */
function FaceIdGlyph({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 2a5 5 0 0 0-5 5v3a5 5 0 0 0 10 0V7a5 5 0 0 0-5-5z" />
      <Path d="M4 11v2a8 8 0 0 0 16 0v-2" />
    </Svg>
  );
}

export function Login({ onBack, onSignup }: { onBack: () => void; onSignup: () => void }) {
  const { t } = useTheme();
  const { toast } = useFeedback();
  const { login, biometricLogin, canBiometricLogin } = useAuth();
  const { promptGoogle } = useGoogleAuth();
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (pending) return;
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
    if (!ok) toast('Face ID sign-in failed', '⚠️');
  };

  return (
    <AuthShell onBack={onBack}>
      <SpringIn style={{ marginTop: 8, marginBottom: 24 }}>
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
        <Pressable onPress={() => toast('Reset link sent', '📧')} style={{ alignSelf: 'flex-end', marginTop: -2, marginBottom: 18 }}>
          <Text style={{ fontSize: 13, color: t.em, fontFamily: weight(600) }}>Forgot password?</Text>
        </Pressable>

        <Btn onPress={submit} disabled={pending} style={{ height: 54 }}>
          <Text style={{ fontSize: 16, color: '#1a1228', fontFamily: weight(600) }}>
            {pending ? 'Logging in…' : 'Log in'}
          </Text>
        </Btn>

        {canBiometricLogin ? (
          <PressableScale onPress={faceId}>
            <View style={[styles.faceIdBtn, { backgroundColor: t.glassBg, borderColor: t.glassBrd }]}>
              <FaceIdGlyph color={t.text1} />
              <Text style={{ fontSize: 14, color: t.text1, fontFamily: weight(600) }}>Use Face ID</Text>
            </View>
          </PressableScale>
        ) : null}

        <AuthDivider label="or" />
        <SocialRow onGoogle={promptGoogle} onApple={() => toast('Apple sign-in coming soon', '🍎')} />
      </SpringIn>

      <View style={{ alignItems: 'center', marginTop: 28, flexDirection: 'row', justifyContent: 'center' }}>
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
    marginTop: 20,
  },
  sub: {
    fontSize: 14,
    marginTop: 6,
  },
  faceIdBtn: {
    height: 50,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 16,
    borderWidth: 1,
  },
});
