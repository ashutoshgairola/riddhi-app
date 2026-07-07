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
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '../../components/BottomSheet';
import { CalendarPicker, type Anchor } from '../../components/CalendarPicker';
import { Btn } from '../../components/ui';
import { useFeedback } from '../../feedback/FeedbackProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, weight } from '../../theme/tokens';
import { CUSTOM_EMOJIS, EV_TEMPLATES, seedFromTemplate } from './templates';
import type { NewEventInput } from '../../api/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Parse a stored 'YYYY-MM-DD' as a *local* date (mirrors FormSheet.tsx's
// `parseYMD`, duplicated here since that helper isn't exported).
function parseYMD(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toYMD(d: Date): string {
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mo}-${day}`;
}

function displayDate(s: string): string | null {
  const d = parseYMD(s);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : null;
}

const DEFAULT_TEMPLATE_KEY = 'birthday';
const DEFAULT_EMOJI = '✨';

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

  const [tpl, setTpl] = useState(DEFAULT_TEMPLATE_KEY);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [budget, setBudget] = useState('');
  const [emoji, setEmoji] = useState(DEFAULT_EMOJI);

  const [dateOpen, setDateOpen] = useState(false);
  const [dateAnchor, setDateAnchor] = useState<Anchor | null>(null);
  const dateRowRef = useRef<View>(null);

  const template = EV_TEMPLATES.find((tp) => tp.key === tpl) ?? EV_TEMPLATES[0];
  const isCustom = tpl === 'custom';

  // Reset on open — MobileEvents.jsx:129–131.
  useEffect(() => {
    if (!open) return;
    setTpl(DEFAULT_TEMPLATE_KEY);
    setName('');
    setDate('');
    setBudget('');
    setEmoji(DEFAULT_EMOJI);
  }, [open]);

  // Seed budget (and reset emoji for `custom`) whenever the template changes
  // — MobileEvents.jsx:133–136.
  useEffect(() => {
    const found = EV_TEMPLATES.find((tp) => tp.key === tpl);
    if (found) {
      setBudget(String(found.budget));
      if (found.key === 'custom') setEmoji(DEFAULT_EMOJI);
    }
  }, [tpl]);

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

  // MobileEvents.jsx:139–148 (`create`). Awaits `onCreate` (mirrors
  // AddTxSheet.tsx's `save`) so a failed create toasts and leaves the sheet
  // open for retry instead of closing (and navigating) silently.
  const create = async () => {
    const seed = seedFromTemplate(template);
    try {
      await onCreate({
        ...seed,
        name: name.trim() || template.name,
        date: date || undefined,
        budget: Number(budget) || template.budget,
        emoji: isCustom ? emoji : template.emoji,
      });
      onClose();
    } catch {
      toast("Couldn't create event", '⚠️');
    }
  };

  const dateLabel = displayDate(date);
  const currentDate = parseYMD(date) ?? new Date();

  return (
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
                <View style={[styles.templateIconWrap, { backgroundColor: `${tp.color}22` }]}>
                  <Text style={styles.templateIcon}>{glyph}</Text>
                </View>
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
            <View style={styles.emojiGrid}>
              {CUSTOM_EMOJIS.map((e) => {
                const on = e === emoji;
                return (
                  <Pressable
                    key={e}
                    onPress={() => setEmoji(e)}
                    style={[
                      styles.emojiBtn,
                      {
                        backgroundColor: on ? t.emDim : t.bg2,
                        borderColor: on ? t.emGlow : t.border,
                      },
                    ]}
                  >
                    <Text style={styles.emojiGlyph}>{e}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <Text style={[styles.label, { color: t.text3, fontFamily: weight(600), marginTop: 18 }]}>
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

        <View style={styles.fieldsRow}>
          <View style={styles.fieldFlex}>
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
              <Text style={styles.dateIcon}>📅</Text>
            </Pressable>
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
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingBottom: 6,
  },
  label: {
    fontSize: 10.5,
    letterSpacing: 0.84,
    marginBottom: 8,
  },
  templateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  templateCard: {
    width: '48.3%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  templateIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  templateIcon: {
    fontSize: 18,
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
    marginTop: 1,
  },
  emojiSection: {
    marginTop: 14,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emojiBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiGlyph: {
    fontSize: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  nameInput: {
    height: 46,
  },
  fieldsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
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
  dateIcon: {
    fontSize: 15,
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
    paddingLeft: 28,
  },
  createBtn: {
    marginTop: 18,
  },
});
