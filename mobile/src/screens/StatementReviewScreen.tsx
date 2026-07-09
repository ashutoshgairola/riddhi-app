/**
 * StatementReview — Task 10's landing screen after a statement PDF has been
 * picked, decrypted (on-device, if needed) and parsed. Reads
 * `entry.data: { view: StatementParseResultView; accountId: string }`, the
 * in-memory handoff `useStatementImportLauncher.push` (`app/
 * useStatementImportLauncher.tsx`) hands it — same pattern `CardDetail`/
 * `AccountDetail` use for their pushed `Account` (`entry.data as Account`),
 * just with a route-only object instead of one refetched from `useApiData`
 * (there is no `GET` for a parse result; it only ever exists as this one
 * response).
 *
 * Building blocks reused rather than reimplemented:
 *  - `MPageShell` for the page scaffold; the Import bar is rendered as a
 *    sibling (not inside the ScrollView), the same "sibling of MPageShell"
 *    technique `CardDetail` uses for `PayBillSheet` — an absolutely
 *    positioned bottom bar isn't part of the scroll content.
 *  - `GlassCard` for the summary header, mismatch banner and each item row's
 *    container (`ListCard`/`ListRow`).
 *  - `Toggle` for "Apply these figures" / "Set balance to…" and each row's
 *    include switch.
 *  - `Chip` for the inline per-row category, tappable to open a category
 *    picker (`useFeedback().sheet`, mirroring `TxDetail`'s pattern) with a
 *    "New category…" fallback (`useFeedback().form`, one text field).
 *  - `bucketByVerdict`/`defaultIncluded`/`buildImportPayload`
 *    (`screens/statementReview.ts`, Task 9) for bucketing, default
 *    selection and the `/statements/import` payload.
 *  - `api.categories.resolveId` on Import-bar confirm — create-or-resolve
 *    any category name the user typed/picked that doesn't exist yet, so the
 *    backend's own by-name lookup (which has no create fallback — see
 *    `StatementsService.import`, it silently falls back to "Other" on a
 *    miss) finds it.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../api';
import type { CategoryView } from '../api/types';
import { useApiData } from '../api/useApi';
import { GlassCard } from '../components/Glass';
import { Btn, Chip, ListCard, ListRow, SectionHead, Toggle } from '../components/ui';
import { MI } from '../components/icons';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useNav, type ScreenEntry } from '../app/navContext';
import { MPageShell } from './_MPageShell';
import {
  bucketByVerdict,
  buildImportPayload,
  defaultIncluded,
  type ClassifiedLineView,
  type StatementParseResultView,
} from './statementReview';

const EMPTY_CATEGORIES: CategoryView[] = [];

interface ReviewRoute {
  view: StatementParseResultView;
  accountId: string;
}

// Money formatting (CardDetail.tsx's `cFmt`) — unsigned, en-IN grouped.
function cFmt(n: number): string {
  return '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN');
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// The wire summary is a closed shape (`ApiStatementSummary`) carried as a
// loose Record on the view (see `adapters.ts`'s `toStatementParseResultView`
// doc comment) — this just names the keys back out for display.
interface SummaryFields {
  statementDate: string | null;
  statementBilled: number | null;
  statementMinDue: number | null;
  statementDueDate: string | null;
  statementRewards: number | null;
  openingBalance: number | null;
  closingBalance: number | null;
}
function summaryFields(view: StatementParseResultView): SummaryFields {
  const s = view.summary;
  return {
    statementDate: (s['statementDate'] as string | null) ?? null,
    statementBilled: (s['statementBilled'] as number | null) ?? null,
    statementMinDue: (s['statementMinDue'] as number | null) ?? null,
    statementDueDate: (s['statementDueDate'] as string | null) ?? null,
    statementRewards: (s['statementRewards'] as number | null) ?? null,
    openingBalance: (s['openingBalance'] as number | null) ?? null,
    closingBalance: (s['closingBalance'] as number | null) ?? null,
  };
}

type IndexedItem = ClassifiedLineView & { idx: number };

const VERDICT_HINT: Record<ClassifiedLineView['verdict'], string | null> = {
  new: null,
  possible: 'Might already exist — check before adding',
  duplicate: 'Already imported',
};

export function StatementReview({ entry }: { entry: ScreenEntry }) {
  const { view, accountId } = entry.data as ReviewRoute;
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { pop } = useNav();
  const { toast, sheet, form } = useFeedback();

  const [items, setItems] = useState<ClassifiedLineView[]>(view.items);
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(items.map((it, idx) => (defaultIncluded(it) ? idx : -1)).filter((i) => i >= 0)),
  );
  const [applySummary, setApplySummary] = useState(true);
  const [setBalanceOn, setSetBalanceOn] = useState(false);
  const [importing, setImporting] = useState(false);

  const { data: categories } = useApiData(() => api.categories.list(), EMPTY_CATEGORIES);

  const summary = summaryFields(view);
  const isCard = view.statementType === 'card';
  const hasClosingBalance = !isCard && typeof summary.closingBalance === 'number';

  const buckets = useMemo(() => {
    const indexed: IndexedItem[] = items.map((it, idx) => ({ ...it, idx }));
    return bucketByVerdict(indexed) as {
      new: IndexedItem[];
      possible: IndexedItem[];
      duplicate: IndexedItem[];
    };
  }, [items]);

  const toggleIncluded = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const updateCategory = (idx: number, name: string) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, category: name } : it)));
  };

  const openCategoryPicker = (idx: number, current: string | null) => {
    sheet({
      title: 'Category',
      options: [
        ...categories.map((c) => ({
          label: `${c.icon} ${c.name}`,
          selected: !!current && c.name.toLowerCase() === current.toLowerCase(),
          onPress: () => updateCategory(idx, c.name),
        })),
        {
          label: 'New category…',
          icon: '➕',
          onPress: () => {
            form({
              title: 'New category',
              fields: [{ key: 'name', label: 'Category name', placeholder: 'e.g. Subscriptions' }],
              submitLabel: 'Use category',
              onSubmit: (v) => {
                updateCategory(idx, v['name']!);
              },
            });
          },
        },
      ],
    });
  };

  const includedCount = selected.size;
  const skippedCount = items.length - includedCount;

  const onImport = async () => {
    if (includedCount === 0) {
      toast('Select at least one transaction to import', '☑️');
      return;
    }
    setImporting(true);
    try {
      // Create-or-resolve every distinct category name among the selected
      // items first — the backend's own by-name lookup at import time has
      // no create fallback (falls back to "Other" on a miss), so any
      // brand-new name the user picked/typed here must exist before then.
      const names = Array.from(
        new Set(
          items
            .map((it, idx) => (selected.has(idx) ? it.category : null))
            .filter((n): n is string => !!n),
        ),
      );
      await Promise.all(names.map((n) => api.categories.resolveId(n)));

      const payload = buildImportPayload({ ...view, items }, selected, {
        applySummary,
        setBalance: setBalanceOn && hasClosingBalance ? (summary.closingBalance as number) : undefined,
      });
      // The route's accountId is the source of truth for who this import is
      // for (it's what resolved the account in the first place); the parsed
      // view's own account.id always agrees with it once resolved (see
      // `useStatementImportLauncher`), but building the payload from a
      // patched `view` keeps this a one-line override rather than a second
      // near-duplicate of `buildImportPayload`.
      const res = await api.statements.import({ ...payload, accountId });
      toast(`Added ${res.imported} transaction${res.imported === 1 ? '' : 's'}`, '📄');
      pop();
    } catch {
      toast("Couldn't import — try again", '📡');
    } finally {
      setImporting(false);
    }
  };

  const renderSection = (title: string, sectionItems: IndexedItem[], defaultCollapsedHint?: string) => {
    if (sectionItems.length === 0) return null;
    return (
      <View style={styles.section}>
        <SectionHead title={`${title} · ${sectionItems.length}`} />
        {defaultCollapsedHint ? (
          <Text style={[styles.sectionHint, { color: t.text3 }]}>{defaultCollapsedHint}</Text>
        ) : null}
        <ListCard>
          {sectionItems.map((it, i) => (
            <ListRow key={it.idx} last={i === sectionItems.length - 1}>
              <View style={styles.rowLeft}>
                <Text style={[styles.rowDate, { color: t.text3 }]}>{fmtDate(it.isoDate)}</Text>
                <Text style={[styles.rowDesc, { color: t.text1, fontFamily: weight(600) }]} numberOfLines={1}>
                  {it.descriptor}
                </Text>
                <View style={styles.rowMetaRow}>
                  <Chip onPress={() => openCategoryPicker(it.idx, it.category)}>
                    {it.category ?? 'Uncategorized'}
                  </Chip>
                  {VERDICT_HINT[it.verdict] ? (
                    <Text style={[styles.rowHint, { color: t.amber }]} numberOfLines={1}>
                      {VERDICT_HINT[it.verdict]}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.rowRight}>
                <Text
                  style={[
                    styles.rowAmount,
                    { color: it.direction === 'credit' ? t.em : t.text1, fontFamily: weight(700) },
                  ]}
                >
                  {it.direction === 'credit' ? '+' : '-'}
                  {cFmt(it.amount)}
                </Text>
                <Toggle on={selected.has(it.idx)} onChange={() => toggleIncluded(it.idx)} />
              </View>
            </ListRow>
          ))}
        </ListCard>
      </View>
    );
  };

  return (
    <>
      <MPageShell title="Review statement" onBack={pop} contentContainerStyle={styles.scrollContent}>
        {view.account.mismatchWarning ? (
          <GlassCard style={styles.banner}>
            <MI.info size={18} color={t.amber} />
            <Text style={[styles.bannerText, { color: t.text1 }]}>
              This statement looks like it's for a different card. You can still import it below.
            </Text>
          </GlassCard>
        ) : null}

        {isCard ? (
          <GlassCard style={styles.summaryCard}>
            <Text style={[styles.summaryTitle, { color: t.text1, fontFamily: weight(700) }]}>
              Statement figures
            </Text>
            <View style={styles.summaryGrid}>
              {summary.statementBilled != null ? (
                <SummaryStat label="Billed" value={cFmt(summary.statementBilled)} color={t.text1} />
              ) : null}
              {summary.statementMinDue != null ? (
                <SummaryStat label="Min due" value={cFmt(summary.statementMinDue)} color={t.text1} />
              ) : null}
              {summary.statementDueDate ? (
                <SummaryStat label="Due date" value={fmtDate(summary.statementDueDate)} color={t.text1} />
              ) : null}
              {summary.statementRewards != null ? (
                <SummaryStat label="Rewards" value={cFmt(summary.statementRewards)} color={t.text1} />
              ) : null}
              {summary.statementDate ? (
                <SummaryStat label="Statement date" value={fmtDate(summary.statementDate)} color={t.text1} />
              ) : null}
            </View>
            <View style={[styles.toggleRow, { borderTopColor: t.border }]}>
              <Text style={[styles.toggleLabel, { color: t.text2 }]}>Apply these figures</Text>
              <Toggle on={applySummary} onChange={setApplySummary} />
            </View>
          </GlassCard>
        ) : hasClosingBalance ? (
          <GlassCard style={styles.summaryCard}>
            <View style={styles.toggleRow}>
              <Text style={[styles.toggleLabel, { color: t.text2 }]}>
                Set balance to {cFmt(summary.closingBalance as number)}
              </Text>
              <Toggle on={setBalanceOn} onChange={setSetBalanceOn} />
            </View>
          </GlassCard>
        ) : null}

        {renderSection('New', buckets.new)}
        {renderSection(
          'Possible duplicates',
          buckets.possible,
          'These look similar to transactions you already have — review before adding.',
        )}
        {renderSection('Already imported', buckets.duplicate)}

        {items.length === 0 ? (
          <GlassCard style={styles.emptyCard}>
            <Text style={[styles.emptyText, { color: t.text3 }]}>
              No line items were found in this statement.
            </Text>
          </GlassCard>
        ) : null}
      </MPageShell>

      {/* Sibling of MPageShell, not inside its ScrollView — same reasoning
       * CardDetail's PayBillSheet comment gives: an absolute-fill/bottom
       * surface needs to sit above the scroll content, not scroll with it. */}
      <View
        style={[
          styles.importBar,
          { backgroundColor: t.bg1, borderTopColor: t.border, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <Btn onPress={() => void onImport()} disabled={importing || includedCount === 0}>
          {importing ? 'Importing…' : `Add ${includedCount} · skip ${skippedCount}`}
        </Btn>
      </View>
    </>
  );
}

function SummaryStat({ label, value, color }: { label: string; value: string; color: string }) {
  const { t } = useTheme();
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statLabel, { color: t.text3 }]}>{label}</Text>
      <Text style={[styles.statValue, { color, fontFamily: weight(700) }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 110,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 14,
  },
  bannerText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },
  summaryCard: {
    marginBottom: 14,
  },
  summaryTitle: {
    fontSize: 14.5,
    marginBottom: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  statBox: {
    minWidth: '28%',
  },
  statLabel: {
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  statValue: {
    fontSize: 15,
    marginTop: 3,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  toggleLabel: {
    fontSize: 13.5,
    flex: 1,
    marginRight: 12,
  },
  section: {
    marginBottom: 18,
  },
  sectionHint: {
    fontSize: 11.5,
    marginTop: -6,
    marginBottom: 10,
    paddingHorizontal: 4,
    lineHeight: 16,
  },
  rowLeft: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  rowDate: {
    fontSize: 11,
  },
  rowDesc: {
    fontSize: 14,
  },
  rowMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  rowHint: {
    fontSize: 11,
    flexShrink: 1,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 8,
    marginLeft: 10,
  },
  rowAmount: {
    fontSize: 14,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 13,
  },
  importBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: 1,
  },
});
