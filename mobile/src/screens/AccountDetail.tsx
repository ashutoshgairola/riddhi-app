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
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '../components/Glass';
import { IconButton, ListCard, ListRow, SectionHead } from '../components/ui';
import { MI } from '../components/icons';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useNav, type ScreenEntry } from '../app/navContext';
import { MPageShell } from './_MPageShell';
import type { Account } from './Accounts';

// Quick actions (MobileScreens.jsx:442)
const QUICK_ACTIONS: { l: string; i: string; c: string }[] = [
  { l: 'Transfer', i: '↔', c: '#8197c4' },
  { l: 'Statement', i: '📄', c: '#c9a86a' },
  { l: 'Settings', i: '⚙', c: '#9d8bd6' },
];

// Recent transactions (MobileScreens.jsx:452–457)
interface Tx {
  i: string;
  d: string;
  a: number;
  t: string;
}

const RECENT_TXS: Tx[] = [
  { i: '🛒', d: 'Swiggy Order', a: -649, t: 'Today' },
  { i: '💼', d: 'Salary — April', a: 118000, t: 'Today' },
  { i: '⚡', d: 'Electricity Bill', a: -1840, t: 'Yesterday' },
  { i: '🚇', d: 'Metro Card', a: -500, t: 'Apr 23' },
];

export function AccountDetail({ entry }: { entry: ScreenEntry }) {
  const a = entry.data as Account;
  const { t } = useTheme();
  const { pop } = useNav();
  const { toast, sheet } = useFeedback();

  const openMoreSheet = () => {
    sheet({
      title: a.name,
      options: [
        { label: 'Edit account', icon: '✏️', onPress: () => toast('Edit account') },
        { label: 'Download statement', icon: '📄', onPress: () => toast('Statement downloaded', '📄') },
        { label: 'Remove account', icon: '🗑', danger: true, onPress: () => toast('Account removed') },
      ],
    });
  };

  return (
    <MPageShell
      title={a.name}
      onBack={pop}
      right={
        <IconButton onPress={openMoreSheet}>
          <MI.more size={20} color={t.text1} />
        </IconButton>
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
        <View>
          <Text style={styles.balanceLabel}>Balance</Text>
          <Text style={styles.balanceValue}>
            {a.bal < 0 ? '-' : ''}₹{Math.abs(a.bal).toLocaleString('en-IN')}
          </Text>
          <Text style={styles.balanceSub}>
            {a.bank} · {a.sub}
          </Text>
        </View>
      </LinearGradient>

      {/* Quick actions (MobileScreens.jsx:441–448) */}
      <View style={styles.quickActionsGrid}>
        {QUICK_ACTIONS.map((q) => (
          <GlassCard key={q.l} style={styles.quickActionCard}>
            <View style={[styles.quickActionIconBox, { backgroundColor: q.c + '22' }]}>
              <Text style={[styles.quickActionIconGlyph, { color: q.c }]}>{q.i}</Text>
            </View>
            <Text style={[styles.quickActionLabel, { color: t.text1, fontFamily: weight(600) }]}>
              {q.l}
            </Text>
          </GlassCard>
        ))}
      </View>

      <SectionHead title="Recent transactions" />
      <ListCard>
        {RECENT_TXS.map((tx, i) => (
          <ListRow key={i} last={i === RECENT_TXS.length - 1}>
            <View style={[styles.txIconBox, { backgroundColor: t.bg3 }]}>
              <Text style={styles.txIconGlyph}>{tx.i}</Text>
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
  quickActionIconGlyph: {
    fontSize: 16,
    fontWeight: '700',
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
  txIconGlyph: {
    fontSize: 17,
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
