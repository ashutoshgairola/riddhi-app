/**
 * Search — RN port of `project/riddhi/MobileScreens.jsx` (the
 * `MobileSearch` component, lines 723–788), the full-screen command
 * palette. Unlike the other three screens in this batch, this is NOT built
 * on `MPageShell` — the source hand-rolls its own `.m-topbar` containing an
 * inline search input rather than a title, so this screen composes
 * `PageBackground` + a custom topbar + `ScrollView` body directly, mirroring
 * `MPageShell`'s internal shape without its title-bar API.
 *
 * Building blocks reused rather than reimplemented:
 *  - `PageBackground` for the `.m-page` gradient + glow.
 *  - `IconButton` for the back button.
 *  - `MI.search`/`MI.arrow` icons.
 *  - `SectionHead` for the "Recent"/"Pages"/"Jump to" section titles.
 *  - `ListCard`/`ListRow` for both the recent list and the page-matches
 *    list.
 *  - `useNav().pop`/`.nav` — back button pops; tapping a page match
 *    navigates via `nav(p.id)` (MobileScreens.jsx:777).
 *
 * Source values transcribed verbatim:
 *  - `pages` — MobileScreens.jsx:728–737.
 *  - `recent` — MobileScreens.jsx:738–743.
 *  - autofocus after 100ms — MobileScreens.jsx:726.
 *  - `matches` filter: `q ? pages.filter(p => p.l.toLowerCase().includes(q.toLowerCase())) : pages`
 *    — MobileScreens.jsx:744.
 *  - "Recent" section only rendered when `!q` — MobileScreens.jsx:760–773.
 *  - Section title: `q ? 'Pages' : 'Jump to'` — MobileScreens.jsx:774.
 *  - Clear (×) button shown only when `q` — MobileScreens.jsx:755.
 */
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton, ListCard, ListRow, SectionHead } from '../components/ui';
import { AppIconBox } from '../components/contentIcons';
import { MI } from '../components/icons';
import { PageBackground } from '../components/PageBackground';
import { useTheme } from '../theme/ThemeProvider';
import { space, weight } from '../theme/tokens';
import { useNav, type ScreenEntry, type ScreenKind } from '../app/navContext';
import { api } from '../api';
import { useApiData } from '../api/useApi';
import type { TxView } from '../api/types';

// ── Data (MobileScreens.jsx:728–737) ─────────────────────────────────
interface SearchPage {
  id: ScreenKind;
  l: string;
  i: string;
  c: string;
}

// `i` values are icon-system names/emoji resolved by `AppIconBox` (see
// render site below). `◈`/`↕`/`◎` are not in the emoji→name table
// (`M_EMOJI` in contentIcons.data.ts), so those three carry explicit
// ICON_LIST names instead of the source's glyphs; the rest resolve as
// legacy emoji.
const PAGES: SearchPage[] = [
  { id: 'home', l: 'Home', i: 'home2', c: '#7faf93' },
  { id: 'txns', l: 'Transactions', i: 'ledger', c: '#8197c4' },
  { id: 'budgets', l: 'Budgets', i: 'wallet', c: '#c9a86a' },
  { id: 'goals', l: 'Goals', i: '⊙', c: '#9d8bd6' },
  { id: 'invest', l: 'Investments', i: '▲', c: '#7faf93' },
  { id: 'reports', l: 'Reports', i: '≋', c: '#6fb3ad' },
  { id: 'accounts', l: 'Accounts', i: '💳', c: '#8197c4' },
  { id: 'settings', l: 'Settings', i: '⚙', c: '#8a8299' },
];

// Autofocus delay (MobileScreens.jsx:726).
const AUTOFOCUS_DELAY_MS = 100;

// Renders empty while the api loads (or is unreachable) — no mock data.
const EMPTY_TXNS: TxView[] = [];

function fmtAmount(n: number): string {
  return `${n > 0 ? '+' : '−'}₹${Math.abs(n).toLocaleString('en-IN')}`;
}

export function Search({ entry: _entry }: { entry: ScreenEntry }) {
  const { t } = useTheme();
  const { pop, nav, push } = useNav();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), AUTOFOCUS_DELAY_MS);
    return () => clearTimeout(id);
  }, []);

  // Debounce the query so we don't fire a request on every keystroke.
  const [dq, setDq] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDq(q.trim()), 220);
    return () => clearTimeout(id);
  }, [q]);

  const ql = q.trim().toLowerCase();

  // Recent transactions for the empty (no-query) state.
  const { data: recentTxns } = useApiData(() => api.transactions.list({ limit: 8 }), EMPTY_TXNS);

  // Server-side search across ALL history (matches the description) — no
  // longer capped at the latest 100. Only runs when there's a query.
  const { data: txMatches } = useApiData(
    () => (dq ? api.transactions.list({ search: dq, limit: 50 }) : Promise.resolve(EMPTY_TXNS)),
    EMPTY_TXNS,
    [dq],
  );

  // Page (nav destination) matches.
  const matches = ql ? PAGES.filter((p) => p.l.toLowerCase().includes(ql)) : PAGES;

  const openTx = (tx: TxView) => push({ kind: 'tx-detail', data: tx });

  const renderTxRow = (tx: TxView, last: boolean) => (
    <ListRow key={tx.id} last={last} onPress={() => openTx(tx)}>
      <View style={[styles.txIconBox, { backgroundColor: tx.cCol + '22' }]}>
        <Text style={styles.txIconGlyph}>{tx.icon}</Text>
      </View>
      <View style={styles.txTextBlock}>
        <Text style={[styles.txDesc, { color: t.text1, fontFamily: weight(600) }]} numberOfLines={1}>
          {tx.desc}
        </Text>
        <Text style={[styles.txCat, { color: t.text3 }]} numberOfLines={1}>
          {tx.cat}
        </Text>
      </View>
      <Text
        style={[styles.txAmount, { color: tx.amount > 0 ? t.em : t.red, fontFamily: weight(700) }]}
      >
        {fmtAmount(tx.amount)}
      </Text>
    </ListRow>
  );

  return (
    <View style={styles.page}>
      <PageBackground />

      <View style={[styles.topbar, { paddingTop: insets.top + 14 }]}>
        <IconButton onPress={pop}>
          <MI.back size={20} color={t.text1} />
        </IconButton>
        <View style={[styles.searchBox, { backgroundColor: t.bg2, borderColor: t.border }]}>
          <MI.search size={16} color={t.text3} />
          <TextInput
            ref={inputRef}
            value={q}
            onChangeText={setQ}
            placeholder="Search anything…"
            placeholderTextColor={t.text3}
            style={[styles.searchInput, { color: t.text1, fontFamily: weight(400) }]}
          />
          {q ? (
            <Text onPress={() => setQ('')} style={[styles.clearBtn, { color: t.text3 }]}>
              ×
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.scrollContent}>
          {!q && recentTxns.length > 0 && (
            <>
              <SectionHead title="Recent" />
              <View style={styles.recentWrap}>
                <ListCard>
                  {recentTxns.map((tx, i) => renderTxRow(tx, i === recentTxns.length - 1))}
                </ListCard>
              </View>
            </>
          )}

          {q && txMatches.length > 0 && (
            <>
              <SectionHead title="Transactions" />
              <View style={styles.recentWrap}>
                <ListCard>
                  {txMatches.map((tx, i) => renderTxRow(tx, i === txMatches.length - 1))}
                </ListCard>
              </View>
            </>
          )}

          <SectionHead title={q ? 'Pages' : 'Jump to'} />
          <ListCard>
            {matches.map((p, i) => (
              <ListRow key={p.id} last={i === matches.length - 1} onPress={() => nav(p.id)}>
                <AppIconBox value={p.i} color={p.c} size={36} iconSize={16} />
                <Text style={[styles.pageLabel, { color: t.text1, fontFamily: weight(600) }]} numberOfLines={1}>
                  {p.l}
                </Text>
                <MI.arrow size={18} color={t.text3} />
              </ListRow>
            ))}
          </ListCard>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[10],
    paddingTop: space[14],
    paddingHorizontal: space[18],
    paddingBottom: space[12],
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[8],
    borderRadius: 12,
    paddingHorizontal: space[14],
    height: 42,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  clearBtn: {
    fontSize: 18,
  },
  body: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: space[12],
    paddingHorizontal: space[18],
    paddingBottom: space[32],
  },
  recentWrap: {
    marginBottom: space[18],
  },
  txIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txIconGlyph: {
    fontSize: 17,
  },
  txTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  txDesc: {
    fontSize: 14,
  },
  txCat: {
    fontSize: 11.5,
    marginTop: space[2],
  },
  txAmount: {
    fontSize: 13,
  },
  pageLabel: {
    flex: 1,
    fontSize: 14,
  },
});
