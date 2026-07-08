/**
 * notification-listener — local Expo module reading captured notifications from
 * an on-device store fed by an Android NotificationListenerService.
 *
 * Android-only. On every other platform requireOptionalNativeModule returns null
 * and every helper degrades to "not available / no messages".
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export interface CapturedItem {
  id: string;
  packageName: string;
  title: string;
  text: string;
  postedAt: number;
}

interface NativeModule {
  isEnabled(): boolean;
  openSettings(): void;
  setAllowlist(packages: string[]): Promise<void>;
  getPending(max: number): Promise<CapturedItem[]>;
  markUploaded(ids: string[]): Promise<void>;
  clearAll(): Promise<void>;
}

const Native =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<NativeModule>('NotificationListener')
    : null;

export const isNotificationListenerAvailable = Native != null;

/** Finance + merchant apps we capture from. Extend as needed. */
export const DEFAULT_ALLOWLIST: string[] = [
  // Banks (notification package names)
  'com.snapwork.hdfc', 'com.csam.icici.bank.imobile', 'com.sbi.lotusintouch',
  'com.axis.mobile', 'com.msf.kbank.mobile', 'com.bankofbaroda.mconnect',
  // UPI / wallets
  'com.google.android.apps.nbu.paisa.user', 'com.phonepe.app', 'net.one97.paytm',
  // Merchants
  'com.rapido.passenger', 'com.ubercab', 'in.swiggy.android',
  'com.application.zomato', 'in.amazon.mShop.android.shopping', 'com.flipkart.android',
];

export function isEnabled(): boolean {
  return Native ? Native.isEnabled() : false;
}
export function openSettings(): void {
  Native?.openSettings();
}
export async function setAllowlist(packages: string[]): Promise<void> {
  if (Native) await Native.setAllowlist(packages);
}
export async function getPending(max = 300): Promise<CapturedItem[]> {
  return Native ? Native.getPending(max) : [];
}
export async function markUploaded(ids: string[]): Promise<void> {
  if (Native && ids.length) await Native.markUploaded(ids);
}
export async function clearAll(): Promise<void> {
  if (Native) await Native.clearAll();
}
