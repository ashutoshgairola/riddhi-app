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
import { CardDetail } from '../screens/CardDetail';
import { CategoryDetail } from '../screens/CategoryDetail';
import { Chat } from '../screens/Chat';
import { EventDetail } from '../screens/events/EventDetail';
import { Events } from '../screens/events/Events';
import { Goals } from '../screens/Goals';
import { Home } from '../screens/Home';
import { Invest } from '../screens/Invest';
import { MonitoredApps } from '../screens/MonitoredApps';
import { Notifications } from '../screens/Notifications';
import { Reports } from '../screens/Reports';
import { Search } from '../screens/Search';
import { Settings } from '../screens/Settings';
import { StatementReview } from '../screens/StatementReviewScreen';
import { Subscriptions } from '../screens/SubscriptionsScreen';
import { SubscriptionsReview } from '../screens/SubscriptionsReview';
import { Sync } from '../screens/Sync';
import { TxCategories } from '../screens/TxCategories';
import { TxDetail } from '../screens/TxDetail';
import { Txns } from '../screens/Txns';
import type { ScreenEntry, ScreenKind } from './navContext';

type ScreenComponent = React.ComponentType<{ entry: ScreenEntry }>;

/** Kind -> component. Still `Partial` (rather than every `ScreenKind`
 * required) for future kinds added ahead of their screen — `renderScreen`'s
 * `?? SCREEN_REGISTRY.home` fallback below quietly lands on Home instead of
 * a missing-component crash in that window. `'subscriptions-review'`
 * (Task 13's detect/add-subscription flow) is registered here (Task 14),
 * completing the union Task 13 left partial. */
export const SCREEN_REGISTRY: Partial<Record<ScreenKind, ScreenComponent>> = {
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
  'card-detail': CardDetail,
  subscriptions: Subscriptions,
  'subscriptions-review': SubscriptionsReview,
  'statement-review': StatementReview,
  'monitored-apps': MonitoredApps,
  'tx-cats': TxCategories,
  'cat-detail': CategoryDetail,
  settings: Settings,
  notifs: Notifications,
  search: Search,
  'tx-detail': TxDetail,
  events: Events,
  'event-detail': EventDetail,
};

/** Renders the screen for a given stack entry — RN counterpart of
 * `renderScreen(entry)` in MobileApp.jsx:288–307. */
export function renderScreen(entry: ScreenEntry) {
  // `SCREEN_REGISTRY.home` is always populated above (`Partial` only
  // accommodates kinds — like `'subscriptions-review'` — with no screen
  // registered yet), so the fallback itself is asserted non-null here.
  const Screen = SCREEN_REGISTRY[entry.kind] ?? (SCREEN_REGISTRY.home as ScreenComponent);
  return <Screen entry={entry} />;
}
