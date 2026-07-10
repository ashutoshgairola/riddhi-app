/**
 * FormSheet — a small bottom-sheet form used for every quick create/edit
 * flow (new budget category, goal, account, holding, category, transaction
 * edit, profile edit…). Declarative field specs keep each call site to a
 * few lines; screens open one through `useFeedback().form(cfg)` so it
 * renders at the root (above the tab bar), like toasts and action sheets.
 *
 * Field kinds:
 *  - text            plain TextInput
 *  - amount          numeric TextInput, validated > 0
 *  - date            tap-to-open native date picker (spinner on iOS,
 *                    system dialog on Android); value kept as YYYY-MM-DD
 *  - select          chip row (single choice)
 *  - bank            searchable bank picker (logo suggestions) that also
 *                    accepts any custom typed value
 *
 * The sheet grows by the keyboard's height while typing (a spacer at the
 * bottom of the content — the sheet is bottom-anchored, so extra content
 * height pushes the fields above the keyboard).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BankLogo, hasBankLogo } from './BankLogo';
import { BottomSheet } from './BottomSheet';
import { CalendarPicker, type Anchor } from './CalendarPicker';
import { AppIcon } from './contentIcons';
import { IconPickerSheet } from './IconPickerSheet';
import { Btn, Chip } from './ui';
import { BANK_NAMES } from '../assets/bankLogos';
import { useTheme } from '../theme/ThemeProvider';
import { radius, weight } from '../theme/tokens';

// Shown as suggestions before the user types — the banks people reach for most
// (filtered to those we actually ship a logo for).
const POPULAR_BANKS = [
  'HDFC Bank',
  'ICICI Bank',
  'State Bank of India',
  'Axis bank',
  'Kotak Mahindra Bank',
  'Punjab National Bank',
  'Bank of Baroda',
  'Yes Bank',
].filter((n) => BANK_NAMES.includes(n));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Parse a stored 'YYYY-MM-DD' as a *local* date (avoids the UTC-midnight day
// shift you'd get from `new Date('YYYY-MM-DD')`). Returns null if malformed.
function parseYMD(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

// Format a Date back to the 'YYYY-MM-DD' the form stores, using local parts.
function toYMD(d: Date): string {
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mo}-${day}`;
}

// Human-readable label for the field row, e.g. "6 Jul 2026". Null when empty.
function displayDate(s: string): string | null {
  const d = parseYMD(s);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : null;
}

/**
 * Date field: a tappable row showing the picked date that opens a themed
 * calendar popover (CalendarPicker) anchored to the row. Future dates are
 * blocked. The value stays a 'YYYY-MM-DD' string so the rest of the form
 * (validation, submit) is unchanged.
 */
function DateField({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (ymd: string) => void;
}) {
  const { t } = useTheme();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const rowRef = useRef<View>(null);
  const current = parseYMD(value) ?? new Date();
  const label = displayDate(value);

  const openPicker = () => {
    Keyboard.dismiss();
    if (rowRef.current) {
      rowRef.current.measureInWindow((x, y, w, h) => {
        setAnchor({ x, y, w, h });
        setOpen(true);
      });
    } else {
      setAnchor(null);
      setOpen(true);
    }
  };

  return (
    <View>
      <Pressable
        ref={rowRef}
        onPress={openPicker}
        style={[
          styles.input,
          styles.dateRow,
          { backgroundColor: t.bg2, borderColor: open ? t.em : t.border },
        ]}
      >
        <Text
          style={[styles.dateText, { color: label ? t.text1 : t.text3, fontFamily: weight(600) }]}
        >
          {label ?? placeholder ?? 'Select date'}
        </Text>
        <Text style={styles.dateIcon}>📅</Text>
      </Pressable>

      <CalendarPicker
        visible={open}
        value={current}
        maxDate={new Date()}
        anchor={anchor}
        onSelect={(d) => {
          onChange(toYMD(d));
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

/**
 * Icon field: a tappable chip showing the currently picked content icon
 * (via `AppIcon`) that opens `IconPickerSheet`. The value stays the icon's
 * name string, like every other field.
 */
function IconField({
  value,
  color,
  onChange,
}: {
  value: string;
  color?: string;
  onChange: (name: string) => void;
}) {
  const { t } = useTheme();
  const [open, setOpen] = useState(false);
  const accent = color ?? t.em;
  return (
    <View>
      <Pressable
        onPress={() => {
          Keyboard.dismiss();
          setOpen(true);
        }}
        style={[
          styles.input,
          styles.dateRow,
          { backgroundColor: t.bg2, borderColor: open ? t.em : t.border },
        ]}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: accent + '22',
          }}
        >
          {value ? <AppIcon value={value} size={18} color={accent} /> : null}
        </View>
        <Text style={[styles.dateText, { color: value ? t.text1 : t.text3, fontFamily: weight(600) }]}>
          {value ? 'Change icon' : 'Choose icon'}
        </Text>
      </Pressable>
      <IconPickerSheet
        open={open}
        value={value}
        color={accent}
        onPick={(name) => {
          onChange(name);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}

/**
 * Searchable bank input: filters the shipped bank list as you type and shows
 * logo suggestions, but the field value is just the text — any custom bank /
 * provider name the user types is kept as-is.
 */
function BankField({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (text: string) => void;
}) {
  const { t } = useTheme();
  const [focused, setFocused] = useState(false);

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return POPULAR_BANKS;
    // Already an exact pick — nothing useful left to suggest.
    if (BANK_NAMES.some((n) => n.toLowerCase() === q)) return [];
    return BANK_NAMES.filter((n) => n.toLowerCase().includes(q)).slice(0, 8);
  }, [value]);

  return (
    <View>
      <View
        style={[
          styles.bankInputRow,
          { backgroundColor: t.bg2, borderColor: focused ? t.em : t.border },
        ]}
      >
        {hasBankLogo(value) ? (
          <BankLogo name={value} size={26} radius={7} />
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder ?? 'Search or type a bank…'}
          placeholderTextColor={t.text3}
          autoCapitalize="words"
          autoCorrect={false}
          style={[styles.bankInput, { color: t.text1, fontFamily: weight(600) }]}
        />
      </View>

      {focused && suggestions.length > 0 ? (
        <View style={[styles.suggestBox, { backgroundColor: t.bg2, borderColor: t.border }]}>
          {suggestions.map((name) => (
            <Pressable
              key={name}
              onPress={() => {
                onChange(name);
                setFocused(false);
                Keyboard.dismiss();
              }}
              style={({ pressed }) => [styles.suggestRow, pressed && { backgroundColor: t.glassBg }]}
            >
              <BankLogo name={name} size={26} radius={7} />
              <Text style={[styles.suggestText, { color: t.text1, fontFamily: weight(600) }]} numberOfLines={1}>
                {name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export type FormFieldSpec =
  | {
      kind?: 'text' | 'amount' | 'date';
      key: string;
      label: string;
      placeholder?: string;
      initial?: string;
      optional?: boolean;
    }
  | {
      kind: 'bank';
      key: string;
      label: string;
      placeholder?: string;
      initial?: string;
      optional?: boolean;
    }
  | {
      kind: 'select';
      key: string;
      label: string;
      options: { label: string; value: string }[];
      initial: string;
    }
  | {
      kind: 'icon';
      key: string;
      label: string;
      initial?: string;
      optional?: boolean;
      /** Accent color for the picker + selected chip (e.g. the category color). */
      color?: string;
    };

export interface FormConfig {
  title: string;
  fields: FormFieldSpec[];
  submitLabel?: string;
  /** Thrown errors keep the sheet open and surface `err.message`. */
  onSubmit: (values: Record<string, string>) => void | Promise<void>;
}

export interface FormSheetProps {
  open: boolean;
  config: FormConfig | null;
  onClose: () => void;
  /** Validation/submit errors surface through the host's toast. */
  onError: (msg: string) => void;
}

function initialValues(config: FormConfig | null): Record<string, string> {
  const values: Record<string, string> = {};
  for (const f of config?.fields ?? []) {
    values[f.key] = f.initial ?? '';
  }
  return values;
}

export function FormSheet({ open, config, onClose, onError }: FormSheetProps) {
  const { t } = useTheme();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [keyboardPad, setKeyboardPad] = useState(0);

  // Re-seed values each time a (new) form opens.
  useEffect(() => {
    if (open) {
      setValues(initialValues(config));
      setBusy(false);
    }
    // `config` is set together with `open` by the host.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', (e) =>
      setKeyboardPad(e.endCoordinates.height),
    );
    const showAndroid = Keyboard.addListener('keyboardDidShow', (e) =>
      setKeyboardPad(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardPad(0));
    const hideAndroid = Keyboard.addListener('keyboardDidHide', () => setKeyboardPad(0));
    return () => {
      show.remove();
      showAndroid.remove();
      hide.remove();
      hideAndroid.remove();
    };
  }, []);

  const submit = async () => {
    if (!config || busy) return;
    for (const f of config.fields) {
      const v = (values[f.key] ?? '').trim();
      if (f.kind === 'select') continue;
      if (f.kind === 'icon') continue;
      if (!v && !f.optional) {
        onError(`${f.label} is required`);
        return;
      }
      if (v && f.kind === 'amount' && (!Number.isFinite(Number(v)) || Number(v) <= 0)) {
        onError(`${f.label} must be a positive number`);
        return;
      }
      if (v && f.kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        onError(`${f.label} must be YYYY-MM-DD`);
        return;
      }
    }
    setBusy(true);
    try {
      await config.onSubmit(
        Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()])),
      );
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={config?.title}>
      <View style={styles.body}>
        {(config?.fields ?? []).map((f) => (
          <View key={f.key} style={styles.field}>
            <Text style={[styles.label, { color: t.text3, fontFamily: weight(600) }]}>
              {f.label.toUpperCase()}
            </Text>
            {f.kind === 'select' ? (
              <View style={styles.chipRow}>
                {f.options.map((o) => (
                  <Chip
                    key={o.value}
                    on={(values[f.key] ?? '') === o.value}
                    onPress={() => setValues((v) => ({ ...v, [f.key]: o.value }))}
                  >
                    {o.label}
                  </Chip>
                ))}
              </View>
            ) : f.kind === 'bank' ? (
              <BankField
                value={values[f.key] ?? ''}
                placeholder={f.placeholder}
                onChange={(text) => setValues((v) => ({ ...v, [f.key]: text }))}
              />
            ) : f.kind === 'date' ? (
              <DateField
                value={values[f.key] ?? ''}
                placeholder={f.placeholder}
                onChange={(ymd) => setValues((v) => ({ ...v, [f.key]: ymd }))}
              />
            ) : f.kind === 'icon' ? (
              <IconField
                value={values[f.key] ?? ''}
                color={f.color}
                onChange={(name) => setValues((v) => ({ ...v, [f.key]: name }))}
              />
            ) : (
              <TextInput
                value={values[f.key] ?? ''}
                onChangeText={(text) => setValues((v) => ({ ...v, [f.key]: text }))}
                placeholder={f.placeholder}
                placeholderTextColor={t.text3}
                keyboardType={f.kind === 'amount' ? 'decimal-pad' : 'default'}
                style={[
                  styles.input,
                  {
                    color: t.text1,
                    backgroundColor: t.bg2,
                    borderColor: t.border,
                    fontFamily: weight(600),
                  },
                ]}
              />
            )}
          </View>
        ))}

        <Btn onPress={submit} disabled={busy} style={styles.submit}>
          {busy ? 'Saving…' : (config?.submitLabel ?? 'Save')}
        </Btn>

        {/* Bottom-anchored sheet: this spacer grows the sheet past the
            keyboard so the fields stay visible while typing. */}
        {keyboardPad > 0 && <View style={{ height: keyboardPad }} />}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingBottom: 8,
    gap: 14,
  },
  field: {
    gap: 7,
  },
  label: {
    fontSize: 10.5,
    letterSpacing: 0.84,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateText: {
    fontSize: 15,
  },
  dateIcon: {
    fontSize: 15,
  },
  bankInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
  },
  bankInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
  },
  suggestBox: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  suggestText: {
    flex: 1,
    fontSize: 14.5,
  },
  submit: {
    marginTop: 4,
  },
});
