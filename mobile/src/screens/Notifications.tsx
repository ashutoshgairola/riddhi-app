/**
 * Notifications — RN port of `project/riddhi/MobileScreens.jsx` (the
 * `MobileNotifPage` component, lines 670–718), including its local data
 * array `all` (lines 672–680).
 *
 * Building blocks reused rather than reimplemented:
 *  - `MPageShell` for the `.m-page`/`.m-topbar`(back+title+right)/`.m-body`
 *    scaffold.
 *  - `IconButton` for the more button.
 *  - `HScroll` + `Chip` for the filter chip row (MobileScreens.jsx:689–696).
 *  - `useFeedback().sheet`/`.toast` for the more-button action sheet
 *    (MobileScreens.jsx:684–687).
 *  - `useNav().pop`/`.nav` for the back button and "Notification settings"
 *    sheet option (which navigates to `'settings'`).
 *
 * Source values transcribed verbatim:
 *  - `all` notifications data — MobileScreens.jsx:672–680.
 *  - Filter logic: `filter==='all'` -> all, `filter==='unread'` ->
 *    `n.unread`, else -> `n.type===filter` — MobileScreens.jsx:681.
 *  - Filter chip set (all/unread/budget/goal/tx/report/security) —
 *    MobileScreens.jsx:690–692.
 *  - Card: unread -> `bg-2` background + emphasis dot (top-right);
 *    icon box (`n.color`+'22'); title bold (700) when unread else 600;
 *    body; time — MobileScreens.jsx:698–712.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Chip, HScroll, IconButton, SearchButton, TopbarActions } from '../components/ui';
import { MI } from '../components/icons';
import { SpringIn } from '../components/SpringIn';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useNav, type ScreenEntry } from '../app/navContext';
import { api } from '../api';
import { useApiData } from '../api/useApi';
import { MPageShell } from './_MPageShell';

// ── Data (MobileScreens.jsx:672–680) ─────────────────────────────────
type NotifType = 'budget' | 'goal' | 'tx' | 'report' | 'security';

interface Notification {
  icon: string;
  title: string;
  body: string;
  time: string;
  color: string;
  unread: boolean;
  type: NotifType;
}

// Renders empty while the api loads (or is unreachable) — no mock data.
const ALL_NOTIFS: Notification[] = [];

type FilterValue = 'all' | 'unread' | NotifType;

const FILTER_CHIPS: { v: FilterValue; l: string }[] = [
  { v: 'all', l: 'All' },
  { v: 'unread', l: 'Unread' },
  { v: 'budget', l: 'Budgets' },
  { v: 'goal', l: 'Goals' },
  { v: 'tx', l: 'Transactions' },
  { v: 'report', l: 'Reports' },
  { v: 'security', l: 'Security' },
];

export function Notifications({ entry: _entry }: { entry: ScreenEntry }) {
  const { t } = useTheme();
  const { pop, nav } = useNav();
  const { toast, sheet } = useFeedback();
  const [filter, setFilter] = useState<FilterValue>('all');

  const { data: notifs } = useApiData(() => api.notifications.list(), ALL_NOTIFS);

  // Filter logic (MobileScreens.jsx:681) — verbatim.
  const filtered =
    filter === 'all' ? notifs : filter === 'unread' ? notifs.filter((n) => n.unread) : notifs.filter((n) => n.type === filter);

  const openMoreSheet = () => {
    sheet({
      title: 'Notifications',
      options: [
        {
          label: 'Mark all as read',
          icon: '✓',
          onPress: () => {
            api.notifications
              .markAllRead()
              .then(() => toast('All marked read', '✓'))
              .catch(() => toast("Couldn't mark all read", '📡'));
          },
        },
        { label: 'Notification settings', icon: '⚙️', onPress: () => nav('settings') },
      ],
    });
  };

  return (
    <MPageShell
      title="Notifications"
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
      <View style={styles.hscrollWrap}>
        <HScroll>
          {FILTER_CHIPS.map((c) => (
            <Chip key={c.v} on={filter === c.v} onPress={() => setFilter(c.v)}>
              {c.l}
            </Chip>
          ))}
        </HScroll>
      </View>

      <View style={styles.list}>
        {filtered.map((n, i) => (
          // animationDelay: `${i*0.03}s` (MobileScreens.jsx:699)
          <SpringIn key={i} delay={i * 30}>
            <View
              style={[
                styles.card,
                { backgroundColor: n.unread ? t.bg2 : t.bg1, borderColor: t.border },
              ]}
            >
              {n.unread && <View style={[styles.unreadDot, { backgroundColor: t.em }]} />}
              <View style={[styles.iconBox, { backgroundColor: n.color + '22' }]}>
                <Text style={styles.iconGlyph}>{n.icon}</Text>
              </View>
              <View style={styles.textBlock}>
                <Text
                  style={[styles.title, { color: t.text1, fontFamily: weight(n.unread ? 700 : 600) }]}
                  numberOfLines={2}
                >
                  {n.title}
                </Text>
                <Text style={[styles.body, { color: t.text2 }]}>{n.body}</Text>
                <Text style={[styles.time, { color: t.text3 }]}>{n.time}</Text>
              </View>
            </View>
          </SpringIn>
        ))}
      </View>
    </MPageShell>
  );
}

const styles = StyleSheet.create({
  hscrollWrap: {
    marginBottom: 14,
  },
  list: {
    flexDirection: 'column',
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderRadius: 14,
    position: 'relative',
  },
  unreadDot: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 7,
    height: 7,
    borderRadius: 99,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconGlyph: {
    fontSize: 18,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 13.5,
    marginBottom: 3,
  },
  body: {
    fontSize: 12,
    lineHeight: 16.8, // 1.4 of 12px
  },
  time: {
    fontSize: 11,
    marginTop: 4,
  },
});
