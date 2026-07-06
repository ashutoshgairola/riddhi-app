/**
 * Screen registry — maps a `ScreenKind` to the component that renders it.
 *
 * Source of truth: the `renderScreen` switch in
 * `project/riddhi/MobileApp.jsx:288–307`, which maps each `entry.kind` to
 * a concrete screen component (`MobileHome`, `MobileTxns`, ...). Phase 4
 * tasks swapped each kind from a `PlaceholderScreen` stub to its real
 * screen component one at a time; `chat` -> `Chat` (Task 4.12) was the
 * last remaining placeholder, so every kind now maps to a real screen.
 */
import { AccountDetail } from '../screens/AccountDetail';
import { Accounts } from '../screens/Accounts';
import { Budgets } from '../screens/Budgets';
import { CategoryDetail } from '../screens/CategoryDetail';
import { Chat } from '../screens/Chat';
import { Goals } from '../screens/Goals';
import { Home } from '../screens/Home';
import { Invest } from '../screens/Invest';
import { Notifications } from '../screens/Notifications';
import { Reports } from '../screens/Reports';
import { Search } from '../screens/Search';
import { Settings } from '../screens/Settings';
import { Sync } from '../screens/Sync';
import { TxCategories } from '../screens/TxCategories';
import { TxDetail } from '../screens/TxDetail';
import { Txns } from '../screens/Txns';
import type { ScreenEntry, ScreenKind } from './navContext';

type ScreenComponent = React.ComponentType<{ entry: ScreenEntry }>;

/** Kind -> component. */
export const SCREEN_REGISTRY: Record<ScreenKind, ScreenComponent> = {
  home: Home,
  txns: Txns,
  budgets: Budgets,
  goals: Goals,
  invest: Invest,
  reports: Reports,
  sync: Sync,
  chat: Chat,
  accounts: Accounts,
  'account-detail': AccountDetail,
  'tx-cats': TxCategories,
  'cat-detail': CategoryDetail,
  settings: Settings,
  notifs: Notifications,
  search: Search,
  'tx-detail': TxDetail,
};

/** Renders the screen for a given stack entry — RN counterpart of
 * `renderScreen(entry)` in MobileApp.jsx:288–307. */
export function renderScreen(entry: ScreenEntry) {
  const Screen = SCREEN_REGISTRY[entry.kind] ?? SCREEN_REGISTRY.home;
  return <Screen entry={entry} />;
}
