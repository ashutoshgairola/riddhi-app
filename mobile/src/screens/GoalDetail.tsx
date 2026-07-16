/**
 * GoalDetail — full-screen drill-in for a goal (pushed from Goals.tsx).
 * Progress is derived server-side from the goal's linked account balance;
 * "Transfer savings" moves money from a chosen source account into that
 * linked account via api.goals.contribute. Goals with no linked account
 * (legacy) instead offer "Link a savings account".
 *
 * `GlassCard` (components/Glass.tsx) has no `onPress` prop — unlike the
 * brief's assumed shape, it's a bare style/contentStyle/children surface.
 * The two action cards below are wrapped in `Pressable` instead, matching
 * the pattern AccountDetail.tsx already uses for its GlassCard quick-action
 * buttons (Pressable owns the tap + pressed-opacity feedback, GlassCard is
 * purely visual).
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '../components/Glass';
import { AppIconBox } from '../components/contentIcons';
import { ProgressBar } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import { weight, type Tokens } from '../theme/tokens';
import { spacing } from '../theme/spacing';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useNav, type ScreenEntry } from '../app/navContext';
import type { FormFieldSpec } from '../components/FormSheet';
import { api } from '../api';
import { useApiData } from '../api/useApi';
import { MPageShell } from './_MPageShell';
import type { GoalView } from '../api/types';

function fmt(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export function GoalDetail({ entry }: { entry: ScreenEntry }) {
  const seed = entry.data as GoalView;
  const { t } = useTheme();
  const { pop } = useNav();
  const { toast, form } = useFeedback();

  const { data: goal } = useApiData(() => api.goals.get(seed.id), seed);
  const { data: accounts } = useApiData(() => api.accounts.list(), []);

  const pct =
    goal.target > 0
      ? Math.min(100, Math.max(0, Math.round((goal.saved / goal.target) * 100)))
      : 0;

  const transfer = () => {
    const sources = accounts.filter((a) => String(a.id) !== goal.accountId);
    if (sources.length === 0) {
      toast('Add another account to transfer from', '🏦');
      return;
    }
    const sourceField: FormFieldSpec = {
      kind: 'select',
      key: 'source',
      label: 'From account',
      initial: String(sources[0]!.id),
      options: sources.map((a) => ({ label: a.name, value: String(a.id) })),
    };
    form({
      title: `Transfer to ${goal.name}`,
      fields: [sourceField, { kind: 'amount', key: 'amount', label: 'Amount (₹)' }],
      submitLabel: 'Transfer',
      onSubmit: async (v) => {
        await api.goals.contribute(goal.id, {
          amount: Number(v['amount']),
          sourceAccountId: v['source']!,
        });
        toast(`Transferred ${fmt(Number(v['amount']))} to ${goal.name}`, '🎯');
        pop(); // list is fresh; this screen holds seed route data
      },
    });
  };

  const linkAccount = () => {
    const linkable = accounts.filter((a) => a.type === 'savings' || a.type === 'cash');
    if (linkable.length === 0) {
      toast('Create a savings account first', '🏦');
      return;
    }
    const field: FormFieldSpec = {
      kind: 'select',
      key: 'account',
      label: 'Savings account',
      initial: String(linkable[0]!.id),
      options: linkable.map((a) => ({ label: a.name, value: String(a.id) })),
    };
    form({
      title: 'Link a savings account',
      fields: [field],
      submitLabel: 'Link account',
      onSubmit: async (v) => {
        await api.goals.update(goal.id, { accountId: v['account']! });
        toast('Account linked', '🔗');
        pop();
      },
    });
  };

  if (!goal?.name) {
    // `entry.data` from an id-only deep link (e.g. a goal-progress
    // notification) is a bare `{ id }` stub — every other GoalView field is
    // undefined until `api.goals.get` resolves. `useApiData` renders that
    // stub synchronously on the first pass (mirrors TxDetail.tsx's guard),
    // so without this the header/stats below would flash `fmt(undefined)`
    // ("₹NaN") and the wrong action card (accountId undefined => "Link a
    // savings account") before the real goal arrives.
    return (
      <MPageShell title="Goal" onBack={pop}>
        <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
          <ActivityIndicator color={t.text3} />
        </View>
      </MPageShell>
    );
  }

  return (
    <MPageShell title={goal.name} onBack={pop}>
      <View style={styles.body}>
        <GlassCard style={styles.headerCard}>
          <View style={styles.headerRow}>
            <AppIconBox value={goal.emoji} color={goal.color} size={48} iconSize={22} />
            <View style={styles.headerText}>
              <Text style={[styles.name, { color: t.text1, fontFamily: weight(700) }]}>{goal.name}</Text>
              <Text style={[styles.sub, { color: t.text3 }]}>Target {goal.date}</Text>
            </View>
            <Text style={[styles.pct, { color: goal.color, fontFamily: weight(700) }]}>{pct}%</Text>
          </View>
          <ProgressBar pct={pct} color={goal.color} height={8} />
          <View style={styles.stats}>
            <Stat label="Saved" value={fmt(goal.saved)} t={t} />
            <Stat label="Target" value={fmt(goal.target)} t={t} />
            <Stat label="Remaining" value={fmt(goal.remaining)} t={t} />
          </View>
        </GlassCard>

        {goal.accountId ? (
          <Pressable onPress={transfer} accessibilityRole="button" accessibilityLabel="Transfer savings">
            {({ pressed }) => (
              <GlassCard style={[styles.actionCard, { opacity: pressed ? 0.6 : 1 }]}>
                <Text style={[styles.action, { color: goal.color, fontFamily: weight(700) }]}>
                  Transfer savings
                </Text>
              </GlassCard>
            )}
          </Pressable>
        ) : (
          <Pressable onPress={linkAccount} accessibilityRole="button" accessibilityLabel="Link a savings account">
            {({ pressed }) => (
              <GlassCard style={[styles.actionCard, { opacity: pressed ? 0.6 : 1 }]}>
                <Text style={[styles.action, { color: goal.color, fontFamily: weight(700) }]}>
                  Link a savings account
                </Text>
              </GlassCard>
            )}
          </Pressable>
        )}
      </View>
    </MPageShell>
  );
}

function Stat({ label, value, t }: { label: string; value: string; t: Tokens }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: t.text3 }]}>{label}</Text>
      <Text style={[styles.statValue, { color: t.text1, fontFamily: weight(700) }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.xs, gap: spacing.md },
  headerCard: { padding: spacing.lg, gap: spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerText: { flex: 1, minWidth: 0 },
  name: { fontSize: 18 },
  sub: { fontSize: 12, marginTop: spacing.xxs },
  pct: { fontSize: 18 },
  stats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xxs },
  stat: { gap: spacing.xxs },
  statLabel: { fontSize: 12 },
  statValue: { fontSize: 16 },
  actionCard: { padding: spacing.lg, alignItems: 'center' },
  action: { fontSize: 16 },
});
