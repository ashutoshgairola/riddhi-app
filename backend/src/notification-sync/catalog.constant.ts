export type CatalogCategory = 'bank' | 'upi' | 'wallet' | 'merchant';

export interface CatalogEntry {
  packageName: string;
  displayName: string;
  category: CatalogCategory;
  region?: string;
}

/** Canonical set of finance/merchant apps we capture notifications from.
 * Update this list + deploy the backend to extend coverage — no app release
 * needed (the mobile app fetches it at runtime). Packages here should also be
 * declared in the mobile AndroidManifest <queries> block so install-state can
 * be probed; a package added here but not yet in <queries> is still captured,
 * it just skips the installed-filter until a mobile release adds it. */
export const NOTIFICATION_CATALOG: CatalogEntry[] = [
  // Banks
  { packageName: 'com.snapwork.hdfc', displayName: 'HDFC Bank', category: 'bank', region: 'IN' },
  { packageName: 'com.csam.icici.bank.imobile', displayName: 'ICICI iMobile', category: 'bank', region: 'IN' },
  { packageName: 'com.sbi.lotusintouch', displayName: 'SBI YONO', category: 'bank', region: 'IN' },
  { packageName: 'com.axis.mobile', displayName: 'Axis Mobile', category: 'bank', region: 'IN' },
  { packageName: 'com.msf.kbank.mobile', displayName: 'Kotak 811', category: 'bank', region: 'IN' },
  { packageName: 'com.bankofbaroda.mconnect', displayName: 'Bank of Baroda', category: 'bank', region: 'IN' },
  // UPI
  { packageName: 'com.google.android.apps.nbu.paisa.user', displayName: 'Google Pay', category: 'upi', region: 'IN' },
  { packageName: 'com.phonepe.app', displayName: 'PhonePe', category: 'upi', region: 'IN' },
  { packageName: 'net.one97.paytm', displayName: 'Paytm', category: 'wallet', region: 'IN' },
  // Merchants
  { packageName: 'com.rapido.passenger', displayName: 'Rapido', category: 'merchant', region: 'IN' },
  { packageName: 'com.ubercab', displayName: 'Uber', category: 'merchant' },
  { packageName: 'in.swiggy.android', displayName: 'Swiggy', category: 'merchant', region: 'IN' },
  { packageName: 'com.application.zomato', displayName: 'Zomato', category: 'merchant', region: 'IN' },
  { packageName: 'in.amazon.mShop.android.shopping', displayName: 'Amazon', category: 'merchant', region: 'IN' },
  { packageName: 'com.flipkart.android', displayName: 'Flipkart', category: 'merchant', region: 'IN' },
];
