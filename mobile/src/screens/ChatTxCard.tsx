/**
 * ChatTxCard — RN port of `project/riddhi/MobileChat.jsx:84–105`
 * (`function ChatTxCard({ tx })`).
 *
 * Renders the small "extracted transaction" card shown under a bot
 * message when the AI logged a spend/income: category icon box, merchant
 * name, category · time line, amount (income in `em`, expense in `text1`),
 * and a "Added" checkmark line.
 *
 * `CHAT_CATCOL`/`CHAT_ICON` are the same category-color/emoji maps used by
 * `AddTxSheet`'s `QA_CATS` (MobileApp.jsx:54–77) but keyed flat by
 * category label rather than nested under a tx-type — transcribed
 * verbatim from MobileChat.jsx:18–25, not reused from `QA_CATS`, since the
 * source defines them as a separate flat lookup (and `QA_CATS` doesn't
 * have an `Income` entry, which this card needs).
 */
import { StyleSheet, Text, View } from 'react-native';

import { AppIconBox } from '../components/contentIcons';
import { MI } from '../components/icons';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { spacing } from '../theme/spacing';
export interface ChatTx {
  merchant: string;
  /** Signed: positive = income, negative = expense. */
  amount: number;
  category: string;
  time: string;
}

// MobileChat.jsx:18–21
export const CHAT_CATCOL: Record<string, string> = {
  Food: '#c9a86a',
  Transport: '#9d8bd6',
  Shopping: '#c97d8c',
  Groceries: '#7faf93',
  Bills: '#6fb3ad',
  Health: '#8197c4',
  Fun: '#bd7ba0',
  Income: '#7faf93',
  Other: '#8a8299',
};

// MobileChat.jsx:22–25
export const CHAT_ICON: Record<string, string> = {
  Food: '🍽',
  Transport: '🚗',
  Shopping: '🛍',
  Groceries: '🛒',
  Bills: '⚡',
  Health: '💊',
  Fun: '🎬',
  Income: '💼',
  Other: '•',
};

const fmt = (n: number) => '₹' + Math.abs(n).toLocaleString('en-IN');

export interface ChatTxCardProps {
  tx: ChatTx;
}

export function ChatTxCard({ tx }: ChatTxCardProps) {
  const { t } = useTheme();
  const col = CHAT_CATCOL[tx.category] || '#8a8299';
  const inc = tx.amount > 0;

  return (
    <View style={[styles.card, { backgroundColor: t.bg1, borderColor: t.border }]}>
      <View style={styles.iconWrap}>
        <AppIconBox value={CHAT_ICON[tx.category] || '•'} color={col} size={40} iconSize={19} />
      </View>
      <View style={styles.mid}>
        <Text style={[styles.merchant, { color: t.text1, fontFamily: weight(600) }]} numberOfLines={1}>
          {tx.merchant}
        </Text>
        <Text style={[styles.meta, { color: t.text3, fontFamily: weight(500) }]} numberOfLines={1}>
          <Text style={{ color: col, fontFamily: weight(600) }}>{tx.category}</Text>
          {tx.time ? ` · ${tx.time}` : ''}
        </Text>
      </View>
      <View style={styles.right}>
        <Text
          style={[
            styles.amount,
            { color: inc ? t.em : t.text1, fontFamily: weight(700) },
          ]}
        >
          {inc ? '+' : '−'}
          {fmt(tx.amount)}
        </Text>
        <View style={styles.addedRow}>
          <MI.check size={11} color={t.em} strokeWidth={3} />
          <Text style={[styles.added, { color: t.em, fontFamily: weight(600) }]}>Added</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 280,
  },
  iconWrap: {
    flexShrink: 0,
  },
  mid: {
    flex: 1,
    minWidth: 0,
  },
  merchant: {
    fontSize: 14,
  },
  meta: {
    fontSize: 11,
    marginTop: spacing.xxs,
  },
  right: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  amount: {
    fontSize: 15,
  },
  addedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    marginTop: spacing.xxs,
  },
  added: {
    fontSize: 10,
  },
});
