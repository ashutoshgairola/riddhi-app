/**
 * Google sign-in via expo-auth-session. Requires EXPO_PUBLIC_GOOGLE_CLIENT_ID
 * (spec: button shows a "not configured" toast until it's set).
 * Verify API shape against https://docs.expo.dev/versions/v56.0.0/sdk/auth-session/
 * if this drifts from SDK 56.
 */
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { useFeedback } from '../../feedback/FeedbackProvider';

WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID = process.env['EXPO_PUBLIC_GOOGLE_CLIENT_ID'] ?? '';

export function useGoogleAuth() {
  const { googleSignIn } = useAuth();
  const { toast } = useFeedback();
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: CLIENT_ID || 'unconfigured.apps.googleusercontent.com',
  });

  useEffect(() => {
    if (response?.type === 'success' && response.params['id_token']) {
      googleSignIn(response.params['id_token']).catch(() => {
        toast('Google sign-in failed', '⚠️');
      });
    }
  }, [response, googleSignIn, toast]);

  const promptGoogle = useCallback(async () => {
    if (!CLIENT_ID) {
      toast('Google sign-in not configured yet', '🔵');
      return;
    }
    await promptAsync();
  }, [promptAsync, toast]);

  return { promptGoogle, googleConfigured: Boolean(CLIENT_ID) && Boolean(request) };
}
