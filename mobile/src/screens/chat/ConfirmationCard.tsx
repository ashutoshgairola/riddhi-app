/**
 * ConfirmationCard — in-chat Confirm/Cancel card for risky AI actions
 * (updates, deletes, large amounts). The backend holds a PendingAction row;
 * nothing touches the DB until Confirm calls POST /ai-chat/actions/:id/confirm.
 * On confirm, result widgets returned by the executed tool render beneath.
 */
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Btn } from '../../components/ui';
import { useTheme } from '../../theme/ThemeProvider';
import { space, weight } from '../../theme/tokens';
import { chatApi } from '../../api/chatApi';
import type { ConfirmationWidget, Widget } from '../../ai/widgets';

type Status = ConfirmationWidget['status'];

const STATUS_LABEL: Record<Exclude<Status, 'pending'>, string> = {
  executed: 'Done',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

export function ConfirmationCard({
  widget,
  renderWidget,
}: {
  widget: ConfirmationWidget;
  renderWidget: (w: Widget, key: string) => ReactNode;
}) {
  const { t } = useTheme();
  const [status, setStatus] = useState<Status>(widget.status);
  const [busy, setBusy] = useState(false);
  const [resultWidgets, setResultWidgets] = useState<Widget[]>([]);
  const [error, setError] = useState<string | null>(null);

  const resolve = async (kind: 'confirm' | 'cancel') => {
    if (busy || status !== 'pending') return;
    setBusy(true);
    setError(null);
    try {
      const res =
        kind === 'confirm'
          ? await chatApi.confirmAction(widget.actionId)
          : await chatApi.cancelAction(widget.actionId);
      setStatus(res.status);
      setResultWidgets(res.widgets);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      // Expired / already-resolved actions come back as 400s.
      if (/expired/i.test(msg)) setStatus('expired');
      else setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const pending = status === 'pending';

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.card,
          { backgroundColor: t.bg1, borderColor: pending ? t.em : t.border },
        ]}
      >
        <Text style={[styles.title, { color: t.text1, fontFamily: weight(700) }]}>
          {widget.title}
        </Text>
        <Text style={[styles.summary, { color: t.text2, fontFamily: weight(400) }]}>
          {widget.summary}
        </Text>

        {widget.fields.length > 0 && (
          <View style={[styles.fields, { borderColor: t.border }]}>
            {widget.fields.map((f) => (
              <View key={f.label} style={styles.fieldRow}>
                <Text style={[styles.fieldLabel, { color: t.text3, fontFamily: weight(500) }]}>
                  {f.label}
                </Text>
                <Text
                  style={[styles.fieldValue, { color: t.text1, fontFamily: weight(600) }]}
                  numberOfLines={2}
                >
                  {f.value}
                </Text>
              </View>
            ))}
          </View>
        )}

        {pending ? (
          <View style={styles.actions}>
            <View style={styles.actionBtn}>
              <Btn variant="ghost" onPress={() => void resolve('cancel')} disabled={busy}>
                Cancel
              </Btn>
            </View>
            <View style={styles.actionBtn}>
              <Btn variant="em" onPress={() => void resolve('confirm')} disabled={busy}>
                {busy ? 'Working…' : 'Confirm'}
              </Btn>
            </View>
          </View>
        ) : (
          <View
            style={[
              styles.statusPill,
              {
                backgroundColor: status === 'executed' ? t.emDim : t.bg2,
                borderColor: t.border,
              },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                {
                  color: status === 'executed' ? t.em : t.text3,
                  fontFamily: weight(600),
                },
              ]}
            >
              {STATUS_LABEL[status as Exclude<Status, 'pending'>]}
            </Text>
          </View>
        )}

        {error && (
          <Text style={[styles.error, { color: t.red, fontFamily: weight(500) }]}>{error}</Text>
        )}
      </View>

      {resultWidgets.map((w, i) => renderWidget(w, `confirm-result-${i}`))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: space[10],
    maxWidth: 300,
    alignSelf: 'stretch',
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: space[14],
  },
  title: {
    fontSize: 14,
  },
  summary: {
    fontSize: 12.5,
    marginTop: space[4],
    lineHeight: 18,
  },
  fields: {
    marginTop: space[10],
    borderTopWidth: 1,
    paddingTop: space[8],
    gap: space[6],
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space[12],
  },
  fieldLabel: {
    fontSize: 11.5,
    flexShrink: 0,
  },
  fieldValue: {
    fontSize: 11.5,
    flexShrink: 1,
    textAlign: 'right',
  },
  actions: {
    flexDirection: 'row',
    gap: space[8],
    marginTop: space[12],
  },
  actionBtn: {
    flex: 1,
  },
  statusPill: {
    alignSelf: 'flex-start',
    marginTop: space[12],
    paddingVertical: space[6],
    paddingHorizontal: space[12],
    borderRadius: 11,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
  },
  error: {
    fontSize: 11.5,
    marginTop: space[8],
  },
});
