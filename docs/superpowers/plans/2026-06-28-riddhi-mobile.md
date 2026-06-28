# Riddhi Mobile App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pixel-perfect React Native (Expo) reproduction of `project/riddhi/Riddhi Mobile.html` and its imported components — 15 screens, all animations, iOS + Android variants, light/dark theme.

**Architecture:** Expo managed + TypeScript. A token-driven `ThemeProvider` ports `mobile.css`/`platform.css` CSS variables 1:1. Shared primitives (from `MobileCore.jsx`) built on Reanimated 3 + Gesture Handler + react-native-svg + expo-blur. A custom nav shell (bottom-tabs + native-stack + FAB overlay) reproduces `MobileApp.jsx`. Screens start on ported local mock data with a thin `api/` layer ready to swap to the backend.

**Tech Stack:** Expo (managed), TypeScript, React Navigation v6 (native-stack + bottom-tabs), react-native-reanimated 3, react-native-gesture-handler, react-native-svg, expo-blur, expo-font, expo-image-picker, @react-native-async-storage/async-storage.

## Global Constraints

- **Source of truth:** `project/riddhi/` prototype files. Reproduce visual output exactly; copy numeric values (sizes, paddings, colors, durations, delays) verbatim from the named source lines.
- **Design tokens (dark):** `bg #0e0b15 · bg1 #17131f · bg2 #1f1a2c · bg3 #2a2339 · bg4 #342c45 · em #b6a4f3 · emDim rgba(182,164,243,0.14) · emGlow rgba(182,164,243,0.25) · red #ff6b85 · amber #ffc24b · blue #6ea8ff · violet #a78bfa · cyan #5ee0d8 · text1 #f3f0fb · text2 #9a90b5 · text3 #635a7a · glassBg rgba(255,255,255,0.055) · glassBg2 rgba(255,255,255,0.09) · glassBrd rgba(255,255,255,0.10) · glassBrd2 rgba(255,255,255,0.18) · glassHi inset 0 1px 0 rgba(255,255,255,0.10)`. Radii sm12 md16 lg20 xl26 2xl32 3xl38. Light theme = full token swap from `mobile.css` `[data-theme="light"]` (lines 57–124).
- **Easing:** `ease = cubic-bezier(.32,.72,0,1)` (`Easing.bezier(0.32,0.72,0,1)`), `spring = cubic-bezier(.34,1.56,.64,1)` (`Easing.bezier(0.34,1.56,0.64,1)` for timing, or `withSpring({damping,stiffness})` tuned to overshoot).
- **Font:** Plus Jakarta Sans, weights 400/500/600/700/800, via expo-font. `font-num` and `font-ui` are both Plus Jakarta Sans.
- **Currency formatting:** `'₹' + Math.abs(n).toLocaleString('en-IN')`. Lakh/K formatting per source (`₹X.XXL` ≥ 100000, `₹XK` otherwise).
- **No formal test suite.** Each task ends with a verification step: `npx tsc --noEmit` clean + boot in Expo and visually confirm against the named prototype source. Commit after each task.
- **RN transform rules (apply to every port task):** `div`→`View`/`Pressable`; text→`Text`; `className`→`style={s.x}` from a per-file `StyleSheet.create` reading theme tokens; `onClick`→`onPress`; `:active` scale→`Pressable` `pressed` style or Reanimated; `backdrop-filter: blur()`→`<BlurView>` (expo-blur) under a translucent overlay; CSS `transition`→Reanimated `withTiming/withSpring`; `onTouchStart/Move/End`→Gesture Handler `Gesture.Pan()`; inline `<svg>`→`react-native-svg`; `localStorage`→AsyncStorage; `window.dispatchEvent` bus→React Context.
- **Anthropic model:** `claude-sonnet-4-6`. `CHAT_CONTEXT` (MobileChat.jsx lines 27–36) used verbatim.

---

## Phase 0 — Project scaffold

### Task 0.1: Initialize Expo + TypeScript app

**Files:**
- Create: `mobile/` (Expo project root)
- Create: `mobile/app.json`, `mobile/tsconfig.json`, `mobile/babel.config.js`, `mobile/.env.example`, `mobile/.gitignore`

**Interfaces:**
- Produces: a booting Expo app; `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_ANTHROPIC_API_KEY` env contract.

- [ ] **Step 1: Scaffold**

```bash
cd /Users/ashutoshgairola/dev/riddhi-app
npx create-expo-app@latest mobile --template blank-typescript
cd mobile
npx expo install react-native-reanimated react-native-gesture-handler react-native-svg expo-blur expo-font expo-image-picker @react-native-async-storage/async-storage
npm i @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs react-native-screens react-native-safe-area-context
```

- [ ] **Step 2: Configure Reanimated + Gesture Handler**

`mobile/babel.config.js` — add `'react-native-reanimated/plugin'` as the **last** plugin. In `mobile/App.tsx` ensure the very first import is `import 'react-native-gesture-handler';` and wrap the root in `<GestureHandlerRootView style={{flex:1}}>`.

- [ ] **Step 3: Env contract**

`mobile/.env.example`:
```
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_ANTHROPIC_API_KEY=
```
Add `.env` to `mobile/.gitignore`.

- [ ] **Step 4: Verify boot**

Run: `cd mobile && npx tsc --noEmit && npx expo start` (or `--web` for a quick check). Expected: bundles with no TS errors; default screen renders.

- [ ] **Step 5: Commit**

```bash
git -C /Users/ashutoshgairola/dev/riddhi-app init 2>/dev/null; git add mobile && git commit -m "chore(mobile): scaffold Expo + TS app with core deps"
```
(If the user declines git init, skip commits throughout and track progress via checkboxes.)

### Task 0.2: Fonts + safe-area + navigation root

**Files:**
- Create: `mobile/assets/fonts/` (Plus Jakarta Sans 400/500/600/700/800 `.ttf`)
- Create: `mobile/src/app/Root.tsx`
- Modify: `mobile/App.tsx`

**Interfaces:**
- Produces: `Root` component mounting `SafeAreaProvider` + `NavigationContainer` + font loader; `useFonts()` gate.

- [ ] **Step 1: Add fonts**

Download Plus Jakarta Sans (the 5 weights) into `assets/fonts/`. Load via `expo-font` `useFonts({ PlusJakarta_400Regular: ..., _500Medium, _600SemiBold, _700Bold, _800ExtraBold })` (or `@expo-google-fonts/plus-jakarta-sans` — `npx expo install @expo-google-fonts/plus-jakarta-sans`). Map weights to family names in tokens (Task 1.1).

- [ ] **Step 2: Root shell**

`Root.tsx`: render `null` until fonts loaded; then `SafeAreaProvider` → `ThemeProvider` (Task 1.2) → `NavigationContainer` → `AppShell` (Task 3.1). `App.tsx` renders `<GestureHandlerRootView><Root/></GestureHandlerRootView>`.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` and boot. Expected: app boots, fonts available (temporary `<Text style={{fontFamily:'PlusJakarta_700Bold'}}>` renders in Jakarta).

- [ ] **Step 4: Commit** — `feat(mobile): fonts, safe-area, navigation root`

---

## Phase 1 — Theme & tokens

### Task 1.1: Token objects

**Files:**
- Create: `mobile/src/theme/tokens.ts`

**Interfaces:**
- Produces: `type Tokens` (keys listed in Global Constraints + `fonts.ui/num`, `weight.{400..800}`, `radius.{sm,md,lg,xl,xl2,xl3}`, `ease`, `spring`); `export const dark: Tokens`, `export const light: Tokens`.

- [ ] **Step 1: Write tokens**

Transcribe every CSS var from `mobile.css:7–54` into `dark` and `mobile.css:57–86` into `light`. Include the light-theme surface overrides (page gradient, card shadow, tabbar, sheet, toast, fab-action, backdrop — `mobile.css:87–124`) as named token fields (`pageGradient: string[]`, `cardShadow`, etc.) so components consume them rather than hard-coding. Fonts: `fonts.ui='PlusJakarta'` with weight→family map; expose `weight` helper returning the right family per numeric weight.

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean.
- [ ] **Step 3: Commit** — `feat(mobile): port mobile.css design tokens to TS`

### Task 1.2: ThemeProvider + persistence

**Files:**
- Create: `mobile/src/theme/ThemeProvider.tsx`

**Interfaces:**
- Consumes: `dark`, `light` from tokens.
- Produces: `ThemeProvider`, `useTheme(): { t: Tokens, mode: 'dark'|'light', setMode(m), toggle() }`. Persists to AsyncStorage key `riddhi-theme` (matches prototype `localStorage` key, MobileScreens.jsx:548).

- [ ] **Step 1: Implement** Context with `mode` state, load persisted value on mount (default `'dark'`), `setMode` writes AsyncStorage. `t = mode==='light'?light:dark`.
- [ ] **Step 2: Verify** — boot; temporary button calling `toggle()` flips a sample card background; relaunch keeps last mode.
- [ ] **Step 3: Commit** — `feat(mobile): ThemeProvider with AsyncStorage persistence`

### Task 1.3: Glass primitive + page background

**Files:**
- Create: `mobile/src/components/Glass.tsx` (`GlassCard`, `GlassView`)
- Create: `mobile/src/components/PageBackground.tsx`

**Interfaces:**
- Produces: `<GlassCard style?>` (BlurView intensity≈40 + `glassBg` overlay + `glassBrd` 1px border + `glassHi` top inset emulated via a 1px top highlight view, radius `xl` default); `<GlassView>` (no padding variant for topbar/tabbar/sheet); `<PageBackground>` rendering the `m-page` linear gradient + `::before` radial glow stack (`mobile.css:153–171`) using `expo-linear-gradient` + absolutely-positioned radial-ish gradients (use `react-native-svg` `RadialGradient` for the glow blobs).

- [ ] **Step 1: Install** `npx expo install expo-linear-gradient`.
- [ ] **Step 2: Implement** GlassCard/GlassView/PageBackground per source values.
- [ ] **Step 3: Verify** — render a `GlassCard` over `PageBackground`; matches the frosted look of `.m-card` on `.m-page`.
- [ ] **Step 4: Commit** — `feat(mobile): glass card + page background primitives`

---

## Phase 2 — Shared primitives (from MobileCore.jsx)

### Task 2.1: useCountUp hook (Reanimated)

**Files:**
- Create: `mobile/src/hooks/useCountUp.ts`

**Interfaces:**
- Produces: `useCountUp(target:number, duration=900, delay=0): number` — returns an integer that animates 0→target with easing `1 - 2^(-10t)`, guarantees final value lands. Source: MobileCore.jsx:3–25.

- [ ] **Step 1: Implement**

```ts
import { useEffect, useState } from 'react';
export function useCountUp(target: number, duration = 900, delay = 0) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf = 0, timer: any, fallback: any;
    timer = setTimeout(() => {
      const start = Date.now();
      const tick = () => {
        const t = Math.min((Date.now() - start) / duration, 1);
        const eased = 1 - Math.pow(2, -10 * t);
        setVal(Math.round(target * eased));
        if (t < 1) raf = requestAnimationFrame(tick); else setVal(target);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    fallback = setTimeout(() => setVal(target), delay + duration + 80);
    return () => { clearTimeout(timer); clearTimeout(fallback); cancelAnimationFrame(raf); };
  }, [target]);
  return val;
}
```
(RAF-on-JS is fine and matches the prototype exactly; no Reanimated needed for a number readout.)

- [ ] **Step 2: Verify** — temporary `<Text>{useCountUp(91000)}</Text>` counts up then settles on 91000.
- [ ] **Step 3: Commit** — `feat(mobile): useCountUp hook`

### Task 2.2: MI icon set

**Files:**
- Create: `mobile/src/components/icons.tsx`

**Interfaces:**
- Produces: `MI: Record<string, (p:{size?:number;color?:string;strokeWidth?:number})=>JSX.Element>` for every icon in MobileCore.jsx:189–205 (home, txns, budget, goals, invest, bell, search, back, plus, filter, more, arrow, eye, eyeOff, sparkle) plus inline svgs used elsewhere (sms/chat/camera/send/check/trash/edit/refresh/info) ported as needed.

- [ ] **Step 1: Implement** each as a `react-native-svg` component preserving exact `viewBox`/paths, `stroke="currentColor"`→`color` prop, default `strokeWidth=2`.
- [ ] **Step 2: Verify** — render a row of all icons; shapes match.
- [ ] **Step 3: Commit** — `feat(mobile): port MI icon set to react-native-svg`

### Task 2.3: Toast + ActionSheet hosts (Context bus)

**Files:**
- Create: `mobile/src/feedback/FeedbackProvider.tsx`

**Interfaces:**
- Produces: `FeedbackProvider`; `useFeedback(): { toast(msg:string, icon?:string), sheet(cfg:{title?:string, options:{label:string,icon?:string,danger?:boolean,onPress?:()=>void}[]}) }`. Replaces `mToast`/`mSheet`/`MToastHost`/`MActionSheetHost` (MobileCore.jsx:207–261). Toast auto-dismiss 2200ms, styled `.m-toast` (mobile.css:687–704), stacked bottom:104. ActionSheet renders inside `BottomSheet` (Task 2.4).

- [ ] **Step 1: Implement** provider holding toast queue + sheet config; render `BottomSheet` for the action sheet, toast stack overlay.
- [ ] **Step 2: Verify** — buttons triggering `toast('Saved','✓')` and `sheet({title,options})` work; toast fades per `toastIn` keyframe.
- [ ] **Step 3: Commit** — `feat(mobile): toast + action-sheet feedback provider`

### Task 2.4: BottomSheet (drag-to-dismiss)

**Files:**
- Create: `mobile/src/components/BottomSheet.tsx`

**Interfaces:**
- Consumes: GlassView, icons.
- Produces: `<BottomSheet open onClose title? headerRight? children>`. Source: MobileCore.jsx:27–79 + `.m-sheet*` styles (mobile.css:375–440). Backdrop fade; sheet slides from `translateY(100%)`; handle-zone `Gesture.Pan()` follows finger downward only, dismiss if drag>100, else spring back; max-height 92%; rounded-top 32; glass blur 40.

- [ ] **Step 1: Implement** with Reanimated shared `translateY` + spring open, `useAnimatedStyle`; Pan gesture on handle zone.
- [ ] **Step 2: Verify** — opens/closes; drag down past threshold dismisses, short drag springs back.
- [ ] **Step 3: Commit** — `feat(mobile): BottomSheet with drag-to-dismiss`

### Task 2.5: MSeg sliding segmented control

**Files:**
- Create: `mobile/src/components/MSeg.tsx`

**Interfaces:**
- Produces: `<MSeg options={(string|{value,label})[]} value onChange>`. Source: MobileCore.jsx:81–113 + `.m-seg*` (mobile.css:551–585). Indicator pill animates `translateX` + `width` with spring (`.35s spring`) to the active button measured via `onLayout`.

- [ ] **Step 1: Implement** capture each button layout (`onLayout` → x,width array); animate indicator with `withTiming(...,{easing: spring bezier})` or `withSpring`.
- [ ] **Step 2: Verify** — 3-option seg; pill slides smoothly with slight overshoot.
- [ ] **Step 3: Commit** — `feat(mobile): MSeg animated segmented control`

### Task 2.6: PullToRefresh

**Files:**
- Create: `mobile/src/components/PullToRefresh.tsx`

**Interfaces:**
- Produces: `<PullToRefresh onRefresh children>` wrapping a scroll area. Source: MobileCore.jsx:116–163 + `.m-ptr*` (mobile.css:658–677). Pull only when scrollTop≤0, factor 0.5, cap 90, threshold 60, spinner rotates `pull*4`deg then spins 700ms linear, 900ms refresh.

- [ ] **Step 1: Implement** as a `ScrollView` with a `Gesture.Pan()` overlay (simultaneous with native scroll) driving a `pull` shared value and content `translateY`; spinner = bordered circle (`m-ptr-spinner`) with rotate.
- [ ] **Step 2: Verify** — overscroll at top reveals spinner; release past threshold triggers refresh then settles.
- [ ] **Step 3: Commit** — `feat(mobile): PullToRefresh`

### Task 2.7: Charts — MSparkline, WeekChart, MGroupedBars, MDonut

**Files:**
- Create: `mobile/src/components/charts.tsx`

**Interfaces:**
- Produces: `<MSparkline data color height=48>` (MobileCore.jsx:165–186), `<WeekChart data peakIdx>` (MobileHome.jsx:15–59, incl. `smoothPath` Catmull-Rom), `<MGroupedBars inc exp labels h=130>` (MobileScreens.jsx:31–50), `<MDonut data total size=140>` (MobileScreens.jsx:52–76). All via react-native-svg.

- [ ] **Step 1: Implement** — port `smoothPath` verbatim:

```ts
function smoothPath(pts:[number,number][]) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i-1]||pts[i], p1 = pts[i], p2 = pts[i+1], p3 = pts[i+2]||p2;
    const c1x = p1[0]+(p2[0]-p0[0])/6, c1y = p1[1]+(p2[1]-p0[1])/6;
    const c2x = p2[0]-(p3[0]-p1[0])/6, c2y = p2[1]-(p3[1]-p1[1])/6;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}
```
Line draw-in: animate `strokeDashoffset` 1→0 via Reanimated `AnimatedPath` (`react-native-svg` + reanimated `createAnimatedComponent`). Area fade-in, peak marker, day labels (peak highlighted) per source. Donut: animated `strokeDasharray` per slice. Grouped bars: animated heights with per-index delay.

- [ ] **Step 2: Verify** — render WeekChart with `MH_WEEK` data; smooth curve, peak dot at Sat, labels correct; donut + bars animate in.
- [ ] **Step 3: Commit** — `feat(mobile): svg charts (sparkline, week area, grouped bars, donut)`

### Task 2.8: Common UI atoms

**Files:**
- Create: `mobile/src/components/ui.tsx`

**Interfaces:**
- Produces: `<Topbar title? left? right? scrolled>` (`.m-topbar`), `<IconButton dot? onPress>` (`.m-iconbtn` + `.m-iconbtn-dot`), `<Chip on? onPress>` (`.m-chip`), `<SectionHead title link? onLink>`, `<Btn variant='em'|'ghost'|'danger'>` (`.m-btn*`), `<ProgressBar pct color>` (`.m-pbar`/`.m-pfill`), `<Toggle on onChange>` (MobileScreens.jsx:552–563), `<ListCard>` + `<ListRow>` (`.m-list-card`/`.m-list-row`), `<HScroll>` (`.m-hscroll`). All token-driven, with `:active` scale via Pressable.

- [ ] **Step 1: Implement** each atom from the named styles.
- [ ] **Step 2: Verify** — sample gallery screen renders all atoms matching prototype.
- [ ] **Step 3: Commit** — `feat(mobile): shared UI atoms`

---

## Phase 3 — Navigation shell (from MobileApp.jsx)

### Task 3.1: AppShell, nav context, screen registry

**Files:**
- Create: `mobile/src/app/AppShell.tsx`
- Create: `mobile/src/app/navContext.tsx`
- Create: `mobile/src/app/screens.ts` (kind→component registry)

**Interfaces:**
- Consumes: all screens (Phase 4) — registry maps `'home'|'txns'|'budgets'|'goals'|'invest'|'reports'|'sync'|'chat'|'accounts'|'account-detail'|'tx-cats'|'settings'|'notifs'|'search'|'tx-detail'` → component.
- Produces: `useNav(): { nav(id,data?), push(entry), pop(), openAdd(), platform }`. Mirrors MobileApp.jsx:239–307 nav model: primary tabs (`home,txns,budgets,goals,invest`) reset the stack; others push. `More` opens a sheet, not a route.

- [ ] **Step 1: Implement** stack state `{kind,data}[]`; native-stack for pushed screens with iOS `slide_from_right` / Android `fade`; bottom-tabs (or custom tab bar — see 3.2) for primary tabs; provide nav context.
- [ ] **Step 2: Verify** — Home renders; `nav('reports')` pushes with slide; `pop()` returns.
- [ ] **Step 3: Commit** — `feat(mobile): app shell + nav context + screen registry`

### Task 3.2: Tab bar + Android NavBar (platform variants)

**Files:**
- Create: `mobile/src/app/TabBar.tsx` (iOS), `mobile/src/app/NavBar.tsx` (Android)

**Interfaces:**
- Consumes: nav context, icons.
- Produces: iOS `.m-tabbar` with centre FAB tab (mobile.css:254–327); Android `.m-navbar` + `.m-mfab` (platform.css:95–157). Active tab indicator pill; FAB rotates 45° when open. `platform` from a build constant (default `'ios'`; expose a dev toggle).

- [ ] **Step 1: Implement** both, selected by `platform`.
- [ ] **Step 2: Verify** — iOS shows centre FAB; flip platform → Android M3 NavBar + bottom-right FAB.
- [ ] **Step 3: Commit** — `feat(mobile): iOS tab bar + Android M3 nav bar`

### Task 3.3: FAB radial action stack

**Files:**
- Create: `mobile/src/app/FabActions.tsx`

**Interfaces:**
- Consumes: nav context.
- Produces: backdrop blur overlay + 4 staggered action cards (Ask Riddhi→chat, Add Expense/Income/Transfer→AddTx). iOS positions `bottom:100+i*64` centred; Android `96+56+12+i*64` right-aligned (MobileApp.jsx:280–341, platform.css:159–167). Staggered `transitionDelay i*0.04s`, scale/translate spring.

- [ ] **Step 1: Implement** with Reanimated per-item entrance; backdrop fade.
- [ ] **Step 2: Verify** — tapping FAB fans actions out with stagger; backdrop dims; tapping one routes/opens AddTx.
- [ ] **Step 3: Commit** — `feat(mobile): FAB radial action stack`

### Task 3.4: AddTx, More, Profile sheets

**Files:**
- Create: `mobile/src/app/AddTxSheet.tsx`, `mobile/src/app/MoreSheet.tsx`, `mobile/src/app/ProfileSheet.tsx`

**Interfaces:**
- Consumes: BottomSheet, MSeg, nav context, expo-image-picker.
- Produces: AddTxSheet (MobileApp.jsx:79–204 — type seg, amount display, `QA_CATS` chips, note, receipt picker, numeric keypad with the exact `press` rules, Save); MoreSheet (MobileApp.jsx:12–52 — 4 cards + list of remaining destinations); ProfileSheet (MobileApp.jsx:206–237).

- [ ] **Step 1: Implement** all three; keypad `press` logic ported verbatim (MobileApp.jsx:96–103); receipt via `expo-image-picker` → preview.
- [ ] **Step 2: Verify** — keypad enforces 2-decimal/8-char caps; category chips switch with type; image attach shows preview.
- [ ] **Step 3: Commit** — `feat(mobile): AddTx, More, Profile sheets`

---

## Phase 4 — Screens

> Each screen task: create `mobile/src/screens/<Name>.tsx`, port the named source 1:1 applying RN transform rules, wire nav, keep data as a local `const` mock (ported from source) plus `import` the matching view-model type from `src/api/types.ts` (Task 5.1, may be stubbed). Verification = boot, navigate to it, compare to source. Commit per task.

### Task 4.1: Home (`MobileHome.jsx`)
**Files:** Create `mobile/src/screens/Home.tsx`. Port hero card (count-up safe-to-spend, progress track, days-left chip), SMS banner (→sync), WeekChart card, recent txns, topbar (avatar→profile, search, bell w/ dot), PullToRefresh, scrolled topbar state. Data: `MH_WEEK`, `MH_RECENT`, budget constants (MobileHome.jsx:3–13,64–73).
- [ ] Implement → [ ] Verify (count-up runs, chart draws, pull-to-refresh works) → [ ] Commit `feat(mobile): Home screen`

### Task 4.2: Transactions (`MobileTxns.jsx`)
**Files:** Create `mobile/src/screens/Txns.tsx` + `mobile/src/screens/SwipeRow.tsx`. Summary cards, MSeg filter (all/inc/exp), `groupTxByDate` (port verbatim, today=2026-04-25), SwipeRow via `Gesture.Pan()` clamp ±90, settle to ±80 (open) or 0, left reveals red delete / right reveals blue edit (MobileTxns.jsx:33–85), tap pushes tx-detail. Data `MT_DATA`.
- [ ] Implement → [ ] Verify (swipe both directions reveals actions; tap opens detail; grouping labels correct) → [ ] Commit `feat(mobile): Transactions + swipe rows`

### Task 4.3: Budgets, Goals, Investments (`MobileSecondary.jsx`)
**Files:** Create `Budgets.tsx`, `Goals.tsx`, `Invest.tsx`. Budgets: overall progress ring (count-up %, threshold colours), category cards with progress + over-budget warning (`MB_BUDGETS`). Goals: cards w/ top accent, progress, L/K format (`MG_GOALS`). Invest: portfolio hero gradient + MSparkline, holdings list w/ return colour (`MV_HOLDINGS`).
- [ ] Implement → [ ] Verify (ring animates; over-budget Shopping shows warning; sparkline renders) → [ ] Commit `feat(mobile): Budgets, Goals, Investments screens`

### Task 4.4: Reports (`MobileScreens.jsx` MobileReports)
**Files:** Create `Reports.tsx`. 5 chip sub-tabs + period MSeg; overview (KPI strip, MGroupedBars, MDonut + legend, net-worth MSparkline); income/expense/savings/wealth tabs with their breakdowns (MobileScreens.jsx:26–337).
- [ ] Implement → [ ] Verify (all 5 tabs render; donut/bars animate; period seg slides) → [ ] Commit `feat(mobile): Reports screen`

### Task 4.5: Accounts + AccountDetail (`MobileScreens.jsx`)
**Files:** Create `Accounts.tsx`, `AccountDetail.tsx`. Net-worth hero (count-up, assets/liabilities), gradient account cards → push detail; detail balance card, quick actions, recent txns (MobileScreens.jsx:342–473). Data `M_ACCOUNTS_FULL`.
- [ ] Implement → [ ] Verify (tap card → detail with matching gradient) → [ ] Commit `feat(mobile): Accounts + AccountDetail`

### Task 4.6: TxCategories (`MobileScreens.jsx` MobileTxCats)
**Files:** Create `TxCategories.tsx`. MSeg all/exp/inc filter, category cards with sub-cat chips (MobileScreens.jsx:478–535). Data `M_CATS`.
- [ ] Implement → [ ] Verify → [ ] Commit `feat(mobile): Categories screen`

### Task 4.7: Settings (`MobileScreens.jsx` MobileSettings)
**Files:** Create `Settings.tsx`. Profile card, Preferences (Theme seg wired to `useTheme().setMode`, Language/Currency/Date sheets), Privacy (toggles), Notifications, Data, About sections, sign-out (MobileScreens.jsx:540–665). **Theme seg must actually swap the app theme + persist.**
- [ ] Implement → [ ] Verify (theme seg flips whole app light/dark, persists across relaunch; toggles toast) → [ ] Commit `feat(mobile): Settings screen + live theme switch`

### Task 4.8: Notifications (`MobileScreens.jsx` MobileNotifPage)
**Files:** Create `Notifications.tsx`. Chip filter (all/unread/budget/goal/tx/report/security), notification cards with unread dot + colour (MobileScreens.jsx:670–718). Data `all` array.
- [ ] Implement → [ ] Verify → [ ] Commit `feat(mobile): Notifications screen`

### Task 4.9: Search (`MobileScreens.jsx` MobileSearch)
**Files:** Create `Search.tsx`. Autofocus input, recent list, jump-to pages filtered by query → `nav` (MobileScreens.jsx:723–788).
- [ ] Implement → [ ] Verify (autofocus; filtering; tap routes) → [ ] Commit `feat(mobile): Search screen`

### Task 4.10: TxDetail (`MobileScreens.jsx` TxDetail)
**Files:** Create `TxDetail.tsx`. Big amount, detail rows, note card, edit/delete, more-sheet (MobileScreens.jsx:793–838).
- [ ] Implement → [ ] Verify → [ ] Commit `feat(mobile): TxDetail screen`

### Task 4.11: Sync (`MobileSync.jsx`)
**Files:** Create `Sync.tsx` + `DetectedCard.tsx`. Status card + Toggle, connected banks, DetectedCard with confirm/dismiss animation (slide ±40px + collapse maxHeight/opacity 360ms, MobileSync.jsx:45–99), add-all, auto-added list, how-it-works. Data `SYNC_DETECTED`, `SYNC_RECENT`, `SYNC_BANKS`.
- [ ] Implement → [ ] Verify (confirm slides right + collapses; ignore slides left; add-all clears; empty state shows count) → [ ] Commit `feat(mobile): Sync screen + detected-card animations`

### Task 4.12: Chat (`MobileChat.jsx`)
**Files:** Create `Chat.tsx` + `ChatTxCard.tsx` + `mobile/src/ai/askRiddhi.ts`. Empty state (scan-bill + suggestions), message bubbles, ChatTxCard, typing dots (`chatDot`), composer (attach + autosize textarea + send). `askRiddhi(history)` (Task 5.2). Receipt scan cycles `RECEIPT_RESULTS`. Data `CHAT_SUGGESTIONS`, `RECEIPT_RESULTS`, `CHAT_CATCOL`, `CHAT_ICON`.
- [ ] Implement → [ ] Verify (suggestion send → reply + ChatTxCard; typing dots animate; receipt scan adds card) → [ ] Commit `feat(mobile): Ask Riddhi chat screen`

---

## Phase 5 — API layer + AI wiring

### Task 5.1: API types + client (mock-first)

**Files:**
- Create: `mobile/src/api/types.ts`, `mobile/src/api/client.ts`, `mobile/src/api/index.ts`

**Interfaces:**
- Produces: view-model types matching screen needs; `apiClient` reading `EXPO_PUBLIC_API_URL` with bearer-token support; `api.*` functions returning the existing mock constants by default (so screens keep working), with a `USE_BACKEND` flag to switch to live fetch later. Adapter maps backend Section-18 shape (`amount` positive + `type`, `categoryId`) → screen view shape (signed amount, `cCol`).
- [ ] Implement → [ ] Verify (`tsc --noEmit`; screens still render from mock path) → [ ] Commit `feat(mobile): api types + mock-first client`

### Task 5.2: askRiddhi (backend → Anthropic → localParse)

**Files:**
- Create: `mobile/src/ai/askRiddhi.ts`, `mobile/src/ai/localParse.ts`

**Interfaces:**
- Produces: `askRiddhi(history:{role,text}[]): Promise<{reply:string, transaction:Tx|null}>`. Order: POST `${API_URL}/ai-chat` → on failure, direct Anthropic `claude-sonnet-4-6` with `CHAT_CONTEXT` verbatim (`EXPO_PUBLIC_ANTHROPIC_API_KEY`) → on failure, `localParse(lastUserText)`. JSON extraction = slice between first `{` and last `}` (MobileChat.jsx:70–82). `localParse` ported verbatim (MobileChat.jsx:38–68).
- [ ] Implement → [ ] Verify (with no key set, chat falls back to localParse and still logs a transaction; with key, real reply parses) → [ ] Commit `feat(mobile): askRiddhi with backend/Anthropic/local fallback`

### Task 5.3: Wire screens to live backend (deferred until backend ready)

**Files:** Modify each screen to call `api.*` instead of inline constants; flip `USE_BACKEND=true`.
- [ ] For each data screen, replace mock constant with `api` call + loading state. → [ ] Verify against running backend (Task list in backend plan) → [ ] Commit `feat(mobile): wire screens to backend API`

---

## Self-review notes
- Every prototype file is covered: MobileCore→Phase 1–2; MobileApp→Phase 3; MobileHome/Txns/Secondary/Screens/Sync/Chat→Phase 4; mobile.css/platform.css→Tasks 1.1–1.3 + atoms; AI→5.2.
- Theme switch is explicitly wired live in Task 4.7 (not just stored).
- Platform variants (iOS/Android) covered in 3.2/3.3.
- No placeholders: novel algorithms (count-up, smoothPath, keypad rules, swipe clamp) inlined; 1:1 ports reference exact source lines (the code exists in-repo).
