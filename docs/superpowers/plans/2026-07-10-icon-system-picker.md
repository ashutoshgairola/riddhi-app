# Icon System Port + Picker Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the handover's liquid-glass icon system (~77 content icons + resolver + picker) into the RN app and replace all rendered emoji/icons with it — including a picker on every icon-selection surface — except the Munshi ji logo.

**Architecture:** Split pure icon logic (`contentIcons.data.ts`: name/emoji resolution, maps, list) from JSX (`contentIcons.tsx`: `MICONS` components, `<AppIcon>` resolver, `<AppIconBox>` prominent wrapper). Add a reusable `<IconPickerSheet>` on the existing `BottomSheet`, and a declarative `kind: 'icon'` field to `FormSheet`. Roll out across screens in slices. Legacy stored emoji resolve at render via `M_EMOJI` — no backend change.

**Tech Stack:** Expo SDK 56, React Native 0.85, `react-native-svg` 15, TypeScript, Jest 30 + ts-jest.

## Global Constraints

- Expo SDK 56 — before writing RN code, consult `https://docs.expo.dev/versions/v56.0.0/` (per `mobile/AGENTS.md`).
- **Never** touch `assets/munshi.png` `<Image>` usages (FabActions, Settings, Notifications, Chat, home/AiInsightsStrip).
- **Never** rewrite emoji that are not rendered UI: `*.spec.ts` fixtures/comments; logic/data strings in `lib/smsSyncMap.ts`, `lib/pluralize.ts`, `lib/catalogSource.ts`, `api/adapters.ts`, `assets/bankLogos.ts`.
- No backend/API change. Picker writes icon **names**; legacy emoji resolve at render.
- Icons use an explicit `color` prop (no `currentColor`). Default color `#f3f0fb` (= `t.text1`).
- **Prominence:** content/category/source/budget/goal/event icons render via `<AppIconBox>` — square 40–44px, radius 12–14, `background = color + '22'`, **icon stroke = the entity accent color** (never muted `text3`), icon size 18–20, stroke width 2. Inline icons ≥ 16px.
- Commit prefs: author `gairola.ashutosh26@gmail.com`, **no** `Co-Authored-By` trailer, `docs/` specs/plans force-added (`git add -f`).
- Source of truth for the port: `project/riddhi/MobileCore.jsx` — `MICONS` (lines 235–313), `M_EMOJI` (316–329), `MICON_LIST` (349–361), `mIcon` (332–346), `MIconPickerHost` (365–403).

---

## Task 1: Icon data module (pure logic)

**Files:**
- Create: `mobile/src/components/contentIcons.data.ts`
- Test: `mobile/src/components/contentIcons.data.spec.ts`

**Interfaces:**
- Produces:
  - `type ContentIconName` — string union of all ~77 icon names (`'home2' | 'food' | … | 'dot'`).
  - `const ICON_NAMES: readonly ContentIconName[]` — every name, once.
  - `const M_EMOJI: Record<string, ContentIconName>` — emoji/glyph → name (verbatim from `MobileCore.jsx:316-329`).
  - `const ICON_LIST: readonly (readonly [ContentIconName, string])[]` — `[name, label]` (verbatim from `MobileCore.jsx:349-361`).
  - `function resolveIconName(value: string | null | undefined): ContentIconName | null` — strips U+FE0F; returns the name if `value` is a known name, else `M_EMOJI[value]`, else `null`.

- [ ] **Step 1: Write the failing test**

```ts
// mobile/src/components/contentIcons.data.spec.ts
import { ICON_NAMES, M_EMOJI, ICON_LIST, resolveIconName } from './contentIcons.data';

describe('resolveIconName', () => {
  it('returns a known name unchanged', () => {
    expect(resolveIconName('food')).toBe('food');
  });
  it('maps a legacy emoji via M_EMOJI', () => {
    expect(resolveIconName('🏷')).toBe('tag');
    expect(resolveIconName('💰')).toBe('coins');
  });
  it('strips the U+FE0F variation selector before matching', () => {
    expect(resolveIconName('⚠️')).toBe('warn');
  });
  it('returns null for an unknown / empty value', () => {
    expect(resolveIconName('🦄')).toBeNull();
    expect(resolveIconName('')).toBeNull();
    expect(resolveIconName(null)).toBeNull();
  });
});

describe('icon reference integrity', () => {
  const names = new Set<string>(ICON_NAMES);
  it('has no duplicate names', () => {
    expect(names.size).toBe(ICON_NAMES.length);
  });
  it('every M_EMOJI target is a real icon name', () => {
    for (const target of Object.values(M_EMOJI)) expect(names.has(target)).toBe(true);
  });
  it('every ICON_LIST entry references a real icon name', () => {
    for (const [name] of ICON_LIST) expect(names.has(name)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest src/components/contentIcons.data.spec.ts`
Expected: FAIL — cannot find module `./contentIcons.data`.

- [ ] **Step 3: Write the data module**

Create `mobile/src/components/contentIcons.data.ts`. Transcribe the three data structures **verbatim** from the source lines:
- `ICON_NAMES` = the 77 keys of `MICONS` (`MobileCore.jsx:235-313`), as a `readonly` tuple, then `export type ContentIconName = (typeof ICON_NAMES)[number];`.
- `M_EMOJI` from `MobileCore.jsx:316-329` (keys are the emoji/glyph strings, values the names).
- `ICON_LIST` from `MobileCore.jsx:349-361`.

```ts
// mobile/src/components/contentIcons.data.ts
export const ICON_NAMES = [
  'home2', 'food', 'cart', 'bag', 'car', 'train', 'plane', 'bolt', 'pill', 'film',
  'gradCap', 'briefcase', 'laptop', 'undo', 'gift', 'bank2', 'card2', 'wallet', 'cash',
  'coins', 'piggy', 'trendUp', 'trendDown', 'chart', 'target', 'ledger', 'sync', 'repeat2',
  'transfer', 'party', 'cake', 'ring', 'flame', 'drink', 'trophy', 'ball', 'music',
  'headphones', 'play', 'pause', 'package', 'cloud', 'dumbbell', 'apple', 'tree', 'plant',
  'scissors', 'lifebuoy', 'umbrella', 'phone', 'calendar2', 'users', 'trash', 'pencil',
  'plus2', 'sun', 'moon', 'globe', 'eye2', 'lock', 'key', 'logout', 'mail', 'export',
  'help', 'check', 'warn', 'doc', 'sparkle2', 'star', 'heart', 'fuel', 'settings2', 'tag',
  'bell3', 'search2', 'dot',
] as const;

export type ContentIconName = (typeof ICON_NAMES)[number];

export const M_EMOJI: Record<string, ContentIconName> = {
  '📒': 'ledger', '🔄': 'sync', '🔁': 'repeat2', '⊙': 'target', '🎯': 'target',
  // …transcribe the remaining entries verbatim from MobileCore.jsx:316-329…
};

export const ICON_LIST: readonly (readonly [ContentIconName, string])[] = [
  ['home2', 'Home'], ['food', 'Food'], ['cart', 'Groceries'],
  // …transcribe the remaining entries verbatim from MobileCore.jsx:349-361…
] as const;

export function resolveIconName(value: string | null | undefined): ContentIconName | null {
  if (value == null || value === '') return null;
  const key = String(value).replace(/️/g, ''); // strip variation selector
  if ((ICON_NAMES as readonly string[]).includes(key)) return key as ContentIconName;
  return M_EMOJI[key] ?? null;
}
```

Verify `ICON_NAMES` has exactly 77 entries: `grep -cE '^\s+[a-zA-Z0-9_]+:' project/riddhi/MobileCore.jsx` over lines 235-313 → 77. Cross-check the count matches.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npx jest src/components/contentIcons.data.spec.ts`
Expected: PASS (all suites). If "every M_EMOJI target is a real icon name" fails, a value in `M_EMOJI` was mistyped — fix against the source.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/contentIcons.data.ts mobile/src/components/contentIcons.data.spec.ts
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): content-icon data module + resolver logic"
```

---

## Task 2: Icon components — MICONS, AppIcon, AppIconBox

**Files:**
- Create: `mobile/src/components/contentIcons.tsx`
- Reference: `mobile/src/components/icons.tsx` (reuse `IconProps`), `project/riddhi/MobileCore.jsx:235-346`

**Interfaces:**
- Consumes: `ContentIconName`, `resolveIconName`, `IconProps` (from `icons.tsx`).
- Produces:
  - `const MICONS: Record<ContentIconName, (p: IconProps) => JSX.Element>` — one component per name.
  - `function AppIcon(props: { value: string; size?: number; color?: string; strokeWidth?: number }): JSX.Element | null` — resolves `value` via `resolveIconName`; renders `MICONS[name]`; falls back to `<Text>{value}</Text>` for unmapped; returns `null` for empty.
  - `function AppIconBox(props: { value: string; color: string; size?: number; iconSize?: number }): JSX.Element` — the prominent tinted box (see Global Constraints).

- [ ] **Step 1: Port MICONS (verbatim transcription)**

Create `mobile/src/components/contentIcons.tsx`. For each of the 77 entries in `MICONS` (`MobileCore.jsx:235-313`), write an RN component. Transcribe every `d`/`points`/attribute value **verbatim**; only change element names and prop casing for `react-native-svg`, and replace `stroke="currentColor"` with the `color` prop. Where the source used `fill="currentColor"` (e.g. `train`, `wallet`, `piggy`, `lock`, `dot` inner marks), thread `color` to `fill`; otherwise `fill="none"`.

Transformation rules (web → `react-native-svg`):
- `<path d="…"/>` → `<Path d="…" />`
- `<polyline points="…"/>` → `<Polyline points="…" />`
- `<circle cx cy r/>` → `<Circle cx cy r />`; `<line x1 y1 x2 y2/>` → `<Line … />`; `<rect .../>` → `<Rect … />`
- `stroke-width` → `strokeWidth`, `stroke-linecap` → `strokeLinecap`, `transform="rotate(...)"` → `transform="rotate(...)"` (string form is supported).

Worked example — `home2` (`MobileCore.jsx:236`):

```tsx
import type { JSX } from 'react';
import { Text } from 'react-native';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
import type { IconProps } from './icons';
import { type ContentIconName, resolveIconName } from './contentIcons.data';

const DEFAULT_SIZE = 20;
const DEFAULT_COLOR = '#f3f0fb';
const DEFAULT_STROKE_WIDTH = 2;

function base(size?: number, color?: string, sw?: number) {
  return {
    width: size ?? DEFAULT_SIZE,
    height: size ?? DEFAULT_SIZE,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: color ?? DEFAULT_COLOR,
    strokeWidth: sw ?? DEFAULT_STROKE_WIDTH,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

export const MICONS: Record<ContentIconName, (p: IconProps) => JSX.Element> = {
  home2: ({ size, color, strokeWidth }) => (
    <Svg {...base(size, color, strokeWidth)}>
      <Path d="M3 12 12 3l9 9" />
      <Path d="M5 10v10a1 1 0 0 0 1 1h3v-7h6v7h3a1 1 0 0 0 1-1V10" />
    </Svg>
  ),
  // …the remaining 76 icons, each transcribed verbatim from MobileCore.jsx:237-312…
  // For fill="currentColor" marks, pass fill={color ?? DEFAULT_COLOR} stroke="none" on that element:
  //   dot: <Circle cx={12} cy={12} r={3.5} fill={color ?? DEFAULT_COLOR} stroke="none" />
};
```

- [ ] **Step 2: Add AppIcon + AppIconBox**

Append to `contentIcons.tsx`:

```tsx
export function AppIcon({
  value,
  size = DEFAULT_SIZE,
  color = DEFAULT_COLOR,
  strokeWidth = DEFAULT_STROKE_WIDTH,
}: {
  value: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}): JSX.Element | null {
  if (value == null || value === '') return null;
  const name = resolveIconName(value);
  if (name) {
    const Cmp = MICONS[name];
    return <Cmp size={size} color={color} strokeWidth={strokeWidth} />;
  }
  return <Text style={{ fontSize: Math.round(size * 0.85), lineHeight: size }}>{value}</Text>;
}

import { View } from 'react-native';

export function AppIconBox({
  value,
  color,
  size = 42,
  iconSize = 20,
}: {
  value: string;
  color: string;
  size?: number;
  iconSize?: number;
}): JSX.Element {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 13,
        backgroundColor: color + '22',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <AppIcon value={value} size={iconSize} color={color} />
    </View>
  );
}
```

- [ ] **Step 3: Typecheck (the Record type is the coverage guarantee)**

Run: `cd mobile && npx tsc --noEmit`
Expected: PASS. A missing icon key → `Record<ContentIconName, …>` reports the missing property; a stray key → excess-property error. Fix until clean. (No render test — the app has no RN render harness; visual correctness is verified in Task 11.)

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/contentIcons.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): MICONS RN icon set + AppIcon/AppIconBox"
```

---

## Task 3: IconPickerSheet + useIconPicker

**Files:**
- Create: `mobile/src/components/IconPickerSheet.tsx`
- Reference: `mobile/src/components/BottomSheet.tsx` (props: `open`, `onClose`, `title`, `children`), `project/riddhi/MobileCore.jsx:365-403`, theme tokens `src/theme/tokens.ts` (`em`, `emDim`, `emGlow`, `glassBg`, `glassBrd`, `text1`, `text3`, `bg2`, `border`).

**Interfaces:**
- Consumes: `ICON_LIST`, `resolveIconName`, `AppIcon`, `BottomSheet`, `useTheme`.
- Produces:
  - `function IconPickerSheet(props: { open: boolean; value?: string; color?: string; title?: string; onPick: (name: ContentIconName) => void; onClose: () => void }): JSX.Element`
  - `function useIconPicker(): { pick(cfg: { value?: string; color?: string; title?: string; onPick: (name: ContentIconName) => void }): void; sheet: JSX.Element }` — local-state imperative opener for non-FormSheet surfaces.

- [ ] **Step 1: Write IconPickerSheet**

Search `TextInput` + 5-column grid from `ICON_LIST` (mirror `MobileCore.jsx:378-401`). Selected tile (`resolveIconName(value) === name`) highlighted with the accent `color` (default `t.em`): tinted background `t.emDim`, border `t.emGlow`, icon in `color`; unselected uses `t.glassBg`/`t.glassBrd`, icon `t.text1`, label `t.text3`.

```tsx
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { AppIcon } from './contentIcons';
import { ICON_LIST, resolveIconName, type ContentIconName } from './contentIcons.data';
import { useTheme } from '../theme/tokens'; // match the actual export used elsewhere

export function IconPickerSheet({
  open, value, color, title = 'Choose icon', onPick, onClose,
}: {
  open: boolean;
  value?: string;
  color?: string;
  title?: string;
  onPick: (name: ContentIconName) => void;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const [q, setQ] = useState('');
  const accent = color ?? t.em;
  const curName = resolveIconName(value);
  const query = q.toLowerCase();
  const list = ICON_LIST.filter(
    ([k, l]) => !query || l.toLowerCase().includes(query) || k.includes(query),
  );
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search icons…"
        placeholderTextColor={t.text3}
        style={{ height: 44, marginBottom: 14, borderRadius: 12, paddingHorizontal: 14,
          backgroundColor: t.bg2, borderWidth: 1, borderColor: t.border, color: t.text1 }}
      />
      <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingBottom: 16 }}>
          {list.map(([k, l]) => {
            const on = k === curName;
            return (
              <Pressable
                key={k}
                onPress={() => { onPick(k); onClose(); }}
                style={{ width: '20%', alignItems: 'center', paddingVertical: 10 }}
              >
                <View style={{ alignItems: 'center', justifyContent: 'center', gap: 6,
                  paddingVertical: 8, borderRadius: 14, width: '92%',
                  backgroundColor: on ? t.emDim : t.glassBg,
                  borderWidth: 1, borderColor: on ? t.emGlow : t.glassBrd }}>
                  <AppIcon value={k} size={20} color={on ? accent : t.text1} />
                  <Text numberOfLines={1} style={{ fontSize: 9.5, fontWeight: '600',
                    color: on ? accent : t.text3, maxWidth: '100%' }}>{l}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

export function useIconPicker() {
  const [cfg, setCfg] = useState<null | {
    value?: string; color?: string; title?: string;
    onPick: (name: ContentIconName) => void;
  }>(null);
  const sheet = (
    <IconPickerSheet
      open={!!cfg}
      value={cfg?.value}
      color={cfg?.color}
      title={cfg?.title}
      onPick={(name) => cfg?.onPick(name)}
      onClose={() => setCfg(null)}
    />
  );
  return { pick: setCfg, sheet };
}
```

Note: confirm the theme hook import (`useTheme`) matches how sibling components import it (see `FormSheet.tsx` top). Adjust the import path if the project re-exports it elsewhere.

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/IconPickerSheet.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): IconPickerSheet + useIconPicker"
```

---

## Task 4: FormSheet `kind: 'icon'` field

**Files:**
- Modify: `mobile/src/components/FormSheet.tsx` (field union `269-300`; render block `393-435`; mirror `DateField` `85-146`)

**Interfaces:**
- Consumes: `IconPickerSheet`, `AppIcon` (from `contentIcons`).
- Produces: a new `FormFieldSpec` variant `{ kind: 'icon'; key; label; optional?; color? }`; an internal `IconField` component. Field value is the chosen icon **name** (string), stored in `values[key]` like every other field.

- [ ] **Step 1: Extend the field union**

In `FormFieldSpec` (`FormSheet.tsx:269-300`), add:

```ts
  | {
      kind: 'icon';
      key: string;
      label: string;
      initial?: string;
      optional?: boolean;
      /** Accent color for the picker + selected chip (e.g. the category color). */
      color?: string;
    }
```

- [ ] **Step 2: Add the IconField component (mirror DateField)**

Add near `DateField` in `FormSheet.tsx`:

```tsx
function IconField({
  value, color, onChange,
}: { value: string; color?: string; onChange: (name: string) => void }) {
  const { t } = useTheme();
  const [open, setOpen] = useState(false);
  const accent = color ?? t.em;
  return (
    <View>
      <Pressable
        onPress={() => { Keyboard.dismiss(); setOpen(true); }}
        style={[styles.input, styles.dateRow,
          { backgroundColor: t.bg2, borderColor: open ? t.em : t.border }]}
      >
        <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center',
          justifyContent: 'center', backgroundColor: accent + '22' }}>
          {value ? <AppIcon value={value} size={18} color={accent} /> : null}
        </View>
        <Text style={[styles.dateText, { color: value ? t.text1 : t.text3, fontFamily: weight(600) }]}>
          {value ? 'Change icon' : 'Choose icon'}
        </Text>
      </Pressable>
      <IconPickerSheet
        open={open}
        value={value}
        color={accent}
        onPick={(name) => { onChange(name); setOpen(false); }}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}
```

Add imports at the top of `FormSheet.tsx`: `import { AppIcon } from './contentIcons';` and `import { IconPickerSheet } from './IconPickerSheet';`.

- [ ] **Step 3: Wire the render branch**

In the field render chain (`FormSheet.tsx:398-430`), add a branch **before** the `secureTextEntry`/`TextInput` fallback:

```tsx
            ) : f.kind === 'icon' ? (
              <IconField
                value={values[f.key] ?? ''}
                color={f.color}
                onChange={(name) => setValues((v) => ({ ...v, [f.key]: name }))}
              />
```

In `submit` (`FormSheet.tsx:361-376`), add `if (f.kind === 'icon') continue;` alongside the `select` skip (icon fields are name strings, not validated text).

- [ ] **Step 4: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/FormSheet.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): FormSheet icon-picker field kind"
```

---

## Task 5: Slice 0 reference wiring — TxCategories

**Files:**
- Modify: `mobile/src/screens/TxCategories.tsx` (form fields `76-83`; action-sheet icons `95-96`; toast `88`; card display `145-146`, styles `195-205`)

**Interfaces:**
- Consumes: `kind: 'icon'` FormSheet field, `AppIconBox`.

- [ ] **Step 1: Convert the create/edit form field**

In `newCategory` (`TxCategories.tsx:76-83`), replace the free-text icon field and default:

```tsx
        { kind: 'icon', key: 'icon', label: 'Icon', optional: true,
          color: kind === 'income' ? '#7faf93' : '#c9a86a' },
```

and the submit default:

```tsx
          icon: v['icon'] || (kind === 'income' ? 'coins' : 'tag'),
```

- [ ] **Step 2: Replace the card icon display**

At `TxCategories.tsx:145-146`, replace the emoji `<Text>` box with the prominent wrapper:

```tsx
import { AppIconBox } from '../components/contentIcons';
// …in the card body, replacing the <View style={iconBox}><Text>{c.icon}</Text></View>:
<AppIconBox value={c.icon} color={c.color} />
```

Remove the now-unused `iconBox`/`iconGlyph` styles (`195-205`) if nothing else references them (grep first).

- [ ] **Step 3: Replace remaining glyphs on this screen**

`openNewCategorySheet` options (`95-96`) use `icon: '🏷'` / `icon: '💰'` for the action sheet — those flow through the sheet's own icon slot; map to names `'tag'` / `'coins'`. The toast (`88`) `toast(..., '🏷')` → `'tag'`. Confirm the sheet/toast host renders icons via `AppIcon`/`MI` — if it still renders raw text, defer those two to the Slice D chrome pass and leave a `// TODO(slice-D): icon host` note. (Category card + form are the Slice 0 deliverable.)

- [ ] **Step 4: Typecheck + existing tests**

Run: `cd mobile && npx tsc --noEmit && npx jest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/TxCategories.tsx
git -c user.email=gairola.ashutosh26@gmail.com commit -m "feat(mobile): category icon picker + prominent icon box"
```

---

## Rollout slices (Tasks 6–10)

Each slice task is mechanical and follows the **same recipe**. Per file:

1. `grep -nP "[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2190}-\x{21FF}\x{2300}-\x{23FF}]" <file>` to inventory glyphs.
2. For each glyph, decide **render vs data**:
   - Rendered UI glyph → replace. If it's a category/source/budget/goal/event icon shown in a box → `<AppIconBox value={…} color={…} />`. Otherwise inline → `<AppIcon value="<name>" size={≥16} color={…} />` (name via `M_EMOJI`, e.g. `📅`→`calendar2`, `⚠`→`warn`), or a `MI.*` chrome icon if one fits better.
   - `munshi.png` `<Image>` → **skip**.
   - Emoji in a `.spec.ts`, comment, or logic/data string (Global Constraints list) → **skip**.
   - A free-text emoji **input** → convert to `kind: 'icon'` field (form) or `IconPickerSheet` + `useIconPicker()` (custom sheet).
3. Add the `AppIcon`/`AppIconBox`/`IconPickerSheet` import.
4. `npx tsc --noEmit` after each file; `npx jest` at slice end.
5. One commit per slice.

The `M_EMOJI` table (`contentIcons.data.ts`) is the glyph→name mapping reference for every replacement.

### Task 6 — Slice A: Money
**Files:** `Accounts.tsx`, `AccountDetail.tsx`, `CardDetail.tsx`, `Budgets.tsx`, `Goals.tsx`, `Invest.tsx`, `app/PayBillSheet.tsx` (payment-source icons). Wire pickers on account/budget/goal create-edit forms.
Commit: `feat(mobile): icon rollout — money screens`

### Task 7 — Slice B: Transactions
**Files:** `Txns.tsx`, `TxDetail.tsx`, `CategoryDetail.tsx`, `app/AddTxSheet.tsx`, `ChatTxCard.tsx`, `Search.tsx`.
Commit: `feat(mobile): icon rollout — transaction screens`

### Task 8 — Slice C: Events & subs
**Files:** `screens/events/CreateEventSheet.tsx`, `EventDetail.tsx`, `EventItemSheet.tsx`, `Events.tsx`, `templates.ts` (audit: only if rendered), subscriptions screen(s). Wire the event-icon picker via `useIconPicker()` (custom sheet).
Commit: `feat(mobile): icon rollout — events & subscriptions`

### Task 9 — Slice D: Home / Chat / chrome
**Files:** `Home.tsx`, `Chat.tsx`, `chat/ToolStatusChip.tsx`, `Notifications.tsx`, `Sync.tsx`, `Reports.tsx`, `app/TabBar.tsx`, `app/NavBar.tsx`, `app/FabActions.tsx`, `app/MoreSheet.tsx`, `app/ProfileSheet.tsx`, `feedback/FeedbackProvider.tsx` (toast/action-sheet icon slots — resolve the Slice 0 TODOs here), `MonitoredApps.tsx`, `StatementReviewScreen.tsx`, `DetectedCard.tsx`. **Skip all `munshi.png`.**
Commit: `feat(mobile): icon rollout — home, chat & app chrome`

### Task 10 — Slice E: Onboarding / auth / settings
**Files:** `screens/onboarding/Wizard.tsx`, `steps.tsx`, `screens/auth/*` (Welcome, Login, Signup, ResetPassword, LockScreen, AuthFlow), `Settings.tsx`, `BackendUrlCard.tsx`. Also replace the `DateField` calendar glyph `📅` (`FormSheet.tsx:130`) → `<MI…>`/`<AppIcon value="calendar2">`.
Commit: `feat(mobile): icon rollout — onboarding, auth & settings`

---

## Task 11: Verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck + test suite**

Run: `cd mobile && npx tsc --noEmit && npx jest`
Expected: PASS.

- [ ] **Step 2: Confirm no stray rendered glyphs remain**

Run: `cd mobile && grep -rnP "[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}]" src/ | grep -viE "\.spec\.|munshi|smsSyncMap|pluralize|catalogSource|adapters|bankLogos|// "`
Expected: no rendered-UI glyphs (only intentionally-skipped data/comment lines, if any). Investigate each remaining line.

- [ ] **Step 3: Drive the app (verify skill)**

Invoke the `verify` skill: launch the app, open a category create sheet → confirm the icon picker opens, searches, and the chosen icon renders prominently (colored box) on the category card; open a screen from each slice and confirm migrated glyphs render as SVG icons and the Munshi avatar is unchanged.

- [ ] **Step 4: Final commit (if any cleanup)**

```bash
git -c user.email=gairola.ashutosh26@gmail.com commit -am "chore(mobile): icon rollout verification cleanup"
```
