# Edit & Delete a Category — Design

**Date:** 2026-07-11
**Status:** Approved (design)

## Problem

Users can create a category (Categories screen `+` button) and drill into one to
see its transactions (`CategoryDetail`), but there is **no way to edit or delete a
category** once created — a wrong name, icon, or colour is permanent, and stray
categories can't be removed.

The backend already supports both operations end-to-end:
- `PATCH /categories/:id` → `CategoriesService.update` (partial: name / color / icon / description / parentId)
- `DELETE /categories/:id` → `CategoriesService.remove`

The mobile client exposes neither, and no screen surfaces an edit/delete affordance.

## Scope

Add an **Edit** and **Delete** affordance for a category, editing its **name, icon,
and colour**. Delete is blocked with a clear message when the category still has
transactions (see Delete flow).

Out of scope: editing `description` / `parentId` (not surfaced anywhere today),
bulk transaction reassignment, editing from the Categories list itself.

## Placement

In `CategoryDetail`, **all-time mode only** (`!isBudget`). That screen already
renders an actions row (`styles.actionBtn`) in *budget* mode with "Edit limit" /
"Remove from budget". We add a parallel actions row for all-time mode with **Edit**
and **Delete**, reusing the same styling and `form()` / `sheet()` patterns. Budget
mode is untouched.

The category id is `p.categoryIds[0]` — all-time mode always passes exactly one id
(`categoryIds: [String(c.id)]` from `TxCategories`).

## Components & changes

### 1. Mobile API client — `src/api/index.ts` (`api.categories`)

Two new methods mirroring `create` (each fires `bumpData()` so mounted screens
refresh):

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

`NewCategoryInput` (`src/api/types.ts`) already has `{ name; icon?; color? }`.

### 2. FormSheet — new `color` field kind (`src/components/FormSheet.tsx`)

The `form()` sheet has no colour picker today, and the create flow hardcodes colour
by income/expense. To edit colour honestly, add a `color` field kind:

- A **swatch chip row** (single-select), same layout family as the existing `select`
  kind, but each option is a coloured circle instead of a text chip.
- Curated palette (single source-of-truth constant) that includes the existing
  income green `#7faf93` and expense gold `#c9a86a`, plus a handful of distinct
  hues. ~6–8 swatches.
- Value stays a hex string; participates in `initialValues` / submit like any field.
- Add `{ kind: 'color'; key; label; initial?; options?: string[] }` to
  `FormFieldSpec` and a `ColorField` render branch. Excluded from the
  required/empty validation loop (like `select` / `icon`).

### 3. Edit flow — `CategoryDetail`

`form()` prefilled from the current entry params:

```
title: `Edit category — ${name}`
fields:
  - { key: 'name',  label: 'Name', initial: name }
  - { kind: 'icon', key: 'icon', label: 'Icon', initial: icon, color: <picked/current color> }
  - { kind: 'color', key: 'color', label: 'Colour', initial: color }
submitLabel: 'Save category'
onSubmit: api.categories.update(catId, { name, icon, color }) → toast('Category updated', '🏷') → pop()
```

`pop()` after save returns to the Categories list, which re-fetches via `bumpData()`
and shows the updated card.

### 4. Delete flow — `CategoryDetail`

Confirm via `sheet()`:

```
title: `Delete ${name}?`   (+ warning copy when the category has transactions)
options: [{ label: 'Delete category', icon: '🗑',
            onPress: api.categories.remove(catId)
                       → toast('Category deleted', '🗑') → pop() }]
```

**Delete guard — the sharp edge.** The transaction→category FK is
`onDelete: 'RESTRICT'` (`transaction.entity.ts`), and `categoryId` is non-nullable,
so deleting a category that still has transactions currently throws a **raw DB error
(HTTP 500)**. Two-part fix:

- **Backend** (`categories.service.ts` `remove`): wrap the delete; catch the Postgres
  foreign-key-violation (`QueryFailedError` with driver code `23503`) and rethrow as
  `ConflictException('Category still has transactions — reassign them before deleting.')`
  so the client gets a meaningful 409 instead of a 500.
- **Mobile**: the delete `onPress` surfaces a failed request's message through the
  existing toast path (`toast("Couldn't delete — reassign its transactions first", '📡')`
  on error). When the current all-time `txns.length > 0`, the confirm sheet copy also
  warns up front that transactions must be reassigned first.

### 5. Icon render fix — `CategoryDetail` header

The header currently renders the icon as a raw text glyph
(`<Text style={styles.iconGlyph}>{icon}</Text>`), but categories store an **AppIcon
name** (e.g. `'tag'`), which the Categories list already renders via `AppIconBox` /
`AppIcon`. Switch the header to render the icon through `AppIcon` (as the list does)
so names display as the actual icon instead of literal text. Small, in-scope fix
since the edit flow reads/writes this same icon field.

## Data flow

```
CategoryDetail (all-time)
  ├─ Edit  → form() → api.categories.update(id, {name,icon,color}) → PATCH → bumpData → pop → list refreshes
  └─ Delete→ sheet()→ api.categories.remove(id)                     → DELETE → bumpData → pop → list refreshes
                                                                       └─ 409 (has txns) → toast, sheet stays/closes, no delete
```

## Error handling

- Update: `form()` keeps the sheet open and surfaces `err.message` on a thrown
  request (existing FormSheet behaviour).
- Delete with transactions: backend 409 → mobile toast with reassign guidance; the
  category is not deleted.
- Network failure on either: existing toast-on-error path.

## Testing

- **Backend** `categories.service.spec.ts`:
  - `update` applies a partial and persists (name/icon/color).
  - `remove` deletes a category with no transactions.
  - `remove` on a category with transactions → `ConflictException` (mock the FK
    `QueryFailedError` code `23503`).
- **Mobile** api-client spec (`src/api/client.spec.ts` pattern):
  - `categories.update` issues `PATCH /categories/:id` with the body and bumps data.
  - `categories.remove` issues `DELETE /categories/:id` and bumps data.

## Non-goals / YAGNI

- No bulk "move transactions to another category" reassignment UI.
- No editing of `description` / `parentId`.
- No edit/delete entry point on the Categories list (long-press, per-card icon) —
  the CategoryDetail actions row is the single home for both.
