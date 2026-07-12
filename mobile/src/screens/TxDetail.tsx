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
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { api } from '../api';
import { AppIcon, AppIconBox } from '../components/contentIcons';
import { GlassCard } from '../components/Glass';
import { Btn, IconButton, ListCard, ListRow, SearchButton, TopbarActions } from '../components/ui';
import { MI } from '../components/icons';
import { SourceTag } from '../components/SourceTag';
import { useTheme } from '../theme/ThemeProvider';
import { space, weight } from '../theme/tokens';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useNav, type ScreenEntry } from '../app/navContext';
import { MPageShell } from './_MPageShell';
import type { SwipeTx } from './SwipeRow';

export function TxDetail({ entry }: { entry: ScreenEntry }) {
  const stub = entry.data as { id: string } & Partial<SwipeTx>;
  const isFull = typeof stub?.desc === 'string';
  const [tx, setTx] = useState<SwipeTx | null>(isFull ? (stub as SwipeTx) : null);

  useEffect(() => {
    if (tx) return;
    let cancelled = false;
    api.transactions
      .get(stub.id)
      .then((full) => {
        if (!cancelled) setTx(full);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tx, stub.id]);

  const { t } = useTheme();
  const { pop, nav } = useNav();
  const { toast, sheet, form } = useFeedback();

  if (!tx) {
    return (
      <MPageShell title="Transaction" onBack={pop}>
        <View style={{ paddingVertical: 48, alignItems: 'center' }}>
          <ActivityIndicator color={t.text3} />
        </View>
      </MPageShell>
    );
  }

  const editTx = async () => {
    const cats = await api.categories.list();
    form({
      title: 'Edit transaction',
      fields: [
        { key: 'desc', label: 'Description', initial: tx.desc },
        { kind: 'amount', key: 'amount', label: 'Amount (₹)', initial: String(Math.abs(tx.amount)) },
        {
          kind: 'select',
          key: 'cat',
          label: 'Category',
          options: cats.map((c) => ({ label: `${c.icon} ${c.name}`, value: c.name })),
          initial: tx.cat,
        },
        { kind: 'date', key: 'date', label: 'Date', initial: tx.date.slice(0, 10) },
        { key: 'note', label: 'Note', optional: true, initial: tx.note ?? '' },
      ],
      submitLabel: 'Save changes',
      onSubmit: async (v) => {
        await api.transactions.update(tx.id, {
          desc: v['desc']!,
          amount: Number(v['amount']),
          categoryName: v['cat']!,
          date: v['date']!,
          note: v['note'] ?? '',
        });
        toast('Transaction updated', '✏️');
        pop(); // detail shows stale route data; the list re-renders fresh
      },
    });
  };

  const duplicateTx = async () => {
    try {
      await api.transactions.create({
        desc: tx.desc,
        amount: tx.amount,
        type: tx.type,
        categoryName: tx.cat,
      });
      toast('Transaction duplicated', '⧉');
      pop();
    } catch {
      toast("Couldn't duplicate — try again", '📡');
    }
  };

  const deleteTx = () => {
    sheet({
      title: 'Delete this transaction?',
      options: [
        {
          label: 'Delete',
          icon: '🗑',
          danger: true,
          onPress: () => {
            api.transactions
              .remove(tx.id)
              .then(() => {
                toast('Transaction deleted', '🗑');
                pop();
              })
              .catch(() => toast("Couldn't delete — try again", '📡'));
          },
        },
        { label: 'Cancel', onPress: () => {} },
      ],
    });
  };

  const openMoreSheet = () => {
    sheet({
      title: 'Transaction',
      options: [
        { label: 'Edit', icon: '✏️', onPress: () => void editTx() },
        { label: 'Duplicate', icon: '⧉', onPress: () => void duplicateTx() },
        { label: 'Delete', icon: '🗑', danger: true, onPress: deleteTx },
      ],
    });
  };

  // Detail rows (MobileScreens.jsx:811–818) — every value now derives from
  // the actual transaction. The prototype's hardcoded "Status: Completed"
  // row is dropped: the backend has no per-transaction status, so showing a
  // constant "Completed" for every entry was fake.
  const rows: { k: string; v: string; c?: string }[] = [
    { k: 'Category', v: tx.cat, c: tx.cCol },
    { k: 'Date', v: tx.date.slice(0, 10) },
    { k: 'Type', v: tx.type === 'inc' ? 'Income' : 'Expense' },
    { k: 'Reference', v: `TXN${String(tx.id).replace(/-/g, '').slice(0, 14).toUpperCase()}` },
  ];

  return (
    <MPageShell
      title="Transaction"
      onBack={pop}
      right={
        <TopbarActions>
          <SearchButton />
          <IconButton onPress={openMoreSheet}>
            <MI.more size={20} color={t.text1} />
          </IconButton>
        </TopbarActions>
      }
    >
      <View style={styles.heroWrap}>
        <AppIconBox value={tx.icon} color={tx.cCol} size={72} iconSize={34} />
        <Text style={[styles.desc, { color: t.text2 }]}>{tx.desc}</Text>
        <Text style={[styles.amount, { color: tx.type === 'inc' ? t.em : t.red, fontFamily: weight(700) }]}>
          {tx.amount > 0 ? '+' : ''}₹{Math.abs(tx.amount).toLocaleString('en-IN')}
        </Text>
      </View>

      <View style={styles.listWrap}>
        <ListCard>
          {rows.map((r, i) => (
            <ListRow key={r.k} last={i === rows.length - 1 && !tx.source}>
              <Text style={[styles.rowKey, { color: t.text3 }]}>{r.k}</Text>
              <Text style={[styles.rowValue, { color: r.c ?? t.text1, fontFamily: weight(600) }]}>{r.v}</Text>
            </ListRow>
          ))}
          {tx.source ? (
            <ListRow last>
              <Text style={[styles.rowKey, { color: t.text3 }]}>Source</Text>
              <SourceTag source={tx.source} />
            </ListRow>
          ) : null}
        </ListCard>
      </View>

      {tx.eventId ? (
        <View style={styles.listWrap}>
          <ListCard>
            <ListRow last onPress={() => nav('event-detail', { id: tx.eventId! })}>
              <Text style={[styles.eventLinkLabel, { color: t.text1, fontFamily: weight(600) }]}>
                View event budget
              </Text>
              <MI.arrow size={18} color={t.text3} />
            </ListRow>
          </ListCard>
        </View>
      ) : null}

      <GlassCard style={styles.noteCard}>
        <Text style={[styles.noteLabel, { color: t.text3, fontFamily: weight(600) }]}>NOTE</Text>
        <Text style={[styles.noteBody, { color: tx.note ? t.text1 : t.text2 }]}>
          {tx.note ? tx.note : 'No note. Tap Edit to add one.'}
        </Text>
      </GlassCard>

      <View style={styles.actionsRow}>
        {/* flex:1 wrappers constrain each button to half the row — Btn applies
            `style` to its inner box, not the Pressable, so flex must live here. */}
        <View style={styles.actionCol}>
          <Btn variant="ghost" onPress={() => void editTx()}>
            <View style={styles.editRow}>
              <AppIcon value="pencil" size={16} color={t.blue} />
              <Text style={[styles.deleteLabel, { color: t.blue, fontFamily: weight(600) }]}>Edit</Text>
            </View>
          </Btn>
        </View>
        <View style={styles.actionCol}>
          <Btn variant="ghost" onPress={deleteTx}>
            <Text style={[styles.deleteLabel, { color: t.red, fontFamily: weight(600) }]}>Delete</Text>
          </Btn>
        </View>
      </View>
    </MPageShell>
  );
}

const styles = StyleSheet.create({
  heroWrap: {
    alignItems: 'center',
    paddingVertical: space[18],
    paddingBottom: space[24],
    gap: space[14],
  },
  desc: {
    fontSize: 13,
    marginBottom: space[6],
  },
  amount: {
    fontSize: 38,
    letterSpacing: -1.14, // -0.03em of 38px
  },
  listWrap: {
    marginBottom: space[14],
  },
  rowKey: {
    flex: 1,
    fontSize: 13,
  },
  rowValue: {
    fontSize: 13,
    textAlign: 'right',
  },
  eventLinkLabel: {
    flex: 1,
    fontSize: 13,
  },
  noteCard: {
    marginBottom: space[14],
  },
  noteLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.88, // 0.08em of 11px
    marginBottom: space[6],
  },
  noteBody: {
    fontSize: 13,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: space[10],
  },
  actionCol: {
    flex: 1,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[6],
  },
  deleteLabel: {
    fontSize: 15,
  },
});
