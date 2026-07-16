/**
 * VendorRules — list of the user's set-once vendor mappings (created via the
 * "Always map this vendor" choice on a detection's edit form). Row tap edits
 * the shown name/category; the trash icon deletes the rule. Rules apply to
 * future syncs only — existing transactions are never rewritten.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useCallback, useEffect, useState } from 'react';

import { api } from '../api';
import type { CategoryView } from '../api/types';
import { GlassCard } from '../components/Glass';
import { ListCard, ListRow } from '../components/ui';
import { AppIconBox } from '../components/contentIcons';
import { MI } from '../components/icons';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { spacing } from '../theme/spacing';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useNav, type ScreenEntry } from '../app/navContext';
import {
  fetchVendorMappings,
  updateVendorMapping,
  deleteVendorMapping,
  type VendorMappingView,
} from '../lib/notificationSync';
import { MPageShell } from './_MPageShell';

export function VendorRules({ entry: _entry }: { entry: ScreenEntry }) {
  const { t } = useTheme();
  const { pop } = useNav();
  const { form, toast } = useFeedback();
  const [rules, setRules] = useState<VendorMappingView[]>([]);
  const [categories, setCategories] = useState<CategoryView[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cats, list] = await Promise.all([api.categories.list(), fetchVendorMappings()]);
      setCategories(cats);
      setRules(list);
    } catch {
      toast("Couldn't load vendor rules", '📡');
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const catOf = (id: string) => categories.find((c) => String(c.id) === id);

  const editRule = (r: VendorMappingView) => {
    form({
      title: 'Edit vendor rule',
      fields: [
        { key: 'name', label: 'Shown as', initial: r.displayName },
        {
          kind: 'select',
          key: 'cat',
          label: 'Category',
          options: categories.map((c) => ({ label: `${c.icon} ${c.name}`, value: String(c.id) })),
          initial: r.categoryId,
        },
      ],
      submitLabel: 'Save rule',
      // Awaited by FormSheet: it shows its busy state, closes only on
      // success, and surfaces a thrown error inline while staying open.
      onSubmit: async (v) => {
        await updateVendorMapping(r.id, { displayName: v['name']!, categoryId: v['cat']! });
        await load();
      },
    });
  };

  const removeRule = (r: VendorMappingView) => {
    setRules((cur) => cur.filter((x) => x.id !== r.id));
    void deleteVendorMapping(r.id)
      .then(() => toast('Rule deleted', '🗑'))
      .catch(() => {
        toast("Couldn't delete the rule", '📡');
        void load();
      });
  };

  return (
    <MPageShell title="Vendor rules" onBack={pop}>
      {loaded && rules.length === 0 ? (
        <GlassCard contentStyle={styles.emptyContent}>
          <Text style={[styles.emptyTitle, { color: t.text1, fontFamily: weight(700) }]}>
            No vendor rules yet
          </Text>
          <Text style={[styles.emptyBody, { color: t.text3 }]}>
            While reviewing a detected transaction, choose “Always map this vendor” in its edit
            form. Future payments to that vendor will then sync automatically.
          </Text>
        </GlassCard>
      ) : (
        <ListCard>
          {rules.map((r, i) => {
            const cat = catOf(r.categoryId);
            return (
              <ListRow key={r.id} last={i === rules.length - 1} onPress={() => editRule(r)}>
                <AppIconBox value={cat?.icon ?? '🏷️'} color={cat?.color ?? t.em} size={40} iconSize={18} />
                <View style={styles.rowText}>
                  <Text
                    style={[styles.rowTitle, { color: t.text1, fontFamily: weight(600) }]}
                    numberOfLines={1}
                  >
                    {r.displayName}
                  </Text>
                  <Text style={[styles.rowCaption, { color: t.text3 }]} numberOfLines={1}>
                    {cat?.name ?? 'Unknown'} · matches “{r.matchKey}”
                  </Text>
                </View>
                <Pressable onPress={() => removeRule(r)} hitSlop={8} style={styles.trashBtn}>
                  <MI.trash size={16} color={t.text3} />
                </Pressable>
              </ListRow>
            );
          })}
        </ListCard>
      )}

      <View style={styles.infoRow}>
        <View style={styles.infoIconWrap}>
          <MI.info size={15} color={t.text3} />
        </View>
        <Text style={[styles.infoText, { color: t.text3 }]}>
          Rules apply when new payments sync. Existing transactions and subscriptions aren't
          changed.
        </Text>
      </View>
    </MPageShell>
  );
}

const styles = StyleSheet.create({
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 14,
  },
  rowCaption: {
    fontSize: 11.5,
    marginTop: spacing.xxs,
  },
  trashBtn: {
    padding: spacing.xs,
    flexShrink: 0,
  },
  emptyContent: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 14.5,
  },
  emptyBody: {
    fontSize: 12.5,
    marginTop: spacing.xxs,
    lineHeight: 18.75,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'flex-start',
    paddingHorizontal: spacing.xxs,
    marginTop: spacing.xl,
  },
  infoIconWrap: {
    marginTop: spacing.xxs,
    flexShrink: 0,
  },
  infoText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 17.25,
  },
});
