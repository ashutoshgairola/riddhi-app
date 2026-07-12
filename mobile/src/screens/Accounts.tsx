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
import { space, weight } from '../theme/tokens';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useNav, type ScreenEntry } from '../app/navContext';
import { MASKED_AMOUNT, usePrefs } from '../prefs/PrefsProvider';
import { useCountUp } from '../hooks/useCountUp';
import { api } from '../api';
import { useApiData } from '../api/useApi';
import type { FormFieldSpec } from '../components/FormSheet';
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

/** Per-credit-account due-hint lookup (accountId -> daysUntilDue/hasBill),
 * fetched once per accounts-list load — see the `dueHints` useApiData call
 * below for why this isn't a per-row fetch. */
type DueHintMap = Record<string, { daysUntilDue: number; hasBill: boolean }>;
const EMPTY_DUE_HINTS: DueHintMap = {};

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
  const { prefs } = usePrefs();
  const hide = prefs.hideBalances;

  const { data: accounts } = useApiData(() => api.accounts.list(), EMPTY_ACCOUNTS);

  // Due hint for the credit-account rows below: fetch each credit account's
  // card summary ONCE per accounts-list load (keyed on the credit-account id
  // set), not per render/per row — a plain per-row `api.cards.get` call
  // inside the list would re-fire on every re-render and get chattier as
  // more cards are added.
  const creditAccountIds = accounts.filter((a) => a.type === 'credit').map((a) => String(a.id));
  const { data: dueHints } = useApiData<DueHintMap>(
    async () => {
      if (creditAccountIds.length === 0) return EMPTY_DUE_HINTS;
      const entries = await Promise.all(
        creditAccountIds.map(async (id) => {
          try {
            const s = await api.cards.get(id);
            return [id, { daysUntilDue: s.daysUntilDue, hasBill: s.hasBill }] as const;
          } catch {
            // Best-effort enrichment — a missing/unreachable card summary
            // just omits that row's hint rather than failing the list.
            return null;
          }
        }),
      );
      const map: DueHintMap = {};
      for (const e of entries) {
        if (e) map[e[0]] = e[1];
      }
      return map;
    },
    EMPTY_DUE_HINTS,
    [creditAccountIds.join(',')],
  );

  const total = accounts.reduce((s, a) => s + a.bal, 0);
  const totalCount = useCountUp(total, 1100);
  const totalAssets = accounts.filter((a) => a.bal > 0).reduce((s, a) => s + a.bal, 0);
  const totalLiab = Math.abs(accounts.filter((a) => a.bal < 0).reduce((s, a) => s + a.bal, 0));

  const addAccount = (type: 'savings' | 'credit' | 'cash', title: string) => {
    // Credit cards need a limit + statement day (the backend seeds the
    // CreditCard row from these); last4/network are optional cosmetic
    // fields. Bank/wallet flows keep the original 3-field shape.
    const creditFields: FormFieldSpec[] =
      type === 'credit'
        ? [
            { kind: 'amount', key: 'creditLimit', label: 'Credit limit (₹)' },
            { kind: 'amount', key: 'statementDay', label: 'Statement day (1-28)', placeholder: 'e.g. 5' },
            { key: 'last4', label: 'Last 4 digits', placeholder: '1234', optional: true },
            { key: 'network', label: 'Network', placeholder: 'Visa / Mastercard / RuPay', optional: true },
          ]
        : [];

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
        ...creditFields,
      ],
      submitLabel: 'Add account',
      onSubmit: async (v) => {
        const balance = Number(v['balance']);
        let statementDay: number | undefined;
        if (type === 'credit') {
          statementDay = Number(v['statementDay']);
          if (!Number.isInteger(statementDay) || statementDay < 1 || statementDay > 28) {
            throw new Error('Statement day must be a whole number between 1 and 28');
          }
        }
        await api.accounts.create({
          name: v['name']!,
          type,
          // Credit accounts carry negative balances (amounts owed).
          balance: type === 'credit' ? -Math.abs(balance) : balance,
          institutionName: v['institutionName'] || undefined,
          ...(type === 'credit'
            ? {
                creditLimit: Number(v['creditLimit']),
                statementDay,
                last4: v['last4'] || undefined,
                network: v['network'] || undefined,
              }
            : {}),
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
          <Text style={styles.heroValue}>
            {hide ? MASKED_AMOUNT : `₹${(totalCount / 100000).toFixed(2)}L`}
          </Text>
          <View style={styles.heroSplitRow}>
            <View style={styles.heroSplitCol}>
              <Text style={styles.heroSplitLabel}>Assets</Text>
              <Text style={[styles.heroSplitValue, { color: '#7faf93' }]}>
                {hide ? MASKED_AMOUNT : `₹${(totalAssets / 100000).toFixed(2)}L`}
              </Text>
            </View>
            <View style={styles.heroSplitCol}>
              <Text style={styles.heroSplitLabel}>Liabilities</Text>
              <Text style={[styles.heroSplitValue, { color: '#c97d8c' }]}>
                {hide ? MASKED_AMOUNT : `₹${(totalLiab / 1000).toFixed(0)}K`}
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
            <Pressable
              onPress={() => push({ kind: a.type === 'credit' ? 'card-detail' : 'account-detail', data: a })}
            >
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
                      <Text style={styles.accountBal}>
                        {hide ? MASKED_AMOUNT : fmtBalance(a.bal)}
                      </Text>
                      {a.type === 'credit' && dueHints[String(a.id)]?.hasBill ? (
                        <Text style={styles.accountDueHint}>
                          {dueHints[String(a.id)]!.daysUntilDue <= 0
                            ? 'Due today'
                            : `Due in ${dueHints[String(a.id)]!.daysUntilDue}d`}
                        </Text>
                      ) : a.change !== 0 ? (
                        <Text style={styles.accountChange}>
                          {hide
                            ? MASKED_AMOUNT
                            : `${a.change > 0 ? '↑ +' : '↓ '}₹${Math.abs(a.change).toLocaleString('en-IN')}`}
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
    marginBottom: space[14],
    overflow: 'hidden',
  },
  heroGradient: {
    padding: space[20],
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
    marginTop: space[6],
    letterSpacing: -0.96, // -0.03em of 32px
  },
  heroSplitRow: {
    flexDirection: 'row',
    gap: space[14],
    marginTop: space[14],
    paddingTop: space[14],
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
    marginTop: space[4],
  },

  // Account list (MobileScreens.jsx:386–411)
  accountList: {
    flexDirection: 'column',
    gap: space[12],
  },
  accountCard: {
    padding: space[16],
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
    gap: space[12],
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
    marginTop: space[2],
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
    marginTop: space[2],
    fontFamily: weight(600),
    fontWeight: '600',
    color: '#fff',
  },
  accountChangeSub: {
    fontWeight: '500',
    opacity: 0.8,
  },
  accountDueHint: {
    fontSize: 11,
    opacity: 0.85,
    marginTop: space[2],
    fontFamily: weight(600),
    fontWeight: '600',
    color: '#fff',
  },
});
