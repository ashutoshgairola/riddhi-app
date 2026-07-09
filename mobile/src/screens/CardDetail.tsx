/**
 * CardDetail — RN port of `project/riddhi/MobileCards.jsx` (the
 * `CardDetail` component, lines 236–393), reading `entry.data` (the
 * `Account` pushed by `Accounts.tsx`'s credit-card branch,
 * `push({kind:'card-detail', data:a})`) and loading the full summary via
 * `api.cards.get` (Task 6's `CardSummaryView` — outstanding/available/
 * usedPct/billed/minDue/dueTone/cycleByCategory/rewards, computed
 * server-side; no client-side `cardOutstanding`/`cardCycleBreakdown`
 * re-derivation needed here).
 *
 * Building blocks reused rather than reimplemented:
 *  - `MPageShell` for the `.m-page`/`.m-topbar`(back+title+search)/`.m-body`
 *    scaffold (matches `AccountDetail.tsx`'s pushed-screen shape).
 *  - `expo-linear-gradient`'s `LinearGradient` for the card visual, using
 *    the account's own two-stop gradient (`a.gradient`) — same source as
 *    `AccountDetail`'s balance card and `Accounts`' account cards.
 *  - `GlassCard` for the statement-due, cycle-breakdown and rewards cards.
 *  - `SectionHead`/`ListCard`/`ListRow` for "This cycle" and "Card
 *    transactions" (MobileCards.jsx:325–380).
 *  - `Btn` (em) for "Pay bill".
 *  - `MI.check` for the "no dues" empty-state glyph.
 *  - `useApiData` for both the card summary and its transactions, with
 *    `useNav().pop` for back and `SearchButton` for the topbar action.
 *
 * Pay-bill (Task 8): `payOpen`/`setPayOpen` gates `<PayBillSheet>`,
 * rendered once `summary` has loaded. The sheet's `api.cards.pay` call
 * bumps data on success, and both `summary` and `txs` here re-fetch via
 * that same `useApiData` signal — no manual refresh wiring needed.
 *
 * Source values transcribed verbatim:
 *  - Card visual: "Total outstanding" label + value, bank/network top
 *    right, usage bar, "•••• {last4}" + "{available} available of
 *    {limit}" — MobileCards.jsx:262–288.
 *  - Statement-due card: billed + min due, days-left pill colored by
 *    `dueTone` (ok/warn/urgent), due date, "Pay bill" button; else "No
 *    dues — all paid" + next-statement date — MobileCards.jsx:290–323.
 *  - This-cycle stacked bar + per-category rows (dot/label/value/pct) —
 *    MobileCards.jsx:325–352.
 *  - Rewards row (🎁 cashback + rate) — MobileCards.jsx:354–361.
 *  - Card transactions rows (icon/desc/category·date[·unbilled]/amount) —
 *    MobileCards.jsx:363–380.
 */
import { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '../components/Glass';
import { Btn, ListCard, ListRow, SearchButton, SectionHead } from '../components/ui';
import { MI } from '../components/icons';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { useNav, type ScreenEntry } from '../app/navContext';
import { PayBillSheet } from '../app/PayBillSheet';
import { CardSetupSheet } from '../app/CardSetupSheet';
import { useStatementImportLauncher } from '../app/useStatementImportLauncher';
import { api } from '../api';
import { ApiError } from '../api/client';
import { useApiData } from '../api/useApi';
import { MPageShell } from './_MPageShell';
import type { Account } from './Accounts';
import type { CardSummaryView, CardTxnView, CycleCategoryView } from '../api/types';

// Money formatting (MobileCards.jsx:4) — unsigned, en-IN grouped.
function cFmt(n: number): string {
  return '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN');
}

// Signed amount for the card-transactions list (this app's convention —
// AccountDetail/SwipeRow both prefix income with '+' and color by sign).
function fmtSigned(n: number): string {
  return `${n > 0 ? '+' : ''}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
}

// Date formatting (MobileCards.jsx:5).
function cFmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// Next-statement date: `lastStatementDate` advanced by one month
// (MobileCards.jsx:7 `nextStmt`).
function nextStatementDate(lastStatementDate: string): string {
  const d = new Date(lastStatementDate);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

// dueTone -> pill color (MobileCards.jsx:250: red <=3d, amber <=7d, else em).
function dueToneColor(t: ReturnType<typeof useTheme>['t'], tone: CardSummaryView['dueTone']): string {
  if (tone === 'urgent') return t.red;
  if (tone === 'warn') return t.amber;
  return t.em;
}

export function CardDetail({ entry }: { entry: ScreenEntry }) {
  const a = entry.data as Account;
  const { t } = useTheme();
  const { pop } = useNav();

  const { data: summary, error } = useApiData<CardSummaryView | null>(
    () => api.cards.get(String(a.id)),
    null,
    [a.id],
  );

  // Seam for Task 8's PayBillSheet — the button below only opens it.
  const [payOpen, setPayOpen] = useState(false);

  // Task 7: legacy credit accounts have no `credit_card` row yet, so the
  // GET 404s — this gates the "set up this card" empty state below.
  const [setupOpen, setSetupOpen] = useState(false);

  // Task 10: pick → decrypt → parse → StatementReview, scoped to this card.
  // Called before the `!summary` early return below so hook order stays
  // stable across renders.
  const { launch: launchStatementImport, sheet: statementImportSheet } = useStatementImportLauncher();

  // A legacy credit account has no credit_card row yet → GET 404s. Offer a
  // one-time "set up" instead of rendering blank. Any other error (transient)
  // falls through to the existing null (the app's inline-retry pattern).
  if (!summary) {
    const notSetUp = error instanceof ApiError && error.status === 404;
    if (!notSetUp) return null;
    return (
      <>
        <MPageShell title={a.name} onBack={pop} right={<SearchButton />}>
          <GlassCard style={styles.cycleEmptyCard}>
            <Text style={[styles.noDuesTitle, { color: t.text1 }]}>Set up this card</Text>
            <Text style={[styles.noDuesSub, { color: t.text3, textAlign: 'center' }]}>
              Add your credit limit and statement day to track dues and spending.
            </Text>
            <Btn variant="em" onPress={() => setSetupOpen(true)} style={styles.payBillBtn}>
              Set up this card
            </Btn>
          </GlassCard>
        </MPageShell>
        <CardSetupSheet open={setupOpen} onClose={() => setSetupOpen(false)} accountId={String(a.id)} />
      </>
    );
  }

  const catTotal = summary.cycleByCategory.reduce((s, d) => s + d.value, 0) || 1;
  const dueColor = dueToneColor(t, summary.dueTone);

  return (
    <>
      <MPageShell title={summary.name || a.name} onBack={pop} right={<SearchButton />}>
      {/* Credit card visual (MobileCards.jsx:262–288) */}
      <LinearGradient
        colors={a.gradient}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.cardVisual}
      >
        <View style={styles.cardGlowBlob} pointerEvents="none" />
        <View style={styles.cardTopRow}>
          <View>
            <Text style={styles.cardOutLabel}>Total outstanding</Text>
            <Text style={styles.cardOutValue}>{cFmt(summary.outstanding)}</Text>
          </View>
          <View style={styles.cardBankBlock}>
            <Text style={styles.cardBankName}>{summary.institutionName ?? a.bank}</Text>
            {summary.network ? <Text style={styles.cardNetwork}>{summary.network}</Text> : null}
          </View>
        </View>
        <View>
          <View style={styles.usageTrack}>
            <View style={[styles.usageFill, { width: `${Math.min(100, summary.usedPct)}%` }]} />
          </View>
          <View style={styles.cardBottomRow}>
            <Text style={styles.cardLast4}>•••• {summary.last4 ?? '••••'}</Text>
            <Text style={styles.cardAvailable}>
              {cFmt(summary.available)} available of {cFmt(summary.creditLimit)}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* Statement due / pay bill (MobileCards.jsx:290–323) */}
      <GlassCard style={styles.statementCard}>
        {summary.hasBill ? (
          <>
            <View style={styles.statementRow}>
              <View style={styles.statementLeft}>
                <Text style={[styles.statementLabel, { color: t.text3 }]}>Statement due</Text>
                <Text style={[styles.statementValue, { color: t.text1 }]}>{cFmt(summary.billed)}</Text>
                <Text style={[styles.statementMinDue, { color: t.text3 }]}>
                  Min due{' '}
                  <Text style={[styles.statementMinDueValue, { color: t.text2 }]}>
                    {cFmt(summary.minDue)}
                  </Text>
                </Text>
              </View>
              <View style={styles.statementRight}>
                <View style={[styles.duePill, { backgroundColor: t.bg3 }]}>
                  <Text style={styles.duePillIcon}>📅</Text>
                  <Text style={[styles.duePillText, { color: dueColor }]}>
                    {summary.daysUntilDue <= 0
                      ? 'Due today'
                      : `${summary.daysUntilDue} day${summary.daysUntilDue !== 1 ? 's' : ''} left`}
                  </Text>
                </View>
                <Text style={[styles.dueDateSub, { color: t.text3 }]}>
                  Due {cFmtDate(summary.dueDate)}
                </Text>
              </View>
            </View>
            <Btn variant="em" onPress={() => setPayOpen(true)} style={styles.payBillBtn}>
              Pay bill
            </Btn>
          </>
        ) : (
          <View style={styles.noDuesRow}>
            <View style={[styles.noDuesIconBox, { backgroundColor: t.emDim }]}>
              <MI.check size={22} color={t.em} strokeWidth={2.4} />
            </View>
            <View style={styles.noDuesTextBlock}>
              <Text style={[styles.noDuesTitle, { color: t.text1 }]}>No dues — all paid</Text>
              <Text style={[styles.noDuesSub, { color: t.text3 }]}>
                Next statement on {cFmtDate(nextStatementDate(summary.lastStatementDate))}
              </Text>
            </View>
          </View>
        )}
      </GlassCard>

      {/* This cycle by category (MobileCards.jsx:325–352) */}
      <SectionHead title="This cycle" link={cFmt(summary.unbilled)} />
      {summary.cycleByCategory.length > 0 ? (
        <GlassCard style={styles.cycleCard}>
          <View style={styles.stackedBar}>
            {summary.cycleByCategory.map((d: CycleCategoryView) => {
              const flex = d.value;
              return <View key={d.categoryId} style={{ flex, backgroundColor: d.color }} />;
            })}
          </View>
          <View style={styles.cycleList}>
            {summary.cycleByCategory.map((d: CycleCategoryView) => {
              const pct = Math.round((d.value / catTotal) * 100);
              return (
                <View key={d.categoryId} style={styles.cycleRow}>
                  <View style={[styles.cycleDot, { backgroundColor: d.color }]} />
                  <Text style={[styles.cycleLabel, { color: t.text1 }]}>{d.label}</Text>
                  <Text style={[styles.cycleValue, { color: t.text1, fontFamily: weight(700) }]}>
                    {cFmt(d.value)}
                  </Text>
                  <Text style={[styles.cyclePct, { color: t.text3 }]}>{pct}%</Text>
                </View>
              );
            })}
          </View>
        </GlassCard>
      ) : (
        <GlassCard style={styles.cycleEmptyCard}>
          <Text style={[styles.cycleEmptyText, { color: t.text3 }]}>No spends this cycle yet.</Text>
        </GlassCard>
      )}

      {/* Rewards (MobileCards.jsx:354–361) — hidden when there's nothing to show. */}
      {summary.rewardsThisCycle !== 0 || summary.rewardRate ? (
        <GlassCard style={styles.rewardsCard}>
          <View style={[styles.rewardsIconBox, { backgroundColor: t.amberDim }]}>
            <Text style={styles.rewardsIconGlyph}>🎁</Text>
          </View>
          <View style={styles.rewardsTextBlock}>
            <Text style={[styles.rewardsTitle, { color: t.text1 }]}>
              {cFmt(summary.rewardsThisCycle)} cashback this cycle
            </Text>
            {summary.rewardRate ? (
              <Text style={[styles.rewardsSub, { color: t.text3 }]}>{summary.rewardRate}</Text>
            ) : null}
          </View>
        </GlassCard>
      ) : null}

      {/* Import statement (Task 10) — adds card spends/bill payments from a
       * PDF statement, scoped to this card's account. */}
      <ListCard>
        <ListRow last onPress={() => launchStatementImport(String(a.id))}>
          <View style={[styles.rewardsIconBox, { backgroundColor: t.emDim }]}>
            <Text style={styles.rewardsIconGlyph}>📄</Text>
          </View>
          <View style={styles.rewardsTextBlock}>
            <Text style={[styles.rewardsTitle, { color: t.text1 }]}>Import statement</Text>
            <Text style={[styles.rewardsSub, { color: t.text3 }]}>
              Add spends & bill figures from a PDF
            </Text>
          </View>
          <MI.arrow size={18} color={t.text3} />
        </ListRow>
      </ListCard>

      {/* Card transactions (MobileCards.jsx:363–380) — swipes (debit) and bill
       * payments (credit) merged server-side in `summary.transactions`, since
       * a payment's `accountId` is the source bank account, not the card, so
       * the shared transactions repo alone can't surface it here. */}
      <SectionHead title="Card transactions" link={String(summary.transactions.length)} />
      {summary.transactions.length > 0 ? (
        <ListCard>
          {summary.transactions.map((tx: CardTxnView, i) => {
            const isPayment = tx.kind === 'payment';
            const unbilled = !isPayment && tx.date >= summary.lastStatementDate;
            const kindColor = isPayment ? t.em : t.red;
            return (
              <ListRow key={tx.id} last={i === summary.transactions.length - 1}>
                <View style={[styles.txIconBox, { backgroundColor: kindColor + '22' }]}>
                  <Text style={styles.txIconGlyph}>{isPayment ? '↩️' : '💳'}</Text>
                </View>
                <View style={styles.txTextBlock}>
                  <Text
                    style={[styles.txDesc, { color: t.text1, fontFamily: weight(600) }]}
                    numberOfLines={1}
                  >
                    {tx.description}
                  </Text>
                  <View style={styles.txMetaRow}>
                    <Text style={[styles.txCat, { color: kindColor, fontFamily: weight(600) }]}>
                      {isPayment ? 'Bill payment' : 'Card spend'}
                    </Text>
                    <Text style={[styles.txMetaDot, { color: t.text3 }]}>·</Text>
                    <Text style={[styles.txDate, { color: t.text3 }]}>{tx.date.slice(0, 10)}</Text>
                    {unbilled ? (
                      <Text style={[styles.txUnbilled, { color: t.em }]}>· unbilled</Text>
                    ) : null}
                  </View>
                </View>
                <Text style={[styles.txAmount, { color: kindColor, fontFamily: weight(700) }]}>
                  {fmtSigned(tx.amount)}
                </Text>
              </ListRow>
            );
          })}
        </ListCard>
      ) : (
        <GlassCard style={styles.cycleEmptyCard}>
          <Text style={[styles.cycleEmptyText, { color: t.text3 }]}>No card transactions yet.</Text>
        </GlassCard>
      )}
      </MPageShell>

      {/* Rendered as a sibling of MPageShell (not inside its ScrollView) so
       * the sheet's absolute-fill backdrop/surface covers the whole screen
       * rather than just the scroll content box — same reasoning as
       * AddTxSheet, which AppShell mounts at the app root. */}
      <PayBillSheet open={payOpen} onClose={() => setPayOpen(false)} card={summary} />
    </>
  );
}

const styles = StyleSheet.create({
  // Credit card visual (MobileCards.jsx:262–288)
  cardVisual: {
    padding: 20,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 14,
    minHeight: 170,
    justifyContent: 'space-between',
  },
  cardGlowBlob: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardOutLabel: {
    fontSize: 11,
    opacity: 0.7,
    textTransform: 'uppercase',
    letterSpacing: 1.1, // 0.1em of 11px
    fontWeight: '600',
    color: '#fff',
  },
  cardOutValue: {
    fontFamily: weight(700),
    fontSize: 32,
    fontWeight: '700',
    marginTop: 5,
    letterSpacing: -0.96, // -0.03em of 32px
    color: '#fff',
  },
  cardBankBlock: {
    alignItems: 'flex-end',
  },
  cardBankName: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.48, // 0.04em of 12px
    color: '#fff',
  },
  cardNetwork: {
    fontSize: 10.5,
    opacity: 0.7,
    marginTop: 2,
    color: '#fff',
  },
  usageTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 99,
    overflow: 'hidden',
    marginBottom: 8,
  },
  usageFill: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 99,
  },
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  cardLast4: {
    fontSize: 12,
    opacity: 0.85,
    color: '#fff',
  },
  cardAvailable: {
    fontSize: 11.5,
    opacity: 0.85,
    color: '#fff',
  },

  // Statement due (MobileCards.jsx:290–323)
  statementCard: {
    padding: 16,
    marginBottom: 14,
  },
  statementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statementLeft: {
    flex: 1,
  },
  statementLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.88, // 0.08em of 11px
    fontWeight: '600',
  },
  statementValue: {
    fontFamily: weight(700),
    fontSize: 24,
    fontWeight: '700',
    marginTop: 4,
  },
  statementMinDue: {
    fontSize: 12,
    marginTop: 3,
  },
  statementMinDueValue: {
    fontWeight: '700',
  },
  statementRight: {
    alignItems: 'flex-end',
  },
  duePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 99,
  },
  duePillIcon: {
    fontSize: 12,
  },
  duePillText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  dueDateSub: {
    fontSize: 11,
    marginTop: 6,
  },
  payBillBtn: {
    marginTop: 14,
    height: 48,
  },

  // No-dues empty state (MobileCards.jsx:312–322)
  noDuesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  noDuesIconBox: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noDuesTextBlock: {
    flex: 1,
  },
  noDuesTitle: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  noDuesSub: {
    fontSize: 12,
    marginTop: 2,
  },

  // This cycle (MobileCards.jsx:325–352)
  cycleCard: {
    padding: 16,
    marginBottom: 14,
  },
  stackedBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 99,
    overflow: 'hidden',
    marginBottom: 14,
  },
  cycleList: {
    gap: 11,
  },
  cycleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cycleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  cycleLabel: {
    fontSize: 13,
    flex: 1,
  },
  cycleValue: {
    fontSize: 13,
  },
  cyclePct: {
    fontSize: 11,
    minWidth: 30,
    textAlign: 'right',
  },
  cycleEmptyCard: {
    padding: 22,
    alignItems: 'center',
    marginBottom: 14,
  },
  cycleEmptyText: {
    fontSize: 13,
  },

  // Rewards (MobileCards.jsx:354–361)
  rewardsCard: {
    padding: 14,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rewardsIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardsIconGlyph: {
    fontSize: 18,
  },
  rewardsTextBlock: {
    flex: 1,
  },
  rewardsTitle: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  rewardsSub: {
    fontSize: 11.5,
    marginTop: 2,
  },

  // Card transactions (MobileCards.jsx:363–380)
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
    minWidth: 0,
  },
  txDesc: {
    fontSize: 14,
  },
  txMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  txCat: {
    fontSize: 11.5,
  },
  txMetaDot: {
    fontSize: 11.5,
  },
  txDate: {
    fontSize: 11.5,
  },
  txUnbilled: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  txAmount: {
    fontSize: 14,
  },
});
