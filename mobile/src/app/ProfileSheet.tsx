/**
 * ProfileSheet — avatar header + account list rows + sign-out.
 *
 * Source of truth: project/riddhi/MobileApp.jsx:206–237 (`ProfileSheet`).
 */
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";

import { useAuth } from "../auth/AuthProvider";
import { BottomSheet } from "../components/BottomSheet";
import { AppIconBox } from "../components/contentIcons";
import { Btn, ListCard, ListRow } from "../components/ui";
import { MI } from "../components/icons";
import { useFeedback } from "../feedback/FeedbackProvider";
import { shareTxCsv } from "../lib/exportCsv";
import { useTheme } from "../theme/ThemeProvider";
import { weight } from "../theme/tokens";
import { useNav, type ScreenKind } from "./navContext";

const HELP_URL = "https://riddhi.app/help";

interface ProfileRow {
  i: string;
  c: string;
  l: string;
  k?: ScreenKind;
  /** Non-navigation action (Export data / Help & support). */
  action?: () => void;
}

export function ProfileSheet() {
  const { t } = useTheme();
  const { profileOpen, setProfileOpen, nav } = useNav();
  const { user, logout } = useAuth();
  const { toast } = useFeedback();

  const displayName = user?.name ?? "Riddhi Desai";
  const email = user?.email ?? "riddhi@example.com";
  const initials = displayName
    .split(/\s+/)
    .map((w) => w.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // rows (MobileApp.jsx:219–225).
  const ROWS: ProfileRow[] = [
    { i: "⚙", c: "#8a8299", l: "Settings", k: "settings" },
    { i: "🔔", c: "#c97d8c", l: "Notifications", k: "notifs" },
    { i: "💳", c: "#8197c4", l: "Manage accounts", k: "accounts" },
    {
      i: "📤",
      c: "#7faf93",
      l: "Export data",
      action: () =>
        void shareTxCsv("all").catch(() => toast("Couldn't export data", "📡")),
    },
    {
      i: "❓",
      c: "#6fb3ad",
      l: "Help & support",
      action: () => void WebBrowser.openBrowserAsync(HELP_URL),
    },
  ];

  const onClose = () => setProfileOpen(false);
  const handleRowPress = (row: ProfileRow) => {
    onClose();
    if (row.k) nav(row.k);
    else row.action?.();
  };

  const signOut = () => {
    onClose();
    void logout();
  };

  return (
    <BottomSheet open={profileOpen} onClose={onClose} title="Profile">
      <View style={styles.header}>
        <LinearGradient
          colors={[t.em, "#9d8bd6"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.avatar}
        >
          <Text style={styles.avatarLabel}>{initials}</Text>
        </LinearGradient>
        <View style={styles.headerText}>
          <Text
            style={[styles.name, { color: t.text1, fontFamily: weight(700) }]}
          >
            {displayName}
          </Text>
          <Text
            style={[styles.email, { color: t.text3, fontFamily: weight(500) }]}
          >
            {email}
          </Text>
        </View>
      </View>

      <ListCard>
        {ROWS.map((r, i) => (
          <ListRow
            key={r.l}
            onPress={() => handleRowPress(r)}
            last={i === ROWS.length - 1}
          >
            <AppIconBox value={r.i} color={r.c} size={36} iconSize={16} />
            <Text
              style={[
                styles.rowLabel,
                { color: t.text1, fontFamily: weight(600) },
              ]}
            >
              {r.l}
            </Text>
            <MI.arrow size={18} color={t.text3} />
          </ListRow>
        ))}
      </ListCard>

      <Btn variant="ghost" style={styles.signOutBtn} onPress={signOut}>
        <Text style={{ color: t.red, fontSize: 15, fontFamily: weight(600) }}>
          Sign out
        </Text>
      </Btn>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingTop: 4,
    paddingBottom: 20,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLabel: {
    fontFamily: weight(700),
    color: "#060810",
    fontSize: 22,
  },
  headerText: {
    flex: 1,
  },
  name: {
    fontSize: 17,
  },
  email: {
    fontSize: 12,
    marginTop: 3,
  },
  badge: {
    alignSelf: "flex-start",
    fontSize: 10.5,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 99,
    marginTop: 6,
  },
  badgeLabel: {
    fontSize: 10.5,
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
  },
  signOutBtn: {
    marginTop: 14,
  },
});
