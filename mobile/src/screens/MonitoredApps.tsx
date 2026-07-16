/**
 * MonitoredApps — lets the user see and control which finance/merchant apps
 * Riddhi captures notifications from. Lists the backend catalog grouped by
 * category, shows the real app icon (from PackageManager) for installed apps,
 * and a per-app Toggle. Flipping a toggle persists it and re-pushes the native
 * allowlist immediately via configureAllowlist().
 */
import { useCallback, useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { ListCard, ListRow, Toggle } from '../components/ui';
import { MI } from '../components/icons';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { spacing } from '../theme/spacing';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useNav, type ScreenEntry } from '../app/navContext';
import { MPageShell } from './_MPageShell';
import { fetchCatalog } from '../lib/catalogSource';
import { configureAllowlist } from '../lib/notificationSync';
import { getToggles, setToggle } from '../lib/toggleStore';
import { getInstalledPackages, getAppIcons } from '../../modules/notification-listener';
import type { CatalogEntry } from '../lib/allowlistResolver';

const CATEGORY_LABEL: Record<CatalogEntry['category'], string> = {
  bank: 'Banks',
  upi: 'UPI',
  wallet: 'Wallets',
  merchant: 'Merchants',
};
const CATEGORY_ORDER: CatalogEntry['category'][] = ['bank', 'upi', 'wallet', 'merchant'];

export function MonitoredApps({ entry: _entry }: { entry: ScreenEntry }) {
  const { t } = useTheme();
  const { pop } = useNav();
  const { toast } = useFeedback();

  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [toggles, setToggles] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    void (async () => {
      const cat = await fetchCatalog();
      if (!alive) return;
      setCatalog(cat);
      const pkgs = cat.map((c) => c.packageName);
      const [inst, ic, tg] = await Promise.all([
        getInstalledPackages(pkgs),
        getAppIcons(pkgs),
        getToggles(),
      ]);
      if (!alive) return;
      setInstalled(new Set(inst));
      setIcons(ic);
      setToggles(tg);
    })();
    return () => { alive = false; };
  }, []);

  const onToggle = useCallback(async (pkg: string, enabled: boolean) => {
    setToggles((prev) => ({ ...prev, [pkg]: enabled }));
    try {
      await setToggle(pkg, enabled);
      await configureAllowlist();
    } catch {
      setToggles((prev) => ({ ...prev, [pkg]: !enabled }));
      toast("Couldn't update monitored apps", '📡');
    }
  }, [toast]);

  const grouped = CATEGORY_ORDER
    .map((cat) => ({ cat, items: catalog.filter((c) => c.category === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <MPageShell title="Monitored apps" onBack={pop}>
      <Text style={[styles.intro, { color: t.text3 }]}>
        Riddhi only reads notifications from the apps you enable here. Turn off any
        app you don't want monitored.
      </Text>
      {grouped.map(({ cat, items }) => (
        <View key={cat} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: t.text1, fontFamily: weight(700) }]}>
            {CATEGORY_LABEL[cat]}
          </Text>
          <ListCard>
            {items.map((c, i) => {
              const isInstalled = installed.has(c.packageName);
              const enabled = toggles[c.packageName] !== false;
              const icon = icons[c.packageName];
              return (
                <ListRow key={c.packageName} last={i === items.length - 1}>
                  <View style={[styles.iconBox, { backgroundColor: t.bg3, opacity: isInstalled ? 1 : 0.4 }]}>
                    {icon ? (
                      <Image source={{ uri: `data:image/png;base64,${icon}` }} style={styles.icon} />
                    ) : (
                      <MI.bell size={18} color={t.text3} />
                    )}
                  </View>
                  <View style={styles.rowText}>
                    <Text style={[styles.appName, { color: t.text1, fontFamily: weight(600), opacity: isInstalled ? 1 : 0.5 }]}>
                      {c.displayName}
                    </Text>
                    <Text style={[styles.appMeta, { color: t.text3 }]}>
                      {isInstalled ? 'Installed' : 'Not installed'}
                    </Text>
                  </View>
                  <Toggle on={enabled} onChange={(v) => onToggle(c.packageName, v)} disabled={!isInstalled} />
                </ListRow>
              );
            })}
          </ListCard>
        </View>
      ))}
    </MPageShell>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 13, lineHeight: 19, marginBottom: spacing.md },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: 15, marginBottom: spacing.xs },
  iconBox: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 24, height: 24, borderRadius: 5 },
  rowText: { flex: 1, marginLeft: spacing.sm },
  appName: { fontSize: 15 },
  appMeta: { fontSize: 12, marginTop: spacing.xxs },
});
