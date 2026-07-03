/**
 * Google sign-in via expo-auth-session. Requires the Google OAuth client IDs
 * in env (spec: button shows a "not configured" toast until set):
 *  - EXPO_PUBLIC_GOOGLE_CLIENT_ID          web client (also the backend's primary audience)
 *  - EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID      iOS client (native builds)
 *  - EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID  Android client (native builds)
 * The platform provider picks the matching ID per platform; tokens minted for
 * the iOS/Android clients carry that client ID as `aud`, so the backend
 * accepts all configured IDs as audiences (GOOGLE_CLIENT_ID comma list).
 * Verify API shape against https://docs.expo.dev/versions/v56.0.0/sdk/auth-session/
 * if this drifts from SDK 56.
 */
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '../../auth/AuthProvider';
import { useFeedback } from '../../feedback/FeedbackProvider';

WebBrowser.maybeCompleteAuthSession();

const WEB_CLIENT_ID = process.env['EXPO_PUBLIC_GOOGLE_CLIENT_ID'] ?? '';
const IOS_CLIENT_ID = process.env['EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID'] ?? '';
const ANDROID_CLIENT_ID = process.env['EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID'] ?? '';

/** The client ID the current platform will actually use. */
const PLATFORM_CLIENT_ID = Platform.select({
  ios: IOS_CLIENT_ID || WEB_CLIENT_ID,
  android: ANDROID_CLIENT_ID || WEB_CLIENT_ID,
  default: WEB_CLIENT_ID,
});

export function useGoogleAuth() {
  const { googleSignIn } = useAuth();
  const { toast } = useFeedback();
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: WEB_CLIENT_ID || 'unconfigured.apps.googleusercontent.com',
    ...(IOS_CLIENT_ID ? { iosClientId: IOS_CLIENT_ID } : {}),
    ...(ANDROID_CLIENT_ID ? { androidClientId: ANDROID_CLIENT_ID } : {}),
  });

  useEffect(() => {
    if (response?.type === 'success' && response.params['id_token']) {
      googleSignIn(response.params['id_token']).catch(() => {
        toast('Google sign-in failed', '⚠️');
      });
    }
  }, [response, googleSignIn, toast]);

  const promptGoogle = useCallback(async () => {
    if (!PLATFORM_CLIENT_ID) {
      toast('Google sign-in not configured yet', '🔵');
      return;
    }
    await promptAsync();
  }, [promptAsync, toast]);

  return { promptGoogle, googleConfigured: Boolean(PLATFORM_CLIENT_ID) && Boolean(request) };
}
