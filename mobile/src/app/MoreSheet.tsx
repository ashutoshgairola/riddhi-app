/**
 * MoreSheet — "More" menu bottom sheet: first 4 destinations as a 2x2 grid
 * of cards, remaining 5 as a list-row card.
 *
 * Source of truth: project/riddhi/MobileApp.jsx:12–52 (`MoreSheet`).
 */
import { Pressable, StyleSheet, Text, View } from "react-native";

import { BottomSheet } from "../components/BottomSheet";
import { ListCard, ListRow } from "../components/ui";
import { MI } from "../components/icons";
import { useTheme } from "../theme/ThemeProvider";
import { radius, weight } from "../theme/tokens";
import { useNav, type ScreenKind } from "./navContext";

interface MoreItem {
  id: ScreenKind;
  l: string;
  i: string;
  c: string;
  d: string;
}

// items (MobileApp.jsx:13–23).
const ITEMS: MoreItem[] = [
  {
    id: "chat",
    l: "Ask Munshi ji",
    i: "💬",
    c: "#9d8bd6",
    d: "Chat to log & plan",
  },
  {
    id: "sync",
    l: "Auto-sync",
    i: "🔄",
    c: "#7faf93",
    d: "SMS transaction sync",
  },
  { id: "goals", l: "Goals", i: "⊙", c: "#9d8bd6", d: "Savings & milestones" },
  {
    id: "invest",
    l: "Investments",
    i: "▲",
    c: "#7faf93",
    d: "Portfolio & holdings",
  },
  { id: "reports", l: "Reports", i: "≋", c: "#6fb3ad", d: "Charts & insights" },
  {
    id: "accounts",
    l: "Accounts",
    i: "💳",
    c: "#8197c4",
    d: "Banks & wallets",
  },
  {
    id: "tx-cats",
    l: "Categories",
    i: "🏷",
    c: "#c9a86a",
    d: "Manage spending categories",
  },
  {
    id: "notifs",
    l: "Notifications",
    i: "🔔",
    c: "#c97d8c",
    d: "All alerts & updates",
  },
  {
    id: "settings",
    l: "Settings",
    i: "⚙",
    c: "#8a8299",
    d: "Preferences & account",
  },
];

export function MoreSheet() {
  const { t } = useTheme();
  const { moreOpen, setMoreOpen, nav } = useNav();

  const onClose = () => setMoreOpen(false);
  const handlePress = (id: ScreenKind) => {
    onClose();
    nav(id);
  };

  const cards = ITEMS.slice(0, 4);
  const rows = ITEMS.slice(4);

  return (
    <BottomSheet open={moreOpen} onClose={onClose} title="More">
      <View style={styles.grid}>
        {cards.map((it) => (
          <Pressable
            key={it.id}
            onPress={() => handlePress(it.id)}
            style={[
              styles.card,
              { backgroundColor: t.glassBg, borderColor: t.glassBrd },
            ]}
          >
            <View style={[styles.cardIcon, { backgroundColor: `${it.c}22` }]}>
              <Text style={[styles.cardIconGlyph, { color: it.c }]}>
                {it.i}
              </Text>
            </View>
            <View>
              <Text
                style={[
                  styles.cardLabel,
                  { color: t.text1, fontFamily: weight(700) },
                ]}
              >
                {it.l}
              </Text>
              <Text
                style={[
                  styles.cardDesc,
                  { color: t.text3, fontFamily: weight(500) },
                ]}
              >
                {it.d}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>

      <ListCard>
        {rows.map((it, i) => (
          <ListRow
            key={it.id}
            onPress={() => handlePress(it.id)}
            last={i === rows.length - 1}
          >
            <View style={[styles.rowIcon, { backgroundColor: `${it.c}22` }]}>
              <Text style={[styles.rowIconGlyph, { color: it.c }]}>{it.i}</Text>
            </View>
            <View style={styles.rowText}>
              <Text
                style={[
                  styles.rowLabel,
                  { color: t.text1, fontFamily: weight(600) },
                ]}
              >
                {it.l}
              </Text>
              <Text
                style={[
                  styles.rowDesc,
                  { color: t.text3, fontFamily: weight(500) },
                ]}
              >
                {it.d}
              </Text>
            </View>
            <MI.arrow size={18} color={t.text3} />
          </ListRow>
        ))}
      </ListCard>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  card: {
    width: "48%",
    padding: 16,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 10,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardIconGlyph: {
    fontSize: 18,
    fontWeight: "700",
  },
  cardLabel: {
    fontSize: 14,
  },
  cardDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconGlyph: {
    fontSize: 16,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 14,
  },
  rowDesc: {
    fontSize: 11.5,
    marginTop: 2,
  },
});
