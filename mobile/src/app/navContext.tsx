/**
 * Navigation model — RN port of the custom stack-based router in the web
 * prototype (`project/riddhi/MobileApp.jsx:239–314`).
 *
 * The prototype keeps navigation state as a plain array of
 * `{ kind, data? }` entries (`stack`) plus a handful of boolean sheet/FAB
 * flags, all colocated in `MobileApp()` and exposed to deep components via
 * `window.RiddhiApp = { openAdd, nav, push, pop }` (MobileApp.jsx:276–278).
 * RN has no global `window` object to lean on for this, so the same shape
 * is exposed instead via a React context (`NavProvider` / `useNav()`) —
 * every deep component calls `useNav()` instead of reaching for a global.
 *
 * This intentionally does NOT use React Navigation: the prototype's model
 * (a flat stack array driving exact CSS-keyframe slide/scale transitions,
 * reset-to-root tab switches, and sheets that are booleans rather than
 * routes) doesn't map cleanly onto React Navigation's stack/tab paradigm.
 * `AppShell.tsx` (Task 3.1), the future `TabBar`/`NavBar` (Task 3.2), `FAB`
 * (Task 3.3) and sheets (Task 3.4) all read this context directly.
 */
import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from 'react';

// ── Screen registry kinds ────────────────────────────────────────────
// Mirrors the `renderScreen` switch in MobileApp.jsx:288–307.
export type ScreenKind =
  | 'home'
  | 'txns'
  | 'budgets'
  | 'goals'
  | 'invest'
  | 'reports'
  | 'sync'
  | 'chat'
  | 'accounts'
  | 'account-detail'
  | 'tx-cats'
  | 'cat-detail'
  | 'settings'
  | 'notifs'
  | 'search'
  | 'tx-detail';

/** One entry in the nav stack. `data` carries route params (e.g. the
 * account/transaction being drilled into) — MobileApp.jsx:299/304. */
export interface ScreenEntry {
  kind: ScreenKind;
  data?: any;
}

/** Tabs that reset the stack to a single root rather than pushing — the
 * `primaryTabs` array in MobileApp.jsx:263. `more` is deliberately NOT in
 * this list: it opens the More sheet instead of navigating (goTab,
 * MobileApp.jsx:251–255). */
export const PRIMARY_TABS: ScreenKind[] = ['home', 'txns', 'budgets', 'goals', 'invest'];

export type Platform = 'ios' | 'android';

/** Optional seed values for the Add-transaction sheet (e.g. an account's
 * "Transfer" quick action opens the sheet in transfer mode, scoped to it). */
export interface AddPrefill {
  type?: 'expense' | 'income' | 'transfer';
  accountId?: string;
  /** Seed amount (absolute value, in rupees) — e.g. from a scanned receipt. */
  amount?: number;
  /** Seed description/note. */
  desc?: string;
  /** Seed category label (matched against the type's quick-add chips). */
  category?: string;
}

/** Dev override for the shell's platform-specific transition/chrome.
 * Task 3.2 will exercise the Android path by flipping this (or by passing
 * `platform="android"` to `<NavProvider>` directly) — see AppShell.tsx. */
export const DEV_PLATFORM_OVERRIDE: Platform | null = null;

export interface NavContextValue {
  /** Full nav stack, root-first. `stack[stack.length - 1]` is the visible
   * screen. */
  stack: ScreenEntry[];
  /** Top of the stack — the currently visible screen. */
  top: ScreenEntry;
  /** `stack[0].kind` if it's a primary tab, else `null` — MobileApp.jsx:310–314. */
  activeTab: ScreenKind | null;
  /** Universal navigate: resets to root for primary tabs, otherwise
   * pushes. Also closes the More/Profile sheets. MobileApp.jsx:262–271. */
  nav: (id: ScreenKind, data?: any) => void;
  /** Append a screen to the stack. MobileApp.jsx:257. */
  push: (entry: ScreenEntry) => void;
  /** Pop the top of the stack (no-op at root). MobileApp.jsx:259. */
  pop: () => void;
  /** Tab-bar navigate: 'more' opens the More sheet; everything else resets
   * the stack to `[{kind: id}]` and closes the FAB. MobileApp.jsx:251–255. */
  goTab: (id: ScreenKind | 'more') => void;
  /** Opens the Add-transaction sheet, closing the FAB. MobileApp.jsx:273.
   * An optional prefill seeds the sheet's type/account. */
  openAdd: (prefill?: AddPrefill) => void;
  platform: Platform;
  fabOpen: boolean;
  setFabOpen: (open: boolean) => void;
  addOpen: boolean;
  setAddOpen: (open: boolean) => void;
  /** Prefill for the currently-open Add sheet (cleared when it closes). */
  addPrefill: AddPrefill | null;
  moreOpen: boolean;
  setMoreOpen: (open: boolean) => void;
  profileOpen: boolean;
  setProfileOpen: (open: boolean) => void;
}

const NavContext = createContext<NavContextValue | null>(null);

export interface NavProviderProps extends PropsWithChildren {
  /** Drives the shell's transition style (iOS slide vs Android
   * scale/fade) and Material vs iOS chrome. Defaults to 'ios'. Task 3.2
   * will exercise 'android' explicitly. */
  platform?: Platform;
}

export function NavProvider({ children, platform = DEV_PLATFORM_OVERRIDE ?? 'ios' }: NavProviderProps) {
  const [stack, setStack] = useState<ScreenEntry[]>([{ kind: 'home' }]);
  const [fabOpen, setFabOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addPrefill, setAddPrefill] = useState<AddPrefill | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const top = stack[stack.length - 1];

  const push = useCallback((entry: ScreenEntry) => {
    setStack((s) => [...s, entry]);
  }, []);

  const pop = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  const goTab = useCallback((id: ScreenKind | 'more') => {
    if (id === 'more') {
      setMoreOpen(true);
      return;
    }
    setStack([{ kind: id }]);
    setFabOpen(false);
  }, []);

  const nav = useCallback((id: ScreenKind, data?: any) => {
    if (PRIMARY_TABS.includes(id)) {
      setStack([{ kind: id }]);
    } else {
      setStack((s) => [...s, { kind: id, data }]);
    }
    setMoreOpen(false);
    setProfileOpen(false);
  }, []);

  const openAdd = useCallback((prefill?: AddPrefill) => {
    setAddPrefill(prefill ?? null);
    setAddOpen(true);
    setFabOpen(false);
  }, []);

  // Clear any prefill once the sheet closes so the next plain open starts fresh.
  const handleSetAddOpen = useCallback((open: boolean) => {
    setAddOpen(open);
    if (!open) setAddPrefill(null);
  }, []);

  const activeTab = useMemo<ScreenKind | null>(() => {
    const k = stack[0].kind;
    return PRIMARY_TABS.includes(k) ? k : null;
  }, [stack]);

  const value = useMemo<NavContextValue>(
    () => ({
      stack,
      top,
      activeTab,
      nav,
      push,
      pop,
      goTab,
      openAdd,
      platform,
      fabOpen,
      setFabOpen,
      addOpen,
      setAddOpen: handleSetAddOpen,
      addPrefill,
      moreOpen,
      setMoreOpen,
      profileOpen,
      setProfileOpen,
    }),
    [stack, top, activeTab, nav, push, pop, goTab, openAdd, handleSetAddOpen, platform, fabOpen, addOpen, addPrefill, moreOpen, profileOpen],
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavContextValue {
  const ctx = useContext(NavContext);
  if (!ctx) {
    throw new Error('useNav() must be called within a <NavProvider>');
  }
  return ctx;
}
