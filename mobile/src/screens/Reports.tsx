/**
 * Reports — RN port of `project/riddhi/MobileScreens.jsx` (the
 * `MobileReports` component, lines 78–337), including its local data
 * constants `REP_OVERVIEW`/`REP_INC`/`REP_EXP`/`REP_LABELS` (lines 26–29)
 * and the in-component `catData` (lines 83–90).
 *
 * Building blocks reused rather than reimplemented:
 *  - `PageBackground` for the `.m-page` gradient + glow.
 *  - `Topbar` for the `.m-topbar` title + back/filter icon buttons,
 *    including its built-in `scrolled` glass treatment.
 *  - `IconButton` for the back/filter buttons.
 *  - `Chip` (`.m-chip`/`.m-chip.on`) for the 5 sub-tabs, in an `HScroll`
 *    (`.m-hscroll`) row (MobileScreens.jsx:114–123).
 *  - `MSeg` for the period selector (MobileScreens.jsx:128–132).
 *  - `GlassCard` (`.m-card`) for every card surface.
 *  - `SectionHead`/`ListCard`/`ListRow`/`ProgressBar` for the income "By
 *    Source" list (MobileScreens.jsx:224–245).
 *  - `MGroupedBars`/`MDonut`/`MSparkline` (src/components/charts.tsx) for
 *    every chart — none reimplemented here.
 *  - `useNav().pop` for the back button; `useFeedback().toast`/`.sheet` for
 *    the filter action sheet (MobileScreens.jsx:106–111).
 *
 * Source values transcribed verbatim:
 *  - `REP_OVERVIEW`/`REP_INC`/`REP_EXP`/`REP_LABELS` — MobileScreens.jsx:26–29.
 *  - `catData` + `totalCat` — MobileScreens.jsx:83–91.
 *  - Sub-tabs list — MobileScreens.jsx:93–99.
 *  - Period `MSeg` options — MobileScreens.jsx:130.
 *  - Overview KPI strip values — MobileScreens.jsx:137–156.
 *  - Income vs Expenses card + legend — MobileScreens.jsx:158–177.
 *  - Spending-by-category donut + legend rows — MobileScreens.jsx:179–196.
 *  - Net worth trend card — MobileScreens.jsx:198–210.
 *  - Income tab total/sparkline/by-source list — MobileScreens.jsx:214–247.
 *  - Expense tab total + top categories — MobileScreens.jsx:249–272.
 *  - Savings tab rate/sparkline/goal progress — MobileScreens.jsx:274–302.
 *  - Wealth tab net worth/sparkline/asset allocation — MobileScreens.jsx:304–332.
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

import { MDonut, MGroupedBars, MSparkline } from '../components/charts';
import { GlassCard } from '../components/Glass';
import { Chip, HScroll, IconButton, ListCard, ListRow, ProgressBar, SearchButton, SectionHead, Topbar, TopbarActions } from '../components/ui';
import { MI } from '../components/icons';
import { MSeg } from '../components/MSeg';
import { PageBackground } from '../components/PageBackground';
import { SpringIn } from '../components/SpringIn';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useNav, type ScreenEntry } from '../app/navContext';
import { api, type TxPeriod } from '../api';
import { shareTxCsv } from '../lib/exportCsv';
import { useApiData } from '../api/useApi';
import type {
  AccountView,
  CategorySliceView,
  GoalView,
  IncomeExpenseSeriesView,
  NetWorthTrendView,
  ReportOverviewView,
  TxView,
} from '../api/types';

// ── Tabs (MobileScreens.jsx:93–99) ───────────────────────────────────
type TabId = 'overview' | 'income' | 'expense' | 'savings' | 'wealth';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'income', label: 'Income' },
  { id: 'expense', label: 'Expense' },
  { id: 'savings', label: 'Savings' },
  { id: 'wealth', label: 'Wealth' },
];

type PeriodValue = '1m' | '3m' | '6m' | '1y' | 'all';

// Empty-but-renderable fallbacks while the api loads (or is unreachable).
const EMPTY_OVERVIEW: ReportOverviewView = {
  netIncome: 0,
  savingsRate: 0,
  totalIncome: 0,
  totalExpenses: 0,
};
const EMPTY_SERIES: IncomeExpenseSeriesView = { labels: [], income: [], expense: [] };
const EMPTY_SLICES: CategorySliceView[] = [];
const EMPTY_TREND: NetWorthTrendView = { points: [], current: 0, deltaPct: 0 };

/** Reports periods map onto the transactions period filter for By Source. */
function txPeriodFor(period: PeriodValue): TxPeriod {
  return period === '1m' ? 'month' : period === '3m' ? '3m' : 'all';
}

/** % change first → last of a series, for the derived delta chips. */
function seriesDeltaPct(values: number[]): number | null {
  const first = values.find((v) => v !== 0);
  const last = values[values.length - 1];
  if (first === undefined || last === undefined || first === 0) return null;
  return ((last - first) / Math.abs(first)) * 100;
}

/** Sparkline data needs ≥2 points to draw a path. */
function sparkable(values: number[]): number[] {
  return values.length >= 2 ? values : [0, 0];
}

function fmtKpi(n: number): string {
  return n >= 100000 ? `₹${(n / 100000).toFixed(2)}L` : `₹${Math.round(n / 1000)}K`;
}

export function Reports({ entry: _entry }: { entry: ScreenEntry }) {
  const { t } = useTheme();
  const { pop } = useNav();
  const { toast, sheet } = useFeedback();
  const [tab, setTab] = useState<TabId>('overview');
  const [scrolled, setScrolled] = useState(false);
  const [period, setPeriod] = useState<PeriodValue>('6m');

  const { data: overview } = useApiData(() => api.reports.overview(period), EMPTY_OVERVIEW, [period]);
  const { data: series } = useApiData(() => api.reports.incomeVsExpense(period), EMPTY_SERIES, [period]);
  const { data: catData } = useApiData(() => api.reports.categories(period), EMPTY_SLICES, [period]);
  const { data: nwTrend } = useApiData(() => api.reports.netWorthTrend(period), EMPTY_TREND, [period]);
  const { data: goals } = useApiData(() => api.goals.list(), [] as GoalView[]);
  const { data: accounts } = useApiData(() => api.accounts.list(), [] as AccountView[]);
  const { data: incomeTxs } = useApiData(
    () => api.transactions.list({ filter: 'inc', period: txPeriodFor(period) }),
    [] as TxView[],
    [period],
  );

  const totalCat = catData.reduce((s, d) => s + d.value, 0);

  // Income "By Source" — income transactions grouped by category.
  const incomeTotal = incomeTxs.reduce((s, tx) => s + tx.amount, 0);
  const incomeSources = [...incomeTxs.reduce((m, tx) => {
    const cur = m.get(tx.cat) ?? { src: tx.cat, amt: 0, c: tx.cCol };
    cur.amt += tx.amount;
    return m.set(tx.cat, cur);
  }, new Map<string, { src: string; amt: number; c: string }>()).values()]
    .sort((a, b) => b.amt - a.amt)
    .map((s) => ({ ...s, pct: incomeTotal > 0 ? Math.round((s.amt / incomeTotal) * 100) : 0 }));

  // Per-month savings rate for the Savings tab sparkline.
  const savingsSpark = series.income.map((inc, i) =>
    inc > 0 ? Math.round(((inc - (series.expense[i] ?? 0)) / inc) * 100) : 0,
  );
  const totalSaved = series.income.reduce((s, v, i) => s + v - (series.expense[i] ?? 0), 0);

  // Wealth: asset allocation grouped from accounts (liabilities excluded).
  const assets = accounts.filter((a) => a.bal > 0);
  const assetTotal = assets.reduce((s, a) => s + a.bal, 0);
  const allocationGroups: { n: string; match: (type: string) => boolean; c: string }[] = [
    { n: 'Cash & Bank', match: (ty) => ['savings', 'checking', 'cash', 'wallet'].includes(ty), c: '#8197c4' },
    { n: 'Investments', match: (ty) => ty === 'investment', c: '#7faf93' },
    { n: 'Other', match: (ty) => !['savings', 'checking', 'cash', 'wallet', 'investment'].includes(ty), c: '#c9a86a' },
  ];
  const allocation = allocationGroups
    .map((g) => {
      const v = assets.filter((a) => g.match(a.type)).reduce((s, a) => s + a.bal, 0);
      return {
        n: g.n,
        v: v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${Math.round(v / 1000)}K`,
        pct: assetTotal > 0 ? Math.round((v / assetTotal) * 100) : 0,
        c: g.c,
        raw: v,
      };
    })
    .filter((g) => g.raw > 0);

  const incomeDelta = seriesDeltaPct(series.income);
  const expenseDelta = seriesDeltaPct(series.expense);
  const netWorthDisplay =
    nwTrend.current >= 100000
      ? `₹${(nwTrend.current / 100000).toFixed(1)}L`
      : `₹${Math.round(nwTrend.current / 1000)}K`;

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrolled(e.nativeEvent.contentOffset.y > 8);
  };

  const openPeriodSheet = () => {
    sheet({
      title: 'Report period',
      options: [
        { label: 'This month', icon: '🗓', onPress: () => setPeriod('1m') },
        { label: 'Last 3 months', icon: '📆', onPress: () => setPeriod('3m') },
        { label: 'This year', icon: '📅', onPress: () => setPeriod('1y') },
        {
          label: 'Export report',
          icon: '📤',
          onPress: () => {
            shareTxCsv('all')
              .then(() => toast('Report exported', '📤'))
              .catch(() => toast("Couldn't export report", '📡'));
          },
        },
      ],
    });
  };

  return (
    <View style={styles.page}>
      <PageBackground />

      <Topbar
        title="Reports"
        scrolled={scrolled}
        left={
          <IconButton onPress={pop}>
            <MI.back size={20} color={t.text1} />
          </IconButton>
        }
        right={
          <TopbarActions>
            <SearchButton />
            <IconButton onPress={openPeriodSheet}>
              <MI.filter size={20} color={t.text1} />
            </IconButton>
          </TopbarActions>
        }
      />

      {/* Sub-tabs scroller (MobileScreens.jsx:114–123) */}
      <View style={[styles.tabsWrap, { borderBottomColor: t.border }]}>
        <HScroll>
          {TABS.map((tb) => (
            <Chip key={tb.id} on={tab === tb.id} onPress={() => setTab(tb.id)}>
              {tb.label}
            </Chip>
          ))}
        </HScroll>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {/* Period selector (MobileScreens.jsx:128–132) */}
        <SpringIn style={styles.periodWrap}>
          <MSeg<PeriodValue>
            options={[
              { value: '1m', label: '1M' },
              { value: '3m', label: '3M' },
              { value: '6m', label: '6M' },
              { value: '1y', label: '1Y' },
              { value: 'all', label: 'All' },
            ]}
            value={period}
            onChange={setPeriod}
          />
        </SpringIn>

        {tab === 'overview' && (
          <>
            {/* KPI Strip (MobileScreens.jsx:137–156) */}
            <SpringIn style={styles.kpiGrid}>
              <GlassCard style={styles.kpiCard}>
                <Text style={[styles.kpiLabel, { color: t.text3, fontFamily: weight(600) }]}>Net Income</Text>
                <Text style={[styles.kpiValue, { color: t.em, fontFamily: weight(700) }]}>
                  {fmtKpi(overview.netIncome)}
                </Text>
              </GlassCard>
              <GlassCard style={styles.kpiCard}>
                <Text style={[styles.kpiLabel, { color: t.text3, fontFamily: weight(600) }]}>Savings Rate</Text>
                <Text style={[styles.kpiValue, { color: t.text1, fontFamily: weight(700) }]}>
                  {Math.round(overview.savingsRate)}%
                </Text>
              </GlassCard>
              <GlassCard style={styles.kpiCard}>
                <Text style={[styles.kpiLabel, { color: t.text3, fontFamily: weight(600) }]}>Total Income</Text>
                <Text style={[styles.kpiValue, { color: t.em, fontFamily: weight(700) }]}>
                  {fmtKpi(overview.totalIncome)}
                </Text>
              </GlassCard>
              <GlassCard style={styles.kpiCard}>
                <Text style={[styles.kpiLabel, { color: t.text3, fontFamily: weight(600) }]}>Total Expenses</Text>
                <Text style={[styles.kpiValue, { color: t.red, fontFamily: weight(700) }]}>
                  {fmtKpi(overview.totalExpenses)}
                </Text>
              </GlassCard>
            </SpringIn>

            {/* Income vs Expense (MobileScreens.jsx:158–177), animationDelay: .05s */}
            <SpringIn delay={50}>
              <GlassCard style={styles.sectionCard}>
                <View style={styles.cardHeaderRow}>
                  <View>
                    <Text style={[styles.cardEyebrow, { color: t.text3, fontFamily: weight(600) }]}>
                      Income vs Expenses
                    </Text>
                    <Text style={[styles.cardSubtitle, { color: t.text1, fontFamily: weight(700) }]}>
                      Last {series.labels.length || '—'} months
                    </Text>
                  </View>
                  <View style={styles.legendRow}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: t.em }]} />
                      <Text style={[styles.legendText, { color: t.text3 }]}>Inc</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: t.red }]} />
                      <Text style={[styles.legendText, { color: t.text3 }]}>Exp</Text>
                    </View>
                  </View>
                </View>
                <MGroupedBars inc={series.income} exp={series.expense} labels={series.labels} />
              </GlassCard>
            </SpringIn>

            {/* Category breakdown (MobileScreens.jsx:179–196), animationDelay: .1s */}
            <SpringIn delay={100}>
              <GlassCard style={styles.sectionCard}>
                <Text style={[styles.cardEyebrow, styles.cardEyebrowMb, { color: t.text3, fontFamily: weight(600) }]}>
                  Spending by Category
                </Text>
                <MDonut data={catData} total={totalCat} />
                <View style={styles.donutLegend}>
                  {catData.map((d) => {
                    const pct = d.pct;
                    return (
                      <View key={d.label} style={styles.donutLegendRow}>
                        <View style={[styles.legendDot10, { backgroundColor: d.color }]} />
                        <Text style={[styles.donutLegendLabel, { color: t.text1 }]}>{d.label}</Text>
                        <Text style={[styles.donutLegendValue, { color: t.text1, fontFamily: weight(700) }]}>
                          ₹{(d.value / 1000).toFixed(1)}K
                        </Text>
                        <Text style={[styles.donutLegendPct, { color: t.text3 }]}>{pct}%</Text>
                      </View>
                    );
                  })}
                </View>
              </GlassCard>
            </SpringIn>

            {/* Net worth trend (MobileScreens.jsx:198–210), animationDelay: .15s */}
            <SpringIn delay={150}>
              <GlassCard style={styles.sectionCardLast}>
                <View style={styles.cardHeaderRow}>
                  <View>
                    <Text style={[styles.cardEyebrow, { color: t.text3, fontFamily: weight(600) }]}>
                      Net Worth Trend
                    </Text>
                    <Text style={[styles.netWorthValue, { color: t.text1, fontFamily: weight(700) }]}>
                      {netWorthDisplay}
                    </Text>
                  </View>
                  <View style={[styles.deltaBadge, { backgroundColor: t.emDim }]}>
                    <Text style={[styles.deltaBadgeText, { color: nwTrend.deltaPct >= 0 ? t.em : t.red, fontFamily: weight(600) }]}>
                      {nwTrend.deltaPct >= 0 ? '↑' : '↓'} {Math.abs(nwTrend.deltaPct).toFixed(1)}%
                    </Text>
                  </View>
                </View>
                <View style={styles.sparklineBleed}>
                  <MSparkline data={sparkable(nwTrend.points)} color="#7faf93" height={68} />
                </View>
              </GlassCard>
            </SpringIn>
          </>
        )}

        {tab === 'income' && (
          <>
            <GlassCard style={styles.sectionCard}>
              <Text style={[styles.cardEyebrow, { color: t.text3, fontFamily: weight(600) }]}>
                Total Income
              </Text>
              <Text style={[styles.totalValue, { color: t.em, fontFamily: weight(700) }]}>
                {fmtKpi(overview.totalIncome)}
              </Text>
              {incomeDelta !== null && (
                <Text style={[styles.totalDelta, { color: incomeDelta >= 0 ? t.em : t.red }]}>
                  {incomeDelta >= 0 ? '↑' : '↓'} {Math.abs(incomeDelta).toFixed(1)}% over the period
                </Text>
              )}
              <View style={styles.sparklineBleedTop}>
                <MSparkline data={sparkable(series.income)} color="#7faf93" height={64} />
              </View>
            </GlassCard>

            {/* NOTE: source's "By Source" list has no `m-spring` class
                (MobileScreens.jsx:224–245) — intentionally not wrapped. */}
            <SectionHead title="By Source" />
            <ListCard>
              {incomeSources.map((d, i) => (
                <ListRow key={d.src} last={i === incomeSources.length - 1}>
                  <View style={styles.sourceLeft}>
                    <Text style={[styles.sourceName, { color: t.text1, fontFamily: weight(600) }]}>{d.src}</Text>
                    <View style={styles.sourceBarWrap}>
                      <ProgressBar pct={d.pct} color={d.c} />
                    </View>
                  </View>
                  <View style={styles.sourceRight}>
                    <Text style={[styles.sourceAmt, { color: t.text1, fontFamily: weight(700) }]}>
                      ₹{(d.amt / 1000).toFixed(0)}K
                    </Text>
                    <Text style={[styles.sourcePct, { color: t.text3 }]}>{d.pct}%</Text>
                  </View>
                </ListRow>
              ))}
            </ListCard>
          </>
        )}

        {tab === 'expense' && (
          <>
            <GlassCard style={styles.sectionCard}>
              <Text style={[styles.cardEyebrow, { color: t.text3, fontFamily: weight(600) }]}>
                Total Expenses
              </Text>
              <Text style={[styles.totalValue, { color: t.red, fontFamily: weight(700) }]}>
                {fmtKpi(overview.totalExpenses)}
              </Text>
              {expenseDelta !== null && (
                <Text style={[styles.totalDelta, { color: expenseDelta >= 0 ? t.red : t.em }]}>
                  {expenseDelta >= 0 ? '↑' : '↓'} {Math.abs(expenseDelta).toFixed(1)}% over the period
                </Text>
              )}
            </GlassCard>

            {/* animationDelay: .05s (MobileScreens.jsx:256) */}
            <SpringIn delay={50}>
              <GlassCard style={styles.sectionCardLast}>
                <Text style={[styles.cardEyebrow, styles.cardEyebrowMb, { color: t.text3, fontFamily: weight(600) }]}>
                  Top Categories
                </Text>
                {catData.map((d) => {
                  const pct = d.pct;
                  return (
                    <View key={d.label} style={styles.topCatRow}>
                      <View style={styles.topCatHeaderRow}>
                        <Text style={[styles.topCatLabel, { color: t.text1, fontFamily: weight(600) }]}>
                          {d.label}
                        </Text>
                        <Text style={[styles.topCatValue, { color: t.text1, fontFamily: weight(700) }]}>
                          ₹{d.value.toLocaleString('en-IN')}
                        </Text>
                      </View>
                      <ProgressBar pct={pct} color={d.color} />
                    </View>
                  );
                })}
              </GlassCard>
            </SpringIn>
          </>
        )}

        {tab === 'savings' && (
          <>
            <GlassCard style={styles.sectionCard}>
              <Text style={[styles.cardEyebrow, { color: t.text3, fontFamily: weight(600) }]}>Savings Rate</Text>
              <Text style={[styles.savingsRateValue, { color: t.em, fontFamily: weight(700) }]}>
                {overview.savingsRate.toFixed(1)}%
              </Text>
              <Text style={[styles.savingsRateSub, { color: t.text2 }]}>
                {fmtKpi(Math.max(0, totalSaved))} saved over the period
              </Text>
              <View style={styles.sparklineBleedTop}>
                <MSparkline data={sparkable(savingsSpark)} color="#7faf93" height={56} />
              </View>
            </GlassCard>

            {/* animationDelay: .05s (MobileScreens.jsx:284) */}
            <SpringIn delay={50}>
              <GlassCard style={styles.sectionCardLast}>
                <Text style={[styles.cardEyebrow, styles.cardEyebrowMb, { color: t.text3, fontFamily: weight(600) }]}>
                  Goal Progress
                </Text>
                {goals.map((g) => {
                  const pct = g.target > 0 ? Math.round((g.current / g.target) * 100) : 0;
                  return (
                    <View key={g.name} style={styles.topCatRow}>
                      <View style={styles.topCatHeaderRow}>
                        <Text style={[styles.topCatLabel, { color: t.text1, fontFamily: weight(600) }]}>{g.name}</Text>
                        <Text style={[styles.topCatValue, { color: g.color, fontFamily: weight(700) }]}>{pct}%</Text>
                      </View>
                      <ProgressBar pct={pct} color={g.color} />
                    </View>
                  );
                })}
              </GlassCard>
            </SpringIn>
          </>
        )}

        {tab === 'wealth' && (
          <>
            <GlassCard style={styles.sectionCard}>
              <Text style={[styles.cardEyebrow, { color: t.text3, fontFamily: weight(600) }]}>
                Total Net Worth
              </Text>
              <Text style={[styles.savingsRateValue, { color: t.text1, fontFamily: weight(700) }]}>
                {netWorthDisplay}
              </Text>
              <Text style={[styles.totalDelta, { color: nwTrend.deltaPct >= 0 ? t.em : t.red }]}>
                {nwTrend.deltaPct >= 0 ? '↑' : '↓'} {Math.abs(nwTrend.deltaPct).toFixed(1)}% over the period
              </Text>
              <View style={styles.sparklineBleedTop}>
                <MSparkline data={sparkable(nwTrend.points)} color="#8197c4" height={64} />
              </View>
            </GlassCard>

            {/* animationDelay: .05s (MobileScreens.jsx:314) */}
            <SpringIn delay={50}>
              <GlassCard style={styles.sectionCardLast}>
                <Text style={[styles.cardEyebrow, styles.cardEyebrowMb, { color: t.text3, fontFamily: weight(600) }]}>
                  Asset Allocation
                </Text>
                {allocation.map((d) => (
                  <View key={d.n} style={styles.topCatRow}>
                    <View style={styles.topCatHeaderRow}>
                      <Text style={[styles.topCatLabel, { color: t.text1, fontFamily: weight(600) }]}>{d.n}</Text>
                      <Text style={[styles.topCatValue, { color: t.text1, fontFamily: weight(700) }]}>
                        {d.v} <Text style={[styles.topCatValueSub, { color: t.text3 }]}>· {d.pct}%</Text>
                      </Text>
                    </View>
                    <ProgressBar pct={d.pct} color={d.c} />
                  </View>
                ))}
              </GlassCard>
            </SpringIn>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 14,
    paddingHorizontal: 18,
    paddingBottom: 30,
  },

  // Sub-tabs (MobileScreens.jsx:115–123)
  tabsWrap: {
    flexShrink: 0,
    paddingTop: 4,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },

  // Period selector
  periodWrap: {
    marginBottom: 18,
  },

  // KPI strip (MobileScreens.jsx:137–156)
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  kpiCard: {
    width: '48%',
  },
  kpiLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8, // 0.08em of 10px
  },
  kpiValue: {
    fontSize: 20,
    marginTop: 4,
  },
  kpiDelta: {
    fontSize: 10.5,
    marginTop: 2,
  },

  // Generic section card
  sectionCard: {
    marginBottom: 14,
  },
  sectionCardLast: {},

  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  cardEyebrow: {
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: 0.84, // 0.08em of 10.5px
  },
  cardEyebrowMb: {
    marginBottom: 14,
  },
  cardSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
  },
  legendText: {
    fontSize: 10,
  },

  // Donut legend
  donutLegend: {
    flexDirection: 'column',
    gap: 10,
    marginTop: 18,
  },
  donutLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  legendDot10: {
    width: 10,
    height: 10,
    borderRadius: 99,
  },
  donutLegendLabel: {
    fontSize: 13,
    flex: 1,
  },
  donutLegendValue: {
    fontSize: 13,
  },
  donutLegendPct: {
    fontSize: 11,
    minWidth: 32,
    textAlign: 'right',
  },

  // Net worth trend
  netWorthValue: {
    fontSize: 22,
    marginTop: 4,
  },
  deltaBadge: {
    fontSize: 11,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 99,
  },
  deltaBadgeText: {
    fontSize: 11,
  },
  sparklineBleed: {
    marginHorizontal: -8,
  },
  sparklineBleedTop: {
    marginTop: 12,
    marginHorizontal: -8,
  },

  // Income / Expense / Wealth totals
  totalValue: {
    fontSize: 30,
    marginTop: 6,
  },
  totalDelta: {
    fontSize: 12,
    marginTop: 4,
  },

  // Income by-source list rows
  sourceLeft: {
    flex: 1,
  },
  sourceName: {
    fontSize: 14,
  },
  sourceBarWrap: {
    marginTop: 8,
  },
  sourceRight: {
    alignItems: 'flex-end',
  },
  sourceAmt: {
    fontSize: 14,
  },
  sourcePct: {
    fontSize: 11,
    marginTop: 2,
  },

  // Top categories / goal progress / asset allocation rows
  topCatRow: {
    marginBottom: 12,
  },
  topCatHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  topCatLabel: {
    fontSize: 13,
  },
  topCatValue: {
    fontSize: 13,
  },
  topCatValueSub: {
    fontWeight: '500',
  },

  // Savings rate
  savingsRateValue: {
    fontSize: 32,
    marginTop: 6,
  },
  savingsRateSub: {
    fontSize: 12,
    marginTop: 4,
  },
});
