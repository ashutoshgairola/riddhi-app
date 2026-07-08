import { NOTIFICATION_CATALOG } from './catalog.constant';

describe('notification catalog', () => {
  it('has unique package names and required fields', () => {
    const pkgs = NOTIFICATION_CATALOG.map((c) => c.packageName);
    expect(new Set(pkgs).size).toBe(pkgs.length);
    for (const c of NOTIFICATION_CATALOG) {
      expect(c.packageName).toMatch(/^[a-z0-9_.]+$/i);
      expect(c.displayName.length).toBeGreaterThan(0);
      expect(['bank', 'upi', 'wallet', 'merchant']).toContain(c.category);
    }
  });

  it('covers every legacy DEFAULT_ALLOWLIST package', () => {
    const legacy = [
      'com.snapwork.hdfc', 'com.csam.icici.bank.imobile', 'com.sbi.lotusintouch',
      'com.axis.mobile', 'com.msf.kbank.mobile', 'com.bankofbaroda.mconnect',
      'com.google.android.apps.nbu.paisa.user', 'com.phonepe.app', 'net.one97.paytm',
      'com.rapido.passenger', 'com.ubercab', 'in.swiggy.android',
      'com.application.zomato', 'in.amazon.mShop.android.shopping', 'com.flipkart.android',
    ];
    const pkgs = new Set(NOTIFICATION_CATALOG.map((c) => c.packageName));
    for (const p of legacy) expect(pkgs.has(p)).toBe(true);
  });
});
