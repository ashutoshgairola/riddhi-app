/**
 * AddTxSheet — quick-add transaction bottom sheet.
 *
 * Source of truth: project/riddhi/MobileApp.jsx:54–204 (`QA_CATS` +
 * `AddTxSheet`).
 *
 * Type segment (expense/income/transfer) drives both the big amount
 * display's accent color and the category chip set (`QA_CATS`). The
 * numeric keypad's `press(k)` reducer (MobileApp.jsx:96–103) is ported
 * verbatim — del trims one char, '.' is inserted at most once (and seeds a
 * leading '0.' from empty), at most 2 digits after the decimal point, at
 * most 8 digits total (decimal point excluded from the length count), and
 * a leading lone '0' is replaced rather than appended to.
 *
 * Receipt attach uses `expo-image-picker`'s `launchImageLibraryAsync`
 * (SDK 56 API) in place of the web's hidden `<input type=file>` +
 * `URL.createObjectURL` (MobileApp.jsx:153–176) — picking an image stores
 * its local `uri` and renders the same thumbnail-preview-with-remove-button
 * card; RN has no object URLs, so the picker's returned `uri` is used
 * directly as the `<Image source={{ uri }}>` source.
 */
import { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';

import { api } from '../api';
import { BottomSheet } from '../components/BottomSheet';
import { MSeg } from '../components/MSeg';
import { Btn } from '../components/ui';
import { MI } from '../components/icons';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useTheme } from '../theme/ThemeProvider';
import { radius, weight } from '../theme/tokens';
import { useNav } from './navContext';

/** Keypad "del" key icon — verbatim from MobileApp.jsx:192 (a delete-key
 * glyph: rounded-left rect arrow + diagonal X), not in the shared `MI` set. */
function DelIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1="18" y1="9" x2="12" y2="15" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="12" y1="9" x2="18" y2="15" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

type TxType = 'expense' | 'income' | 'transfer';

interface QaCat {
  l: string;
  i: string;
  c: string;
}

// QA_CATS (MobileApp.jsx:54–77).
const QA_CATS: Record<TxType, QaCat[]> = {
  expense: [
    { l: 'Food', i: '🍽', c: '#c9a86a' },
    { l: 'Transport', i: '🚗', c: '#9d8bd6' },
    { l: 'Shopping', i: '🛍', c: '#c97d8c' },
    { l: 'Groceries', i: '🛒', c: '#7faf93' },
    { l: 'Bills', i: '⚡', c: '#6fb3ad' },
    { l: 'Health', i: '💊', c: '#8197c4' },
    { l: 'Fun', i: '🎬', c: '#bd7ba0' },
    { l: 'Other', i: '•', c: '#8a8299' },
  ],
  income: [
    { l: 'Salary', i: '💼', c: '#7faf93' },
    { l: 'Freelance', i: '💻', c: '#8197c4' },
    { l: 'Refund', i: '↩', c: '#6fb3ad' },
    { l: 'Gift', i: '🎁', c: '#bd7ba0' },
    { l: 'Other', i: '•', c: '#8a8299' },
  ],
  transfer: [
    { l: 'Self', i: '🔄', c: '#8197c4' },
    { l: 'Savings', i: '🏦', c: '#7faf93' },
    { l: 'Invest', i: '▲', c: '#9d8bd6' },
  ],
};

// keys (MobileApp.jsx:109).
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'] as const;

/** `press(k)` reducer, ported verbatim from MobileApp.jsx:96–103. */
function press(a: string, k: string): string {
  if (k === 'del') return a.slice(0, -1);
  if (k === '.') return a.includes('.') ? a : a === '' ? '0.' : a + '.';
  if (a.includes('.') && a.split('.')[1].length >= 2) return a; // max 2 decimals
  if (a.replace('.', '').length >= 8) return a; // cap length
  if (a === '0' && k !== '.') return k;
  return a + k;
}

export function AddTxSheet() {
  const { t } = useTheme();
  const { addOpen, setAddOpen } = useNav();
  const { toast } = useFeedback();

  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [cat, setCat] = useState('Food');
  const [note, setNote] = useState('');
  const [receipt, setReceipt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // typeColor (MobileApp.jsx:86).
  const typeColor: Record<TxType, string> = { income: t.em, expense: t.text1, transfer: t.blue };

  // Reset amount/note/receipt on open (MobileApp.jsx:88–90).
  useEffect(() => {
    if (addOpen) {
      setAmount('');
      setNote('');
      setReceipt(null);
    }
  }, [addOpen]);

  // Reset cat to the new type's first category (MobileApp.jsx:92–94).
  useEffect(() => {
    setCat(QA_CATS[type][0].l);
  }, [type]);

  const onClose = () => setAddOpen(false);
  const cats = QA_CATS[type];
  const accent = typeColor[type];

  const pickReceipt = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length > 0) {
      setReceipt(result.assets[0].uri);
    }
  };

  const saveLabel = type === 'income' ? 'income' : type === 'transfer' ? 'transfer' : 'expense';

  const save = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || saving) return;
    setSaving(true);
    try {
      // Transfers are stored as expenses under their transfer category
      // (Self/Savings/Invest) — the backend's `transfer` type needs a
      // counter-account picker this quick-add sheet doesn't have.
      await api.transactions.create({
        desc: note.trim() || cat,
        amount: value,
        type: type === 'income' ? 'inc' : 'exp',
        categoryName: cat,
        note: note.trim() || undefined,
      });
      toast(`Saved ${saveLabel} · ₹${value.toLocaleString('en-IN')}`, '✓');
      setAddOpen(false);
    } catch {
      toast("Couldn't save — try again", '📡');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open={addOpen} onClose={onClose} title="Add">
      {/* type segment */}
      <View style={styles.segWrap}>
        <MSeg<TxType>
          options={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
            { value: 'transfer', label: 'Transfer' },
          ]}
          value={type}
          onChange={setType}
        />
      </View>

      {/* amount display */}
      <View style={styles.amountWrap}>
        <Text style={[styles.amountSymbol, { color: t.text3, fontFamily: weight(600) }]}>₹</Text>
        <Text
          style={[
            styles.amountValue,
            { color: amount === '' ? t.text3 : accent, fontFamily: weight(700) },
          ]}
        >
          {amount === '' ? '0' : Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
        </Text>
      </View>

      {/* category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {cats.map((c) => {
          const on = c.l === cat;
          return (
            <Pressable
              key={c.l}
              onPress={() => setCat(c.l)}
              style={[
                styles.chip,
                {
                  backgroundColor: on ? `${c.c}22` : t.bg2,
                  borderColor: on ? c.c : t.border,
                },
              ]}
            >
              <Text style={styles.chipIcon}>{c.i}</Text>
              <Text style={[styles.chipLabel, { color: on ? c.c : t.text2, fontFamily: weight(600) }]}>
                {c.l}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* note */}
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Add a note (optional)"
        placeholderTextColor={t.text3}
        style={[
          styles.noteInput,
          { backgroundColor: t.bg2, borderColor: t.border, color: t.text1, fontFamily: weight(500) },
        ]}
      />

      {/* receipt attachment */}
      {receipt ? (
        <View style={[styles.receiptCard, { backgroundColor: t.bg2, borderColor: t.border }]}>
          <Image source={{ uri: receipt }} style={styles.receiptThumb} />
          <View style={styles.receiptText}>
            <Text style={[styles.receiptTitle, { color: t.text1, fontFamily: weight(600) }]}>
              Receipt attached
            </Text>
            <Text style={[styles.receiptSubtitle, { color: t.em, fontFamily: weight(500) }]}>
              Munshi will read the amount & merchant
            </Text>
          </View>
          <Pressable
            onPress={() => setReceipt(null)}
            style={[styles.receiptRemove, { backgroundColor: t.glassBg, borderColor: t.glassBrd }]}
          >
            <MI.close size={16} color={t.text1} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={pickReceipt}
          style={[styles.attachBtn, { borderColor: t.borderStr }]}
        >
          <MI.camera size={16} color={t.text2} />
          <Text style={[styles.attachLabel, { color: t.text2, fontFamily: weight(600) }]}>
            Attach bill or screenshot
          </Text>
        </Pressable>
      )}

      {/* keypad */}
      <View style={styles.keypad}>
        {KEYS.map((k) => (
          <Pressable
            key={k}
            onPress={() => setAmount((a) => press(a, k))}
            style={({ pressed }) => [
              styles.key,
              { backgroundColor: pressed ? t.bg3 : t.bg2 },
            ]}
          >
            {k === 'del' ? (
              <DelIcon color={t.text1} />
            ) : (
              <Text style={[styles.keyLabel, { color: t.text1, fontFamily: weight(600) }]}>{k}</Text>
            )}
          </Pressable>
        ))}
      </View>

      {/* save */}
      <Btn
        variant="em"
        onPress={() => void save()}
        disabled={amount === '' || saving}
        style={styles.saveBtn}
      >
        {saving ? 'Saving…' : `Save ${saveLabel}`}
      </Btn>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  segWrap: {
    marginBottom: 20,
  },
  amountWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 5,
    paddingTop: 4,
    paddingBottom: 18,
  },
  amountSymbol: {
    fontSize: 26,
  },
  amountValue: {
    fontSize: 52,
    letterSpacing: -1.56, // -0.03em of 52px
    lineHeight: 56,
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
    paddingHorizontal: 14,
    borderRadius: 99,
    borderWidth: 1,
  },
  chipIcon: {
    fontSize: 15,
  },
  chipLabel: {
    fontSize: 13,
  },
  noteInput: {
    marginTop: 14,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 14,
  },
  receiptCard: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderRadius: 13,
  },
  receiptThumb: {
    width: 42,
    height: 42,
    borderRadius: 9,
  },
  receiptText: {
    flex: 1,
    minWidth: 0,
  },
  receiptTitle: {
    fontSize: 13,
  },
  receiptSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  receiptRemove: {
    width: 30,
    height: 30,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachBtn: {
    marginTop: 10,
    width: '100%',
    paddingVertical: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  attachLabel: {
    fontSize: 13,
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 14,
  },
  key: {
    width: '32%',
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyLabel: {
    fontSize: 22,
  },
  saveBtn: {
    marginTop: 14,
    height: 54,
  },
});
