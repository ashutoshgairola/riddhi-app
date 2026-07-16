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
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { BankLogo, hasBankLogo } from './BankLogo';
import { BottomSheet } from './BottomSheet';
import { CalendarPicker, type Anchor } from './CalendarPicker';
import { AppIcon } from './contentIcons';
import { MI } from './icons';
import { useIconPicker } from './IconPickerSheet';
import { Btn, Chip } from './ui';
import { BANK_NAMES } from '../assets/bankLogos';
import { useTheme } from '../theme/ThemeProvider';
import { radius, weight } from '../theme/tokens';
import { spacing } from '../theme/spacing';

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

// Default swatch palette for the `color` field kind. Includes the app's
// existing income green (#7faf93) and expense gold (#c9a86a).
const CATEGORY_COLORS = [
  '#7faf93', '#c9a86a', '#e07a7a', '#7f9fc9',
  '#b18fd0', '#e0a878', '#6fc0b0', '#c98fb0',
];

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
        <AppIcon value="calendar2" size={16} color={t.em} />
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
 * Icon field: a tappable chip showing the currently picked content icon (via
 * `AppIcon`). Tapping opens the shared `IconPickerSheet` that the FormSheet
 * hoists to its root via `openPicker` (see `useIconPicker`). The picker MUST
 * render outside the sheet's clipped body: its overlay is `absoluteFill`, so
 * nesting it inside this small field `View` clips the icon grid to the chip's
 * height (only the header/search sliver shows). The value stays the icon's
 * name string, like every other field.
 */
function IconField({
  value,
  color,
  onChange,
  openPicker,
}: {
  value: string;
  color?: string;
  onChange: (name: string) => void;
  openPicker: (cfg: {
    value?: string;
    color?: string;
    title?: string;
    onPick: (name: string) => void;
  }) => void;
}) {
  const { t } = useTheme();
  const accent = color ?? t.em;
  return (
    <Pressable
      onPress={() => {
        Keyboard.dismiss();
        openPicker({ value, color: accent, title: 'Choose icon', onPick: onChange });
      }}
      style={[styles.input, styles.dateRow, { backgroundColor: t.bg2, borderColor: t.border }]}
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
  );
}

/**
 * Colour field: a row of tappable swatches (single choice). The value is the
 * selected hex string, like every other field.
 */
function ColorField({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (hex: string) => void;
}) {
  const { t } = useTheme();
  return (
    <View style={styles.chipRow}>
      {options.map((hex) => {
        const on = value.toLowerCase() === hex.toLowerCase();
        return (
          <Pressable
            key={hex}
            onPress={() => onChange(hex)}
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: hex,
              borderWidth: on ? 3 : 1,
              borderColor: on ? t.text1 : t.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {on ? <AppIcon value="check" size={16} color="#ffffff" /> : null}
          </Pressable>
        );
      })}
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

/**
 * Secure (dot-masked) text field with a show/hide eye toggle — mirrors the
 * Login screen's `PasswordField` (screens/auth/authUi.tsx:190-216), reused
 * here for sensitive form fields like the Change-PIN sheet's PIN inputs.
 */
function SecureField({
  value,
  placeholder,
  keyboardType,
  maxLength,
  onChange,
}: {
  value: string;
  placeholder?: string;
  keyboardType?: TextInputProps['keyboardType'];
  maxLength?: number;
  onChange: (text: string) => void;
}) {
  const { t } = useTheme();
  const [show, setShow] = useState(false);
  return (
    <View style={{ position: 'relative' }}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.text3}
        secureTextEntry={!show}
        keyboardType={keyboardType ?? 'default'}
        maxLength={maxLength}
        style={[
          styles.input,
          {
            color: t.text1,
            backgroundColor: t.bg2,
            borderColor: t.border,
            fontFamily: weight(600),
            paddingRight: spacing.xxl,
          },
        ]}
      />
      <Pressable onPress={() => setShow((s) => !s)} style={styles.eyeBtn}>
        {show ? <MI.eye size={18} color={t.text3} /> : <MI.eyeOff size={18} color={t.text3} />}
      </Pressable>
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
      /** Renders as a dot-masked field with a show/hide toggle — used for
       * PIN entry (Settings → Change PIN). */
      secureTextEntry?: boolean;
      /** Overrides the default keyboard for this field (e.g. `number-pad`
       * for PIN digits). Ignored for `kind: 'amount'`, which always uses
       * `decimal-pad`. */
      keyboardType?: TextInputProps['keyboardType'];
      maxLength?: number;
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
    }
  | {
      kind: 'color';
      key: string;
      label: string;
      initial?: string;
      /** Swatch palette; defaults to CATEGORY_COLORS when omitted. */
      options?: string[];
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
    if (f.kind === 'color') {
      values[f.key] = f.initial ?? (f.options ?? CATEGORY_COLORS)[0]!;
    } else {
      values[f.key] = f.initial ?? '';
    }
  }
  return values;
}

export function FormSheet({ open, config, onClose, onError }: FormSheetProps) {
  const { t } = useTheme();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [keyboardPad, setKeyboardPad] = useState(0);
  // One shared icon picker, rendered at the FormSheet root (outside the
  // BottomSheet body) so its full-screen overlay isn't clipped by the sheet.
  const iconPicker = useIconPicker();

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
      if (f.kind === 'color') continue;
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
    <>
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
                openPicker={iconPicker.pick}
              />
            ) : f.kind === 'color' ? (
              <ColorField
                value={values[f.key] ?? ''}
                options={f.options ?? CATEGORY_COLORS}
                onChange={(hex) => setValues((v) => ({ ...v, [f.key]: hex }))}
              />
            ) : f.secureTextEntry ? (
              <SecureField
                value={values[f.key] ?? ''}
                placeholder={f.placeholder}
                keyboardType={f.keyboardType}
                maxLength={f.maxLength}
                onChange={(text) => setValues((v) => ({ ...v, [f.key]: text }))}
              />
            ) : (
              <TextInput
                value={values[f.key] ?? ''}
                onChangeText={(text) => setValues((v) => ({ ...v, [f.key]: text }))}
                placeholder={f.placeholder}
                placeholderTextColor={t.text3}
                keyboardType={f.kind === 'amount' ? 'decimal-pad' : (f.keyboardType ?? 'default')}
                maxLength={f.maxLength}
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
      {iconPicker.sheet}
    </>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingBottom: spacing.xs,
    gap: spacing.md,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    fontSize: 10.5,
    letterSpacing: 0.84,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
  eyeBtn: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateText: {
    fontSize: 15,
  },
  bankInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
  },
  bankInput: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
  suggestBox: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  suggestText: {
    flex: 1,
    fontSize: 14.5,
  },
  submit: {
    marginTop: spacing.xxs,
  },
});
