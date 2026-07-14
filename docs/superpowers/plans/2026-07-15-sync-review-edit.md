# Editable Needs-review Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users edit a detected transaction's name, amount, category, account, date and type on the Auto-sync "Needs review" cards before tapping Add transaction.

**Architecture:** Client-only. Edits patch the item in `Sync.tsx`'s `detected: DetectedView[]` state; the card display (`toDetectedCardTx`) and the confirm payload (`confirmDetectedItem`) already derive from that array, so edited values flow through with zero backend changes. The form-values→view merge is a pure function in `lib/notificationSync.ts`.

**Tech Stack:** React Native (Expo 56), existing `useFeedback().form`/`.sheet` (FormSheet/BottomSheet), Jest.

**Spec:** `docs/superpowers/specs/2026-07-15-sync-review-edit-design.md`

## Global Constraints

- Mobile only; no backend changes.
- All commands run from `mobile/`.
- Spacing uses named tokens from `theme/spacing.ts` (e.g. `spacing.sm`) — never raw px.
- Commit with author email `gairola.ashutosh26@gmail.com`, no Co-Authored-By trailer.
- Expo docs, if needed: https://docs.expo.dev/versions/v56.0.0/

---

### Task 1: `applyDetectedEdit` pure merge in lib/notificationSync.ts

**Files:**
- Modify: `mobile/src/lib/notificationSync.ts` (append after `ConfirmPayload`, ~line 53)
- Test: `mobile/src/lib/notificationSync.spec.ts` (append a new `describe` at the end)

**Interfaces:**
- Consumes: existing `DetectedView` (already exported from this file):
  ```ts
  export interface DetectedView {
    id: string;
    merchant: string | null;
    amount: number | null;
    type: 'income' | 'expense';
    suggestedCategory: string | null;
    accountId: string | null;
    paymentMethod: string;
    confidence: number;
    postedAt: string | null;
  }
  ```
- Produces: `export function applyDetectedEdit(d: DetectedView, v: Record<string, string>): DetectedView` — `v` is a FormSheet values record with keys `desc`, `amount`, `cat`, `account`, `date`, `type`. Task 3 calls this from the form's `onSubmit`.

- [ ] **Step 1: Write the failing tests**

Append to `mobile/src/lib/notificationSync.spec.ts` (bottom of file). Also extend the existing import line `import { uploadCaptured, configureAllowlist } from './notificationSync';` to include `applyDetectedEdit` and `type DetectedView`:

```ts
import { uploadCaptured, configureAllowlist, applyDetectedEdit, type DetectedView } from './notificationSync';
```

```ts
describe('applyDetectedEdit', () => {
  const base: DetectedView = {
    id: 'det-1',
    merchant: 'DILIP KUMAR',
    amount: 150,
    type: 'expense',
    suggestedCategory: null,
    accountId: null,
    paymentMethod: 'upi',
    confidence: 0.9,
    postedAt: '2026-07-14T17:36:00.000Z',
  };
  const values = {
    desc: 'Dilip (milk)',
    amount: '180',
    cat: 'Groceries',
    account: 'acc-9',
    date: '2026-07-13',
    type: 'expense',
  };

  it('maps form values onto the view', () => {
    const out = applyDetectedEdit(base, values);
    expect(out).toEqual({
      ...base,
      merchant: 'Dilip (milk)',
      amount: 180,
      type: 'expense',
      suggestedCategory: 'Groceries',
      accountId: 'acc-9',
      postedAt: '2026-07-13T17:36:00.000Z', // date replaced, time-of-day kept
    });
  });

  it('stores amount as an absolute number and honors income type', () => {
    const out = applyDetectedEdit(base, { ...values, amount: '-250', type: 'income' });
    expect(out.amount).toBe(250);
    expect(out.type).toBe('income');
  });

  it('maps an empty account selection to null (Unlinked)', () => {
    const out = applyDetectedEdit({ ...base, accountId: 'acc-1' }, { ...values, account: '' });
    expect(out.accountId).toBeNull();
  });

  it('builds a midnight-UTC postedAt when the original had none', () => {
    const out = applyDetectedEdit({ ...base, postedAt: null }, values);
    expect(out.postedAt).toBe('2026-07-13T00:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile && npx jest src/lib/notificationSync.spec.ts -t applyDetectedEdit`
Expected: FAIL — `applyDetectedEdit` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `mobile/src/lib/notificationSync.ts`, directly after the `ConfirmPayload` interface (~line 53):

```ts
/** Merges FormSheet edit values (Sync's "Edit detection" form — keys `desc`,
 * `amount`, `cat`, `account`, `date`, `type`) back onto a detected view.
 * Amount is stored unsigned (sign comes from `type`, matching how
 * `confirmDetectedItem` builds its payload); an empty account value means
 * Unlinked; editing the date keeps the original time-of-day when known. */
export function applyDetectedEdit(d: DetectedView, v: Record<string, string>): DetectedView {
  const date = v['date']!;
  return {
    ...d,
    merchant: v['desc']!,
    amount: Math.abs(Number(v['amount'])),
    type: v['type'] === 'income' ? 'income' : 'expense',
    suggestedCategory: v['cat']!,
    accountId: v['account'] ? v['account'] : null,
    postedAt: d.postedAt ? date + d.postedAt.slice(10) : `${date}T00:00:00.000Z`,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mobile && npx jest src/lib/notificationSync.spec.ts`
Expected: PASS (all suites in the file, new and pre-existing).

- [ ] **Step 5: Commit**

```bash
cd mobile && git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(sync): applyDetectedEdit merge for review-item edits" -- src/lib/notificationSync.ts src/lib/notificationSync.spec.ts
```

---

### Task 2: DetectedCard edit surfaces

**Files:**
- Modify: `mobile/src/screens/DetectedCard.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: two new **optional** props on `DetectedCardProps`, which Task 3 passes from Sync:
  ```ts
  onEdit?: (id: string) => void;        // card body tap + Edit action button
  onEditCategory?: (id: string) => void; // category chip tap
  ```
  Existing props/behavior (confirm/dismiss animation) unchanged.

- [ ] **Step 1: Extend the props**

In `mobile/src/screens/DetectedCard.tsx`, change the interface and destructuring:

```ts
export interface DetectedCardProps {
  tx: SyncDetected;
  onConfirm: (id: string) => void;
  onDismiss: (id: string) => void;
  /** Opens the full edit form (card body tap and the Edit action button). */
  onEdit?: (id: string) => void;
  /** Opens the category picker (category chip tap). */
  onEditCategory?: (id: string) => void;
}

export function DetectedCard({ tx, onConfirm, onDismiss, onEdit, onEditCategory }: DetectedCardProps) {
```

- [ ] **Step 2: Make the card body and category chip tappable**

Wrap the two content blocks (the `resultRow` View and the `rawWrap` View — NOT the actions row) in a single `Pressable`. The chip becomes a nested `Pressable` (RN gives the inner pressable precedence):

```tsx
      <GlassView style={styles.card} radius={radius.xl} padding={0}>
        <Pressable onPress={onEdit ? () => onEdit(tx.id) : undefined}>
          {/* parsed result */}
          <View style={styles.resultRow}>
            <AppIconBox value={tx.icon} color={tx.catCol} size={44} />
            <View style={styles.resultText}>
              <Text style={[styles.merchant, { color: t.text1, fontFamily: weight(600) }]} numberOfLines={1}>
                {tx.merchant}
              </Text>
              <View style={styles.metaRow}>
                <Pressable
                  onPress={onEditCategory ? () => onEditCategory(tx.id) : undefined}
                  hitSlop={6}
                  style={[styles.catChip, { backgroundColor: tx.catCol + '1e' }]}
                >
                  <Text style={[styles.catChipText, { color: tx.catCol, fontFamily: weight(600) }]}>{tx.cat}</Text>
                </Pressable>
                <Text style={[styles.accountText, { color: t.text3 }]}>{tx.account}</Text>
              </View>
            </View>
            <View style={styles.amountCol}>
              <Text
                style={[
                  styles.amount,
                  { color: isInc ? t.em : t.text1, fontFamily: weight(700) },
                ]}
              >
                {isInc ? '+' : ''}
                {fmtR(tx.amount)}
              </Text>
              <Text style={[styles.time, { color: t.text3 }]}>{tx.time}</Text>
            </View>
          </View>

          {/* raw SMS source */}
          <View style={styles.rawWrap}>
            <View style={[styles.rawRow, { backgroundColor: t.bg, borderColor: t.border }]}>
              <View style={[styles.rawIconBox, { backgroundColor: t.bg3 }]}>
                <AppIcon value="mail" size={16} color={tx.catCol} />
              </View>
              <Text style={[styles.rawText, { color: t.text3 }]} numberOfLines={1}>
                {tx.raw}
              </Text>
            </View>
          </View>
        </Pressable>
```

(The chip's old `View` container becomes this `Pressable`; styles are unchanged.)

- [ ] **Step 3: Add the Edit action button**

Replace the actions row with a three-button row — Ignore | Edit | Add transaction (the Edit button renders only when `onEdit` is provided, keeping the component backward-compatible):

```tsx
        {/* actions */}
        <View style={[styles.actionsRow, { borderTopColor: t.border }]}>
          <Pressable onPress={() => act('dismissed')} style={[styles.ignoreBtn, { borderRightColor: t.border }]}>
            <Text style={[styles.ignoreLabel, { color: t.text3, fontFamily: weight(600) }]}>Ignore</Text>
          </Pressable>
          {onEdit ? (
            <Pressable onPress={() => onEdit(tx.id)} style={[styles.editBtn, { borderRightColor: t.border }]}>
              <MI.edit size={14} color={t.text2} />
              <Text style={[styles.editLabel, { color: t.text2, fontFamily: weight(600) }]}>Edit</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => act('confirmed')} style={styles.addBtn}>
            <MI.check size={16} color={t.em} strokeWidth={2.6} />
            <Text style={[styles.addLabel, { color: t.em, fontFamily: weight(700) }]}>Add transaction</Text>
          </Pressable>
        </View>
```

Add to the `StyleSheet.create` block (next to `ignoreBtn`):

```ts
  editBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    borderRightWidth: 1,
  },
  editLabel: {
    fontSize: 13,
  },
```

Update the component doc comment (top of file) with one line noting the new edit surfaces, e.g.: `Editing (optional onEdit/onEditCategory props): card body tap or the Edit action button opens the full edit form; the category chip opens a category picker.`

- [ ] **Step 4: Typecheck and run the test suite**

Run: `cd mobile && npx tsc --noEmit && npx jest`
Expected: no type errors; all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd mobile && git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(sync): DetectedCard edit surfaces (body tap, Edit button, category chip)" -- src/screens/DetectedCard.tsx
```

---

### Task 3: Wire editing in Sync.tsx

**Files:**
- Modify: `mobile/src/screens/Sync.tsx`

**Interfaces:**
- Consumes:
  - `applyDetectedEdit(d: DetectedView, v: Record<string, string>): DetectedView` from `../lib/notificationSync` (Task 1).
  - `onEdit`/`onEditCategory` props on `DetectedCard` (Task 2).
  - Existing: `useApiData` from `../api/useApi`, `api.accounts.list(): Promise<AccountView[]>` (`AccountView.id` is `number | string`, `.name` is the display name), `useFeedback().form/.sheet`, `CategoryView`.
- Produces: nothing consumed later.

- [ ] **Step 1: Add imports, accounts data, and the `form` handle**

In `mobile/src/screens/Sync.tsx`:

```ts
import { api } from '../api';
import type { AccountView, CategoryView, PaymentMethod } from '../api/types';
import { useApiData } from '../api/useApi';
```

Extend the notificationSync import list with `applyDetectedEdit`:

```ts
import {
  notificationSyncSupported,
  configureAllowlist,
  uploadCaptured,
  fetchDetected,
  confirmDetected,
  dismissDetected,
  analyzeNow,
  applyDetectedEdit,
  CAPTURE_PAUSED_KEY,
  DETECTED_FETCH_LIMIT,
  type DetectedView,
} from '../lib/notificationSync';
```

Add next to the other module-level constants (~line 134):

```ts
const EMPTY_ACCOUNTS: AccountView[] = [];
```

Inside the component, change the feedback destructuring and add the accounts fetch (next to the `categories` state):

```ts
  const { toast, sheet, form } = useFeedback();
  // Accounts feed the Account select in the edit form and the account label
  // on each review card.
  const { data: accounts } = useApiData(() => api.accounts.list(), EMPTY_ACCOUNTS);
```

- [ ] **Step 2: Show the resolved account name on the card**

In `toDetectedCardTx`, replace the `account:` line and add `accounts` to the `useCallback` dep array:

```ts
        account: d.accountId
          ? (accounts.find((a) => String(a.id) === d.accountId)?.name ?? 'Linked account')
          : 'Unlinked',
```

```ts
    [categories, accounts],
  );
```

- [ ] **Step 3: Add the edit handlers**

Add after `dismissDetectedItem` (~line 281):

```ts
  const patchDetected = (id: string, patch: (d: DetectedView) => DetectedView) =>
    setDetected((cur) => cur.map((x) => (x.id === id ? patch(x) : x)));

  /** Full edit form (card body tap / Edit action button) — same FormSheet
   * TxDetail's Edit uses. Saving patches the item in `detected`; the card
   * display and the confirm payload both derive from it, so edited values
   * flow through with no other changes. */
  const editDetectedItem = (id: string) => {
    const d = detected.find((x) => x.id === id);
    if (!d) return;
    const catName = d.suggestedCategory ?? 'Uncategorized';
    const catOptions = categories.map((c) => ({ label: `${c.icon} ${c.name}`, value: c.name }));
    // Keep a suggestion that isn't a real category yet (e.g. "Uncategorized")
    // selectable so the select has a valid initial.
    if (!categories.some((c) => c.name.toLowerCase() === catName.toLowerCase())) {
      catOptions.unshift({ label: catName, value: catName });
    }
    form({
      title: 'Edit detection',
      fields: [
        { key: 'desc', label: 'Description', initial: d.merchant ?? '' },
        { kind: 'amount', key: 'amount', label: 'Amount (₹)', initial: String(Math.abs(d.amount ?? 0)) },
        { kind: 'select', key: 'cat', label: 'Category', options: catOptions, initial: catName },
        {
          kind: 'select',
          key: 'account',
          label: 'Account',
          options: [
            { label: 'Unlinked', value: '' },
            ...accounts.map((a) => ({ label: a.name, value: String(a.id) })),
          ],
          initial: d.accountId ?? '',
        },
        { kind: 'date', key: 'date', label: 'Date', initial: (d.postedAt ?? new Date().toISOString()).slice(0, 10) },
        {
          kind: 'select',
          key: 'type',
          label: 'Type',
          options: [
            { label: 'Expense', value: 'expense' },
            { label: 'Income', value: 'income' },
          ],
          initial: d.type,
        },
      ],
      submitLabel: 'Save changes',
      onSubmit: (v) => patchDetected(id, (x) => applyDetectedEdit(x, v)),
    });
  };

  /** Category chip tap — picker sheet with a "New category…" fallback,
   * mirroring StatementReview's `openCategoryPicker`. `resolveId` at confirm
   * time creates any brand-new name server-side. */
  const openDetectedCategoryPicker = (id: string) => {
    const current = detected.find((x) => x.id === id)?.suggestedCategory ?? null;
    const setCat = (name: string) => patchDetected(id, (x) => ({ ...x, suggestedCategory: name }));
    sheet({
      title: 'Category',
      options: [
        ...categories.map((c) => ({
          label: c.name,
          icon: c.icon,
          selected: !!current && c.name.toLowerCase() === current.toLowerCase(),
          onPress: () => setCat(c.name),
        })),
        {
          label: 'New category…',
          icon: '➕',
          onPress: () => {
            form({
              title: 'New category',
              fields: [{ key: 'name', label: 'Category name', placeholder: 'e.g. Subscriptions' }],
              submitLabel: 'Use category',
              onSubmit: (v) => setCat(v['name']!),
            });
          },
        },
      ],
    });
  };
```

- [ ] **Step 4: Pass the handlers to DetectedCard**

In the needs-review render block:

```tsx
          {shownDetected.map((d) => (
            <DetectedCard
              key={d.id}
              tx={toDetectedCardTx(d)}
              onConfirm={confirmDetectedItem}
              onDismiss={dismissDetectedItem}
              onEdit={editDetectedItem}
              onEditCategory={openDetectedCategoryPicker}
            />
          ))}
```

Also add one line to the Sync.tsx header doc comment (the "What it renders now" list): `Review cards are editable before confirming — body tap/Edit button opens a FormSheet, the category chip a picker; edits patch the item in `detected``.

- [ ] **Step 5: Typecheck and run the full suite**

Run: `cd mobile && npx tsc --noEmit && npx jest`
Expected: no type errors; all tests PASS.

- [ ] **Step 6: Commit**

```bash
cd mobile && git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(sync): edit needs-review detections before confirming" -- src/screens/Sync.tsx
```

---

## Manual verification (after all tasks)

On an Android build with pending detections: tap a card body → edit form opens prefilled; change name/amount/date/type/account → card updates; tap the category chip → picker with New category…; Add transaction → confirmed transaction carries the edited values (check in Txns).
