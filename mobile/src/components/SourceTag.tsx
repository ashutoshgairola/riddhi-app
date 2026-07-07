/**
 * SourceTag — small pill (colored dot + label) showing a transaction's
 * payment source (card/autopay/cash/bank/upi). Rendered inline with the
 * category/date meta on transaction rows (SwipeRow, TxDetail, Home recents).
 *
 * Dot color mirrors the source kind: card -> em, autopay -> amber,
 * cash -> text3, bank/upi -> cyan.
 */
import { View, Text, StyleSheet } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';
import type { TxSource, SourceKind } from '../api/paymentSource';

function dotColor(kind: SourceKind, t: Tokens): string {
  switch (kind) {
    case 'card':
      return t.em;
    case 'autopay':
      return t.amber;
    case 'cash':
      return t.text3;
    case 'bank':
    case 'upi':
    default:
      return t.cyan;
  }
}

export function SourceTag({ source }: { source?: TxSource }) {
  const { t } = useTheme();
  if (!source) return null;
  return (
    <View style={[styles.pill, { backgroundColor: t.bg3, borderColor: t.border }]}>
      <View style={[styles.dot, { backgroundColor: dotColor(source.kind, t) }]} />
      <Text style={[styles.label, { color: t.text3 }]} numberOfLines={1}>
        {source.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 1.5,
    paddingHorizontal: 7,
    borderRadius: 99,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 10, fontWeight: '700' },
});
