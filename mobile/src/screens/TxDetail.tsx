/**
 * TxDetail — RN port of `project/riddhi/MobileScreens.jsx` (the `TxDetail`
 * component, lines 793–838), reading `entry.data` (the `SwipeTx` pushed by
 * `SwipeRow.tsx`'s `push({kind:'tx-detail', data: tx})`,
 * src/screens/SwipeRow.tsx:77) as the source's `data` prop.
 *
 * Building blocks reused rather than reimplemented:
 *  - `MPageShell` for the `.m-page`/`.m-topbar`(back+title+right)/`.m-body`
 *    scaffold.
 *  - `IconButton` for the more button.
 *  - `ListCard`/`ListRow` for the detail rows (MobileScreens.jsx:810–824).
 *  - `GlassCard` (`.m-card`) for the note card (MobileScreens.jsx:826–829).
 *  - `Btn` (ghost variant) for the Edit/Delete buttons, both static (no
 *    onClick in source) — MobileScreens.jsx:831–834.
 *  - `useFeedback().sheet`/`.toast` for the more-button action sheet
 *    (MobileScreens.jsx:796–800).
 *  - `useNav().pop` for the back button and the Delete option's `onBack()`
 *    call.
 *
 * Source values transcribed verbatim:
 *  - Centered icon box (`tx.cCol`+'22', 72×72), `tx.desc`, big amount
 *    (`tx.type==='inc'` -> em else red, with `+` sign for positive amounts)
 *    — MobileScreens.jsx:802–808.
 *  - Detail rows: Category (`tx.cCol`-colored) / Date (hardcoded '25 April
 *    2026, 1:24 PM') / Account (hardcoded 'HDFC Savings · ••••4521') / Type
 *    (Income/Expense) / Status (hardcoded 'Completed', em-colored) /
 *    Reference (hardcoded 'TXN20260425001824') — MobileScreens.jsx:811–823.
 *  - Note card: hardcoded "No note. Tap to add one." — MobileScreens.jsx:826–829.
 *  - More-sheet options: Edit/Duplicate/Delete (danger, toasts then pops)
 *    — MobileScreens.jsx:797–799.
 */
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '../components/Glass';
import { Btn, IconButton, ListCard, ListRow } from '../components/ui';
import { MI } from '../components/icons';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useNav, type ScreenEntry } from '../app/navContext';
import { MPageShell } from './_MPageShell';
import type { SwipeTx } from './SwipeRow';

export function TxDetail({ entry }: { entry: ScreenEntry }) {
  const tx = entry.data as SwipeTx;
  const { t } = useTheme();
  const { pop } = useNav();
  const { toast, sheet } = useFeedback();

  const openMoreSheet = () => {
    sheet({
      title: 'Transaction',
      options: [
        { label: 'Edit', icon: '✏️', onPress: () => toast('Edit transaction') },
        { label: 'Duplicate', icon: '⧉', onPress: () => toast('Transaction duplicated', '⧉') },
        {
          label: 'Delete',
          icon: '🗑',
          danger: true,
          onPress: () => {
            toast('Transaction deleted');
            pop();
          },
        },
      ],
    });
  };

  // Detail rows (MobileScreens.jsx:811–818) — verbatim.
  const rows: { k: string; v: string; c?: string }[] = [
    { k: 'Category', v: tx.cat, c: tx.cCol },
    { k: 'Date', v: '25 April 2026, 1:24 PM' },
    { k: 'Account', v: 'HDFC Savings · ••••4521' },
    { k: 'Type', v: tx.type === 'inc' ? 'Income' : 'Expense' },
    { k: 'Status', v: 'Completed', c: t.em },
    { k: 'Reference', v: 'TXN20260425001824' },
  ];

  return (
    <MPageShell
      title="Transaction"
      onBack={pop}
      right={
        <IconButton onPress={openMoreSheet}>
          <MI.more size={20} color={t.text1} />
        </IconButton>
      }
    >
      <View style={styles.heroWrap}>
        <View style={[styles.iconBox, { backgroundColor: tx.cCol + '22' }]}>
          <Text style={styles.iconGlyph}>{tx.icon}</Text>
        </View>
        <Text style={[styles.desc, { color: t.text2 }]}>{tx.desc}</Text>
        <Text style={[styles.amount, { color: tx.type === 'inc' ? t.em : t.red, fontFamily: weight(700) }]}>
          {tx.amount > 0 ? '+' : ''}₹{Math.abs(tx.amount).toLocaleString('en-IN')}
        </Text>
      </View>

      <View style={styles.listWrap}>
        <ListCard>
          {rows.map((r, i) => (
            <ListRow key={r.k} last={i === rows.length - 1}>
              <Text style={[styles.rowKey, { color: t.text3 }]}>{r.k}</Text>
              <Text style={[styles.rowValue, { color: r.c ?? t.text1, fontFamily: weight(600) }]}>{r.v}</Text>
            </ListRow>
          ))}
        </ListCard>
      </View>

      <GlassCard style={styles.noteCard}>
        <Text style={[styles.noteLabel, { color: t.text3, fontFamily: weight(600) }]}>NOTE</Text>
        <Text style={[styles.noteBody, { color: t.text2 }]}>No note. Tap to add one.</Text>
      </GlassCard>

      {/* Static buttons, no handlers — MobileScreens.jsx:831–834 has no
       * onClick on either button (only the more-sheet's Edit/Delete options
       * are wired up). */}
      <View style={styles.actionsRow}>
        <Btn variant="ghost" style={styles.actionBtn}>
          ✎ Edit
        </Btn>
        <Btn variant="ghost" style={styles.actionBtn}>
          <Text style={[styles.deleteLabel, { color: t.red, fontFamily: weight(600) }]}>Delete</Text>
        </Btn>
      </View>
    </MPageShell>
  );
}

const styles = StyleSheet.create({
  heroWrap: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingBottom: 24,
  },
  iconBox: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  iconGlyph: {
    fontSize: 34,
  },
  desc: {
    fontSize: 13,
    marginBottom: 6,
  },
  amount: {
    fontSize: 38,
    letterSpacing: -1.14, // -0.03em of 38px
  },
  listWrap: {
    marginBottom: 14,
  },
  rowKey: {
    flex: 1,
    fontSize: 13,
  },
  rowValue: {
    fontSize: 13,
    textAlign: 'right',
  },
  noteCard: {
    marginBottom: 14,
  },
  noteLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.88, // 0.08em of 11px
    marginBottom: 6,
  },
  noteBody: {
    fontSize: 13,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
  },
  deleteLabel: {
    fontSize: 15,
  },
});
