/**
 * biometricLabel — platform-aware name for the device's biometric method
 * (spec 2026-07-06-app-lock-design.md § Platform-aware biometric labeling).
 * The handoff copy says "Face ID"; Android devices get "Fingerprint" etc.
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

export async function getBiometricLabel(): Promise<string> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return 'Face ID';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint';
    }
  } catch {
    // fall through to generic label
  }
  return 'Biometrics';
}

export function useBiometricLabel(): string {
  const [label, setLabel] = useState('Face ID');
  useEffect(() => {
    let cancelled = false;
    void getBiometricLabel().then((l) => {
      if (!cancelled) setLabel(l);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return label;
}
