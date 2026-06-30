/**
 * Txns — RN port of `project/riddhi/MobileTxns.jsx` (the `MobileTxns`
 * component, lines 87–152), including its local data constant `MT_DATA`
 * (lines 3–15) and the `groupTxByDate` helper (lines 17–31, ported
 * verbatim).
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
 *  - `groupTxByDate` — MobileTxns.jsx:17–31 (today hardcoded to
 *    2026-04-25, exactly as in source).
 *  - `fmt` formatter — MobileTxns.jsx:91.
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
import { IconButton, ListCard, Topbar } from '../components/ui';
import { MI } from '../components/icons';
import { MSeg } from '../components/MSeg';
import { PageBackground } from '../components/PageBackground';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useNav, type ScreenEntry } from '../app/navContext';
import { SwipeRow, type SwipeTx } from './SwipeRow';

// ── Data (MobileTxns.jsx:3–15) ───────────────────────────────────────
const MT_DATA: SwipeTx[] = [
  { id: 1, icon: '💼', desc: 'Salary — April 2026', cat: 'Income', cCol: '#7faf93', date: '2026-04-25', amount: 118000, type: 'inc' },
  { id: 3, icon: '🛒', desc: 'Swiggy Order', cat: 'Food & Dining', cCol: '#c9a86a', date: '2026-04-25', amount: -649, type: 'exp' },
  { id: 2, icon: '🏠', desc: 'Rent — April', cat: 'Housing', cCol: '#8197c4', date: '2026-04-24', amount: -28000, type: 'exp' },
  { id: 4, icon: '⚡', desc: 'BESCOM Electricity', cat: 'Utilities', cCol: '#6fb3ad', date: '2026-04-24', amount: -1840, type: 'exp' },
  { id: 5, icon: '🚇', desc: 'Metro Smart Card', cat: 'Transport', cCol: '#9d8bd6', date: '2026-04-23', amount: -500, type: 'exp' },
  { id: 6, icon: '📱', desc: 'Netflix', cat: 'Entertainment', cCol: '#c97d8c', date: '2026-04-22', amount: -649, type: 'exp' },
  { id: 7, icon: '🛍', desc: 'Myntra Shopping', cat: 'Shopping', cCol: '#c97d8c', date: '2026-04-21', amount: -3200, type: 'exp' },
  { id: 8, icon: '💊', desc: 'Apollo Pharmacy', cat: 'Healthcare', cCol: '#ef4444', date: '2026-04-19', amount: -820, type: 'exp' },
  { id: 9, icon: '📈', desc: 'SIP — Nifty 50 ETF', cat: 'Investments', cCol: '#7faf93', date: '2026-04-15', amount: -10000, type: 'exp' },
  { id: 13, icon: '💰', desc: 'Freelance Project', cat: 'Income', cCol: '#7faf93', date: '2026-04-08', amount: 35000, type: 'inc' },
  { id: 14, icon: '⛽', desc: 'BPCL Fuel', cat: 'Transport', cCol: '#9d8bd6', date: '2026-04-07', amount: -2400, type: 'exp' },
];

interface TxGroup {
  label: string;
  date: string;
  txs: SwipeTx[];
}

// ── groupTxByDate — ported verbatim (MobileTxns.jsx:17–31) ───────────
function groupTxByDate(txs: SwipeTx[]): TxGroup[] {
  const groups: Record<string, TxGroup> = {};
  txs.forEach((tx) => {
    const d = new Date(tx.date);
    const today = new Date('2026-04-25');
    const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
    let label: string;
    if (diff === 0) label = 'Today';
    else if (diff === 1) label = 'Yesterday';
    else label = d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
    if (!groups[label]) groups[label] = { label, date: tx.date, txs: [] };
    groups[label].txs.push(tx);
  });
  return Object.values(groups);
}

function fmt(n: number): string {
  return '₹' + Math.abs(n).toLocaleString('en-IN');
}

type FilterValue = 'all' | 'inc' | 'exp';

export function Txns({ entry: _entry }: { entry: ScreenEntry }) {
  const { t } = useTheme();
  const { nav } = useNav();
  const { toast, sheet } = useFeedback();
  const [filter, setFilter] = useState<FilterValue>('all');
  const [scrolled, setScrolled] = useState(false);

  const filtered = MT_DATA.filter((tx) => filter === 'all' || tx.type === filter);
  const totalInc = filtered.filter((t2) => t2.type === 'inc').reduce((s, t2) => s + t2.amount, 0);
  const totalExp = filtered.filter((t2) => t2.type === 'exp').reduce((s, t2) => s + Math.abs(t2.amount), 0);
  const groups = groupTxByDate(filtered);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrolled(e.nativeEvent.contentOffset.y > 8);
  };

  const openFilterSheet = () => {
    sheet({
      title: 'Filter by period',
      options: [
        { label: 'This week', icon: '📅', onPress: () => toast('Showing this week') },
        { label: 'This month', icon: '🗓', onPress: () => toast('Showing this month') },
        { label: 'Last 3 months', icon: '📆', onPress: () => toast('Showing last 3 months') },
        { label: 'All time', icon: '∞', onPress: () => toast('Showing all time') },
      ],
    });
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
            <IconButton onPress={openFilterSheet}>
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
        <View style={styles.summaryRow}>
          <GlassCard style={styles.summaryCard}>
            <Text style={[styles.summaryLabel, { color: t.text3 }]}>Income</Text>
            <Text style={[styles.summaryValue, { color: t.em, fontFamily: weight(700) }]}>
              +{fmt(totalInc)}
            </Text>
          </GlassCard>
          <GlassCard style={styles.summaryCard}>
            <Text style={[styles.summaryLabel, { color: t.text3 }]}>Expenses</Text>
            <Text style={[styles.summaryValue, { color: t.red, fontFamily: weight(700) }]}>
              -{fmt(totalExp)}
            </Text>
          </GlassCard>
        </View>

        {/* Filter seg — MobileTxns.jsx:124–128 */}
        <View style={styles.segWrap}>
          <MSeg<FilterValue>
            options={[
              { value: 'all', label: 'All' },
              { value: 'inc', label: 'Income' },
              { value: 'exp', label: 'Expense' },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </View>

        {/* Groups — MobileTxns.jsx:131–143 */}
        {groups.map((group) => (
          <View key={group.label} style={styles.groupWrap}>
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
                <SwipeRow key={tx.id} tx={tx} fmt={fmt} />
              ))}
            </ListCard>
          </View>
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
    paddingBottom: 24,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  summaryCard: {
    flex: 1,
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
