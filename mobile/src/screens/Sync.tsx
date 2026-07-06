/**
 * Sync — RN port of `project/riddhi/MobileSync.jsx` (the `MobileSync`
 * component, lines 101–211), including its local data constants
 * `SYNC_DETECTED` (4–29), `SYNC_RECENT` (31–35) and `SYNC_BANKS` (37–41).
 *
 * Building blocks reused rather than reimplemented:
 *  - `MPageShell` for the `.m-page`/`.m-topbar`(back+title+right)/`.m-body`
 *    scaffold.
 *  - `IconButton` for the more button.
 *  - `GlassCard` (`.m-card`) for the status card and the empty "All caught
 *    up" state.
 *  - `Toggle` for the auto-sync switch (MobileSync.jsx:136–138).
 *  - "Needs review" / "Auto-added" section heads are composed inline rather
 *    than via `SectionHead` — its `title` prop is a plain string and can't
 *    host the conditional amber `· {count}` suffix or the conditional
 *    (only when `pending.length > 1`) "Add all" link (MobileSync.jsx:153–155).
 *  - `ListCard`/`ListRow` for the "Auto-added" recent list.
 *  - `MI.refresh`/`MI.more`/`MI.check`/`MI.info` icons.
 *  - `DetectedCard` (./DetectedCard.tsx) for each pending SMS-detected
 *    transaction, including its confirm/dismiss slide+collapse animation.
 *  - `useNav().pop` for the back button.
 *  - `useFeedback().toast`/`.sheet` for the more-button action sheet.
 *
 * Source values transcribed verbatim:
 *  - `SYNC_DETECTED`/`SYNC_RECENT`/`SYNC_BANKS` — MobileSync.jsx:4–41.
 *  - `fmtR` — MobileSync.jsx:43 (`'₹' + Math.abs(n).toLocaleString('en-IN')`).
 *  - More-sheet options (Sync now / Manage banks / Pause auto-sync) —
 *    MobileSync.jsx:115–119.
 *  - Status card: refresh icon box (em-tinted + status dot when `autoSync`,
 *    else `bg3`/`text3`), "SMS auto-sync" title, "Listening · last synced 2
 *    min ago" / "Paused" subtitle, `Toggle` — MobileSync.jsx:126–139.
 *  - Connected banks row: colored logo box + name (or "Add" + 0.4 opacity
 *    when `b.off`) — MobileSync.jsx:142–149.
 *  - `pending`/`autoSync`/`justAdded` state + `confirm`/`dismiss`/`addAll`
 *    handlers — MobileSync.jsx:102–108.
 *  - Empty state copy (`justAdded` count vs default message) —
 *    MobileSync.jsx:165–174.
 *  - "Auto-added" recent list rows — MobileSync.jsx:182–193.
 *  - "How it works" info row copy — MobileSync.jsx:197–204.
 */
import { StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import { api } from '../api';
import { GlassCard } from '../components/Glass';
import { BankLogo } from '../components/BankLogo';
import { IconButton, ListCard, ListRow, Toggle } from '../components/ui';
import { MI } from '../components/icons';
import { SpringIn } from '../components/SpringIn';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useNav, type ScreenEntry } from '../app/navContext';
import { useApiData } from '../api/useApi';
import { usePrefs } from '../prefs/PrefsProvider';
import { MPageShell } from './_MPageShell';
import { DetectedCard } from './DetectedCard';

// ── Data (MobileSync.jsx:4–41) ───────────────────────────────────────
export interface SyncDetected {
  id: string;
  raw: string;
  bank: string;
  amount: number;
  merchant: string;
  icon: string;
  cat: string;
  catCol: string;
  account: string;
  time: string;
  conf: number;
}

interface SyncRecent {
  merchant: string;
  icon: string;
  amount: number;
  cat: string;
  catCol: string;
  account: string;
  time: string;
}

interface SyncBank {
  name: string;
  col: string;
  logo: string;
  count: number;
  off?: boolean;
}

// No SMS pipeline exists yet (Expo has no SMS access on iOS), so there is
// no fake "detected" queue — the screen starts at its real empty state and
// the confirm flow below stays wired for when detection lands.
const NO_DETECTED: SyncDetected[] = [];

// Brand colors for the banks picked during onboarding (prefs.selectedBanks).
const BANK_COLORS: Record<string, string> = {
  HDFC: '#004c8f',
  ICICI: '#ae282e',
  Axis: '#97144d',
  SBI: '#2d6a4f',
  Kotak: '#ed1c24',
};
const DEFAULT_BANK_COLOR = '#3b3563';

const fmtR = (n: number) => '₹' + Math.abs(n).toLocaleString('en-IN');

export function Sync({ entry: _entry }: { entry: ScreenEntry }) {
  const { t } = useTheme();
  const { pop } = useNav();
  const { toast, sheet } = useFeedback();
  const { prefs } = usePrefs();

  const [pending, setPending] = useState<SyncDetected[]>(NO_DETECTED);
  const [autoSync, setAutoSync] = useState(true);
  const [justAdded, setJustAdded] = useState(0);

  // Connected banks come from onboarding (prefs.selectedBanks); the last
  // slot is always the dimmed "Add" affordance from the design.
  const banks: SyncBank[] = [
    ...prefs.selectedBanks.map((name) => ({
      name,
      col: BANK_COLORS[name.split(' ')[0]!] ?? DEFAULT_BANK_COLOR,
      logo: name.charAt(0).toUpperCase(),
      count: 0,
    })),
    { name: 'Add', col: DEFAULT_BANK_COLOR, logo: '+', count: 0, off: true },
  ];

  // "Auto-added" shows the latest real transactions.
  const { data: recentTx } = useApiData(() => api.transactions.recent(), []);
  const recent: SyncRecent[] = recentTx.map((tx) => ({
    merchant: tx.desc,
    icon: tx.icon,
    amount: tx.amt,
    cat: tx.cat,
    catCol: tx.cCol,
    account: tx.cat,
    time: tx.date,
  }));

  /** Persists one detected SMS transaction through the api layer. */
  const saveDetected = (tx: SyncDetected) =>
    api.transactions.create({
      desc: tx.merchant,
      amount: tx.amount,
      type: tx.amount > 0 ? 'inc' : 'exp',
      categoryName: tx.cat,
    });

  const confirm = (id: string) => {
    const tx = pending.find((p) => p.id === id);
    setPending((p) => p.filter((t2) => t2.id !== id));
    if (!tx) return;
    saveDetected(tx)
      .then(() => setJustAdded((n) => n + 1))
      .catch(() => {
        toast("Couldn't add that transaction", '📡');
        setPending((p) => [tx, ...p]);
      });
  };
  const dismiss = (id: string) => {
    // Dismissing an SMS suggestion is local-only by design — nothing to persist.
    setPending((p) => p.filter((tx) => tx.id !== id));
  };
  const addAll = () => {
    const batch = pending;
    setPending([]);
    Promise.all(batch.map(saveDetected))
      .then(() => setJustAdded((n) => n + batch.length))
      .catch(() => {
        toast("Couldn't add all transactions", '📡');
        setPending(batch);
      });
  };

  const openMoreSheet = () => {
    sheet({
      title: 'Auto-sync',
      options: [
        { label: 'Sync now', icon: '🔄', onPress: () => toast('Syncing messages…', '🔄') },
        { label: 'Manage banks', icon: '🏦', onPress: () => toast('Manage connected banks') },
        {
          label: autoSync ? 'Pause auto-sync' : 'Resume auto-sync',
          icon: autoSync ? '⏸' : '▶️',
          onPress: () => {
            setAutoSync(!autoSync);
            toast(autoSync ? 'Auto-sync paused' : 'Auto-sync resumed');
          },
        },
      ],
    });
  };

  return (
    <MPageShell
      title="Auto-sync"
      onBack={pop}
      right={
        <IconButton onPress={openMoreSheet}>
          <MI.more size={20} color={t.text1} />
        </IconButton>
      }
    >
      {/* status card (MobileSync.jsx:126–150) */}
      <SpringIn>
        <GlassCard style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusIconBox,
                { backgroundColor: autoSync ? t.emDim : t.bg3 },
              ]}
            >
              <MI.refresh size={20} color={autoSync ? t.em : t.text3} />
              {autoSync ? (
                <View style={[styles.statusDot, { backgroundColor: t.em, borderColor: t.bg1 }]} />
              ) : null}
            </View>
            <View style={styles.statusText}>
              <Text style={[styles.statusTitle, { color: t.text1, fontFamily: weight(700) }]}>SMS auto-sync</Text>
              <Text style={[styles.statusSubtitle, { color: t.text3 }]}>
                {autoSync ? 'Listening for bank SMS' : 'Paused'}
              </Text>
            </View>
            <Toggle on={autoSync} onChange={setAutoSync} />
          </View>

          {/* connected banks (MobileSync.jsx:142–149) */}
          <View style={[styles.banksRow, { borderTopColor: t.border }]}>
            {banks.map((b) => (
              <View key={b.name} style={[styles.bankCol, { opacity: b.off ? 0.4 : 1 }]}>
                <BankLogo name={b.name} size={34} radius={10} fallbackColor={b.col} fallbackText={b.logo} />
                <Text style={[styles.bankLabel, { color: t.text3, fontFamily: weight(600) }]}>
                  {b.off ? 'Add' : b.name.split(' ')[0]}
                </Text>
              </View>
            ))}
          </View>
        </GlassCard>
      </SpringIn>

      {/* needs review (MobileSync.jsx:152–156) */}
      <View style={styles.sectionHeadRow}>
        <Text style={[styles.sectionTitle, { color: t.text1, fontFamily: weight(700) }]}>
          Needs review
          {pending.length > 0 ? (
            <Text style={{ color: t.amber }}> · {pending.length}</Text>
          ) : null}
        </Text>
        {pending.length > 1 ? (
          <Text style={[styles.sectionLink, { color: t.em, fontFamily: weight(600) }]} onPress={addAll}>
            Add all
          </Text>
        ) : null}
      </View>

      {pending.length > 0 ? (
        // animationDelay: .05s (MobileSync.jsx:159)
        <SpringIn delay={50}>
          {pending.map((tx) => (
            <DetectedCard key={tx.id} tx={tx} onConfirm={confirm} onDismiss={dismiss} />
          ))}
        </SpringIn>
      ) : (
        <SpringIn>
          <GlassCard contentStyle={styles.emptyCardContent}>
            <View style={[styles.emptyIconBox, { backgroundColor: t.emDim }]}>
              <MI.check size={24} color={t.em} strokeWidth={2.4} />
            </View>
            <Text style={[styles.emptyTitle, { color: t.text1, fontFamily: weight(700) }]}>All caught up</Text>
            <Text style={[styles.emptyBody, { color: t.text3 }]}>
              {justAdded > 0
                ? `${justAdded} transaction${justAdded > 1 ? 's' : ''} added today.`
                : 'New bank messages appear here for a quick tap to confirm.'}
            </Text>
          </GlassCard>
        </SpringIn>
      )}

      {/* recently synced (MobileSync.jsx:176–194) */}
      <View style={styles.sectionHeadRow}>
        <Text style={[styles.sectionTitle, { color: t.text1, fontFamily: weight(700) }]}>Auto-added</Text>
        <Text style={[styles.sectionMeta, { color: t.text3 }]}>High confidence</Text>
      </View>
      {/* animationDelay: .1s (MobileSync.jsx:181) */}
      <SpringIn delay={100}>
        <ListCard>
          {recent.map((tx, i) => (
            <ListRow key={i} last={i === recent.length - 1}>
              <View style={[styles.recentIconBox, { backgroundColor: tx.catCol + '22' }]}>
                <Text style={styles.recentIconGlyph}>{tx.icon}</Text>
              </View>
              <View style={styles.recentText}>
                <Text style={[styles.recentMerchant, { color: t.text1, fontFamily: weight(600) }]}>{tx.merchant}</Text>
                <View style={styles.recentMetaRow}>
                  <Text style={[styles.recentCat, { color: tx.catCol, fontFamily: weight(600) }]}>{tx.cat}</Text>
                  <Text style={[styles.recentDot, { color: t.text3 }]}>•</Text>
                  <Text style={[styles.recentTime, { color: t.text3 }]}>{tx.time}</Text>
                </View>
              </View>
              <Text
                style={[
                  styles.recentAmount,
                  { color: tx.amount > 0 ? t.em : t.text1, fontFamily: weight(700) },
                ]}
              >
                {tx.amount > 0 ? '+' : ''}
                {fmtR(tx.amount)}
              </Text>
            </ListRow>
          ))}
        </ListCard>
      </SpringIn>

      {/* how it works (MobileSync.jsx:197–204) */}
      <View style={styles.infoRow}>
        <View style={styles.infoIconWrap}>
          <MI.info size={15} color={t.text3} />
        </View>
        <Text style={[styles.infoText, { color: t.text3 }]}>
          Riddhi reads transaction alerts from your bank's SMS on-device — message content never leaves your phone.
        </Text>
      </View>
    </MPageShell>
  );
}

const styles = StyleSheet.create({
  statusCard: {
    marginBottom: 24,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusIconBox: {
    position: 'relative',
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statusDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 11,
    height: 11,
    borderRadius: 99,
    borderWidth: 2,
  },
  statusText: {
    flex: 1,
    minWidth: 0,
  },
  statusTitle: {
    fontSize: 14.5,
  },
  statusSubtitle: {
    fontSize: 11.5,
    marginTop: 2,
  },
  banksRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  bankCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  bankLabel: {
    fontSize: 10,
  },
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    paddingHorizontal: 4,
    paddingBottom: 12,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 15,
    letterSpacing: -0.15,
  },
  sectionLink: {
    fontSize: 13,
  },
  sectionMeta: {
    fontSize: 11.5,
  },
  // Content layout + padding override — must be contentStyle to reach the
  // card's inner overlay (on `style` the centering never applies and the
  // paddings stack outside GlassCard's own 18px).
  emptyCardContent: {
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  emptyIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 14.5,
  },
  emptyBody: {
    fontSize: 12.5,
    marginTop: 4,
    lineHeight: 18.75,
    textAlign: 'center',
  },
  recentIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  recentIconGlyph: {
    fontSize: 18,
  },
  recentText: {
    flex: 1,
    minWidth: 0,
  },
  recentMerchant: {
    fontSize: 14,
  },
  recentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  recentCat: {
    fontSize: 11.5,
  },
  recentDot: {
    fontSize: 11.5,
  },
  recentTime: {
    fontSize: 11.5,
  },
  recentAmount: {
    fontSize: 14,
    flexShrink: 0,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    marginTop: 20,
    paddingHorizontal: 4,
  },
  infoIconWrap: {
    marginTop: 1,
    flexShrink: 0,
  },
  infoText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 17.25,
  },
});
