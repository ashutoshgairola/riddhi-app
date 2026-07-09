/**
 * Txns — RN port of `project/riddhi/MobileTxns.jsx` (the `MobileTxns`
 * component, lines 87–152), including its local data constant `MT_DATA`
 * (lines 3–15) and the `groupTxByDate` helper (lines 17–31; the local-date
 * fix in `./txnGroups.ts` means it's no longer a verbatim port — see that
 * file's header doc).
 *
 * Building blocks reused rather than reimplemented:
 *  - `PageBackground` for the `.m-page` gradient + glow.
 *  - `Topbar` for the `.m-topbar` title + search/filter icon buttons,
 *    including its built-in `scrolled` glass treatment.
 *  - `IconButton` for the search/filter buttons.
 *  - `GlassCard` (`.m-card`) for the two summary cards.
 *  - `MSeg` for the all/income/expense filter segmented control.
 *  - `ListCard` (`.m-list-card`) as the per-date-group container; its
 *    children are `SwipeRow`s (src/screens/SwipeRow.tsx — ports
 *    MobileTxns.jsx:33–85 verbatim, see that file's header doc).
 *  - `useFeedback().sheet`/`.toast` for the filter action sheet
 *    (MobileTxns.jsx:101–106).
 *  - `useNav().nav` for the search icon button (MobileTxns.jsx:100).
 *
 * Source values transcribed verbatim:
 *  - `MT_DATA` — MobileTxns.jsx:3–15.
 *  - `fmt` formatter — MobileTxns.jsx:91.
 *
 * `groupTxByDate` (MobileTxns.jsx:17–31, today hardcoded to 2026-04-25 in
 * source) diverges from the source: see `./txnGroups.ts`.
 */
import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { GlassCard } from '../components/Glass';
import { InlineRetry } from '../components/InlineRetry';
import { IconButton, ListCard, Topbar } from '../components/ui';
import { MI } from '../components/icons';
import { MSeg } from '../components/MSeg';
import { PageBackground } from '../components/PageBackground';
import { SpringIn } from '../components/SpringIn';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useNav, type ScreenEntry } from '../app/navContext';
import { api, type TxPeriod } from '../api';
import { useApiData } from '../api/useApi';
import { SwipeRow, type SwipeTx } from './SwipeRow';
import { groupTxByDate } from './txnGroups';

// Renders empty while the api loads (or is unreachable) — no mock data.
const EMPTY_TXNS: SwipeTx[] = [];

function fmt(n: number): string {
  return '₹' + Math.abs(n).toLocaleString('en-IN');
}

type FilterValue = 'all' | 'inc' | 'exp';
type SourceValue = 'all' | 'bank' | 'card';

const PERIODS: { value: TxPeriod; label: string; icon: string }[] = [
  { value: 'week', label: 'This week', icon: '📅' },
  { value: 'month', label: 'This month', icon: '🗓' },
  { value: '3m', label: 'Last 3 months', icon: '📆' },
  { value: 'all', label: 'All time', icon: '∞' },
];

const SOURCES: { value: SourceValue; label: string; icon: string }[] = [
  { value: 'all', label: 'All sources', icon: '🌐' },
  { value: 'bank', label: 'Bank & UPI', icon: '🏦' },
  { value: 'card', label: 'Cards', icon: '💳' },
];

export function Txns({ entry: _entry }: { entry: ScreenEntry }) {
  const { t } = useTheme();
  const { nav, push } = useNav();
  const { toast, sheet } = useFeedback();
  const [filter, setFilter] = useState<FilterValue>('all');
  const [period, setPeriod] = useState<TxPeriod>('all');
  const [source, setSource] = useState<SourceValue>('all');
  const [scrolled, setScrolled] = useState(false);

  const {
    data: txData,
    error: txError,
    refetch: refetchTx,
  } = useApiData(
    () => api.transactions.list({ period, source: source === 'all' ? undefined : source }),
    EMPTY_TXNS,
    [period, source],
  );
  // Only show the "couldn't load" banner when there's nothing real to show
  // (EMPTY_TXNS is a stable module-level constant, so this identity check
  // is reliable across renders) — a stale-but-real list beats an error wall.
  const showRetry = Boolean(txError) && txData === EMPTY_TXNS;

  const filtered = txData.filter((tx) => filter === 'all' || tx.type === filter);
  const totalInc = filtered.filter((t2) => t2.type === 'inc').reduce((s, t2) => s + t2.amount, 0);
  const totalExp = filtered.filter((t2) => t2.type === 'exp').reduce((s, t2) => s + Math.abs(t2.amount), 0);
  const groups = groupTxByDate(filtered);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrolled(e.nativeEvent.contentOffset.y > 8);
  };

  const openFilterSheet = () => {
    sheet({
      title: 'Filter',
      sections: [
        {
          header: 'Period',
          options: PERIODS.map((p) => ({
            label: p.label,
            icon: p.icon,
            selected: p.value === period,
            onPress: () => setPeriod(p.value),
          })),
        },
        {
          header: 'Source',
          options: SOURCES.map((s) => ({
            label: s.label,
            icon: s.icon,
            selected: s.value === source,
            onPress: () => setSource(s.value),
          })),
        },
      ],
    });
  };

  const deleteTx = (tx: SwipeTx) => {
    api.transactions
      .remove(tx.id)
      .then(() => toast('Transaction deleted', '🗑'))
      .catch(() => toast("Couldn't delete — try again", '📡'));
  };

  const editTx = (tx: SwipeTx) => {
    // Swipe-right edit lands on the detail screen, which hosts the full
    // edit form (same one as its ✎ Edit button).
    push({ kind: 'tx-detail', data: tx });
  };

  return (
    <View style={styles.page}>
      <PageBackground />

      <Topbar
        title="Transactions"
        scrolled={scrolled}
        right={
          <View style={styles.topbarActions}>
            <IconButton onPress={() => nav('search')}>
              <MI.search size={20} color={t.text1} />
            </IconButton>
            <IconButton onPress={openFilterSheet} dot={period !== 'all' || source !== 'all'}>
              <MI.filter size={20} color={t.text1} />
            </IconButton>
          </View>
        }
      />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary row — MobileTxns.jsx:112–121 */}
        <SpringIn style={styles.summaryRow}>
          <GlassCard style={styles.summaryCard} contentStyle={styles.summaryCardContent}>
            <Text style={[styles.summaryLabel, { color: t.text3 }]}>Income</Text>
            <Text style={[styles.summaryValue, { color: t.em, fontFamily: weight(700) }]}>
              +{fmt(totalInc)}
            </Text>
          </GlassCard>
          <GlassCard style={styles.summaryCard} contentStyle={styles.summaryCardContent}>
            <Text style={[styles.summaryLabel, { color: t.text3 }]}>Expenses</Text>
            <Text style={[styles.summaryValue, { color: t.red, fontFamily: weight(700) }]}>
              -{fmt(totalExp)}
            </Text>
          </GlassCard>
        </SpringIn>

        {/* Filter seg — MobileTxns.jsx:124–128, animationDelay: .05s */}
        <SpringIn delay={50} style={styles.segWrap}>
          <MSeg<FilterValue>
            options={[
              { value: 'all', label: 'All' },
              { value: 'inc', label: 'Income' },
              { value: 'exp', label: 'Expense' },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </SpringIn>

        {/* Read-path error state (nothing real to show yet) */}
        {showRetry ? (
          <View style={styles.retryWrap}>
            <InlineRetry onRetry={refetchTx} message="Couldn't load transactions — tap to retry" />
          </View>
        ) : null}

        {/* Groups — MobileTxns.jsx:131–143, animationDelay: `${0.08 + gi*0.04}s` */}
        {groups.map((group, gi) => (
          <SpringIn key={group.label} delay={80 + gi * 40} style={styles.groupWrap}>
            <View style={styles.groupHeader}>
              <Text style={[styles.groupLabel, { color: t.text2, fontFamily: weight(700) }]}>
                {group.label}
              </Text>
              <Text style={[styles.groupCount, { color: t.text3 }]}>
                {group.txs.length} txn{group.txs.length !== 1 ? 's' : ''}
              </Text>
            </View>
            <ListCard>
              {group.txs.map((tx) => (
                <SwipeRow key={tx.id} tx={tx} fmt={fmt} onDelete={deleteTx} onEdit={editTx} />
              ))}
            </ListCard>
          </SpringIn>
        ))}

        {/* Footer hint — MobileTxns.jsx:145–147 */}
        <Text style={[styles.footerHint, { color: t.text3 }]}>
          Swipe rows ← to delete · → to edit
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  topbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  body: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 4,
    paddingHorizontal: 18,
    // The centred footer hint lines up under the centre FAB, which protrudes
    // ~21px above the tab-bar top (TabBar fabRing marginTop -29 on a 68px
    // ring). paddingBottom is the min gap between the hint and the bar top in
    // both scroll states, so it must clear that overhang with room to spare.
    paddingBottom: 44,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  summaryCard: {
    flex: 1,
  },
  // Padding override (14 vs GlassCard's 18) — contentStyle so it replaces
  // the overlay's padding instead of stacking on the outer wrapper.
  summaryCardContent: {
    padding: 14,
  },
  summaryLabel: {
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: 0.84, // 0.08em of 10.5px
    fontFamily: weight(600),
  },
  summaryValue: {
    fontSize: 18,
    marginTop: 4,
  },
  segWrap: {
    marginTop: 16,
  },
  retryWrap: {
    marginTop: 20,
  },
  groupWrap: {
    marginTop: 20,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 10,
  },
  groupLabel: {
    fontSize: 13,
  },
  groupCount: {
    fontSize: 11,
  },
  footerHint: {
    textAlign: 'center',
    fontSize: 11,
    marginTop: 18,
  },
});
