/**
 * EventItemSheet — add/edit a line-item expense within an event budget.
 *
 * Source of truth: project/riddhi/MobileEvents.jsx:10–114. Built as a custom
 * `BottomSheet` body (category chips, labeled numeric inputs, a toggle row,
 * primary/danger buttons) following the structure of `AddTxSheet.tsx` rather
 * than the generic `useFeedback().form()` — this sheet needs a paid-toggle
 * with a dynamic sub-label and a two-column planned/actual row that the
 * declarative form config doesn't support.
 *
 * Category chips: `EV_CAT_LIST` (templates.ts) is a plain name list with no
 * icon/color attached (unlike `AddTxSheet`'s `QA_CATS`, which is keyed by a
 * different, non-overlapping label set — "Food" vs "Food & Dining", etc.).
 * `EV_CAT_META` below is a local port of the web prototype's `CAT_META`
 * (project/riddhi/MobileStore.jsx:8–19), scoped to this sheet since no
 * shared category-metadata module exists yet that covers these labels.
 */
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

import { BottomSheet } from '../../components/BottomSheet';
import { Btn } from '../../components/ui';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, weight } from '../../theme/tokens';
import { EV_CAT_LIST } from './templates';
import type { EventExpenseView, NewEventExpenseInput } from '../../api/types';

/** Icon + color per event category label — port of MobileStore.jsx:8–19 (`CAT_META`). */
const EV_CAT_META: Record<string, { icon: string; color: string }> = {
  Housing: { icon: '🏠', color: '#8197c4' },
  'Food & Dining': { icon: '🍽', color: '#c9a86a' },
  Transport: { icon: '🚇', color: '#9d8bd6' },
  Utilities: { icon: '⚡', color: '#6fb3ad' },
  Entertainment: { icon: '🎬', color: '#c97d8c' },
  Healthcare: { icon: '💊', color: '#ef4444' },
  Shopping: { icon: '🛍', color: '#c97d8c' },
  Education: { icon: '🎓', color: '#6fb3ad' },
  Other: { icon: '•', color: '#8a8299' },
};

/** Neutral fallback for any label not present in `EV_CAT_META`. */
const FALLBACK_CAT_META = { icon: '•', color: '#8a8299' };

function catMeta(name: string): { icon: string; color: string } {
  return EV_CAT_META[name] ?? FALLBACK_CAT_META;
}

export interface EventItemSaved extends NewEventExpenseInput {
  actual: number;
}

export function EventItemSheet({
  open,
  onClose,
  item,
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  item?: EventExpenseView | null;
  onSave: (patch: EventItemSaved) => void;
  onDelete?: () => void;
}) {
  const { t } = useTheme();

  const [cat, setCat] = useState('Food & Dining');
  const [label, setLabel] = useState('');
  const [planned, setPlanned] = useState('');
  const [actual, setActual] = useState('');
  const [paid, setPaid] = useState(false);

  const isNew = !item;

  // Seed from `item` (or defaults) each time the sheet opens — MobileEvents.jsx:17–24.
  useEffect(() => {
    if (!open) return;
    setCat(item?.categoryName ?? 'Food & Dining');
    setLabel(item?.label ?? '');
    setPlanned(item ? String(item.planned || '') : '');
    setActual(item && item.actual ? String(item.actual) : '');
    setPaid(item?.paid ?? false);
  }, [open, item]);

  // MobileEvents.jsx:27–33 (`save`).
  const save = () => {
    const p = Number(planned) || 0;
    const a = actual === '' ? (paid ? p : 0) : Number(actual);
    if (!label.trim() && p === 0) {
      onClose();
      return;
    }
    onSave({ categoryName: cat, label: label.trim() || cat, planned: p, actual: a, paid });
    onClose();
  };

  const remove = () => {
    onDelete?.();
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={isNew ? 'Add expense' : 'Edit expense'}>
      <View style={styles.body}>
        {/* category */}
        <Text style={[styles.label, { color: t.text3, fontFamily: weight(600) }]}>CATEGORY</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {EV_CAT_LIST.map((c) => {
            const meta = catMeta(c);
            const on = c === cat;
            return (
              <Pressable
                key={c}
                onPress={() => setCat(c)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: on ? `${meta.color}22` : t.bg2,
                    borderColor: on ? meta.color : t.border,
                  },
                ]}
              >
                <Text style={styles.chipIcon}>{meta.icon}</Text>
                <Text
                  style={[
                    styles.chipLabel,
                    { color: on ? meta.color : t.text2, fontFamily: weight(600) },
                  ]}
                >
                  {c}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* label */}
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="What's this expense?"
          placeholderTextColor={t.text3}
          style={[
            styles.input,
            styles.labelInput,
            { color: t.text1, backgroundColor: t.bg2, borderColor: t.border, fontFamily: weight(600) },
          ]}
        />

        {/* planned + actual */}
        <View style={styles.amountsRow}>
          <View style={styles.amountField}>
            <Text style={[styles.label, { color: t.text3, fontFamily: weight(600) }]}>PLANNED</Text>
            <View style={styles.amountInputWrap}>
              <Text
                style={[styles.currencySymbol, { color: t.text3, fontFamily: weight(600) }]}
              >
                ₹
              </Text>
              <TextInput
                value={planned}
                onChangeText={(v) => setPlanned(v.replace(/[^0-9]/g, ''))}
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
          <View style={styles.amountField}>
            <Text style={[styles.label, { color: t.text3, fontFamily: weight(600) }]}>ACTUAL PAID</Text>
            <View style={styles.amountInputWrap}>
              <Text
                style={[styles.currencySymbol, { color: t.text3, fontFamily: weight(600) }]}
              >
                ₹
              </Text>
              <TextInput
                value={actual}
                onChangeText={(v) => setActual(v.replace(/[^0-9]/g, ''))}
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

        {/* paid toggle */}
        <Pressable
          onPress={() => setPaid((p) => !p)}
          style={[
            styles.paidRow,
            {
              backgroundColor: paid ? t.emDim : t.bg2,
              borderColor: paid ? t.emGlow : t.border,
            },
          ]}
        >
          <View
            style={[
              styles.checkbox,
              {
                backgroundColor: paid ? t.em : 'transparent',
                borderColor: paid ? t.em : t.text3,
              },
            ]}
          >
            {paid ? (
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
          <View style={styles.paidTextWrap}>
            <Text style={[styles.paidTitle, { color: t.text1, fontFamily: weight(600) }]}>
              Mark as paid
            </Text>
            <Text style={[styles.paidSubtitle, { color: t.text3, fontFamily: weight(500) }]}>
              Logs a real transaction under {cat}
            </Text>
          </View>
        </Pressable>

        <Btn variant="em" onPress={save} style={styles.saveBtn}>
          {isNew ? 'Add expense' : 'Save changes'}
        </Btn>
        {!isNew ? (
          <Pressable onPress={remove} style={styles.removeBtn}>
            <Text style={[styles.removeLabel, { color: t.red, fontFamily: weight(600) }]}>
              Remove expense
            </Text>
          </Pressable>
        ) : null}
      </View>
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
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 99,
    borderWidth: 1,
    flexShrink: 0,
  },
  chipIcon: {
    fontSize: 15,
  },
  chipLabel: {
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  labelInput: {
    marginTop: 14,
    height: 46,
  },
  amountsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  amountField: {
    flex: 1,
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
  paidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    padding: 14,
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
  paidTextWrap: {
    flex: 1,
  },
  paidTitle: {
    fontSize: 14,
  },
  paidSubtitle: {
    fontSize: 11.5,
    marginTop: 1,
  },
  saveBtn: {
    marginTop: 16,
  },
  removeBtn: {
    marginTop: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeLabel: {
    fontSize: 15,
  },
});
