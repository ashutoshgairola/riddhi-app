/**
 * Sync — originally an RN port of `project/riddhi/MobileSync.jsx`
 * (the `MobileSync` component); since unified onto the single backend
 * detected queue, so the local SMS pending state and its
 * confirm/dismiss/addAll handlers are gone.
 *
 * What it renders now:
 *  - "Needs review": the backend detected queue (`detected`, fed by both
 *    notification and SMS capture channels), each item as a `DetectedCard`
 *    with `confirmDetectedItem`/`dismissDetectedItem` handlers.
 *    Review cards are editable before confirming — body tap/Edit button opens a FormSheet, the category chip a picker; edits patch the item in `detected`.
 *  - "Auto-added": `added`, the transactions confirmed this session.
 *  - "Sync now" (more sheet) uploads both capture channels then runs
 *    `analyzeNow()` before reloading the queue.
 *
 * Building blocks reused rather than reimplemented:
 *  - `MPageShell` for the `.m-page`/`.m-topbar`(back+title+right)/`.m-body`
 *    scaffold.
 *  - `IconButton` for the more button.
 *  - `GlassCard` (`.m-card`) for the status card and the empty "All caught
 *    up" state.
 *  - `Toggle` for the auto-sync switch.
 *  - "Needs review" / "Auto-added" section heads are composed inline rather
 *    than via `SectionHead` — its `title` prop is a plain string and can't
 *    host the conditional amber `· {count}` suffix.
 *  - `ListCard`/`ListRow` for the "Auto-added" recent list.
 *  - `MI.refresh`/`MI.more`/`MI.check`/`MI.info` icons.
 *  - `DetectedCard` (./DetectedCard.tsx) for each detected transaction,
 *    including its confirm/dismiss slide+collapse animation.
 *  - `useNav().pop` for the back button.
 *  - `useFeedback().toast`/`.sheet` for the more-button action sheet.
 *
 * Kept from the original design: the status card (refresh icon box +
 * auto-sync toggle), the connected banks row, the empty-state copy, and
 * the "How it works" info row.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api } from '../api';
import type { AccountView, CategoryView, PaymentMethod } from '../api/types';
import { useApiData } from '../api/useApi';
import { GlassCard } from '../components/Glass';
import { BankLogo } from '../components/BankLogo';
import { IconButton, ListCard, ListRow, SearchButton, Toggle, TopbarActions } from '../components/ui';
import { MI } from '../components/icons';
import { AppIconBox } from '../components/contentIcons';
import { SpringIn } from '../components/SpringIn';
import { useTheme } from '../theme/ThemeProvider';
import { radius, weight } from '../theme/tokens';
import { spacing } from '../theme/spacing';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useNav, type ScreenEntry } from '../app/navContext';
import { useStatementImportLauncher } from '../app/useStatementImportLauncher';
import { usePrefs } from '../prefs/PrefsProvider';
import {
  ensureSmsPermission,
  uploadSmsCaptures,
  smsSyncSupported,
} from '../lib/smsSync';
import {
  notificationSyncSupported,
  configureAllowlist,
  uploadCaptured,
  fetchDetected,
  confirmDetected,
  dismissDetected,
  analyzeNow,
  applyDetectedEdit,
  CAPTURE_PAUSED_KEY,
  DETECTED_FETCH_LIMIT,
  type DetectedView,
} from '../lib/notificationSync';
import {
  isEnabled as isListenerEnabled,
  openSettings as openListenerSettings,
  clearAll as clearCaptured,
  setAllowlist,
} from '../../modules/notification-listener';
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
  paymentMethod: PaymentMethod;
  /** Resolved source account (from last4/institution match), when known. */
  accountId?: string;
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

// Auto-sync is a client-only toggle (no backend field), persisted locally.
const AUTO_SYNC_KEY = 'sms-sync/auto';

// Generic fallback tint for a detected category with no match in the
// user's real category list (see `toDetectedCardTx`).
const DEFAULT_CATEGORY_COLOR = '#6b7280';

const EMPTY_ACCOUNTS: AccountView[] = [];

// How many review cards render at once, and how many each "Show more" tap
// reveals. `DetectedCard` is blur-heavy (a live `expo-blur` surface each), so
// mounting a whole backlog — the backend can hold hundreds — at once overwhelms
// the GPU and blanks the screen. Rendering a small window keeps it smooth; the
// rest are one tap away.
const REVIEW_PAGE = 12;

export function Sync({ entry: _entry }: { entry: ScreenEntry }) {
  const { t } = useTheme();
  const { pop, push } = useNav();
  const { toast, sheet, form } = useFeedback();
  const { prefs } = usePrefs();

  // Task 10: pick → decrypt → parse → StatementReview. No accountId here —
  // the backend resolves by last4, falling back to an account-picker sheet.
  const { launch: launchStatementImport, sheet: statementImportSheet } = useStatementImportLauncher();

  // Transactions confirmed from SMS during this session (the "Auto-added"
  // list). Previously this relabeled *all* recent transactions as if they were
  // SMS-added and mis-set `account` to the category — both fixed here.
  const [added, setAdded] = useState<SyncRecent[]>([]);
  const [autoSync, setAutoSync] = useState(true);
  const [justAdded, setJustAdded] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const supported = smsSyncSupported();

  // ── Notification-detected transactions (Task 10/8 pipeline) ──────────
  const notifSupported = notificationSyncSupported();
  const [listenerEnabled, setListenerEnabled] = useState(false);
  const [detected, setDetected] = useState<DetectedView[]>([]);
  const [categories, setCategories] = useState<CategoryView[]>([]);
  // Accounts feed the Account select in the edit form and the account label
  // on each review card.
  const { data: accounts } = useApiData(() => api.accounts.list(), EMPTY_ACCOUNTS);
  const [capturePaused, setCapturePaused] = useState(false);
  // Sliding window over the detected review list — grows by REVIEW_PAGE on
  // each "Show more" tap (see the needs-review section below).
  const [reviewLimit, setReviewLimit] = useState(REVIEW_PAGE);

  useEffect(() => {
    void AsyncStorage.getItem(CAPTURE_PAUSED_KEY).then((v) => setCapturePaused(v === '1'));
  }, []);

  /** Pushes the allowlist, uploads both capture channels (notifications +
   * SMS), optionally runs analysis, and reloads the backend-detected review
   * queue. Re-run after pause/resume/clear so the list reflects the latest
   * server state. */
  const refreshDetections = useCallback(async (analyze = false) => {
    setListenerEnabled(isListenerEnabled());
    try {
      const paused = (await AsyncStorage.getItem(CAPTURE_PAUSED_KEY)) === '1';
      if (!paused) await configureAllowlist();
      await Promise.all([uploadCaptured(), uploadSmsCaptures()]);
      if (analyze) await analyzeNow();
      const [cats, det] = await Promise.all([api.categories.list(), fetchDetected()]);
      setCategories(cats);
      setDetected(det);
    } catch {
      toast("Couldn't load detected transactions", '📡');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refreshDetections();
  }, [refreshDetections]);

  const toggleCapturePaused = async (paused: boolean) => {
    setCapturePaused(paused);
    try {
      await AsyncStorage.setItem(CAPTURE_PAUSED_KEY, paused ? '1' : '0');
      if (paused) await setAllowlist([]);
    } catch {
      toast("Couldn't update capture setting", '📡');
    }
    await refreshDetections();
  };

  /** Maps a backend-detected transaction into the shape `DetectedCard`
   * already renders (icon/color come from a real category match when the
   * suggested name exists in the user's category list). */
  const toDetectedCardTx = useCallback(
    (d: DetectedView): SyncDetected => {
      const catName = d.suggestedCategory ?? 'Uncategorized';
      const match = categories.find((c) => c.name.toLowerCase() === catName.toLowerCase());
      const amount = Math.abs(d.amount ?? 0);
      return {
        id: d.id,
        raw: `Detected from a ${d.paymentMethod} notification`,
        bank: '',
        amount: d.type === 'income' ? amount : -amount,
        merchant: d.merchant ?? 'Unknown',
        icon: match?.icon ?? '🔔',
        cat: catName,
        catCol: match?.color ?? DEFAULT_CATEGORY_COLOR,
        account: d.accountId
          ? (accounts.find((a) => String(a.id) === d.accountId)?.name ?? 'Linked account')
          : 'Unlinked',
        time: d.postedAt
          ? new Date(d.postedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
          : 'Just now',
        conf: d.confidence,
        paymentMethod: d.paymentMethod as PaymentMethod,
      };
    },
    [categories, accounts],
  );

  /** Resolves the suggested category name to a real id (creating it if it
   * doesn't exist yet — same behavior `transactions.create({categoryName})`
   * already relies on elsewhere), then confirms the detection. */
  const confirmDetectedItem = (id: string) => {
    const d = detected.find((x) => x.id === id);
    setDetected((cur) => cur.filter((x) => x.id !== id));
    if (!d) return;
    (async () => {
      try {
        const categoryId = await api.categories.resolveId(d.suggestedCategory ?? 'Uncategorized');
        await confirmDetected(d.id, {
          date: d.postedAt ? d.postedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
          description: d.merchant ?? 'Transaction',
          amount: Math.abs(d.amount ?? 0),
          type: d.type,
          categoryId,
          accountId: d.accountId ?? undefined,
          paymentMethod: d.paymentMethod,
        });
        setJustAdded((n) => n + 1);
        // Mirror the SMS confirm path (`confirm`): also push into the
        // "Auto-added · This session" list so it stays consistent with the
        // "N added today" count.
        setAdded((a) => [toRecentRow(toDetectedCardTx(d)), ...a]);
      } catch {
        toast("Couldn't add that transaction", '📡');
        setDetected((cur) => [d, ...cur]);
      }
    })();
  };

  const dismissDetectedItem = (id: string) => {
    const d = detected.find((x) => x.id === id);
    setDetected((cur) => cur.filter((x) => x.id !== id));
    if (!d) return;
    // Match `confirmDetectedItem`: roll the item back and surface feedback on
    // failure rather than silently swallowing the error.
    void dismissDetected(d.id).catch(() => {
      toast("Couldn't dismiss that transaction", '📡');
      setDetected((cur) => [d, ...cur]);
    });
  };

  const patchDetected = (id: string, patch: (d: DetectedView) => DetectedView) =>
    setDetected((cur) => cur.map((x) => (x.id === id ? patch(x) : x)));

  /** Full edit form (card body tap / Edit action button) — same FormSheet
   * TxDetail's Edit uses. Saving patches the item in `detected`; the card
   * display and the confirm payload both derive from it, so edited values
   * flow through with no other changes. */
  const editDetectedItem = (id: string) => {
    const d = detected.find((x) => x.id === id);
    if (!d) return;
    const catName = d.suggestedCategory ?? 'Uncategorized';
    const catOptions = categories.map((c) => ({ label: `${c.icon} ${c.name}`, value: c.name }));
    // Keep a suggestion that isn't a real category yet (e.g. "Uncategorized")
    // selectable so the select has a valid initial.
    if (!categories.some((c) => c.name.toLowerCase() === catName.toLowerCase())) {
      catOptions.unshift({ label: catName, value: catName });
    }
    form({
      title: 'Edit detection',
      fields: [
        { key: 'desc', label: 'Description', initial: d.merchant ?? '' },
        { kind: 'amount', key: 'amount', label: 'Amount (₹)', initial: String(Math.abs(d.amount ?? 0)) },
        { kind: 'select', key: 'cat', label: 'Category', options: catOptions, initial: catName },
        {
          kind: 'select',
          key: 'account',
          label: 'Account',
          options: [
            { label: 'Unlinked', value: '' },
            ...accounts.map((a) => ({ label: a.name, value: String(a.id) })),
          ],
          initial: d.accountId ?? '',
        },
        { kind: 'date', key: 'date', label: 'Date', initial: (d.postedAt ?? new Date().toISOString()).slice(0, 10) },
        {
          kind: 'select',
          key: 'type',
          label: 'Type',
          options: [
            { label: 'Expense', value: 'expense' },
            { label: 'Income', value: 'income' },
          ],
          initial: d.type,
        },
      ],
      submitLabel: 'Save changes',
      onSubmit: (v) => patchDetected(id, (x) => applyDetectedEdit(x, v)),
    });
  };

  /** Category chip tap — picker sheet with a "New category…" fallback,
   * mirroring StatementReview's `openCategoryPicker`. `resolveId` at confirm
   * time creates any brand-new name server-side. */
  const openDetectedCategoryPicker = (id: string) => {
    const current = detected.find((x) => x.id === id)?.suggestedCategory ?? null;
    const setCat = (name: string) => patchDetected(id, (x) => ({ ...x, suggestedCategory: name }));
    sheet({
      title: 'Category',
      options: [
        ...categories.map((c) => ({
          label: c.name,
          icon: c.icon,
          selected: !!current && c.name.toLowerCase() === current.toLowerCase(),
          onPress: () => setCat(c.name),
        })),
        {
          label: 'New category…',
          icon: '➕',
          onPress: () => {
            form({
              title: 'New category',
              fields: [{ key: 'name', label: 'Category name', placeholder: 'e.g. Subscriptions' }],
              submitLabel: 'Use category',
              onSubmit: (v) => setCat(v['name']!),
            });
          },
        },
      ],
    });
  };

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

  // Restore the persisted auto-sync preference on mount.
  useEffect(() => {
    void AsyncStorage.getItem(AUTO_SYNC_KEY).then((v) => {
      if (v !== null) setAutoSync(v === '1');
    });
  }, []);
  const toggleAutoSync = (on: boolean) => {
    setAutoSync(on);
    void AsyncStorage.setItem(AUTO_SYNC_KEY, on ? '1' : '0');
  };

  /** Maps a confirmed detection into an "Auto-added" list row. */
  const toRecentRow = (tx: SyncDetected): SyncRecent => ({
    merchant: tx.merchant,
    icon: tx.icon,
    amount: tx.amount,
    cat: tx.cat,
    catCol: tx.catCol,
    account: tx.account,
    time: 'Just now',
  });

  const openMoreSheet = () => {
    sheet({
      title: 'Auto-sync',
      options: [
        {
          label: syncing ? 'Syncing…' : 'Sync now',
          icon: '🔄',
          // Upload both capture channels (notifications + SMS) then run
          // analysis so newly uploaded raw captures turn into review items.
          onPress: () =>
            void (async () => {
              setSyncing(true);
              try {
                if (smsSyncSupported()) await ensureSmsPermission();
                await refreshDetections(true);
                toast('Synced', '🔄');
              } finally {
                setSyncing(false);
              }
            })(),
        },
        {
          label: autoSync ? 'Pause auto-sync' : 'Resume auto-sync',
          icon: autoSync ? '⏸' : '▶️',
          onPress: () => {
            toggleAutoSync(!autoSync);
            toast(autoSync ? 'Auto-sync paused' : 'Auto-sync resumed');
          },
        },
        ...(notifSupported
          ? [
              {
                label: capturePaused ? 'Resume notification capture' : 'Pause notification capture',
                icon: capturePaused ? '▶️' : '⏸',
                onPress: () => {
                  void toggleCapturePaused(!capturePaused).then(() => {
                    toast(capturePaused ? 'Notification capture resumed' : 'Notification capture paused');
                  });
                },
              },
              {
                label: 'Clear captured data',
                icon: '🗑',
                onPress: () => {
                  void (async () => {
                    try {
                      await clearCaptured();
                      toast('Captured data cleared', '🗑');
                    } catch {
                      toast("Couldn't clear captured data", '📡');
                    }
                    await refreshDetections();
                  })();
                },
              },
            ]
          : []),
      ],
    });
  };

  // Review list is `detected` (notifications + SMS, both fed through the
  // same backend queue), windowed to `reviewLimit` so only a handful of
  // blur-heavy cards mount at once.
  const reviewCount = detected.length;
  // The fetch is capped (DETECTED_FETCH_LIMIT); when it comes back full there
  // are likely more on the server, so the badge reads e.g. "50+".
  const reviewCountLabel =
    detected.length >= DETECTED_FETCH_LIMIT ? `${reviewCount}+` : `${reviewCount}`;
  const shownDetected = detected.slice(0, reviewLimit);
  const hiddenCount = reviewCount - shownDetected.length;

  return (
    <>
      <MPageShell
      title="Auto-sync"
      onBack={pop}
      right={
        <TopbarActions>
          <SearchButton />
          <IconButton onPress={openMoreSheet}>
            <MI.more size={20} color={t.text1} />
          </IconButton>
        </TopbarActions>
      }
    >
      {/* Import a statement (Task 10) — no accountId; the backend resolves
          by last4, and the launcher falls back to an account-picker sheet
          when it can't. */}
      <SpringIn style={styles.block}>
        <ListCard>
          <ListRow last onPress={() => launchStatementImport()}>
            <AppIconBox value="doc" color={t.em} />
            <View style={styles.statusText}>
              <Text style={[styles.statusTitle, { color: t.text1, fontFamily: weight(700) }]}>
                Import a statement
              </Text>
              <Text style={[styles.statusSubtitle, { color: t.text3 }]}>
                Add transactions from a bank or card PDF statement
              </Text>
            </View>
            <MI.arrow size={18} color={t.text3} />
          </ListRow>
        </ListCard>
      </SpringIn>

      {/* status card (MobileSync.jsx:126–150) */}
      <SpringIn style={styles.block}>
        <GlassCard>
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
                {!supported
                  ? 'Available on the Android app'
                  : autoSync
                    ? 'Listening for bank SMS'
                    : 'Paused'}
              </Text>
            </View>
            <Toggle on={autoSync} onChange={toggleAutoSync} disabled={!supported} />
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

      {/* enable notification capture CTA — shown only when the platform
          supports it and access hasn't been granted yet */}
      {notifSupported && !listenerEnabled ? (
        <SpringIn style={styles.block}>
          <Pressable onPress={() => openListenerSettings()}>
            <GlassCard>
              <View style={styles.statusRow}>
                <View style={[styles.statusIconBox, { backgroundColor: t.emDim }]}>
                  <MI.bell size={20} color={t.em} />
                </View>
                <View style={styles.statusText}>
                  <Text style={[styles.statusTitle, { color: t.text1, fontFamily: weight(700) }]}>
                    Enable notification capture
                  </Text>
                  <Text style={[styles.statusSubtitle, { color: t.text3 }]}>
                    Grant Riddhi notification access so it can detect transactions from your bank & app alerts.
                  </Text>
                </View>
              </View>
            </GlassCard>
          </Pressable>
        </SpringIn>
      ) : null}

      {notifSupported && listenerEnabled ? (
        <SpringIn style={styles.block}>
          <ListCard>
            <ListRow last onPress={() => push({ kind: 'monitored-apps' })}>
              <View style={[styles.statusIconBox, { backgroundColor: t.emDim }]}>
                <MI.bell size={20} color={t.em} />
              </View>
              <View style={styles.statusText}>
                <Text style={[styles.statusTitle, { color: t.text1, fontFamily: weight(700) }]}>
                  Monitored apps
                </Text>
                <Text style={[styles.statusSubtitle, { color: t.text3 }]}>
                  Choose which apps Riddhi reads notifications from
                </Text>
              </View>
              <MI.arrow size={18} color={t.text3} />
            </ListRow>
          </ListCard>
        </SpringIn>
      ) : null}

      {/* needs review (MobileSync.jsx:152–156) — backend detected queue,
          fed by both notification and SMS capture channels */}
      <View style={styles.sectionHeadRow}>
        <Text style={[styles.sectionTitle, { color: t.text1, fontFamily: weight(700) }]}>
          Needs review
          {reviewCount > 0 ? (
            <Text style={{ color: t.amber }}> · {reviewCountLabel}</Text>
          ) : null}
        </Text>
      </View>

      {reviewCount > 0 ? (
        // animationDelay: .05s (MobileSync.jsx:159)
        <SpringIn delay={50} style={styles.block}>
          {shownDetected.map((d) => (
            <DetectedCard
              key={d.id}
              tx={toDetectedCardTx(d)}
              onConfirm={confirmDetectedItem}
              onDismiss={dismissDetectedItem}
              onEdit={editDetectedItem}
              onEditCategory={openDetectedCategoryPicker}
            />
          ))}
          {hiddenCount > 0 ? (
            <Pressable
              onPress={() => setReviewLimit((n) => n + REVIEW_PAGE)}
              style={[styles.showMore, { borderColor: t.border }]}
            >
              <Text style={[styles.showMoreText, { color: t.em, fontFamily: weight(600) }]}>
                Show {Math.min(hiddenCount, REVIEW_PAGE)} more
              </Text>
            </Pressable>
          ) : null}
        </SpringIn>
      ) : (
        <SpringIn style={styles.block}>
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

      {/* recently synced (MobileSync.jsx:176–194) — session confirmations only */}
      {added.length > 0 ? (
        <>
          <View style={styles.sectionHeadRow}>
            <Text style={[styles.sectionTitle, { color: t.text1, fontFamily: weight(700) }]}>Auto-added</Text>
            <Text style={[styles.sectionMeta, { color: t.text3 }]}>This session</Text>
          </View>
          {/* animationDelay: .1s (MobileSync.jsx:181) */}
          <SpringIn delay={100} style={styles.block}>
            <ListCard>
              {added.map((tx, i) => (
                <ListRow key={i} last={i === added.length - 1}>
                  <AppIconBox value={tx.icon} color={tx.catCol} size={40} iconSize={18} />
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
        </>
      ) : null}

      {/* how it works (MobileSync.jsx:197–204) */}
      <View style={styles.infoRow}>
        <View style={styles.infoIconWrap}>
          <MI.info size={15} color={t.text3} />
        </View>
        <Text style={[styles.infoText, { color: t.text3 }]}>
          Riddhi reads transaction alerts from your bank's SMS and parses the amount & merchant. Nothing is added until you confirm it.
        </Text>
      </View>
      </MPageShell>

      {/* Sibling of MPageShell, not inside its ScrollView — same reasoning
       * CardDetail's PayBillSheet comment gives. */}
      {statementImportSheet}
    </>
  );
}

const styles = StyleSheet.create({
  // Consistent top-level block rhythm: every stacked block pushes the next
  // one down by one gap. Using a single push-down convention (rather than a
  // mix of marginBottom on cards + marginTop on section heads) is what fixes
  // the old 24+24=48 double-gap — RN margins add, they don't collapse.
  block: {
    marginBottom: spacing.xl,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
    marginTop: spacing.xxs,
  },
  banksRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  bankCol: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xxs,
  },
  bankLabel: {
    fontSize: 10,
  },
  // No marginTop: the gap above a section head comes from the previous
  // block's `block` marginBottom (single push-down convention). paddingBottom
  // keeps the head hugging its own content below.
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xxs,
    paddingHorizontal: spacing.xxs,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 15,
    letterSpacing: -0.15,
  },
  sectionMeta: {
    fontSize: 11.5,
  },
  // Content layout + padding override — must be contentStyle to reach the
  // card's inner overlay (on `style` the centering never applies and the
  // paddings stack outside GlassCard's own 18px).
  emptyCardContent: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  emptyIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontSize: 14.5,
  },
  emptyBody: {
    fontSize: 12.5,
    marginTop: spacing.xxs,
    lineHeight: 18.75,
    textAlign: 'center',
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
    gap: spacing.xxs,
    marginTop: spacing.xxs,
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
  showMore: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  showMoreText: {
    fontSize: 13,
  },
  // No marginTop: gets its top gap from the previous block's `block` margin.
  infoRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'flex-start',
    paddingHorizontal: spacing.xxs,
  },
  infoIconWrap: {
    marginTop: spacing.xxs,
    flexShrink: 0,
  },
  infoText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 17.25,
  },
});
