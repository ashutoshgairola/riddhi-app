/**
 * TxCategories — RN port of `project/riddhi/MobileScreens.jsx` (the
 * `MobileTxCats` component, lines 490–535), including its local data
 * constant `M_CATS` (lines 478–488).
 *
 * Building blocks reused rather than reimplemented:
 *  - `MPageShell` for the `.m-page`/`.m-topbar`(back+title+right)/`.m-body`
 *    scaffold.
 *  - `IconButton` for the plus button.
 *  - `MSeg` for the all/expense/income filter segmented control.
 *  - `GlassCard` (`.m-card`) for each category card.
 *  - `Chip` for each sub-category pill.
 *  - `useFeedback().sheet`/`.toast` for the "New category" action sheet
 *    (MobileScreens.jsx:494–497).
 *  - `useNav().pop` for the back button.
 *
 * Source values transcribed verbatim:
 *  - `M_CATS` — MobileScreens.jsx:478–488.
 *  - Filter logic: `tab==='all'` -> all, `tab==='inc'` -> `color==='#7faf93'`,
 *    else (`'exp'`) -> `color!=='#7faf93'` — MobileScreens.jsx:492.
 *  - Card body: icon box, name, "{txs} txns · {n} sub-cat" (sub-cat clause
 *    only when `subs.length>0`), right-aligned ₹total colored `c.color` —
 *    MobileScreens.jsx:507–521.
 *  - Sub-cat chip row, only when `subs.length>0` — MobileScreens.jsx:522–528.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '../components/Glass';
import { Chip, IconButton } from '../components/ui';
import { MI } from '../components/icons';
import { MSeg } from '../components/MSeg';
import { SpringIn } from '../components/SpringIn';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useNav, type ScreenEntry } from '../app/navContext';
import { MPageShell } from './_MPageShell';

// ── Data (MobileScreens.jsx:478–488) ─────────────────────────────────
interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
  txs: number;
  total: number;
  subs: string[];
}

const M_CATS: Category[] = [
  { id: 1, name: 'Housing', icon: '🏠', color: '#8197c4', txs: 24, total: 28000, subs: ['Rent', 'Maintenance'] },
  { id: 2, name: 'Food & Dining', icon: '🍽', color: '#c9a86a', txs: 48, total: 13200, subs: ['Groceries', 'Restaurants', 'Delivery'] },
  { id: 3, name: 'Transport', icon: '🚇', color: '#9d8bd6', txs: 18, total: 7400, subs: ['Metro', 'Cab', 'Fuel'] },
  { id: 4, name: 'Utilities', icon: '⚡', color: '#6fb3ad', txs: 8, total: 2900, subs: ['Electricity', 'Internet'] },
  { id: 5, name: 'Entertainment', icon: '🎬', color: '#c97d8c', txs: 12, total: 2498, subs: ['Subscriptions', 'Events'] },
  { id: 6, name: 'Healthcare', icon: '💊', color: '#ef4444', txs: 5, total: 820, subs: [] },
  { id: 7, name: 'Shopping', icon: '🛍', color: '#c97d8c', txs: 14, total: 10820, subs: [] },
  { id: 8, name: 'Education', icon: '🎓', color: '#6fb3ad', txs: 3, total: 5400, subs: [] },
  { id: 9, name: 'Income', icon: '💼', color: '#7faf93', txs: 6, total: 153000, subs: ['Salary', 'Freelance'] },
];

type FilterValue = 'all' | 'exp' | 'inc';

export function TxCategories({ entry: _entry }: { entry: ScreenEntry }) {
  const { t } = useTheme();
  const { pop } = useNav();
  const { toast, sheet } = useFeedback();
  const [tab, setTab] = useState<FilterValue>('all');

  // Filter logic (MobileScreens.jsx:492) — verbatim.
  const filtered =
    tab === 'all' ? M_CATS : tab === 'inc' ? M_CATS.filter((c) => c.color === '#7faf93') : M_CATS.filter((c) => c.color !== '#7faf93');

  const openNewCategorySheet = () => {
    sheet({
      title: 'New category',
      options: [
        { label: 'Expense category', icon: '🏷', onPress: () => toast('Category created', '🏷') },
        { label: 'Income category', icon: '💰', onPress: () => toast('Category created', '🏷') },
      ],
    });
  };

  return (
    <MPageShell
      title="Categories"
      onBack={pop}
      right={
        <IconButton onPress={openNewCategorySheet}>
          <MI.plus size={20} color={t.text1} />
        </IconButton>
      }
    >
      <SpringIn style={styles.segWrap}>
        <MSeg<FilterValue>
          options={[
            { value: 'all', label: 'All' },
            { value: 'exp', label: 'Expense' },
            { value: 'inc', label: 'Income' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </SpringIn>

      <View style={styles.list}>
        {filtered.map((c, i) => (
          // animationDelay: `${0.04 + i*0.03}s` (MobileScreens.jsx:506)
          <SpringIn key={c.id} delay={40 + i * 30}>
            <GlassCard style={styles.card}>
              <View style={styles.cardRow}>
                <View style={[styles.iconBox, { backgroundColor: c.color + '22' }]}>
                  <Text style={styles.iconGlyph}>{c.icon}</Text>
                </View>
                <View style={styles.textBlock}>
                  <Text style={[styles.name, { color: t.text1, fontFamily: weight(600) }]} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={[styles.meta, { color: t.text3 }]}>
                    {c.txs} txns{c.subs.length > 0 ? ` · ${c.subs.length} sub-cat` : ''}
                  </Text>
                </View>
                <Text style={[styles.total, { color: c.color, fontFamily: weight(700) }]}>
                  ₹{c.total.toLocaleString('en-IN')}
                </Text>
              </View>

              {c.subs.length > 0 && (
                <View style={[styles.subsRow, { borderTopColor: t.border }]}>
                  {c.subs.map((s) => (
                    <Chip key={s}>{s}</Chip>
                  ))}
                </View>
              )}
            </GlassCard>
          </SpringIn>
        ))}
      </View>
    </MPageShell>
  );
}

const styles = StyleSheet.create({
  segWrap: {
    marginBottom: 14,
  },
  list: {
    flexDirection: 'column',
    gap: 10,
  },
  card: {
    padding: 14,
  },
  cardRow: {
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
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 14,
  },
  meta: {
    fontSize: 11.5,
    marginTop: 2,
  },
  total: {
    fontFamily: weight(700),
    fontSize: 14,
  },
  subsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
});
