/**
 * sms-reader — local Expo module that reads the device SMS inbox on Android.
 *
 * Android-only by design (iOS has no SMS-read API). The native module is only
 * registered on Android (see expo-module.config.json), so on every other
 * platform `requireOptionalNativeModule` returns null and the helpers below
 * degrade to "no messages / not available" rather than throwing.
 *
 * Reading SMS requires the READ_SMS runtime permission (declared in app.json
 * and requested at call time by src/lib/smsSync.ts). This module only reads;
 * it never sends, deletes, or uploads message content — parsing happens on the
 * backend against bodies the user explicitly syncs.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export interface SmsMessage {
  /** Provider row id (stable per message on this device). */
  id: string;
  /** Sender address / short code. */
  address: string;
  /** Message body. */
  body: string;
  /** Epoch milliseconds the message was received. */
  date: number;
}

interface SmsReaderNativeModule {
  getMessages(sinceMs: number, max: number): Promise<SmsMessage[]>;
}

const SmsReader =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<SmsReaderNativeModule>('SmsReader')
    : null;

/** True only on an Android build where the native module is linked. */
export const isSmsReaderAvailable = SmsReader != null;

/**
 * Returns inbox messages received at/after `sinceMs`, newest first, capped at
 * `max`. Resolves to `[]` on unsupported platforms or when the module is
 * missing (e.g. Expo Go, which can't link custom native modules).
 */
export async function getMessages(sinceMs: number, max = 200): Promise<SmsMessage[]> {
  if (!SmsReader) return [];
  return SmsReader.getMessages(sinceMs, max);
}
