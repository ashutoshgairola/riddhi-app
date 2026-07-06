/**
 * AiInsightsStrip — horizontal strip of AI-insight cards on Home
 * (GET /insights: rule-based, computed server-side). Tapping a card
 * deep-links into chat with the insight's follow-up prompt autosent.
 *
 * Hides itself entirely when the request fails or returns nothing.
 */
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { HScroll } from "../../components/ui";
import { GlassView } from "../../components/Glass";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, weight } from "../../theme/tokens";
import { useNav } from "../../app/navContext";
import { apiClient } from "../../api/client";

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
          <GlassView style={styles.card} padding={14} radius={radius.lg}>
            <View style={styles.headRow}>
              <Text style={styles.icon}>{insight.icon}</Text>
              <Text
                style={[
                  styles.title,
                  { color: tint(insight.severity), fontFamily: weight(700) },
                ]}
                numberOfLines={1}
              >
                {insight.title}
              </Text>
            </View>
            <Text
              style={[styles.body, { color: t.text2, fontFamily: weight(400) }]}
              numberOfLines={2}
            >
              {insight.body}
            </Text>
            <Text
              style={[styles.cta, { color: t.text3, fontFamily: weight(600) }]}
            >
              Ask Munshi ji →
            </Text>
          </GlassView>
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
    gap: 7,
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
    marginTop: 6,
  },
  cta: {
    fontSize: 11,
    marginTop: 9,
  },
});
