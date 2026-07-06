/**
 * Budgets — RN port of `project/riddhi/MobileSecondary.jsx` (the
 * `MobileBudgets` component, lines 13–99), including its local data
 * constant `MB_BUDGETS` (lines 3–11).
 *
 * Building blocks reused rather than reimplemented:
 *  - `PageBackground` for the `.m-page` gradient + glow.
 *  - `Topbar` for the `.m-topbar` title + plus icon button, including its
 *    built-in `scrolled` glass treatment.
 *  - `IconButton` for the plus button.
 *  - `GlassCard` (`.m-card`) for the overall-ring card and each category
 *    card.
 *  - `SectionHead` (`.m-section-head`) for the "Categories" section label.
 *  - `ProgressBar` (`.m-pbar`/`.m-pfill`) for each category's fill bar.
 *  - `useCountUp` for the animated overall ring percentage
 *    (MobileSecondary.jsx:18).
 *  - `useFeedback().sheet`/`.toast` for the "+" action sheet
 *    (MobileSecondary.jsx:24–27) — "Add transaction" calls `openAdd()`
 *    from `useNav()`, mirroring the source's `window.RiddhiApp?.openAdd()`.
 *
 * The overall progress ring (MobileSecondary.jsx:34–46, an inline `<svg>`
 * with two `<circle>`s) has no existing RN port, so it's drawn here
 * directly with `react-native-svg`: r=40, strokeWidth=8, circumference
 * 2*pi*40 ≈ 251.3 (matching the source's hardcoded `251.3` dasharray
 * denominator), animated via the same `animPct` `useCountUp` value driving
 * `strokeDasharray`.
 *
 * Source values transcribed verbatim:
 *  - `MB_BUDGETS` — MobileSecondary.jsx:3–11.
 *  - Overall totals/pct math — MobileSecondary.jsx:15–18.
 *  - Ring threshold colors (>=90 red, >=75 amber, else em) —
 *    MobileSecondary.jsx:37.
 *  - Per-category pct/over/warn/color logic — MobileSecondary.jsx:62–65.
 *  - "April Budget" / ₹K / remaining formatting — MobileSecondary.jsx:49–51.
 *  - Over-budget warning row — MobileSecondary.jsx:86–90.
 *
 * Per the brief, this screen is NOT pull-to-refresh in the source (it uses
 * a plain scrollable body with `onScroll={e => setScrolled(e.target.scrollTop > 8)}`)
 * — a plain `ScrollView` is used here too, matching `Txns.tsx`'s pattern.
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
import Svg, { Circle } from 'react-native-svg';

import { GlassCard } from '../components/Glass';
import { IconButton, ProgressBar, SearchButton, SectionHead, Topbar, TopbarActions } from '../components/ui';
import { MI } from '../components/icons';
import { PageBackground } from '../components/PageBackground';
import { SpringIn } from '../components/SpringIn';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useNav, type ScreenEntry } from '../app/navContext';
import { useCountUp } from '../hooks/useCountUp';
import { api } from '../api';
import { useApiData } from '../api/useApi';

// ── Data (MobileSecondary.jsx:3–11) ──────────────────────────────────
interface Budget {
  name: string;
  icon: string;
  c: string;
  allocated: number;
  spent: number;
}

// Renders empty while the api loads (or is unreachable) — no mock data.
const EMPTY_BUDGETS: Budget[] = [];

// Ring geometry — MobileSecondary.jsx:34–41: r=40, strokeWidth=8,
// circumference hardcoded in source as 251.3 (≈ 2*pi*40).
const RING_SIZE = 96;
const RING_R = 40;
const RING_STROKE = 8;
const RING_CIRCUMFERENCE = 251.3;

export function Budgets({ entry: _entry }: { entry: ScreenEntry }) {
  const { t } = useTheme();
  const { openAdd } = useNav();
  const { toast, sheet, form } = useFeedback();
  const [scrolled, setScrolled] = useState(false);

  const { data: budgets } = useApiData(() => api.budgets.list(), EMPTY_BUDGETS);

  // Overall totals (MobileSecondary.jsx:15–17)
  const totalAlloc = budgets.reduce((s, b) => s + b.allocated, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const overallPct = totalAlloc > 0 ? Math.round((totalSpent / totalAlloc) * 100) : 0;
  const animPct = useCountUp(overallPct, 1100);
  const monthLabel = new Date().toLocaleString('en', { month: 'long' });

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrolled(e.nativeEvent.contentOffset.y > 8);
  };

  const newBudget = async () => {
    const cats = await api.categories.list();
    const existing = new Set(budgets.map((b) => b.name.toLowerCase()));
    const options = cats
      .filter((c) => !existing.has(c.name.toLowerCase()) && c.name !== 'Income')
      .map((c) => ({ label: `${c.icon} ${c.name}`, value: c.name }));
    form({
      title: 'New category budget',
      fields: [
        options.length
          ? { kind: 'select', key: 'name', label: 'Category', options, initial: options[0]!.value }
          : { key: 'name', label: 'Category name' },
        { kind: 'amount', key: 'allocated', label: 'Monthly budget (₹)' },
      ],
      submitLabel: 'Create budget',
      onSubmit: async (v) => {
        await api.budgets.upsertCategory({ name: v['name']!, allocated: Number(v['allocated']) });
        toast(`Budget set for ${v['name']}`, '🎯');
      },
    });
  };

  const openCreateSheet = () => {
    sheet({
      title: 'Create',
      options: [
        { label: 'New budget', icon: '🎯', onPress: () => void newBudget() },
        { label: 'Add transaction', icon: '💸', onPress: () => openAdd() },
      ],
    });
  };

  const ringColor = overallPct >= 90 ? t.red : overallPct >= 75 ? t.amber : t.em;

  return (
    <View style={styles.page}>
      <PageBackground />

      <Topbar
        title="Budgets"
        scrolled={scrolled}
        right={
          <TopbarActions>
            <SearchButton />
            <IconButton onPress={openCreateSheet}>
              <MI.plus size={20} color={t.text1} />
            </IconButton>
          </TopbarActions>
        }
      />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {/* Overall ring (MobileSecondary.jsx:32–53) */}
        <SpringIn>
          <GlassCard style={styles.ringCard} contentStyle={styles.ringCardContent}>
            <View style={styles.ringWrap}>
              <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
                <Circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RING_R}
                  stroke={t.bg3}
                  strokeWidth={RING_STROKE}
                  fill="none"
                />
                <Circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RING_R}
                  stroke={ringColor}
                  strokeWidth={RING_STROKE}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${(animPct / 100) * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
                  origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
                  rotation={-90}
                />
              </Svg>
              <View style={styles.ringCenter} pointerEvents="none">
                <Text style={[styles.ringPct, { color: t.text1, fontFamily: weight(700) }]}>
                  {animPct}%
                </Text>
                <Text style={[styles.ringLabel, { color: t.text3, fontFamily: weight(600) }]}>
                  Used
                </Text>
              </View>
            </View>
            <View style={styles.ringInfo}>
              <Text style={[styles.ringInfoTitle, { color: t.text3, fontFamily: weight(600) }]}>
                {monthLabel} Budget
              </Text>
              <View style={styles.ringInfoAmountRow}>
                <Text style={[styles.ringInfoAmount, { color: t.text1, fontFamily: weight(700) }]}>
                  ₹{(totalSpent / 1000).toFixed(0)}K{' '}
                </Text>
                <Text style={[styles.ringInfoAmountAlloc, { color: t.text3 }]}>
                  / ₹{(totalAlloc / 1000).toFixed(0)}K
                </Text>
              </View>
              <Text style={[styles.ringInfoRemaining, { color: t.text2 }]}>
                ₹{(totalAlloc - totalSpent).toLocaleString('en-IN')} remaining
              </Text>
            </View>
          </GlassCard>
        </SpringIn>

        {/* Categories (MobileSecondary.jsx:55–94) */}
        <View style={styles.sectionWrap}>
          <SectionHead title="Categories" link={String(budgets.length)} />
        </View>
        <View style={styles.categoryList}>
          {budgets.map((b, i) => {
            const pct = Math.round((b.spent / b.allocated) * 100);
            const over = pct >= 100;
            const warn = pct >= 75 && !over;
            const c = over ? t.red : warn ? t.amber : b.c;
            const badgeBg = over ? t.redDim : warn ? t.amberDim : t.emDim;

            return (
              // animationDelay: `${0.05 + i*0.04}s` (MobileSecondary.jsx:68)
              <SpringIn key={b.name} delay={50 + i * 40}>
                <GlassCard contentStyle={styles.categoryCardContent}>
                  <View style={styles.categoryHeaderRow}>
                    <View style={[styles.categoryIconBox, { backgroundColor: b.c + '22' }]}>
                      <Text style={styles.categoryIconGlyph}>{b.icon}</Text>
                    </View>
                    <View style={styles.categoryTextBlock}>
                      <Text style={[styles.categoryName, { color: t.text1, fontFamily: weight(600) }]}>
                        {b.name}
                      </Text>
                      <Text style={[styles.categoryAmount, { color: t.text3 }]}>
                        ₹{b.spent.toLocaleString('en-IN')}{' '}
                        <Text style={{ color: t.text3 }}>
                          of ₹{b.allocated.toLocaleString('en-IN')}
                        </Text>
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.categoryPctBadge,
                        { color: c, backgroundColor: badgeBg, fontFamily: weight(700) },
                      ]}
                    >
                      {pct}%
                    </Text>
                  </View>
                  <ProgressBar pct={Math.min(pct, 100)} color={c} />
                  {over ? (
                    <Text style={[styles.overBudgetWarning, { color: t.red, fontFamily: weight(600) }]}>
                      ⚠ Over budget by ₹{(b.spent - b.allocated).toLocaleString('en-IN')}
                    </Text>
                  ) : null}
                </GlassCard>
              </SpringIn>
            );
          })}
        </View>
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
    paddingTop: 4,
    paddingHorizontal: 18,
    paddingBottom: 24,
  },

  // Overall ring card
  ringCard: {
    marginTop: 8,
  },
  // Row layout must go through contentStyle to reach the card's content
  // (on `style` it applies to GlassCard's outer wrapper — ring and text
  // would stack vertically).
  ringCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    position: 'relative',
  },
  ringCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPct: {
    fontSize: 22,
  },
  ringLabel: {
    fontSize: 9.5,
    textTransform: 'uppercase',
    letterSpacing: 0.57, // 0.06em of 9.5px
    marginTop: 1,
  },
  ringInfo: {
    flex: 1,
  },
  ringInfoTitle: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.88, // 0.08em of 11px
  },
  ringInfoAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  ringInfoAmount: {
    fontSize: 22,
  },
  ringInfoAmountAlloc: {
    fontSize: 14,
  },
  ringInfoRemaining: {
    fontSize: 12,
    marginTop: 6,
  },

  // Categories
  sectionWrap: {
    marginTop: 22,
  },
  categoryList: {
    flexDirection: 'column',
    gap: 10,
  },
  // Padding override (16 vs GlassCard's 18 default) — must be contentStyle;
  // on `style` it pads the outer wrapper *around* the already-padded overlay.
  categoryCardContent: {
    padding: 16,
  },
  categoryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  categoryIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIconGlyph: {
    fontSize: 18,
  },
  categoryTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  categoryName: {
    fontSize: 14,
  },
  categoryAmount: {
    fontSize: 11.5,
    marginTop: 2,
  },
  categoryPctBadge: {
    fontSize: 14,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 99,
    overflow: 'hidden',
  },
  overBudgetWarning: {
    fontSize: 11,
    marginTop: 8,
  },
});
