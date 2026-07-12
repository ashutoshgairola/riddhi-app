/**
 * CreateEventSheet — template picker + basics for creating a new event.
 *
 * Source of truth: project/riddhi/MobileEvents.jsx:119–218. Built as a
 * custom `BottomSheet` body (2-col template grid, custom-emoji picker, text
 * + date + amount inputs) following `AddTxSheet.tsx`'s structure rather than
 * `useFeedback().form()` — the template grid and conditional emoji picker
 * aren't expressible as a flat field-spec list.
 *
 * Date field: the prototype used a free-text "e.g. 18 Jul" input
 * (MobileEvents.jsx:202); this port instead uses the app's themed
 * `CalendarPicker` (mobile/src/components/CalendarPicker.tsx) — the same
 * component `FormSheet`'s `kind: 'date'` field wraps (see its `DateField`
 * helper) — so `date` is stored as a `YYYY-MM-DD` string, matching how every
 * other date field in the app persists dates (e.g. Goals.tsx's `targetDate`).
 */
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Svg, { Polyline } from 'react-native-svg';

import { BottomSheet } from '../../components/BottomSheet';
import { CalendarPicker, type Anchor } from '../../components/CalendarPicker';
import { CalendarRangePicker } from '../../components/CalendarRangePicker';
import { AppIcon, AppIconBox } from '../../components/contentIcons';
import { useIconPicker } from '../../components/IconPickerSheet';
import { Btn } from '../../components/ui';
import { useFeedback } from '../../feedback/FeedbackProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, weight } from '../../theme/tokens';
import { spacing } from '../../theme/spacing';
import { EV_TEMPLATES, seedFromTemplate } from './templates';
import { parseYMD, toYMD, formatRange } from './eventDates';
import type { NewEventInput } from '../../api/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function displayDate(s: string): string | null {
  const d = parseYMD(s);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : null;
}

const DEFAULT_TEMPLATE_KEY = 'birthday';
const DEFAULT_EMOJI = '✨';

/**
 * Swatch palette for the custom-event colour picker. Leads with the custom
 * template's own colour (`#b6a4f3`) so the initial selection matches a swatch,
 * then a spread mirroring the other templates + the app's category swatches —
 * same idea as `FormSheet`'s `CATEGORY_COLORS` (categories pick icon + colour).
 */
const EVENT_COLORS = [
  '#b6a4f3', '#c97d8c', '#c9a86a', '#6fb3ad',
  '#9d8bd6', '#e0a878', '#6fc0b0', '#7f9fc9',
];

/** Kept in sync with `BottomSheet`'s slide duration so the wrapping Modal
 * survives the exit animation before unmounting (see `IconPickerSheet`). */
const SLIDE_OUT_MS = 350;

export function CreateEventSheet({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: NewEventInput) => void | Promise<void>;
}) {
  const { t } = useTheme();
  const { toast } = useFeedback();
  const { pick, sheet } = useIconPicker();

  const [tpl, setTpl] = useState(DEFAULT_TEMPLATE_KEY);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [budget, setBudget] = useState('');
  const [emoji, setEmoji] = useState(DEFAULT_EMOJI);
  const [color, setColor] = useState(EVENT_COLORS[0]);

  const [dateOpen, setDateOpen] = useState(false);
  const [dateAnchor, setDateAnchor] = useState<Anchor | null>(null);
  const dateRowRef = useRef<View>(null);

  const [multiDay, setMultiDay] = useState(false);
  const [endDate, setEndDate] = useState('');
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeAnchor, setRangeAnchor] = useState<Anchor | null>(null);
  const rangeRowRef = useRef<View>(null);

  const template = EV_TEMPLATES.find((tp) => tp.key === tpl) ?? EV_TEMPLATES[0];
  const isCustom = tpl === 'custom';
  // Custom events use the picked colour; templates keep their own accent.
  const accent = isCustom ? color : template.color;

  // Reset on open — MobileEvents.jsx:129–131.
  useEffect(() => {
    if (!open) return;
    setTpl(DEFAULT_TEMPLATE_KEY);
    setName('');
    setDate('');
    setBudget('');
    setEmoji(DEFAULT_EMOJI);
    setColor(EVENT_COLORS[0]);
    setMultiDay(false);
    setEndDate('');
  }, [open]);

  // Seed budget (and reset emoji for `custom`) whenever the template changes
  // — MobileEvents.jsx:133–136.
  useEffect(() => {
    const found = EV_TEMPLATES.find((tp) => tp.key === tpl);
    if (found) {
      setBudget(String(found.budget));
      setColor(found.color);
      if (found.key === 'custom') setEmoji(DEFAULT_EMOJI);
    }
  }, [tpl]);

  // Keep the wrapping Modal alive through the sheet's slide-out (see the Modal
  // note on the return below).
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const id = setTimeout(() => setMounted(false), SLIDE_OUT_MS);
    return () => clearTimeout(id);
  }, [open]);

  const openDatePicker = () => {
    Keyboard.dismiss();
    if (dateRowRef.current) {
      dateRowRef.current.measureInWindow((x, y, w, h) => {
        setDateAnchor({ x, y, w, h });
        setDateOpen(true);
      });
    } else {
      setDateAnchor(null);
      setDateOpen(true);
    }
  };

  const openRangePicker = () => {
    Keyboard.dismiss();
    if (rangeRowRef.current) {
      rangeRowRef.current.measureInWindow((x, y, w, h) => {
        setRangeAnchor({ x, y, w, h });
        setRangeOpen(true);
      });
    } else {
      setRangeAnchor(null);
      setRangeOpen(true);
    }
  };

  // MobileEvents.jsx:139–148 (`create`). Awaits `onCreate` (mirrors
  // AddTxSheet.tsx's `save`) so a failed create toasts and leaves the sheet
  // open for retry instead of closing (and navigating) silently.
  const create = async () => {
    if (multiDay && (!date || !endDate)) return; // need a full range
    const seed = seedFromTemplate(template);
    try {
      await onCreate({
        ...seed,
        name: name.trim() || template.name,
        date: date || undefined,
        multiDay,
        endDate: multiDay ? endDate || undefined : undefined,
        budget: Number(budget) || template.budget,
        emoji: isCustom ? emoji : template.emoji,
        color: accent,
      });
      onClose();
    } catch {
      toast("Couldn't create event", '⚠️');
    }
  };

  const dateLabel = displayDate(date);
  const currentDate = parseYMD(date) ?? new Date();

  if (!mounted) return null;

  return (
    // The sheet is opened from *inside* the Events screen, which lives in a
    // clipped (`overflow: hidden`) stage that sits above the tab bar — an
    // in-tree `BottomSheet` there renders clipped and leaves the tab bar
    // exposed. A transparent native Modal hoists it to the top window layer so
    // it covers the whole screen (tab bar included), the same escape hatch
    // `IconPickerSheet`/`CalendarPicker` use. `GestureHandlerRootView` restores
    // the drag-to-dismiss handle, which a native Modal renders outside of.
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <BottomSheet open={open} onClose={onClose} title="New event">
      <View style={styles.body}>
        <Text style={[styles.label, { color: t.text3, fontFamily: weight(600) }]}>
          START FROM A TEMPLATE
        </Text>
        <View style={styles.templateGrid}>
          {EV_TEMPLATES.map((tp) => {
            const on = tp.key === tpl;
            const glyph = tp.key === 'custom' && on ? emoji : tp.emoji;
            return (
              <Pressable
                key={tp.key}
                onPress={() => setTpl(tp.key)}
                style={[
                  styles.templateCard,
                  {
                    backgroundColor: on ? `${tp.color}1f` : t.bg2,
                    borderColor: on ? tp.color : t.border,
                  },
                ]}
              >
                <AppIconBox value={glyph} color={tp.color} size={36} iconSize={18} />
                <View style={styles.templateTextWrap}>
                  <Text
                    style={[styles.templateName, { color: t.text1, fontFamily: weight(700) }]}
                    numberOfLines={1}
                  >
                    {tp.name}
                  </Text>
                  <Text style={[styles.templateSub, { color: t.text3, fontFamily: weight(500) }]}>
                    {tp.items.length ? `${tp.items.length} items` : 'blank'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {isCustom ? (
          <View style={styles.emojiSection}>
            <Text style={[styles.label, { color: t.text3, fontFamily: weight(600) }]}>
              PICK AN ICON
            </Text>
            <Pressable
              onPress={() =>
                pick({ value: emoji, color: accent, title: 'Choose icon', onPick: setEmoji })
              }
              style={[styles.iconPickRow, { backgroundColor: t.bg2, borderColor: t.border }]}
            >
              <AppIconBox value={emoji} color={accent} size={40} iconSize={20} />
              <Text style={[styles.iconPickLabel, { color: t.text1, fontFamily: weight(600) }]}>
                Change icon
              </Text>
            </Pressable>

            <Text style={[styles.label, { color: t.text3, fontFamily: weight(600), marginTop: spacing.md }]}>
              PICK A COLOUR
            </Text>
            <View style={styles.swatchRow}>
              {EVENT_COLORS.map((hex) => {
                const on = color.toLowerCase() === hex.toLowerCase();
                return (
                  <Pressable
                    key={hex}
                    onPress={() => setColor(hex)}
                    style={[
                      styles.swatch,
                      { backgroundColor: hex, borderWidth: on ? 3 : 1, borderColor: on ? t.text1 : t.border },
                    ]}
                  >
                    {on ? <AppIcon value="check" size={16} color="#ffffff" /> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <Text style={[styles.label, { color: t.text3, fontFamily: weight(600), marginTop: spacing.md }]}>
          EVENT NAME
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={template.name}
          placeholderTextColor={t.text3}
          style={[
            styles.input,
            styles.nameInput,
            { color: t.text1, backgroundColor: t.bg2, borderColor: t.border, fontFamily: weight(600) },
          ]}
        />

        <Pressable
          onPress={() => setMultiDay((m) => !m)}
          style={[
            styles.multiDayRow,
            {
              backgroundColor: multiDay ? t.emDim : t.bg2,
              borderColor: multiDay ? t.emGlow : t.border,
            },
          ]}
        >
          <View
            style={[
              styles.checkbox,
              {
                backgroundColor: multiDay ? t.em : 'transparent',
                borderColor: multiDay ? t.em : t.text3,
              },
            ]}
          >
            {multiDay ? (
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                <Polyline
                  points="20 6 9 17 4 12"
                  stroke="#1a1228"
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            ) : null}
          </View>
          <View style={styles.multiDayTextWrap}>
            <Text style={[styles.multiDayTitle, { color: t.text1, fontFamily: weight(600) }]}>
              Multiple days
            </Text>
            <Text style={[styles.multiDaySubtitle, { color: t.text3, fontFamily: weight(500) }]}>
              Spans a date range instead of a single day
            </Text>
          </View>
        </Pressable>

        <View style={styles.fieldsRow}>
          <View style={styles.fieldFlex}>
            {multiDay ? (
              <>
                <Text style={[styles.label, { color: t.text3, fontFamily: weight(600) }]}>DATES</Text>
                <Pressable
                  ref={rangeRowRef}
                  onPress={openRangePicker}
                  style={[
                    styles.input,
                    styles.dateRow,
                    { backgroundColor: t.bg2, borderColor: rangeOpen ? t.em : t.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.dateText,
                      { color: date && endDate ? t.text1 : t.text3, fontFamily: weight(600) },
                    ]}
                    numberOfLines={1}
                  >
                    {date && endDate ? formatRange(date, endDate) : 'Select dates'}
                  </Text>
                  <AppIcon value="calendar2" size={16} color={accent} />
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[styles.label, { color: t.text3, fontFamily: weight(600) }]}>DATE</Text>
                <Pressable
                  ref={dateRowRef}
                  onPress={openDatePicker}
                  style={[
                    styles.input,
                    styles.dateRow,
                    { backgroundColor: t.bg2, borderColor: dateOpen ? t.em : t.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.dateText,
                      { color: dateLabel ? t.text1 : t.text3, fontFamily: weight(600) },
                    ]}
                    numberOfLines={1}
                  >
                    {dateLabel ?? 'Select date'}
                  </Text>
                  <AppIcon value="calendar2" size={16} color={accent} />
                </Pressable>
              </>
            )}
          </View>
          <View style={styles.fieldFlex}>
            <Text style={[styles.label, { color: t.text3, fontFamily: weight(600) }]}>BUDGET</Text>
            <View style={styles.amountInputWrap}>
              <Text style={[styles.currencySymbol, { color: t.text3, fontFamily: weight(600) }]}>
                ₹
              </Text>
              <TextInput
                value={budget}
                onChangeText={(v) => setBudget(v.replace(/[^0-9]/g, ''))}
                inputMode="numeric"
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={t.text3}
                style={[
                  styles.input,
                  styles.amountInput,
                  { color: t.text1, backgroundColor: t.bg2, borderColor: t.border, fontFamily: weight(600) },
                ]}
              />
            </View>
          </View>
        </View>

        <Btn variant="em" onPress={() => void create()} style={styles.createBtn}>
          Create event
        </Btn>
      </View>

      <CalendarPicker
        visible={dateOpen}
        value={currentDate}
        anchor={dateAnchor}
        onSelect={(d) => {
          setDate(toYMD(d));
          setDateOpen(false);
        }}
        onClose={() => setDateOpen(false)}
      />

      <CalendarRangePicker
        visible={rangeOpen}
        start={parseYMD(date)}
        end={parseYMD(endDate)}
        anchor={rangeAnchor}
        onSelect={(s, e) => {
          setDate(toYMD(s));
          setEndDate(toYMD(e));
          setRangeOpen(false);
        }}
        onClose={() => setRangeOpen(false)}
      />

          {sheet}
        </BottomSheet>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingBottom: spacing.xs,
  },
  label: {
    fontSize: 10.5,
    letterSpacing: 0.84,
    marginBottom: spacing.xs,
  },
  templateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  templateCard: {
    width: '48.3%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  templateTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  templateName: {
    fontSize: 13,
  },
  templateSub: {
    fontSize: 10.5,
    marginTop: spacing.xxs,
  },
  emojiSection: {
    marginTop: spacing.md,
  },
  iconPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  iconPickLabel: {
    fontSize: 14,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 15,
  },
  nameInput: {
    height: 46,
  },
  multiDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  multiDayTextWrap: {
    flex: 1,
  },
  multiDayTitle: {
    fontSize: 14,
  },
  multiDaySubtitle: {
    fontSize: 11.5,
    marginTop: spacing.xxs,
  },
  fieldsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  fieldFlex: {
    flex: 1,
  },
  dateRow: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateText: {
    fontSize: 14,
    flexShrink: 1,
  },
  amountInputWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  currencySymbol: {
    position: 'absolute',
    left: 14,
    fontSize: 15,
    zIndex: 1,
  },
  amountInput: {
    height: 46,
    paddingLeft: spacing.lg,
  },
  createBtn: {
    marginTop: spacing.md,
  },
});
