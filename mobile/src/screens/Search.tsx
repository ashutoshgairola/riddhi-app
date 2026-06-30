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

import { IconButton, ListCard, ListRow, SectionHead } from '../components/ui';
import { MI } from '../components/icons';
import { PageBackground } from '../components/PageBackground';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { useNav, type ScreenEntry, type ScreenKind } from '../app/navContext';

// ── Data (MobileScreens.jsx:728–737) ─────────────────────────────────
interface SearchPage {
  id: ScreenKind;
  l: string;
  i: string;
  c: string;
}

const PAGES: SearchPage[] = [
  { id: 'home', l: 'Home', i: '◈', c: '#7faf93' },
  { id: 'txns', l: 'Transactions', i: '↕', c: '#8197c4' },
  { id: 'budgets', l: 'Budgets', i: '◎', c: '#c9a86a' },
  { id: 'goals', l: 'Goals', i: '⊙', c: '#9d8bd6' },
  { id: 'invest', l: 'Investments', i: '▲', c: '#7faf93' },
  { id: 'reports', l: 'Reports', i: '≋', c: '#6fb3ad' },
  { id: 'accounts', l: 'Accounts', i: '💳', c: '#8197c4' },
  { id: 'settings', l: 'Settings', i: '⚙', c: '#8a8299' },
];

// ── Data (MobileScreens.jsx:738–743) ──────────────────────────────────
const RECENT: { l: string; a: string; colorKey: 'em' | 'red' }[] = [
  { l: 'Salary — April 2026', a: '+₹1,18,000', colorKey: 'em' },
  { l: 'Rent — April', a: '-₹28,000', colorKey: 'red' },
  { l: 'Swiggy Order', a: '-₹649', colorKey: 'red' },
  { l: 'SIP — Nifty 50 ETF', a: '-₹10,000', colorKey: 'red' },
];

// Autofocus delay (MobileScreens.jsx:726).
const AUTOFOCUS_DELAY_MS = 100;

export function Search({ entry: _entry }: { entry: ScreenEntry }) {
  const { t } = useTheme();
  const { pop, nav } = useNav();
  const [q, setQ] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), AUTOFOCUS_DELAY_MS);
    return () => clearTimeout(id);
  }, []);

  // matches (MobileScreens.jsx:744) — verbatim.
  const matches = q ? PAGES.filter((p) => p.l.toLowerCase().includes(q.toLowerCase())) : PAGES;

  return (
    <View style={styles.page}>
      <PageBackground />

      <View style={styles.topbar}>
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
          {!q && (
            <>
              <SectionHead title="Recent" />
              <View style={styles.recentWrap}>
                <ListCard>
                  {RECENT.map((r, i) => (
                    <ListRow key={i} last={i === RECENT.length - 1}>
                      <View style={[styles.recentIconBox, { backgroundColor: t.bg3 }]}>
                        <Text style={[styles.recentIconGlyph, { color: t.text3 }]}>↻</Text>
                      </View>
                      <Text style={[styles.recentLabel, { color: t.text1, fontFamily: weight(600) }]} numberOfLines={1}>
                        {r.l}
                      </Text>
                      <Text
                        style={[
                          styles.recentAmount,
                          { color: r.colorKey === 'em' ? t.em : t.red, fontFamily: weight(700) },
                        ]}
                      >
                        {r.a}
                      </Text>
                    </ListRow>
                  ))}
                </ListCard>
              </View>
            </>
          )}

          <SectionHead title={q ? 'Pages' : 'Jump to'} />
          <ListCard>
            {matches.map((p, i) => (
              <ListRow key={p.id} last={i === matches.length - 1} onPress={() => nav(p.id)}>
                <View style={[styles.pageIconBox, { backgroundColor: p.c + '22' }]}>
                  <Text style={[styles.pageIconGlyph, { color: p.c, fontFamily: weight(700) }]}>{p.i}</Text>
                </View>
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
    gap: 10,
    paddingTop: 14,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 14,
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
    paddingTop: 12,
    paddingHorizontal: 18,
    paddingBottom: 30,
  },
  recentWrap: {
    marginBottom: 18,
  },
  recentIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentIconGlyph: {
    fontSize: 14,
  },
  recentLabel: {
    flex: 1,
    fontSize: 14,
  },
  recentAmount: {
    fontSize: 13,
  },
  pageIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageIconGlyph: {
    fontSize: 15,
  },
  pageLabel: {
    flex: 1,
    fontSize: 14,
  },
});
