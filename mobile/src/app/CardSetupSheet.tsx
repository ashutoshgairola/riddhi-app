/**
 * CardSetupSheet — one-time "set up this card" flow for legacy credit
 * accounts that have no `credit_card` row yet (`CardDetail`'s 404 empty
 * state opens this). `api.cards.updateSettings` (Task 3) is now an upsert,
 * so this same PATCH call both creates and edits the row.
 *
 * Structure mirrors `PayBillSheet.tsx`: `BottomSheet` + themed `TextInput`s
 * + a single `Btn` CTA. Form → PATCH body parsing/clamping lives in the
 * pure `buildCardSetupPatch` helper (`lib/cardSetup.ts`) so it's unit
 * testable without RN.
 *
 * `updateSettings` calls `bumpData()` on success, and CardDetail's
 * `useApiData` is wired through that same signal, so the real card summary
 * replaces the empty state automatically once this sheet closes — no
 * manual refresh needed.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '../api';
import type { ApiCardSummary } from '../api/types';
import { BottomSheet } from '../components/BottomSheet';
import { Btn } from '../components/ui';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space, weight } from '../theme/tokens';
import { buildCardSetupPatch } from '../lib/cardSetup';

export interface CardSetupSheetProps {
  open: boolean;
  onClose: () => void;
  accountId: string;
}

export function CardSetupSheet({ open, onClose, accountId }: CardSetupSheetProps) {
  const { t } = useTheme();
  const { toast } = useFeedback();

  const [creditLimit, setCreditLimit] = useState('');
  const [statementDay, setStatementDay] = useState('1');
  const [network, setNetwork] = useState('');
  const [last4, setLast4] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCreditLimit(''); setStatementDay('1'); setNetwork(''); setLast4(''); setSaving(false);
  }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      const patch = buildCardSetupPatch({ creditLimit, statementDay, network, last4 });
      await api.cards.updateSettings(accountId, patch as Partial<ApiCardSummary>);
      toast('Card set up', '💳');
      onClose();
    } catch {
      toast("Couldn't save the card — try again", '📡');
    } finally {
      setSaving(false);
    }
  };

  const field = (
    label: string,
    value: string,
    onChangeText: (v: string) => void,
    opts: { numeric?: boolean; maxLength?: number; placeholder?: string } = {},
  ) => (
    <View style={styles.fieldBlock}>
      <Text style={[styles.fieldLabel, { color: t.text3, fontFamily: weight(600) }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(v) => onChangeText(opts.numeric ? v.replace(/[^0-9]/g, '') : v)}
        keyboardType={opts.numeric ? 'number-pad' : 'default'}
        maxLength={opts.maxLength}
        placeholder={opts.placeholder}
        placeholderTextColor={t.text3}
        style={[styles.input, { color: t.text1, backgroundColor: t.glassBg, borderColor: t.glassBrd, fontFamily: weight(600) }]}
      />
    </View>
  );

  return (
    <BottomSheet open={open} onClose={onClose} title="Set up this card">
      <Text style={[styles.intro, { color: t.text3, fontFamily: weight(500) }]}>
        Add your card's details so Riddhi can track the cycle, dues, and available limit.
      </Text>
      {field('Credit limit', creditLimit, setCreditLimit, { numeric: true, placeholder: '0' })}
      {field('Statement day (1–28)', statementDay, setStatementDay, { numeric: true, maxLength: 2, placeholder: '1' })}
      {field('Network (optional)', network, setNetwork, { maxLength: 40, placeholder: 'Visa / Mastercard / RuPay' })}
      {field('Last 4 digits (optional)', last4, setLast4, { numeric: true, maxLength: 4, placeholder: '4521' })}
      <Btn variant="em" onPress={() => void save()} disabled={saving} style={styles.saveBtn}>
        {saving ? 'Saving…' : 'Save card'}
      </Btn>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 12.5, lineHeight: 18, paddingBottom: space[14] },
  fieldBlock: { marginBottom: space[12] },
  fieldLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: space[6] },
  input: { height: 48, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: space[14], fontSize: 15 },
  saveBtn: { marginTop: space[8], height: 52 },
});
