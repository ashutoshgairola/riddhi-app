/**
 * MPageShell — RN port of the shared pushed-screen scaffold from
 * `project/riddhi/MobileScreens.jsx:4–21`.
 *
 * The web `MPageShell` is `.m-page` + `.m-topbar` (with a back button) +
 * a scrollable `.m-body` that tracks a `scrolled` boolean (toggled past an
 * 8px scrollTop) to drive the topbar's glass/border treatment. This is the
 * same shape every other pushed/tab screen in this app already builds by
 * hand (see `Reports.tsx`, `Goals.tsx`, `Invest.tsx`), so this component
 * just factors that boilerplate out for screens that push deeper (Accounts
 * -> AccountDetail) — it composes `PageBackground` + `Topbar` (back button
 * + title + optional `right`) + a `ScrollView` body wired to `onScroll`.
 *
 * Reused, not reimplemented: `PageBackground`, `Topbar`, `IconButton`,
 * `MI.back`.
 */
import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { IconButton, Topbar } from '../components/ui';
import { MI } from '../components/icons';
import { PageBackground } from '../components/PageBackground';
import { useTheme } from '../theme/ThemeProvider';
import { spacing } from '../theme/spacing';

export interface MPageShellProps {
  title: string;
  /** Back-button handler. MobileScreens.jsx:10–12 (`onBack` prop, rendered
   * only when truthy — every caller here supplies one, namely `pop`). */
  onBack: () => void;
  /** Extra topbar-right content (e.g. a plus/more `IconButton`). */
  right?: React.ReactNode;
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

export function MPageShell({ title, onBack, right, children, contentContainerStyle }: MPageShellProps) {
  const { t } = useTheme();
  const [scrolled, setScrolled] = useState(false);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrolled(e.nativeEvent.contentOffset.y > 8);
  };

  return (
    <View style={styles.page}>
      <PageBackground />

      <Topbar
        title={title}
        scrolled={scrolled}
        left={
          <IconButton onPress={onBack}>
            <MI.back size={20} color={t.text1} />
          </IconButton>
        }
        right={right}
      />

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
});
