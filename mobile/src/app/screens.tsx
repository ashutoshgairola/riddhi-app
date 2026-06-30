/**
 * Screen registry — maps a `ScreenKind` to the component that renders it.
 *
 * Source of truth: the `renderScreen` switch in
 * `project/riddhi/MobileApp.jsx:288–307`, which maps each `entry.kind` to
 * a concrete screen component (`MobileHome`, `MobileTxns`, ...). Those
 * real screens land in Phase 4; until then every kind maps to
 * `PlaceholderScreen`, which renders enough chrome (a `Topbar` titled with
 * the kind, on the shared `PageBackground`) plus two buttons that exercise
 * the nav model end-to-end (`push({kind:'tx-detail'})` and `pop()`) so
 * `AppShell` and `navContext` can be verified before any real screen
 * exists. Phase 4 tasks replace entries in `SCREEN_REGISTRY` one kind at a
 * time — no shell/registry rework needed.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Btn } from '../components/ui';
import { PageBackground } from '../components/PageBackground';
import { Topbar } from '../components/ui';
import { AccountDetail } from '../screens/AccountDetail';
import { Accounts } from '../screens/Accounts';
import { Budgets } from '../screens/Budgets';
import { Goals } from '../screens/Goals';
import { Home } from '../screens/Home';
import { Invest } from '../screens/Invest';
import { Reports } from '../screens/Reports';
import { Txns } from '../screens/Txns';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { useNav, type ScreenEntry, type ScreenKind } from './navContext';

function PlaceholderScreen({ entry }: { entry: ScreenEntry }) {
  const { t } = useTheme();
  const { push, pop, stack } = useNav();

  return (
    <View style={styles.fill}>
      <PageBackground />
      <Topbar title={entry.kind} />
      <View style={styles.body}>
        <Text style={[styles.kind, { color: t.text1, fontFamily: weight(700) }]}>{entry.kind}</Text>
        <Text style={[styles.depth, { color: t.text3, fontFamily: weight(500) }]}>
          stack depth: {stack.length}
        </Text>
        {entry.data ? (
          <Text style={[styles.depth, { color: t.text3, fontFamily: weight(500) }]}>
            data: {JSON.stringify(entry.data)}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Btn variant="em" onPress={() => push({ kind: 'tx-detail', data: { from: entry.kind } })}>
            Push tx-detail
          </Btn>
          <Btn variant="ghost" onPress={pop}>
            Pop
          </Btn>
        </View>
      </View>
    </View>
  );
}

type ScreenComponent = React.ComponentType<{ entry: ScreenEntry }>;

/** Kind -> component. Every kind currently maps to `PlaceholderScreen`;
 * Phase 4 tasks swap individual entries for the real screen as each lands. */
export const SCREEN_REGISTRY: Record<ScreenKind, ScreenComponent> = {
  home: Home,
  txns: Txns,
  budgets: Budgets,
  goals: Goals,
  invest: Invest,
  reports: Reports,
  sync: PlaceholderScreen,
  chat: PlaceholderScreen,
  accounts: Accounts,
  'account-detail': AccountDetail,
  'tx-cats': PlaceholderScreen,
  settings: PlaceholderScreen,
  notifs: PlaceholderScreen,
  search: PlaceholderScreen,
  'tx-detail': PlaceholderScreen,
};

/** Renders the screen for a given stack entry — RN counterpart of
 * `renderScreen(entry)` in MobileApp.jsx:288–307. */
export function renderScreen(entry: ScreenEntry) {
  const Screen = SCREEN_REGISTRY[entry.kind] ?? SCREEN_REGISTRY.home;
  return <Screen entry={entry} />;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  kind: {
    fontSize: 22,
  },
  depth: {
    fontSize: 13,
  },
  actions: {
    marginTop: 24,
    width: '100%',
    gap: 12,
  },
});
