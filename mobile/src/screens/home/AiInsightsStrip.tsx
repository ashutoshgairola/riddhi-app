/**
 * AiInsightsStrip — horizontal strip of AI-insight cards on Home
 * (GET /insights: rule-based, computed server-side). Tapping a card
 * deep-links into chat with the insight's follow-up prompt autosent.
 *
 * Hides itself entirely when the request fails or returns nothing.
 */
import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { HScroll } from "../../components/ui";
import { LiquidGlass } from "../../components/LiquidGlass";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space, weight } from "../../theme/tokens";
import { useNav } from "../../app/navContext";
import { apiClient } from "../../api/client";
import { usePrefs } from "../../prefs/PrefsProvider";
import { maskAmounts } from "../../lib/maskAmounts";

interface Insight {
  id: string;
  icon: string;
  title: string;
  body: string;
  severity: "info" | "warn" | "good";
  chatPrompt: string;
}

export function AiInsightsStrip() {
  const { t } = useTheme();
  const { nav } = useNav();
  const { prefs } = usePrefs();
  const [insights, setInsights] = useState<Insight[]>([]);

  useEffect(() => {
    apiClient
      .get<{ insights: Insight[] }>("/insights")
      .then((res) => setInsights(res.insights))
      .catch(() => setInsights([]));
  }, []);

  if (insights.length === 0) return null;

  const tint = (severity: Insight["severity"]): string =>
    severity === "warn" ? t.amber : severity === "good" ? t.em : t.text2;

  return (
    <HScroll>
      {insights.map((insight) => (
        <Pressable
          key={insight.id}
          onPress={() =>
            nav("chat", { prefill: insight.chatPrompt, autoSend: true })
          }
        >
          <LiquidGlass style={styles.card} padding={14} radius={radius.lg}>
            <View style={styles.headRow}>
              <Text style={styles.icon}>{insight.icon}</Text>
              <Text
                style={[
                  styles.title,
                  { color: tint(insight.severity), fontFamily: weight(700) },
                ]}
                numberOfLines={1}
              >
                {prefs.hideBalances
                  ? maskAmounts(insight.title)
                  : insight.title}
              </Text>
            </View>
            <Text
              style={[styles.body, { color: t.text2, fontFamily: weight(400) }]}
              numberOfLines={2}
            >
              {prefs.hideBalances ? maskAmounts(insight.body) : insight.body}
            </Text>
            <View style={styles.ctaRow}>
              <Image
                source={require("../../../assets/munshi.png")}
                style={styles.ctaLogo}
              />
              <Text
                style={[
                  styles.cta,
                  { color: t.text3, fontFamily: weight(600) },
                ]}
              >
                Ask Munshi ji →
              </Text>
            </View>
          </LiquidGlass>
        </Pressable>
      ))}
    </HScroll>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 230,
  },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[8],
  },
  icon: {
    fontSize: 15,
  },
  title: {
    fontSize: 12.5,
    flex: 1,
  },
  body: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: space[6],
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[6],
    marginTop: space[10],
  },
  ctaLogo: {
    width: 14,
    height: 14,
    borderRadius: 5,
    resizeMode: "cover",
  },
  cta: {
    fontSize: 11,
  },
});
