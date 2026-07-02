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
import { Chip, HScroll, IconButton, ListCard, ListRow, ProgressBar, SectionHead, Topbar } from '../components/ui';
import { MI } from '../components/icons';
import { MSeg } from '../components/MSeg';
import { PageBackground } from '../components/PageBackground';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useNav, type ScreenEntry } from '../app/navContext';
import { api } from '../api';
import { useApiData } from '../api/useApi';
import type { ReportOverviewView } from '../api/types';

// ── Data (MobileScreens.jsx:26–29) ───────────────────────────────────
const REP_OVERVIEW = [82, 85, 84, 88, 91, 89, 93, 98, 95, 102, 108, 112];
const REP_INC = [110, 108, 115, 118, 116, 122, 118, 118];
const REP_EXP = [86, 91, 88, 95, 91, 102, 98, 91];
const REP_LABELS = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'];

// ── catData (MobileScreens.jsx:83–90) ────────────────────────────────
interface CatDatum {
  label: string;
  value: number;
  color: string;
}

const CAT_DATA: CatDatum[] = [
  { label: 'Housing', value: 28000, color: '#8197c4' },
  { label: 'Food', value: 13200, color: '#c9a86a' },
  { label: 'Shopping', value: 10820, color: '#c97d8c' },
  { label: 'Transport', value: 7400, color: '#9d8bd6' },
  { label: 'Entertainment', value: 2498, color: '#6fb3ad' },
  { label: 'Healthcare', value: 820, color: '#ef4444' },
];
const TOTAL_CAT = CAT_DATA.reduce((s, d) => s + d.value, 0);

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

// Income "By Source" (MobileScreens.jsx:226–230)
const INCOME_SOURCES = [
  { src: 'Salary', amt: 590000, pct: 85, c: '#7faf93' },
  { src: 'Freelance', amt: 75000, pct: 11, c: '#8197c4' },
  { src: 'Investments', amt: 18500, pct: 3, c: '#c9a86a' },
  { src: 'Other', amt: 8500, pct: 1, c: '#9d8bd6' },
];

// Savings "Goal Progress" (MobileScreens.jsx:286–291)
const SAVINGS_GOALS = [
  { n: 'Emergency Fund', pct: 62, c: '#7faf93' },
  { n: 'Goa Trip', pct: 64, c: '#6fb3ad' },
  { n: 'MacBook Pro', pct: 34, c: '#9d8bd6' },
  { n: 'House Down Pay', pct: 8, c: '#c9a86a' },
];

// Savings sparkline (MobileScreens.jsx:281)
const SAVINGS_RATE_SPARK = [18, 21, 19, 24, 22, 25, 23];

// Wealth "Asset Allocation" (MobileScreens.jsx:316–320)
const ASSET_ALLOCATION = [
  { n: 'Cash & Bank', v: '₹8.3L', pct: 62, c: '#8197c4' },
  { n: 'Equities', v: '₹3.2L', pct: 24, c: '#7faf93' },
  { n: 'Mutual Funds', v: '₹1.4L', pct: 10, c: '#9d8bd6' },
  { n: 'Gold', v: '₹0.5L', pct: 4, c: '#c9a86a' },
];

// Overview KPI strip (MobileScreens.jsx:137–156) — matches the hardcoded
// display values (₹27K / 23% / ₹1.18L / ₹91K) verbatim as the api.reports
// fallback so mock-mode rendering is unchanged.
const REP_KPI_FALLBACK: ReportOverviewView = {
  netIncome: 27000,
  savingsRate: 23,
  totalIncome: 118000,
  totalExpenses: 91000,
};

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

  const { data: overview } = useApiData(() => api.reports.overview(period), REP_KPI_FALLBACK);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrolled(e.nativeEvent.contentOffset.y > 8);
  };

  const openPeriodSheet = () => {
    sheet({
      title: 'Report period',
      options: [
        { label: 'This week', icon: '📅', onPress: () => toast('This week') },
        { label: 'This month', icon: '🗓', onPress: () => toast('This month') },
        { label: 'This year', icon: '📆', onPress: () => toast('This year') },
        { label: 'Export report', icon: '📤', onPress: () => toast('Report exported', '📤') },
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
          <IconButton onPress={openPeriodSheet}>
            <MI.filter size={20} color={t.text1} />
          </IconButton>
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
        <View style={styles.periodWrap}>
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
        </View>

        {tab === 'overview' && (
          <>
            {/* KPI Strip (MobileScreens.jsx:137–156) */}
            <View style={styles.kpiGrid}>
              <GlassCard style={styles.kpiCard}>
                <Text style={[styles.kpiLabel, { color: t.text3, fontFamily: weight(600) }]}>Net Income</Text>
                <Text style={[styles.kpiValue, { color: t.em, fontFamily: weight(700) }]}>
                  {fmtKpi(overview.netIncome)}
                </Text>
                <Text style={[styles.kpiDelta, { color: t.em }]}>↑ 12.4%</Text>
              </GlassCard>
              <GlassCard style={styles.kpiCard}>
                <Text style={[styles.kpiLabel, { color: t.text3, fontFamily: weight(600) }]}>Savings Rate</Text>
                <Text style={[styles.kpiValue, { color: t.text1, fontFamily: weight(700) }]}>
                  {Math.round(overview.savingsRate)}%
                </Text>
                <Text style={[styles.kpiDelta, { color: t.em }]}>↑ 2pp</Text>
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
            </View>

            {/* Income vs Expense (MobileScreens.jsx:158–177) */}
            <GlassCard style={styles.sectionCard}>
              <View style={styles.cardHeaderRow}>
                <View>
                  <Text style={[styles.cardEyebrow, { color: t.text3, fontFamily: weight(600) }]}>
                    Income vs Expenses
                  </Text>
                  <Text style={[styles.cardSubtitle, { color: t.text1, fontFamily: weight(700) }]}>
                    Last 8 months
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
              <MGroupedBars inc={REP_INC} exp={REP_EXP} labels={REP_LABELS} />
            </GlassCard>

            {/* Category breakdown (MobileScreens.jsx:179–196) */}
            <GlassCard style={styles.sectionCard}>
              <Text style={[styles.cardEyebrow, styles.cardEyebrowMb, { color: t.text3, fontFamily: weight(600) }]}>
                Spending by Category
              </Text>
              <MDonut data={CAT_DATA} total={TOTAL_CAT} />
              <View style={styles.donutLegend}>
                {CAT_DATA.map((d) => {
                  const pct = Math.round((d.value / TOTAL_CAT) * 100);
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

            {/* Net worth trend (MobileScreens.jsx:198–210) */}
            <GlassCard style={styles.sectionCardLast}>
              <View style={styles.cardHeaderRow}>
                <View>
                  <Text style={[styles.cardEyebrow, { color: t.text3, fontFamily: weight(600) }]}>
                    Net Worth Trend
                  </Text>
                  <Text style={[styles.netWorthValue, { color: t.text1, fontFamily: weight(700) }]}>₹13.4L</Text>
                </View>
                <View style={[styles.deltaBadge, { backgroundColor: t.emDim }]}>
                  <Text style={[styles.deltaBadgeText, { color: t.em, fontFamily: weight(600) }]}>↑ 18.2%</Text>
                </View>
              </View>
              <View style={styles.sparklineBleed}>
                <MSparkline data={REP_OVERVIEW} color="#7faf93" height={68} />
              </View>
            </GlassCard>
          </>
        )}

        {tab === 'income' && (
          <>
            <GlassCard style={styles.sectionCard}>
              <Text style={[styles.cardEyebrow, { color: t.text3, fontFamily: weight(600) }]}>
                Total Income · 6 months
              </Text>
              <Text style={[styles.totalValue, { color: t.em, fontFamily: weight(700) }]}>₹6.92L</Text>
              <Text style={[styles.totalDelta, { color: t.em }]}>↑ 8.4% vs prior period</Text>
              <View style={styles.sparklineBleedTop}>
                <MSparkline data={REP_INC} color="#7faf93" height={64} />
              </View>
            </GlassCard>

            <SectionHead title="By Source" />
            <ListCard>
              {INCOME_SOURCES.map((d, i) => (
                <ListRow key={d.src} last={i === INCOME_SOURCES.length - 1}>
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
                Total Expenses · 6 months
              </Text>
              <Text style={[styles.totalValue, { color: t.red, fontFamily: weight(700) }]}>₹5.32L</Text>
              <Text style={[styles.totalDelta, { color: t.red }]}>↑ 4.1% vs prior period</Text>
            </GlassCard>

            <GlassCard style={styles.sectionCardLast}>
              <Text style={[styles.cardEyebrow, styles.cardEyebrowMb, { color: t.text3, fontFamily: weight(600) }]}>
                Top Categories
              </Text>
              {CAT_DATA.map((d) => {
                const pct = Math.round((d.value / TOTAL_CAT) * 100);
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
          </>
        )}

        {tab === 'savings' && (
          <>
            <GlassCard style={styles.sectionCard}>
              <Text style={[styles.cardEyebrow, { color: t.text3, fontFamily: weight(600) }]}>Savings Rate</Text>
              <Text style={[styles.savingsRateValue, { color: t.em, fontFamily: weight(700) }]}>23.1%</Text>
              <Text style={[styles.savingsRateSub, { color: t.text2 }]}>₹1.60L saved over last 6 months</Text>
              <View style={styles.sparklineBleedTop}>
                <MSparkline data={SAVINGS_RATE_SPARK} color="#7faf93" height={56} />
              </View>
            </GlassCard>

            <GlassCard style={styles.sectionCardLast}>
              <Text style={[styles.cardEyebrow, styles.cardEyebrowMb, { color: t.text3, fontFamily: weight(600) }]}>
                Goal Progress
              </Text>
              {SAVINGS_GOALS.map((g) => (
                <View key={g.n} style={styles.topCatRow}>
                  <View style={styles.topCatHeaderRow}>
                    <Text style={[styles.topCatLabel, { color: t.text1, fontFamily: weight(600) }]}>{g.n}</Text>
                    <Text style={[styles.topCatValue, { color: g.c, fontFamily: weight(700) }]}>{g.pct}%</Text>
                  </View>
                  <ProgressBar pct={g.pct} color={g.c} />
                </View>
              ))}
            </GlassCard>
          </>
        )}

        {tab === 'wealth' && (
          <>
            <GlassCard style={styles.sectionCard}>
              <Text style={[styles.cardEyebrow, { color: t.text3, fontFamily: weight(600) }]}>
                Total Net Worth
              </Text>
              <Text style={[styles.savingsRateValue, { color: t.text1, fontFamily: weight(700) }]}>₹13.4L</Text>
              <Text style={[styles.totalDelta, { color: t.em }]}>↑ ₹2.1L (18.2%) YTD</Text>
              <View style={styles.sparklineBleedTop}>
                <MSparkline data={REP_OVERVIEW} color="#8197c4" height={64} />
              </View>
            </GlassCard>

            <GlassCard style={styles.sectionCardLast}>
              <Text style={[styles.cardEyebrow, styles.cardEyebrowMb, { color: t.text3, fontFamily: weight(600) }]}>
                Asset Allocation
              </Text>
              {ASSET_ALLOCATION.map((d) => (
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
