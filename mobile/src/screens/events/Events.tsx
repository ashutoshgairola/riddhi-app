/**
 * Events — RN port of `project/riddhi/MobileEvents.jsx` (the `MobileEvents`
 * list component, lines 394–483). Follows `Goals.tsx`'s list-of-progress-
 * cards shape: `PageBackground` + `Topbar` (title + plus icon button) +
 * `SpringIn`-staggered `GlassView` cards, each with a top accent bar and a
 * `ProgressBar` fill.
 *
 * Building blocks reused rather than reimplemented:
 *  - `PageBackground` for the `.m-page` gradient + glow.
 *  - `Topbar` for the `.m-topbar` title + plus icon button.
 *  - `IconButton` for the plus button.
 *  - `GlassView` (`.m-card`) for the empty-state and each event card (not
 *    `GlassCard`, so the accent bar can sit flush at the card's top edge —
 *    same reasoning as `Goals.tsx`'s `goalCard`).
 *  - `ProgressBar` (`.m-pbar`/`.m-pfill`, height 8) for each event's fill.
 *  - `Btn` for the empty-state "New event" button.
 *  - `SpringIn` for the staggered card entrance (MobileEvents.jsx's
 *    `m-spring` + `animationDelay`).
 *  - `CreateEventSheet` (Task 8) for the create flow.
 *
 * Source values transcribed verbatim:
 *  - Subtitle: "{n} event(s) · {paid} spent of {budget} planned" —
 *    MobileEvents.jsx:427 (singular/plural via `events.length === 1`).
 *  - Empty state: 🎉 "Plan your first event" / explainer / "New event"
 *    button — MobileEvents.jsx:431–437.
 *  - Per-event pct/over/barColor math — MobileEvents.jsx:443–445.
 *  - Card layout: accent bar (`ev.color`, height 3), 50×50 emoji tile,
 *    name, "🗓 {date}" + "{paidCount}/{count} paid", 8px progress bar,
 *    "{paid} / {budget}" and right-aligned "{left}"/"⚠ over by {amt}" —
 *    MobileEvents.jsx:446–473.
 *  - `evFmtK` — MobileStore.jsx:32, ported as a local helper (matching
 *    `EventDetail.tsx`'s own local copy — no shared money-formatting
 *    module exists in `mobile/src/lib/` yet).
 */
import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { GlassView } from '../../components/Glass';
import { Btn, IconButton, ProgressBar, Topbar } from '../../components/ui';
import { MI } from '../../components/icons';
import { AppIcon, AppIconBox } from '../../components/contentIcons';
import { PageBackground } from '../../components/PageBackground';
import { SpringIn } from '../../components/SpringIn';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, weight } from '../../theme/tokens';
import { useNav, type ScreenEntry } from '../../app/navContext';
import { api } from '../../api';
import { useApiData } from '../../api/useApi';
import { CreateEventSheet } from './CreateEventSheet';
import type { EventView, NewEventInput } from '../../api/types';

const EMPTY_EVENTS: EventView[] = [];

// evFmtK — MobileStore.jsx:32 (mirrors EventDetail.tsx's local copy).
function evFmtK(n: number): string {
  const a = Math.abs(n);
  if (a >= 100000) return `₹${(a / 100000).toFixed(2)}L`;
  if (a >= 1000) return `₹${(a / 1000).toFixed(a % 1000 ? 1 : 0)}K`;
  return `₹${a}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Parse a stored 'YYYY-MM-DD' as a *local* date (mirrors
// CreateEventSheet.tsx's `parseYMD`, duplicated here since that helper
// isn't exported).
function parseYMD(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

// Friendly display label for a stored `YYYY-MM-DD` date (mirrors
// CreateEventSheet.tsx's `displayDate`).
function displayDate(s: string): string | null {
  const d = parseYMD(s);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : null;
}

export function Events({ entry }: { entry: ScreenEntry }) {
  const { t } = useTheme();
  const { nav } = useNav();
  const [scrolled, setScrolled] = useState(false);

  const { data: events } = useApiData(() => api.events.list(), EMPTY_EVENTS);

  const [createOpen, setCreateOpen] = useState(Boolean(entry.data?.autoCreate));

  // Honor a FAB "Plan an event" intent (MobileEvents.jsx:399, Task 11).
  useEffect(() => {
    if (entry.data?.autoCreate) setCreateOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.data?.autoCreate]);

  const totalPaid = events.reduce((s, e) => s + e.paid, 0);
  const totalBudget = events.reduce((s, e) => s + e.budget, 0);
  const subtitle = `${events.length} ${events.length === 1 ? 'event' : 'events'} · ${evFmtK(totalPaid)} spent of ${evFmtK(totalBudget)} planned`;

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrolled(e.nativeEvent.contentOffset.y > 8);
  };

  const handleCreate = async (input: NewEventInput) => {
    const created = await api.events.create(input);
    nav('event-detail', { id: created.id });
  };

  return (
    <View style={styles.page}>
      <PageBackground />

      <Topbar
        title="Events"
        scrolled={scrolled}
        right={
          <IconButton onPress={() => setCreateOpen(true)}>
            <MI.plus size={20} color={t.text1} />
          </IconButton>
        }
      />

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <SpringIn>
          <Text style={[styles.subtitle, { color: t.text2 }]}>{subtitle}</Text>
        </SpringIn>

        {events.length === 0 ? (
          <SpringIn>
            <GlassView style={styles.emptyCard} radius={radius.xl} padding={0}>
              <View style={styles.emptyCardBody}>
                <AppIcon value="party" size={34} color={t.em} />
                <Text style={[styles.emptyTitle, { color: t.text1, fontFamily: weight(700) }]}>
                  Plan your first event
                </Text>
                <Text style={[styles.emptySubtitle, { color: t.text3 }]}>
                  Birthdays, weddings, trips — break the cost into a payable checklist and track
                  every rupee.
                </Text>
                <Btn variant="em" onPress={() => setCreateOpen(true)} style={styles.emptyBtn}>
                  New event
                </Btn>
              </View>
            </GlassView>
          </SpringIn>
        ) : null}

        <View style={styles.eventList}>
          {events.map((ev, i) => {
            const pct = ev.budget > 0 ? Math.round((ev.paid / ev.budget) * 100) : 0;
            const over = ev.projected > ev.budget;
            const barColor = over ? t.red : pct >= 85 ? t.amber : ev.color;
            const dateLabel = ev.date ? displayDate(ev.date) : null;

            return (
              <SpringIn key={ev.id} delay={50 + i * 50}>
                <Pressable onPress={() => nav('event-detail', { id: ev.id })}>
                  <GlassView style={styles.eventCard} intensity={40} radius={radius.xl} padding={0}>
                    <View style={[styles.accentBar, { backgroundColor: ev.color }]} />
                    <View style={styles.eventCardBody}>
                      <View style={styles.eventHeaderRow}>
                        <AppIconBox value={ev.emoji} color={ev.color} size={50} iconSize={24} />
                        <View style={styles.eventTextBlock}>
                          <Text
                            style={[styles.eventName, { color: t.text1, fontFamily: weight(700) }]}
                            numberOfLines={1}
                          >
                            {ev.name}
                          </Text>
                          <View style={styles.eventMetaRow}>
                            {dateLabel ? (
                              <View style={styles.eventMetaChipRow}>
                                <AppIcon value="calendar2" size={16} color={ev.color} />
                                <Text style={[styles.eventMetaText, { color: t.text3 }]}>{dateLabel}</Text>
                              </View>
                            ) : null}
                            <Text style={[styles.eventMetaText, { color: t.text3 }]}>
                              {ev.paidCount}/{ev.count} paid
                            </Text>
                          </View>
                        </View>
                        <MI.arrow size={18} color={t.text3} />
                      </View>

                      <ProgressBar pct={pct} color={barColor} height={8} />

                      <View style={styles.eventAmountRow}>
                        <Text style={[styles.eventPaid, { color: t.text1, fontFamily: weight(700) }]}>
                          {evFmtK(ev.paid)}{' '}
                          <Text style={[styles.eventBudget, { color: t.text3 }]}>
                            / {evFmtK(ev.budget)}
                          </Text>
                        </Text>
                        {over ? (
                          <View style={styles.eventOverRow}>
                            <AppIcon value="warn" size={16} color={t.red} />
                            <Text style={[styles.eventLeftOrOver, { color: t.red }]}>
                              over by {evFmtK(ev.projected - ev.budget)}
                            </Text>
                          </View>
                        ) : (
                          <Text style={[styles.eventLeftOrOver, { color: t.text2 }]}>
                            {evFmtK(ev.budget - ev.paid)} left
                          </Text>
                        )}
                      </View>
                    </View>
                  </GlassView>
                </Pressable>
              </SpringIn>
            );
          })}
        </View>
      </ScrollView>

      <CreateEventSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
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
  subtitle: {
    fontSize: 13,
    marginTop: 8,
    marginBottom: 16,
  },

  // Empty state
  emptyCard: {
    overflow: 'hidden',
  },
  emptyCardBody: {
    paddingVertical: 36,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 12.5,
    marginTop: 5,
    lineHeight: 18,
    textAlign: 'center',
  },
  emptyBtn: {
    marginTop: 16,
  },

  // Event list/cards
  eventList: {
    flexDirection: 'column',
    gap: 14,
  },
  eventCard: {
    position: 'relative',
    overflow: 'hidden',
  },
  eventCardBody: {
    padding: 18,
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  eventHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginBottom: 14,
  },
  eventTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  eventName: {
    fontSize: 16,
  },
  eventMetaRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 3,
  },
  eventMetaChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  eventMetaText: {
    fontSize: 11.5,
  },
  eventAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 10,
  },
  eventPaid: {
    fontSize: 15,
  },
  eventBudget: {
    fontSize: 12,
    fontWeight: '600',
  },
  eventOverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  eventLeftOrOver: {
    fontSize: 11.5,
    fontWeight: '600',
  },
});
