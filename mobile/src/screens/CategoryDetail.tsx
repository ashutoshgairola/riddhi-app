/**
 * CategoryDetail — a category's transactions on a dedicated screen, shared
 * by two entry points:
 *
 *  - From Budgets (budget mode): opened by tapping a budget category card.
 *    `data.month` scopes the transaction list to that budget's month and a
 *    header card shows the spent / allocated progress. When the month is the
 *    current one, the header also offers "Edit limit" and "Remove from
 *    budget" — the budget-editing surface.
 *  - From Categories (all-time mode): opened by tapping a category card.
 *    No `data.month`, so every transaction in the category (all history) is
 *    listed and the header is a plain count/total summary.
 *
 * Building blocks reused rather than reimplemented:
 *  - `MPageShell` for the back/title/body scaffold.
 *  - `GlassCard`, `ProgressBar` for the header card.
 *  - `ListCard` + `SwipeRow` for the grouped transaction list (same as Txns).
 *  - `useFeedback().form`/`.toast` for edit-limit and remove flows.
 *  - `useApiData` for loading, with an empty fallback.
 */
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '../components/Glass';
import { ListCard, ProgressBar, SearchButton } from '../components/ui';
import { SpringIn } from '../components/SpringIn';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useNav, type ScreenEntry } from '../app/navContext';
import { api } from '../api';
import { useApiData } from '../api/useApi';
import { MPageShell } from './_MPageShell';
import { SwipeRow, type SwipeTx } from './SwipeRow';

/** Route params for a `cat-detail` stack entry. */
export interface CatDetailParams {
  name: string;
  icon: string;
  color: string;
  /** Transaction-category ids this view drills into (1+ for a budget line). */
  categoryIds: string[];
  /** Budget mode: the budget month (YYYY-MM) to scope + show progress for. */
  month?: string;
  /** Budget mode: this category's allocation and spend for that month. */
  allocated?: number;
  spent?: number;
}

const EMPTY_TXNS: SwipeTx[] = [];

// ── Month helpers ─────────────────────────────────────────────────────
function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const CURRENT_MONTH = monthKeyOf(new Date());

function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y!, m!, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

// ── Date grouping (mirrors Txns.groupTxByDate) ────────────────────────
interface TxGroup {
  label: string;
  txs: SwipeTx[];
}
function groupTxByDate(txs: SwipeTx[]): TxGroup[] {
  const groups: Record<string, TxGroup> = {};
  txs.forEach((tx) => {
    const d = new Date(tx.date);
    const today = new Date(new Date().toISOString().slice(0, 10));
    const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
    let label: string;
    if (diff === 0) label = 'Today';
    else if (diff === 1) label = 'Yesterday';
    else label = d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
    if (!groups[label]) groups[label] = { label, txs: [] };
    groups[label]!.txs.push(tx);
  });
  return Object.values(groups);
}

function fmt(n: number): string {
  return '₹' + Math.abs(n).toLocaleString('en-IN');
}

export function CategoryDetail({ entry }: { entry: ScreenEntry }) {
  const { t } = useTheme();
  const { pop, push } = useNav();
  const { form, sheet, toast } = useFeedback();

  const p = (entry.data ?? {}) as CatDetailParams;
  const { name, icon, color, categoryIds = [], month, allocated } = p;
  const isBudget = !!month;
  const canEdit = isBudget && month === CURRENT_MONTH;
  const bounds = month ? monthBounds(month) : null;

  const { data: txns } = useApiData<SwipeTx[]>(
    async () => {
      if (!categoryIds.length) return [];
      const results = await Promise.all(
        categoryIds.map((cid) =>
          api.transactions.list({
            categoryId: cid,
            from: bounds?.from,
            to: bounds?.to,
            limit: 100,
          }),
        ),
      );
      const seen = new Set<SwipeTx['id']>();
      return results
        .flat()
        .filter((tx) => (seen.has(tx.id) ? false : (seen.add(tx.id), true)))
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    },
    EMPTY_TXNS,
    [categoryIds.join(','), bounds?.from, bounds?.to],
  );

  const groups = groupTxByDate(txns);
  const totalValue = txns.reduce((s, tx) => s + Math.abs(tx.amount), 0);

  // Budget progress (budget mode) — prefer the fetched spend so the bar
  // stays truthful even if the passed-in figure is stale.
  const spent = isBudget ? txns.reduce((s, tx) => s + Math.abs(tx.amount), 0) : 0;
  const alloc = allocated ?? 0;
  const pct = alloc > 0 ? Math.round((spent / alloc) * 100) : 0;
  const over = pct >= 100;
  const warn = pct >= 75 && !over;
  const barColor = over ? t.red : warn ? t.amber : color;

  const editLimit = () => {
    form({
      title: `Edit budget — ${name}`,
      fields: [{ kind: 'amount', key: 'allocated', label: 'Monthly budget (₹)', initial: String(alloc) }],
      submitLabel: 'Save budget',
      onSubmit: async (v) => {
        await api.budgets.upsertCategory({ name, allocated: Number(v['allocated']) });
        toast(`Budget updated for ${name}`, '🎯');
        pop();
      },
    });
  };

  const removeFromBudget = () => {
    sheet({
      title: `Remove ${name} from this month's budget?`,
      options: [
        {
          label: 'Remove from budget',
          icon: '🗑',
          onPress: async () => {
            await api.budgets.removeCategory(name);
            toast(`Removed ${name} from budget`, '🗑');
            pop();
          },
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
  const editTx = (tx: SwipeTx) => push({ kind: 'tx-detail', data: tx });

  return (
    <MPageShell title={name} onBack={pop} right={<SearchButton />}>
      {/* Header card */}
      <SpringIn>
        <GlassCard contentStyle={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={[styles.iconBox, { backgroundColor: color + '22' }]}>
              <Text style={styles.iconGlyph}>{icon}</Text>
            </View>
            <View style={styles.headerText}>
              <Text style={[styles.headerName, { color: t.text1, fontFamily: weight(700) }]}>
                {name}
              </Text>
              {isBudget ? (
                <Text style={[styles.headerMeta, { color: t.text3 }]}>
                  {fmt(spent)}{' '}
                  <Text style={{ color: t.text3 }}>of {fmt(alloc)}</Text>
                </Text>
              ) : (
                <Text style={[styles.headerMeta, { color: t.text3 }]}>
                  {txns.length} txn{txns.length !== 1 ? 's' : ''} · {fmt(totalValue)}
                </Text>
              )}
            </View>
            {isBudget ? (
              <Text
                style={[styles.pctBadge, {
                  color: barColor,
                  backgroundColor: over ? t.redDim : warn ? t.amberDim : t.emDim,
                  fontFamily: weight(700),
                }]}
              >
                {pct}%
              </Text>
            ) : null}
          </View>

          {isBudget ? (
            <>
              <View style={styles.barWrap}>
                <ProgressBar pct={Math.min(pct, 100)} color={barColor} />
              </View>
              {over ? (
                <Text style={[styles.overWarn, { color: t.red, fontFamily: weight(600) }]}>
                  ⚠ Over budget by {fmt(spent - alloc)}
                </Text>
              ) : null}
              {canEdit ? (
                <View style={styles.actionsRow}>
                  <Text
                    onPress={editLimit}
                    style={[styles.actionBtn, {
                      color: t.text1,
                      backgroundColor: t.bg3,
                      fontFamily: weight(700),
                    }]}
                  >
                    Edit limit
                  </Text>
                  <Text
                    onPress={removeFromBudget}
                    style={[styles.actionBtn, {
                      color: t.red,
                      backgroundColor: t.redDim,
                      fontFamily: weight(700),
                    }]}
                  >
                    Remove
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
        </GlassCard>
      </SpringIn>

      {/* Transactions */}
      {groups.length === 0 ? (
        <GlassCard contentStyle={styles.emptyCard}>
          <Text style={[styles.emptyText, { color: t.text2, fontFamily: weight(600) }]}>
            {isBudget ? 'No transactions in this category this month.' : 'No transactions yet.'}
          </Text>
        </GlassCard>
      ) : (
        groups.map((group, gi) => (
          <SpringIn key={group.label} delay={50 + gi * 40} style={styles.groupWrap}>
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
        ))
      )}
    </MPageShell>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    padding: 16,
    marginTop: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyph: {
    fontSize: 20,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  headerName: {
    fontSize: 16,
  },
  headerMeta: {
    fontSize: 12,
    marginTop: 3,
  },
  pctBadge: {
    fontSize: 14,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 99,
    overflow: 'hidden',
  },
  barWrap: {
    marginTop: 14,
  },
  overWarn: {
    fontSize: 11,
    marginTop: 8,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  actionBtn: {
    fontSize: 12.5,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 99,
    overflow: 'hidden',
    textAlign: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 28,
    marginTop: 16,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
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
});
