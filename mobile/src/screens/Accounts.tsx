/**
 * Accounts — RN port of `project/riddhi/MobileScreens.jsx` (the
 * `MobileAccounts` component, lines 351–415), including its local data
 * constant `M_ACCOUNTS_FULL` (lines 342–349) and the shared `MPageShell`
 * scaffold (lines 4–21, ported as `./_MPageShell`).
 *
 * Building blocks reused rather than reimplemented:
 *  - `MPageShell` for the `.m-page`/`.m-topbar`(back)/`.m-body` scaffold.
 *  - `IconButton` for the plus button.
 *  - `expo-linear-gradient`'s `LinearGradient` for the net-worth hero and
 *    each account card's bespoke gradient fill (same pattern as
 *    `Invest.tsx`'s portfolio hero) — `.m-card`'s default glass tint isn't
 *    used here since both surfaces fully override the background.
 *  - `SectionHead` for "All Accounts" (MobileScreens.jsx:386).
 *  - `useCountUp` for the animated net-worth total (MobileScreens.jsx:353).
 *  - `useNav().pop`/`.push` for back / drill-down navigation.
 *  - `useFeedback().toast`/`.sheet` for the "+" action sheet
 *    (MobileScreens.jsx:358–362).
 *
 * Source values transcribed verbatim:
 *  - `M_ACCOUNTS_FULL` — MobileScreens.jsx:342–349. Each `color` is a CSS
 *    `linear-gradient(135deg, <stop0> 0%, <stop1> 100%)` string; RN has no
 *    CSS gradient parser, so the two hex stops are transcribed directly
 *    into a `gradient: [string, string]` tuple per account and rendered
 *    via `expo-linear-gradient`.
 *  - Net worth hero gradient `linear-gradient(135deg, #241a4a 0%, #0e0b15
 *    100%)` + border `1px solid rgba(182,164,243,0.2)` —
 *    MobileScreens.jsx:367–368. Note this is a 2-stop gradient, unlike
 *    Invest's 3-stop hero (`#241a4a -> #18122e -> #0e0b15`) — transcribed
 *    exactly as authored in source.
 *  - `totalCount`/Assets/Liabilities math — MobileScreens.jsx:352–355.
 *  - Account card layout: logo box, name, sub·type, balance L/K/neg
 *    formatting, change ↑+/↓ — MobileScreens.jsx:389–409.
 *  - "Add account" sheet options — MobileScreens.jsx:358–362.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BankLogo } from '../components/BankLogo';
import { IconButton, SearchButton, SectionHead, TopbarActions } from '../components/ui';
import { MI } from '../components/icons';
import { SpringIn } from '../components/SpringIn';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useNav, type ScreenEntry } from '../app/navContext';
import { useCountUp } from '../hooks/useCountUp';
import { api } from '../api';
import { useApiData } from '../api/useApi';
import { MPageShell } from './_MPageShell';

// ── Data (MobileScreens.jsx:342–349) ─────────────────────────────────
export interface Account {
  id: number | string;
  name: string;
  type: string;
  sub: string;
  bal: number;
  /** Two hex stops transcribed from the source's `linear-gradient(135deg,
   * <stop0> 0%, <stop1> 100%)` string. */
  gradient: [string, string];
  logo: string;
  bank: string;
  change: number;
}

// Renders empty while the api loads (or is unreachable) — no mock data.
const EMPTY_ACCOUNTS: Account[] = [];

// Balance formatting (MobileScreens.jsx:401–403): abs >= 100000 -> L (2dp),
// else grouped (en-IN), with a leading '-' for negative balances.
function fmtBalance(bal: number): string {
  const abs = Math.abs(bal);
  const magnitude = abs >= 100000 ? `${(abs / 100000).toFixed(2)}L` : abs.toLocaleString('en-IN');
  return `${bal < 0 ? '-' : ''}₹${magnitude}`;
}

export function Accounts({ entry: _entry }: { entry: ScreenEntry }) {
  const { t } = useTheme();
  const { pop, push } = useNav();
  const { toast, sheet, form } = useFeedback();

  const { data: accounts } = useApiData(() => api.accounts.list(), EMPTY_ACCOUNTS);

  const total = accounts.reduce((s, a) => s + a.bal, 0);
  const totalCount = useCountUp(total, 1100);
  const totalAssets = accounts.filter((a) => a.bal > 0).reduce((s, a) => s + a.bal, 0);
  const totalLiab = Math.abs(accounts.filter((a) => a.bal < 0).reduce((s, a) => s + a.bal, 0));

  const addAccount = (type: 'savings' | 'credit' | 'cash', title: string) => {
    form({
      title,
      fields: [
        { key: 'name', label: 'Account name', placeholder: type === 'credit' ? 'ICICI Credit' : 'HDFC Savings' },
        { kind: 'bank', key: 'institutionName', label: 'Bank / provider', placeholder: 'Search or type a bank…', optional: true },
        {
          kind: 'amount',
          key: 'balance',
          label: type === 'credit' ? 'Outstanding (₹)' : 'Current balance (₹)',
        },
      ],
      submitLabel: 'Add account',
      onSubmit: async (v) => {
        const balance = Number(v['balance']);
        await api.accounts.create({
          name: v['name']!,
          type,
          // Credit accounts carry negative balances (amounts owed).
          balance: type === 'credit' ? -Math.abs(balance) : balance,
          institutionName: v['institutionName'] || undefined,
        });
        toast(`Added ${v['name']}`, '🏦');
      },
    });
  };

  const openAddAccountSheet = () => {
    sheet({
      title: 'Add account',
      options: [
        { label: 'Bank account', icon: '🏦', onPress: () => addAccount('savings', 'Add bank account') },
        { label: 'Credit card', icon: '💳', onPress: () => addAccount('credit', 'Add credit card') },
        { label: 'Wallet', icon: '👛', onPress: () => addAccount('cash', 'Add wallet') },
      ],
    });
  };

  return (
    <MPageShell
      title="Accounts"
      onBack={pop}
      right={
        <TopbarActions>
          <SearchButton />
          <IconButton onPress={openAddAccountSheet}>
            <MI.plus size={20} color={t.text1} />
          </IconButton>
        </TopbarActions>
      }
    >
      {/* Net worth hero (MobileScreens.jsx:365–384) */}
      <SpringIn style={styles.heroCard}>
        <LinearGradient
          colors={['#241a4a', '#0e0b15']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.75, y: 1 }}
          style={[styles.heroGradient, { borderColor: 'rgba(182,164,243,0.2)' }]}
        >
          <Text style={styles.heroLabel}>Net Worth</Text>
          <Text style={styles.heroValue}>₹{(totalCount / 100000).toFixed(2)}L</Text>
          <View style={styles.heroSplitRow}>
            <View style={styles.heroSplitCol}>
              <Text style={styles.heroSplitLabel}>Assets</Text>
              <Text style={[styles.heroSplitValue, { color: '#7faf93' }]}>
                ₹{(totalAssets / 100000).toFixed(2)}L
              </Text>
            </View>
            <View style={styles.heroSplitCol}>
              <Text style={styles.heroSplitLabel}>Liabilities</Text>
              <Text style={[styles.heroSplitValue, { color: '#c97d8c' }]}>
                ₹{(totalLiab / 1000).toFixed(0)}K
              </Text>
            </View>
          </View>
        </LinearGradient>
      </SpringIn>

      <SectionHead title="All Accounts" link={String(accounts.length)} />

      <View style={styles.accountList}>
        {accounts.map((a, i) => (
          // animationDelay: `${0.04 + i*0.04}s` (MobileScreens.jsx:392)
          <SpringIn key={a.id} delay={40 + i * 40}>
            <Pressable onPress={() => push({ kind: 'account-detail', data: a })}>
              {({ pressed }) => (
                <LinearGradient
                  colors={a.gradient}
                  start={{ x: 0.1, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={[styles.accountCard, { opacity: pressed ? 0.92 : 1 }]}
                >
                  <View style={styles.accountGlowBlob} pointerEvents="none" />
                  <View style={styles.accountRow}>
                    <BankLogo name={a.bank} size={42} radius={12} fallbackText={a.logo} />
                    <View style={styles.accountTextBlock}>
                      <Text style={styles.accountName}>{a.name}</Text>
                      <Text style={styles.accountSub}>{a.sub}</Text>
                    </View>
                    <View style={styles.accountRight}>
                      <Text style={styles.accountBal}>{fmtBalance(a.bal)}</Text>
                      {a.change !== 0 ? (
                        <Text style={styles.accountChange}>
                          {a.change > 0 ? '↑ +' : '↓ '}₹{Math.abs(a.change).toLocaleString('en-IN')}
                          <Text style={styles.accountChangeSub}> · 30d</Text>
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </LinearGradient>
              )}
            </Pressable>
          </SpringIn>
        ))}
      </View>
    </MPageShell>
  );
}

const styles = StyleSheet.create({
  // Net worth hero (MobileScreens.jsx:365–384)
  heroCard: {
    borderRadius: 26, // .m-card border-radius (--r-xl), the hero card keeps that radius
    marginBottom: 14,
    overflow: 'hidden',
  },
  heroGradient: {
    padding: 20,
    borderWidth: 1,
  },
  heroLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase',
    letterSpacing: 1.1, // 0.1em of 11px
    fontFamily: weight(600),
  },
  heroValue: {
    fontFamily: weight(700),
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    marginTop: 6,
    letterSpacing: -0.96, // -0.03em of 32px
  },
  heroSplitRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  heroSplitCol: {
    flex: 1,
  },
  heroSplitLabel: {
    fontSize: 10.5,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.63, // 0.06em of 10.5px
    fontFamily: weight(600),
  },
  heroSplitValue: {
    fontFamily: weight(700),
    fontSize: 15,
    marginTop: 3,
  },

  // Account list (MobileScreens.jsx:386–411)
  accountList: {
    flexDirection: 'column',
    gap: 12,
  },
  accountCard: {
    padding: 16,
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
  },
  accountGlowBlob: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accountTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  accountName: {
    fontSize: 14.5,
    fontWeight: '700',
    fontFamily: weight(700),
    color: '#fff',
  },
  accountSub: {
    fontSize: 11.5,
    opacity: 0.75,
    marginTop: 2,
    color: '#fff',
  },
  accountRight: {
    alignItems: 'flex-end',
  },
  accountBal: {
    fontFamily: weight(700),
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.36, // -0.02em of 18px
    color: '#fff',
  },
  accountChange: {
    fontSize: 11,
    opacity: 0.75,
    marginTop: 2,
    fontFamily: weight(600),
    fontWeight: '600',
    color: '#fff',
  },
  accountChangeSub: {
    fontWeight: '500',
    opacity: 0.8,
  },
});
