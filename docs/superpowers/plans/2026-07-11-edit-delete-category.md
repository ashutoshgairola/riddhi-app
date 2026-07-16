# Edit & Delete a Category Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users edit a category's name / icon / colour and delete a category, surfaced from the CategoryDetail screen.

**Architecture:** The backend already exposes `PATCH /categories/:id` and `DELETE /categories/:id`; this plan wires the mobile client + UI to them and hardens the delete against the `RESTRICT` foreign key. The edit/delete affordances live in `CategoryDetail` (all-time mode only), reusing the existing actions-row pattern that budget mode already uses. Colour editing needs a new `color` field kind in the shared `FormSheet`.

**Tech Stack:** NestJS + TypeORM (backend), React Native / Expo (mobile), Jest.

## Global Constraints

- Mobile git commits: **no `Co-Authored-By` trailer**; commit as `gairola.ashutosh26@gmail.com`.
- Currency display: `₹` + `toLocaleString('en-IN')` (existing convention — not touched here).
- Follow existing patterns: mutations in `api/index.ts` call `bumpData()` after the request; quick create/edit uses `useFeedback().form(cfg)`; confirms use `useFeedback().sheet(cfg)`.
- Mobile tests are **pure-logic only** (no React-Native component-render harness exists). UI wiring (Task 4) is verified manually in the app, matching the codebase norm.
- Expo is pinned; read `https://docs.expo.dev/versions/v56.0.0/` before writing Expo/RN API code.

---

### Task 1: Backend — guard category delete against the transaction FK

The transaction→category FK is `onDelete: 'RESTRICT'` (`backend/src/transactions/transaction.entity.ts:55`) and `categoryId` is non-nullable, so deleting a category that still has transactions throws a raw Postgres error (HTTP 500). Catch the FK violation (`23503`) and rethrow as `ConflictException` so the client receives a clean 409. Add service specs covering `update`, plain `remove`, and the FK-conflict path.

**Files:**
- Modify: `backend/src/categories/categories.service.ts`
- Create: `backend/src/categories/categories.service.spec.ts`

**Interfaces:**
- Consumes: `CategoriesRepository` (`findOneByUser(id, userId)`, `save(cat)`, `remove(cat)`, `create(data)`).
- Produces: `CategoriesService.remove(id, userId)` now throws `ConflictException` on FK violation; `CategoriesService.update(id, userId, dto)` unchanged in signature.

- [ ] **Step 1: Write the failing spec**

Create `backend/src/categories/categories.service.spec.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

function makeRepo(seed: any[] = []) {
  const rows = [...seed];
  return {
    rows,
    findOneByUser: jest.fn(async (id: string, userId: string) =>
      rows.find((r) => r.id === id && r.userId === userId) ?? null),
    save: jest.fn(async (c: any) => { const i = rows.findIndex((r) => r.id === c.id); if (i >= 0) rows[i] = c; return c; }),
    remove: jest.fn(async (c: any) => { const i = rows.findIndex((r) => r.id === c.id); if (i >= 0) rows.splice(i, 1); }),
    create: jest.fn((d: any) => ({ ...d })),
  };
}

describe('CategoriesService', () => {
  it('update applies a partial and persists it', async () => {
    const repo = makeRepo([{ id: 'c1', userId: 'u1', name: 'Food', icon: 'cart', color: '#c9a86a' }]);
    const svc = new CategoriesService(repo as any);
    const out = await svc.update('c1', 'u1', { name: 'Groceries', color: '#7faf93' } as any);
    expect(out).toMatchObject({ id: 'c1', name: 'Groceries', color: '#7faf93', icon: 'cart' });
    expect(repo.save).toHaveBeenCalled();
  });

  it('update throws NotFound for another user\'s category', async () => {
    const repo = makeRepo([{ id: 'c1', userId: 'u1', name: 'Food' }]);
    const svc = new CategoriesService(repo as any);
    await expect(svc.update('c1', 'u2', { name: 'X' } as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove deletes a category with no transactions', async () => {
    const repo = makeRepo([{ id: 'c1', userId: 'u1', name: 'Food' }]);
    const svc = new CategoriesService(repo as any);
    await svc.remove('c1', 'u1');
    expect(repo.remove).toHaveBeenCalled();
    expect(repo.rows).toHaveLength(0);
  });

  it('remove rethrows a FK violation (23503) as ConflictException', async () => {
    const repo = makeRepo([{ id: 'c1', userId: 'u1', name: 'Food' }]);
    repo.remove = jest.fn(async () => { throw Object.assign(new Error('fk'), { code: '23503' }); });
    const svc = new CategoriesService(repo as any);
    await expect(svc.remove('c1', 'u1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('remove rethrows a FK violation nested under driverError', async () => {
    const repo = makeRepo([{ id: 'c1', userId: 'u1', name: 'Food' }]);
    repo.remove = jest.fn(async () => { throw Object.assign(new Error('fk'), { driverError: { code: '23503' } }); });
    const svc = new CategoriesService(repo as any);
    await expect(svc.remove('c1', 'u1')).rejects.toBeInstanceOf(ConflictException);
  });
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `cd backend && npx jest src/categories/categories.service.spec.ts`
Expected: the two FK-violation tests FAIL (the raw error is rethrown, not a `ConflictException`). The others should pass.

- [ ] **Step 3: Add the FK guard to the service**

In `backend/src/categories/categories.service.ts`, add `ConflictException` to the `@nestjs/common` import:

```ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
```

Replace the `remove` method:

```ts
  async remove(id: string, userId: string): Promise<void> {
    const category = await this.findOne(id, userId);
    try {
      await this.categoriesRepository.remove(category);
    } catch (err) {
      const code =
        (err as { code?: string }).code ??
        (err as { driverError?: { code?: string } }).driverError?.code;
      if (code === '23503') {
        throw new ConflictException(
          'Category still has transactions — reassign them before deleting.',
        );
      }
      throw err;
    }
  }
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `cd backend && npx jest src/categories/categories.service.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add backend/src/categories/categories.service.ts backend/src/categories/categories.service.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(backend): 409 instead of 500 when deleting a category with transactions"
```

---

### Task 2: Mobile API client — `categories.update` + `categories.remove`

Add the two mutation methods mirroring `categories.create`, each firing `bumpData()`.

**Files:**
- Modify: `mobile/src/api/index.ts` (the `categories:` object, ~line 771–804)
- Create: `mobile/src/api/categories.spec.ts`

**Interfaces:**
- Consumes: `apiClient.patch(path, body)`, `apiClient.delete(path)`, `bumpData()`.
- Produces:
  - `api.categories.update(id: string, input: Partial<NewCategoryInput>): Promise<void>`
  - `api.categories.remove(id: string): Promise<void>`
  - (`NewCategoryInput = { name: string; icon?: string; color?: string }` — `mobile/src/api/types.ts:552`)

- [ ] **Step 1: Write the failing spec**

Create `mobile/src/api/categories.spec.ts`:

```ts
/**
 * categories.update / categories.remove — verify each issues the right verb +
 * path and bumps the data version. Mocks the transport (`./client`) and the
 * refresh bus (`./refresh`) so no native modules load.
 */
jest.mock('./client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
  setAuthToken: jest.fn(),
  setSessionHandlers: jest.fn(),
}));
jest.mock('./refresh', () => ({ bumpData: jest.fn(), subscribeData: jest.fn() }));

import { api } from './index';
import { apiClient } from './client';
import { bumpData } from './refresh';

describe('api.categories mutations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('update PATCHes /categories/:id with the partial and bumps data', async () => {
    (apiClient.patch as jest.Mock).mockResolvedValueOnce({});
    await api.categories.update('c1', { name: 'Groceries', icon: 'cart', color: '#7faf93' });
    expect(apiClient.patch).toHaveBeenCalledWith('/categories/c1', {
      name: 'Groceries', icon: 'cart', color: '#7faf93',
    });
    expect(bumpData).toHaveBeenCalledTimes(1);
  });

  it('remove DELETEs /categories/:id and bumps data', async () => {
    (apiClient.delete as jest.Mock).mockResolvedValueOnce(undefined);
    await api.categories.remove('c1');
    expect(apiClient.delete).toHaveBeenCalledWith('/categories/c1');
    expect(bumpData).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `cd mobile && npx jest src/api/categories.spec.ts`
Expected: FAIL — `api.categories.update is not a function` (and `.remove`).

- [ ] **Step 3: Add the two methods**

In `mobile/src/api/index.ts`, inside the `categories: { ... }` object, immediately after the `create` method, add:

```ts
    async update(id: string, input: Partial<NewCategoryInput>): Promise<void> {
      await apiClient.patch(`/categories/${id}`, input);
      bumpData();
    },

    async remove(id: string): Promise<void> {
      await apiClient.delete(`/categories/${id}`);
      bumpData();
    },
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `cd mobile && npx jest src/api/categories.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add mobile/src/api/index.ts mobile/src/api/categories.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): categories.update + categories.remove api methods"
```

---

### Task 3: FormSheet — new `color` field kind

Add a colour-swatch field kind to the shared form sheet so the edit flow (Task 4) can offer colour selection. Value is a hex string; single-select swatch row.

**Files:**
- Modify: `mobile/src/components/FormSheet.tsx`

**Interfaces:**
- Produces: a new `FormFieldSpec` variant
  `{ kind: 'color'; key: string; label: string; initial?: string; options?: string[] }`.
  When `options` is omitted, a default palette `CATEGORY_COLORS` is used. Value stored/submitted is the selected hex string.

- [ ] **Step 1: Add the palette constant**

In `mobile/src/components/FormSheet.tsx`, near the top-level constants (after `MONTHS`), add:

```ts
// Default swatch palette for the `color` field kind. Includes the app's
// existing income green (#7faf93) and expense gold (#c9a86a).
const CATEGORY_COLORS = [
  '#7faf93', '#c9a86a', '#e07a7a', '#7f9fc9',
  '#b18fd0', '#e0a878', '#6fc0b0', '#c98fb0',
];
```

- [ ] **Step 2: Add the `ColorField` component**

Add this component next to `IconField` in the same file:

```tsx
/**
 * Colour field: a row of tappable swatches (single choice). The value is the
 * selected hex string, like every other field.
 */
function ColorField({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (hex: string) => void;
}) {
  const { t } = useTheme();
  return (
    <View style={styles.chipRow}>
      {options.map((hex) => {
        const on = value.toLowerCase() === hex.toLowerCase();
        return (
          <Pressable
            key={hex}
            onPress={() => onChange(hex)}
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: hex,
              borderWidth: on ? 3 : 1,
              borderColor: on ? t.text1 : t.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {on ? <AppIcon value="check" size={16} color="#ffffff" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
```

(`AppIcon`, `Pressable`, `useTheme`, and `styles.chipRow` already exist in this file. Confirm `AppIcon` supports a `check` glyph — it is used elsewhere, e.g. ToolStatusChip; if the name differs, use the same check-icon name that file uses.)

- [ ] **Step 3: Extend `FormFieldSpec` and default the value**

In the `FormFieldSpec` union, add a new variant (after the `icon` variant):

```ts
  | {
      kind: 'color';
      key: string;
      label: string;
      initial?: string;
      /** Swatch palette; defaults to CATEGORY_COLORS when omitted. */
      options?: string[];
    };
```

In `initialValues`, seed a colour field with the first palette entry when no `initial` is given so a swatch is always selected:

```ts
function initialValues(config: FormConfig | null): Record<string, string> {
  const values: Record<string, string> = {};
  for (const f of config?.fields ?? []) {
    if (f.kind === 'color') {
      values[f.key] = f.initial ?? (f.options ?? CATEGORY_COLORS)[0]!;
    } else {
      values[f.key] = f.initial ?? '';
    }
  }
  return values;
}
```

- [ ] **Step 4: Render the field and exclude it from required-validation**

In the `submit` validation loop, add an early-continue alongside the existing `select`/`icon` ones:

```ts
      if (f.kind === 'select') continue;
      if (f.kind === 'icon') continue;
      if (f.kind === 'color') continue;
```

In the field render switch, add a branch (place it next to the `icon` branch):

```tsx
            ) : f.kind === 'color' ? (
              <ColorField
                value={values[f.key] ?? ''}
                options={f.options ?? CATEGORY_COLORS}
                onChange={(hex) => setValues((v) => ({ ...v, [f.key]: hex }))}
              />
```

- [ ] **Step 5: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors introduced by FormSheet.tsx.

- [ ] **Step 6: Commit**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add mobile/src/components/FormSheet.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): color swatch field kind for FormSheet"
```

---

### Task 4: CategoryDetail — Edit + Delete actions row (all-time mode) + icon-render fix

Add an actions row (Edit / Delete) for all-time mode, mirroring the budget-mode "Edit limit / Remove" row. Fix the header icon to render via `AppIcon` (it currently renders the icon *name* as raw text — visible in the app as "Food" inside the icon box).

**Files:**
- Modify: `mobile/src/screens/CategoryDetail.tsx`

**Interfaces:**
- Consumes: `api.categories.update(id, input)`, `api.categories.remove(id)` (Task 2); the `color` field kind (Task 3); `useFeedback().form` / `.sheet` / `.toast`; `useNav().pop`.
- Category id source: `p.categoryIds[0]` (all-time mode always passes exactly one id).

- [ ] **Step 1: Fix the header icon rendering**

In `mobile/src/screens/CategoryDetail.tsx`, replace the header icon box:

```tsx
            <View style={[styles.iconBox, { backgroundColor: color + '22' }]}>
              <Text style={styles.iconGlyph}>{icon}</Text>
            </View>
```

with:

```tsx
            <View style={[styles.iconBox, { backgroundColor: color + '22' }]}>
              <AppIcon value={icon} size={20} color={color} />
            </View>
```

(`AppIcon` is already imported at line 23. The now-unused `styles.iconGlyph` may be left or removed; remove it if `npx tsc`/lint flags it as unused.)

- [ ] **Step 2: Add the edit + delete handlers**

Inside the `CategoryDetail` component, after `removeFromBudget` (before `deleteTx`), add:

```tsx
  const catId = categoryIds[0];

  const editCategory = () => {
    if (!catId) return;
    form({
      title: `Edit category — ${name}`,
      fields: [
        { key: 'name', label: 'Name', initial: name },
        { kind: 'icon', key: 'icon', label: 'Icon', initial: icon, color },
        { kind: 'color', key: 'color', label: 'Colour', initial: color },
      ],
      submitLabel: 'Save category',
      onSubmit: async (v) => {
        await api.categories.update(catId, {
          name: v['name']!,
          icon: v['icon'] || icon,
          color: v['color'] || color,
        });
        toast('Category updated', '🏷');
        pop();
      },
    });
  };

  const deleteCategory = () => {
    if (!catId) return;
    const hasTxns = txns.length > 0;
    sheet({
      // SheetConfig has no `message`/subtitle field (only title/options/
      // sections) — fold the warning into the title.
      title: hasTxns
        ? `Delete ${name}? It still has transactions — reassign them to another category first.`
        : `Delete ${name}?`,
      options: [
        {
          label: 'Delete category',
          icon: '🗑',
          danger: true,
          onPress: async () => {
            try {
              await api.categories.remove(catId);
              toast('Category deleted', '🗑');
              pop();
            } catch {
              toast("Couldn't delete — reassign its transactions first", '📡');
            }
          },
        },
      ],
    });
  };
```

(`SheetOption` supports `danger?: boolean` — used here to style the delete row as destructive. `SheetConfig` is `{ title?; options?; sections? }` — verified in `mobile/src/feedback/FeedbackProvider.tsx:78`.)

- [ ] **Step 3: Destructure `categoryIds` (already destructured — verify)**

`categoryIds` is already pulled from `p` at the top of the component:
`const { name, icon, color, categoryIds = [], month, allocated } = p;` — no change needed. `form`, `sheet`, `toast`, `pop` are already in scope from `useFeedback()` / `useNav()`.

- [ ] **Step 4: Render the actions row for all-time mode**

In the header `GlassCard`, there is currently a `{isBudget ? ( ... ) : null}` block that renders the budget bar + budget actions. After that block (still inside the `GlassCard`, after its closing `) : null}`), add an all-time actions row:

```tsx
          {!isBudget ? (
            <View style={styles.actionsRow}>
              <Text
                onPress={editCategory}
                style={[styles.actionBtn, {
                  color: t.text1,
                  backgroundColor: t.bg3,
                  fontFamily: weight(700),
                }]}
              >
                Edit
              </Text>
              <Text
                onPress={deleteCategory}
                style={[styles.actionBtn, {
                  color: t.red,
                  backgroundColor: t.redDim,
                  fontFamily: weight(700),
                }]}
              >
                Delete
              </Text>
            </View>
          ) : null}
```

(`styles.actionsRow` and `styles.actionBtn` already exist — reused from the budget-mode row.)

- [ ] **Step 5: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Manual verification in the app**

Launch the app (use the `/run` skill or the project's Expo start). Then:
1. Open Categories → tap a category (e.g. Food) → confirm the header icon now shows the actual icon, not the text "Food".
2. Confirm an **Edit** and **Delete** row appears under the header (all-time mode).
3. Tap **Edit** → change name, icon, and colour → Save → confirm the toast, that you return to the list, and the card reflects all three changes.
4. Tap **Delete** on a category **with** transactions → confirm the warning copy and that the delete is rejected with the "reassign its transactions first" toast (category still present).
5. Create a throwaway empty category → open it → **Delete** → confirm it deletes and disappears from the list.
6. Open a **budget** category (from Budgets, current month) → confirm its row still shows "Edit limit / Remove" and NOT the new Edit/Delete row (no regression).

- [ ] **Step 7: Commit**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
git add mobile/src/screens/CategoryDetail.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): edit/delete category from CategoryDetail + fix header icon render"
```

---

## Self-Review notes

- **Spec coverage:** API client update/remove (Task 2) ✓; color field kind (Task 3) ✓; edit flow (Task 4 Step 2/4) ✓; delete flow + backend 409 guard (Task 1, Task 4) ✓; icon-render fix (Task 4 Step 1) ✓; tests — backend service spec (Task 1) ✓, mobile api spec (Task 2) ✓; UI verified manually per codebase norm ✓.
- **Placeholders:** none — every code step is complete. Two verify-before-use notes are intentional (the `check` AppIcon glyph name in Task 3, and `sheet`'s `message` support in Task 4) with explicit fallbacks given.
- **Type consistency:** `api.categories.update(id, input: Partial<NewCategoryInput>)` / `api.categories.remove(id)` are defined in Task 2 and consumed with the same signatures in Task 4; the `color` field kind shape defined in Task 3 matches its use in Task 4.
