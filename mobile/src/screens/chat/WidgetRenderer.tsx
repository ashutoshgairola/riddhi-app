/**
 * WidgetRenderer — maps backend-emitted chat widgets to native cards using
 * the app's existing glass components and charts. Widgets come from tool
 * handlers (never composed by the model), so shapes are trusted.
 */
import { StyleSheet, Text, View } from 'react-native';

import { ListCard, ListRow, ProgressBar } from '../../components/ui';
import { MDonut, MGroupedBars, MSparkline } from '../../components/charts';
import { useTheme } from '../../theme/ThemeProvider';
import { weight } from '../../theme/tokens';
import { ChatTxCard, CHAT_CATCOL } from '../ChatTxCard';
import { ConfirmationCard } from './ConfirmationCard';
import type { TxWidgetItem, Widget } from '../../ai/widgets';

const POS_GREEN = '#7faf93';
const DONUT_PALETTE = [
  '#c9a86a',
  '#9d8bd6',
  '#c97d8c',
  '#7faf93',
  '#6fb3ad',
  '#8197c4',
  '#bd7ba0',
  '#8a8299',
];

const inr = (n: number): string =>
  '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');

const shortDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

function toChatTx(tx: TxWidgetItem) {
  return {
    merchant: tx.description,
    amount: tx.type === 'income' ? Math.abs(tx.amount) : -Math.abs(tx.amount),
    category: tx.categoryName,
    time: shortDate(tx.date),
  };
}

function CardShell({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const { t } = useTheme();
  return (
    <View style={[styles.shell, { backgroundColor: t.bg1, borderColor: t.border }]}>
      {title ? (
        <Text style={[styles.shellTitle, { color: t.text3, fontFamily: weight(600) }]}>
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export function WidgetRenderer({ widget }: { widget: Widget }) {
  const { t } = useTheme();

  switch (widget.kind) {
    case 'transaction':
      return <ChatTxCard tx={toChatTx(widget.tx)} />;

    case 'transaction_list': {
      if (widget.items.length === 0) {
        return (
          <CardShell title={widget.title ?? 'Transactions'}>
            <Text style={[styles.emptyText, { color: t.text3, fontFamily: weight(400) }]}>
              Nothing found.
            </Text>
          </CardShell>
        );
      }
      return (
        <View style={styles.listWrap}>
          <ListCard>
            {widget.items.map((tx, i) => (
              <ListRow key={tx.id} last={i === widget.items.length - 1}>
                <View style={styles.txRow}>
                  <View style={styles.txMid}>
                    <Text
                      style={[styles.txDesc, { color: t.text1, fontFamily: weight(600) }]}
                      numberOfLines={1}
                    >
                      {tx.description}
                    </Text>
                    <Text style={[styles.txMeta, { color: t.text3, fontFamily: weight(500) }]}>
                      <Text style={{ color: CHAT_CATCOL[tx.categoryName] ?? t.text3 }}>
                        {tx.categoryName}
                      </Text>
                      {` · ${shortDate(tx.date)}`}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.txAmt,
                      {
                        color: tx.type === 'income' ? POS_GREEN : t.text1,
                        fontFamily: weight(700),
                      },
                    ]}
                  >
                    {tx.type === 'income' ? '+' : '−'}
                    {inr(tx.amount)}
                  </Text>
                </View>
              </ListRow>
            ))}
          </ListCard>
          {widget.totalCount != null && widget.totalCount > widget.items.length ? (
            <Text style={[styles.moreNote, { color: t.text3, fontFamily: weight(500) }]}>
              {widget.totalCount - widget.items.length} more not shown
            </Text>
          ) : null}
        </View>
      );
    }

    case 'budget': {
      const b = widget.budget;
      const pct =
        b.totalAllocated > 0
          ? Math.min((b.totalSpent / b.totalAllocated) * 100, 100)
          : 0;
      return (
        <CardShell title={b.name}>
          <View style={styles.budgetHead}>
            <Text style={[styles.budgetSpent, { color: t.text1, fontFamily: weight(700) }]}>
              {inr(b.totalSpent)}
              <Text style={[styles.budgetOf, { color: t.text3, fontFamily: weight(500) }]}>
                {' '}
                / {inr(b.totalAllocated)}
              </Text>
            </Text>
            <Text
              style={[
                styles.budgetRemaining,
                { color: b.remaining >= 0 ? POS_GREEN : t.red, fontFamily: weight(600) },
              ]}
            >
              {b.remaining >= 0 ? `${inr(b.remaining)} left` : `${inr(b.remaining)} over`}
            </Text>
          </View>
          <ProgressBar pct={pct} color={pct >= 100 ? t.red : t.em} />
          <View style={styles.budgetCats}>
            {b.categories.slice(0, 4).map((c) => {
              const catPct =
                c.allocated > 0 ? Math.min((c.spent / c.allocated) * 100, 100) : 0;
              const color = c.color ?? CHAT_CATCOL[c.name] ?? t.em;
              return (
                <View key={c.name} style={styles.budgetCat}>
                  <View style={styles.budgetCatHead}>
                    <Text
                      style={[styles.budgetCatName, { color: t.text2, fontFamily: weight(500) }]}
                      numberOfLines={1}
                    >
                      {c.name}
                    </Text>
                    <Text style={[styles.budgetCatAmt, { color: t.text3, fontFamily: weight(500) }]}>
                      {inr(c.spent)}/{inr(c.allocated)}
                    </Text>
                  </View>
                  <ProgressBar pct={catPct} color={c.spent > c.allocated ? t.red : color} height={4} />
                </View>
              );
            })}
          </View>
        </CardShell>
      );
    }

    case 'goal': {
      const g = widget.goal;
      return (
        <CardShell title="Goal">
          <Text style={[styles.goalName, { color: t.text1, fontFamily: weight(700) }]}>
            {g.name}
          </Text>
          <Text style={[styles.goalAmounts, { color: t.text2, fontFamily: weight(500) }]}>
            {inr(g.currentAmount)}
            <Text style={{ color: t.text3 }}> of {inr(g.targetAmount)}</Text>
            <Text style={{ color: t.em, fontFamily: weight(600) }}>  {g.progressPct}%</Text>
          </Text>
          <ProgressBar pct={g.progressPct} color={t.em} />
          {g.projectedCompletionDate ? (
            <Text style={[styles.goalProjection, { color: t.text3, fontFamily: weight(500) }]}>
              On track for {shortDate(g.projectedCompletionDate)}
            </Text>
          ) : null}
        </CardShell>
      );
    }

    case 'account_list':
      return (
        <View style={styles.listWrap}>
          <ListCard>
            {widget.accounts.map((a, i) => (
              <ListRow key={a.id} last={i === widget.accounts.length - 1}>
                <View style={styles.txRow}>
                  <View style={styles.txMid}>
                    <Text
                      style={[styles.txDesc, { color: t.text1, fontFamily: weight(600) }]}
                      numberOfLines={1}
                    >
                      {a.name}
                    </Text>
                    <Text style={[styles.txMeta, { color: t.text3, fontFamily: weight(500) }]}>
                      {a.type}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.txAmt,
                      { color: a.balance >= 0 ? t.text1 : t.red, fontFamily: weight(700) },
                    ]}
                  >
                    {a.balance < 0 ? '−' : ''}
                    {inr(a.balance)}
                  </Text>
                </View>
              </ListRow>
            ))}
          </ListCard>
        </View>
      );

    case 'net_worth':
      return (
        <CardShell title="Net worth">
          <Text style={[styles.nwTotal, { color: t.text1, fontFamily: weight(800) }]}>
            {widget.total < 0 ? '−' : ''}
            {inr(widget.total)}
          </Text>
          {widget.trend && widget.trend.length > 1 ? (
            <View style={styles.nwSpark}>
              <MSparkline data={widget.trend.map((p) => p.netWorth)} color={t.em} height={44} />
            </View>
          ) : null}
          <View style={styles.nwSplit}>
            <Text style={[styles.nwSplitItem, { color: POS_GREEN, fontFamily: weight(600) }]}>
              Assets {inr(widget.assets)}
            </Text>
            <Text style={[styles.nwSplitItem, { color: t.red, fontFamily: weight(600) }]}>
              Liabilities {inr(widget.liabilities)}
            </Text>
          </View>
        </CardShell>
      );

    case 'chart_bar':
      return (
        <CardShell title={widget.title}>
          <MGroupedBars inc={widget.income} exp={widget.expense} labels={widget.labels} h={120} />
        </CardShell>
      );

    case 'chart_donut': {
      const data = widget.items.map((item, i) => ({
        label: item.name,
        value: item.value,
        color: item.color ?? CHAT_CATCOL[item.name] ?? DONUT_PALETTE[i % DONUT_PALETTE.length],
      }));
      return (
        <CardShell title={widget.title}>
          <View style={styles.donutRow}>
            <MDonut data={data} total={widget.total} size={120} />
            <View style={styles.donutLegend}>
              {widget.items.slice(0, 5).map((item, i) => (
                <View key={item.name} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: data[i].color }]} />
                  <Text
                    style={[styles.legendName, { color: t.text2, fontFamily: weight(500) }]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  <Text style={[styles.legendPct, { color: t.text3, fontFamily: weight(600) }]}>
                    {Math.round(item.sharePct)}%
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </CardShell>
      );
    }

    case 'stat':
      return (
        <CardShell title={widget.title}>
          <View style={styles.statRows}>
            {widget.rows.map((row) => (
              <View key={row.label} style={styles.statRow}>
                <Text
                  style={[styles.statLabel, { color: t.text2, fontFamily: weight(500) }]}
                  numberOfLines={1}
                >
                  {row.label}
                </Text>
                <Text
                  style={[
                    styles.statValue,
                    {
                      color:
                        row.tone === 'pos' ? POS_GREEN : row.tone === 'neg' ? t.red : t.text1,
                      fontFamily: weight(700),
                    },
                  ]}
                >
                  {row.value}
                </Text>
              </View>
            ))}
          </View>
        </CardShell>
      );

    case 'confirmation':
      return (
        <ConfirmationCard
          widget={widget}
          renderWidget={(w, key) => <WidgetRenderer key={key} widget={w} />}
        />
      );

    default:
      return null;
  }
}

const styles = StyleSheet.create({
  shell: {
    marginTop: 9,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    alignSelf: 'stretch',
    maxWidth: 320,
  },
  shellTitle: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 12.5,
  },
  listWrap: {
    marginTop: 9,
    alignSelf: 'stretch',
    maxWidth: 320,
  },
  txRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  txMid: {
    flex: 1,
    minWidth: 0,
  },
  txDesc: {
    fontSize: 13.5,
  },
  txMeta: {
    fontSize: 11,
    marginTop: 1,
  },
  txAmt: {
    fontSize: 13.5,
    flexShrink: 0,
  },
  moreNote: {
    fontSize: 11,
    marginTop: 6,
    marginLeft: 4,
  },
  budgetHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  budgetSpent: {
    fontSize: 16,
  },
  budgetOf: {
    fontSize: 12,
  },
  budgetRemaining: {
    fontSize: 11.5,
  },
  budgetCats: {
    marginTop: 12,
    gap: 9,
  },
  budgetCat: {
    gap: 4,
  },
  budgetCatHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  budgetCatName: {
    fontSize: 11.5,
    flexShrink: 1,
  },
  budgetCatAmt: {
    fontSize: 11,
  },
  goalName: {
    fontSize: 15,
  },
  goalAmounts: {
    fontSize: 12.5,
    marginTop: 3,
    marginBottom: 8,
  },
  goalProjection: {
    fontSize: 11,
    marginTop: 7,
  },
  nwTotal: {
    fontSize: 22,
    letterSpacing: -0.4,
  },
  nwSpark: {
    marginTop: 10,
  },
  nwSplit: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  nwSplitItem: {
    fontSize: 11.5,
  },
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  donutLegend: {
    flex: 1,
    gap: 6,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendName: {
    fontSize: 11.5,
    flex: 1,
  },
  legendPct: {
    fontSize: 11,
  },
  statRows: {
    gap: 8,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  statLabel: {
    fontSize: 12.5,
    flexShrink: 1,
  },
  statValue: {
    fontSize: 12.5,
    flexShrink: 0,
  },
});
