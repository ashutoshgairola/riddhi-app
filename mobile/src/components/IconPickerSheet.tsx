/**
 * IconPickerSheet — bottom-sheet icon picker for content icons (categories,
 * budgets, goals, etc): a search field plus a 5-column grid of `ICON_LIST`.
 *
 * Source of truth: project/riddhi/MobileCore.jsx:365-403 (icon picker sheet
 * body), built on the ported `BottomSheet` + `AppIcon`/`ICON_LIST` from
 * Tasks 1-2 of the icon-system port.
 *
 * `useIconPicker` is a small imperative wrapper for surfaces that aren't
 * already driving a `FormSheet` config (e.g. a settings row that opens the
 * picker directly) — call `pick(cfg)` to open, render `sheet` once near the
 * root of that screen.
 */
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { BottomSheet } from './BottomSheet';
import { AppIcon } from './contentIcons';
import { ICON_LIST, resolveIconName, type ContentIconName } from './contentIcons.data';
import { useTheme } from '../theme/ThemeProvider';
import { radius, weight } from '../theme/tokens';
import { spacing } from '../theme/spacing';

/**
 * Kept in sync with `BottomSheet`'s slide duration (`SLIDE_DURATION_MS`, 350ms)
 * — the wrapping Modal must stay mounted at least this long after `open` flips
 * to false so the sheet's exit animation is visible before it unmounts.
 */
const SLIDE_OUT_MS = 350;

export interface IconPickerSheetProps {
  open: boolean;
  value?: string;
  color?: string;
  title?: string;
  onPick: (name: ContentIconName) => void;
  onClose: () => void;
}

export function IconPickerSheet({
  open,
  value,
  color,
  title = 'Choose icon',
  onPick,
  onClose,
}: IconPickerSheetProps) {
  const { t } = useTheme();
  const [q, setQ] = useState('');
  const accent = color ?? t.em;
  const curName = resolveIconName(value);
  const query = q.trim().toLowerCase();
  const list = ICON_LIST.filter(
    ([k, l]) => !query || l.toLowerCase().includes(query) || k.toLowerCase().includes(query),
  );

  // The picker is frequently opened from *inside* a FormSheet (the `icon` field
  // kind), and `BottomSheet` is an in-tree overlay — nested inside the form's
  // own sheet body it would render inline and clipped instead of over the whole
  // screen. A transparent native `Modal` hoists it to the top window layer, the
  // same escape hatch `CalendarPicker` uses for the date field. `mounted` keeps
  // the Modal alive through the sheet's slide-out before unmounting.
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const id = setTimeout(() => setMounted(false), SLIDE_OUT_MS);
    return () => clearTimeout(id);
  }, [open]);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      {/* A native Modal renders outside the app-root GestureHandlerRootView, so
       * the sheet's drag-to-dismiss handle needs its own root here. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheet open={open} onClose={onClose} title={title}>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search icons…"
        placeholderTextColor={t.text3}
        style={{
          height: 44,
          marginBottom: spacing.md,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          backgroundColor: t.bg2,
          borderWidth: 1,
          borderColor: t.border,
          color: t.text1,
          fontFamily: weight(600),
        }}
      />
      <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingBottom: spacing.md }}>
          {list.map(([k, l]) => {
            const on = k === curName;
            return (
              <Pressable
                key={k}
                onPress={() => {
                  onPick(k);
                  onClose();
                }}
                style={{ width: '20%', alignItems: 'center', paddingVertical: spacing.xs }}
              >
                <View
                  style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: spacing.xxs,
                    paddingVertical: spacing.xs,
                    borderRadius: 14,
                    width: '92%',
                    backgroundColor: on ? t.emDim : t.glassBg,
                    borderWidth: 1,
                    borderColor: on ? t.emGlow : t.glassBrd,
                  }}
                >
                  <AppIcon value={k} size={20} color={on ? accent : t.text1} />
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 9.5,
                      fontFamily: weight(600),
                      color: on ? accent : t.text3,
                      maxWidth: '100%',
                    }}
                  >
                    {l}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </BottomSheet>
      </GestureHandlerRootView>
    </Modal>
  );
}

interface IconPickerConfig {
  value?: string;
  color?: string;
  title?: string;
  onPick: (name: ContentIconName) => void;
}

/**
 * Local-state imperative opener for `IconPickerSheet` on surfaces that don't
 * already own a sheet config (unlike `FormSheet`, which is driven by a host
 * at the screen root). Call `pick(cfg)` to open the sheet with a given
 * value/color/title/onPick; render `sheet` once, anywhere in the tree.
 */
export function useIconPicker(): { pick: (cfg: IconPickerConfig) => void; sheet: JSX.Element } {
  const [cfg, setCfg] = useState<IconPickerConfig | null>(null);

  const sheet = (
    <IconPickerSheet
      open={!!cfg}
      value={cfg?.value}
      color={cfg?.color}
      title={cfg?.title}
      onPick={(name) => cfg?.onPick(name)}
      onClose={() => setCfg(null)}
    />
  );

  return { pick: setCfg, sheet };
}
