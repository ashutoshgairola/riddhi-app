/**
 * AccountDetail — RN port of `project/riddhi/MobileScreens.jsx` (the
 * `AccountDetail` component, lines 417–473), reading `entry.data` (the
 * `Account` pushed by `Accounts.tsx`'s `push({kind:'account-detail',
 * data:a})`, MobileScreens.jsx:390) as the source's `data` prop.
 *
 * Building blocks reused rather than reimplemented:
 *  - `MPageShell` for the `.m-page`/`.m-topbar`(back)/`.m-body` scaffold.
 *  - `IconButton` for the more button.
 *  - `expo-linear-gradient`'s `LinearGradient` for the balance card, using
 *    the account's own two-stop gradient (`a.gradient`, the same tuple
 *    transcribed in `Accounts.tsx` from the source's `a.color` CSS
 *    string).
 *  - `GlassCard` for each quick-action button (MobileScreens.jsx:443).
 *  - `SectionHead`/`ListCard`/`ListRow` for "Recent transactions"
 *    (MobileScreens.jsx:450–469).
 *  - `useNav().pop` for the back button; `useFeedback().toast`/`.sheet` for
 *    the more-button action sheet (MobileScreens.jsx:420–424).
 *
 * Source values transcribed verbatim:
 *  - Balance card: "Balance" label, `±₹{abs.toLocaleString('en-IN')}`
 *    (note: unlike the account-list card, the detail balance is NOT L/K
 *    abbreviated — MobileScreens.jsx:434), `{a.bank} · {a.sub}` —
 *    MobileScreens.jsx:426–438.
 *  - Quick actions (Transfer/Statement/Settings + colors) —
 *    MobileScreens.jsx:442.
 *  - Recent transactions 4 hardcoded rows — MobileScreens.jsx:452–457.
 *  - More-button sheet options (Edit/Download/Remove, danger) —
 *    MobileScreens.jsx:420–424.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BankLogo } from '../components/BankLogo';
import { AppIcon } from '../components/contentIcons';
import { GlassCard } from '../components/Glass';
import { IconButton, ListCard, ListRow, SearchButton, SectionHead, TopbarActions } from '../components/ui';
import { MI } from '../components/icons';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useNav, type ScreenEntry } from '../app/navContext';
import { useStatementImportLauncher } from '../app/useStatementImportLauncher';
import { api } from '../api';
import { useApiData } from '../api/useApi';
import { shareTxCsv } from '../lib/exportCsv';
import { MPageShell } from './_MPageShell';
import type { Account } from './Accounts';

// Quick actions (MobileScreens.jsx:442). `import` is a Task 10 addition —
// no source parity, it slots in alongside the other three the same way the
// grid already flexes to fit.
type QuickActionKey = 'transfer' | 'statement' | 'settings' | 'import';
const QUICK_ACTIONS: { l: string; i: string; c: string; k: QuickActionKey }[] = [
  { l: 'Transfer', i: 'transfer', c: '#8197c4', k: 'transfer' },
  { l: 'Statement', i: 'doc', c: '#c9a86a', k: 'statement' },
  { l: 'Import', i: '📥', c: '#7bb88f', k: 'import' },
  { l: 'Settings', i: 'settings2', c: '#9d8bd6', k: 'settings' },
];

// Recent transaction row shape (MobileScreens.jsx:452–457)
interface Tx {
  i: string;
  d: string;
  a: number;
  t: string;
}

const EMPTY_TXS: Tx[] = [];

export function AccountDetail({ entry }: { entry: ScreenEntry }) {
  const a = entry.data as Account;
  const { t } = useTheme();
  const { pop, openAdd } = useNav();
  const { toast, sheet, form } = useFeedback();

  // Task 10: pick → decrypt → parse → StatementReview, scoped to this account.
  const { launch: launchStatementImport, sheet: statementImportSheet } = useStatementImportLauncher();

  // This account's latest transactions (accountId-scoped backend query).
  const { data: recentTxs } = useApiData(
    () =>
      api.transactions
        .list({ accountId: String(a.id), limit: 6 })
        .then((txs) =>
          txs.map((tx) => ({ i: tx.icon, d: tx.desc, a: tx.amount, t: tx.date.slice(0, 10) })),
        ),
    EMPTY_TXS,
  );

  const editAccount = () => {
    form({
      title: 'Edit account',
      fields: [
        { key: 'name', label: 'Account name', initial: a.name },
        { key: 'institutionName', label: 'Bank / provider', initial: a.bank, optional: true },
      ],
      submitLabel: 'Save changes',
      onSubmit: async (v) => {
        await api.accounts.update(a.id, {
          name: v['name']!,
          institutionName: v['institutionName'] || undefined,
        });
        toast('Account updated', '✏️');
        pop(); // this screen renders stale route data; the list is fresh
      },
    });
  };

  const removeAccount = () => {
    sheet({
      title: `Remove ${a.name}? Its transactions keep their history.`,
      options: [
        {
          label: 'Remove account',
          icon: '🗑',
          danger: true,
          onPress: () => {
            api.accounts
              .remove(a.id)
              .then(() => {
                toast('Account removed', '🗑');
                pop();
              })
              .catch(() => toast("Couldn't remove — try again", '📡'));
          },
        },
        { label: 'Cancel', onPress: () => {} },
      ],
    });
  };

  const downloadStatement = () => {
    // Scope the statement to THIS account, not the whole ledger.
    shareTxCsv({ accountId: String(a.id), label: a.name })
      .then(() => toast('Statement exported', '📄'))
      .catch(() => toast("Couldn't export statement", '📡'));
  };

  const openMoreSheet = () => {
    sheet({
      title: a.name,
      options: [
        { label: 'Edit account', icon: '✏️', onPress: editAccount },
        { label: 'Download statement', icon: '📄', onPress: downloadStatement },
        { label: 'Remove account', icon: '🗑', danger: true, onPress: removeAccount },
      ],
    });
  };

  // Quick-action row: Transfer opens the add-transaction sheet (transfer
  // type), Statement exports a CSV, Import launches the statement-import
  // picker (Task 10) scoped to this account, Settings opens the account's
  // more menu.
  const runQuickAction = (k: QuickActionKey) => {
    if (k === 'transfer') openAdd({ type: 'transfer', accountId: String(a.id) });
    else if (k === 'statement') downloadStatement();
    else if (k === 'import') launchStatementImport(String(a.id));
    else openMoreSheet();
  };

  return (
    <>
      <MPageShell
      title={a.name}
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
      {/* Balance card (MobileScreens.jsx:426–438) */}
      <LinearGradient
        colors={a.gradient}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.balanceCard}
      >
        <View style={styles.balanceGlowBlob} pointerEvents="none" />
        <View style={styles.balanceRow}>
          <View style={styles.balanceTextBlock}>
            <Text style={styles.balanceLabel}>Balance</Text>
            <Text style={styles.balanceValue}>
              {a.bal < 0 ? '-' : ''}₹{Math.abs(a.bal).toLocaleString('en-IN')}
            </Text>
            <Text style={styles.balanceSub}>
              {a.bank} · {a.sub}
            </Text>
          </View>
          <BankLogo name={a.bank} size={48} radius={14} fallbackText={a.logo} />
        </View>
      </LinearGradient>

      {/* Quick actions (MobileScreens.jsx:441–448) */}
      <View style={styles.quickActionsGrid}>
        {QUICK_ACTIONS.map((q) => (
          <Pressable
            key={q.l}
            style={styles.quickActionPressable}
            onPress={() => runQuickAction(q.k)}
            accessibilityRole="button"
            accessibilityLabel={q.l}
          >
            {({ pressed }) => (
              <GlassCard style={[styles.quickActionCard, { opacity: pressed ? 0.6 : 1 }]}>
                <View style={[styles.quickActionIconBox, { backgroundColor: q.c + '22' }]}>
                  <AppIcon value={q.i} size={16} color={q.c} />
                </View>
                <Text style={[styles.quickActionLabel, { color: t.text1, fontFamily: weight(600) }]}>
                  {q.l}
                </Text>
              </GlassCard>
            )}
          </Pressable>
        ))}
      </View>

      <SectionHead title="Recent transactions" />
      <ListCard>
        {recentTxs.map((tx, i) => (
          <ListRow key={i} last={i === recentTxs.length - 1}>
            <View style={[styles.txIconBox, { backgroundColor: t.bg3 }]}>
              <AppIcon value={tx.i} size={18} color={t.text1} />
            </View>
            <View style={styles.txTextBlock}>
              <Text style={[styles.txDesc, { color: t.text1, fontFamily: weight(600) }]}>{tx.d}</Text>
              <Text style={[styles.txDate, { color: t.text3 }]}>{tx.t}</Text>
            </View>
            <Text
              style={[
                styles.txAmount,
                { color: tx.a > 0 ? t.em : t.red, fontFamily: weight(700) },
              ]}
            >
              {tx.a > 0 ? '+' : ''}₹{Math.abs(tx.a).toLocaleString('en-IN')}
            </Text>
          </ListRow>
        ))}
      </ListCard>
      </MPageShell>

      {/* Sibling of MPageShell, not inside its ScrollView — same reasoning
       * CardDetail's PayBillSheet comment gives. */}
      {statementImportSheet}
    </>
  );
}

const styles = StyleSheet.create({
  // Balance card (MobileScreens.jsx:426–438)
  balanceCard: {
    padding: 22,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 14,
  },
  balanceGlowBlob: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  balanceTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  balanceLabel: {
    fontSize: 11,
    opacity: 0.8,
    textTransform: 'uppercase',
    letterSpacing: 1.1, // 0.1em of 11px
    fontFamily: weight(600),
    fontWeight: '600',
    color: '#fff',
  },
  balanceValue: {
    fontFamily: weight(700),
    fontSize: 34,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: -1.02, // -0.03em of 34px
    color: '#fff',
  },
  balanceSub: {
    fontSize: 12,
    opacity: 0.8,
    marginTop: 6,
    color: '#fff',
  },

  // Quick actions (MobileScreens.jsx:441–448)
  quickActionsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  quickActionPressable: {
    flex: 1,
  },
  quickActionCard: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  quickActionIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontSize: 11,
  },

  // Recent transactions (MobileScreens.jsx:452–469)
  txIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txTextBlock: {
    flex: 1,
  },
  txDesc: {
    fontSize: 14,
  },
  txDate: {
    fontSize: 11,
    marginTop: 2,
  },
  txAmount: {
    fontSize: 14,
  },
});
