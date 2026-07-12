import { useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ReadinessComponentKey } from "@focus/engine";
import { BandChip } from "@/components/BandChip";
import { getDb } from "@/db";
import { buildStats } from "@/lib/stats";
import { type Theme } from "@/theme/tokens";
import { useThemedStyles } from "@/theme/useTheme";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

const COMPONENT_LABEL: Record<ReadinessComponentKey, string> = {
  mock_trend: "Mock trend",
  coverage: "Coverage",
  review_debt: "Review debt",
  accuracy: "Accuracy",
  consistency: "Consistency",
};

export default function ReadinessBreakdownScreen() {
  const styles = useThemedStyles(makeStyles);
  const { data: stats } = useQuery({
    queryKey: ["readiness-breakdown"],
    queryFn: () => buildStats(getDb()),
  });

  if (!stats) return <View style={styles.screen} />;

  if (stats.readiness.score === null) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <View style={styles.lockedBody}>
          <Text style={styles.lockedLine}>
            Complete your first missions to unlock your readiness estimate.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.score}>{stats.readiness.score}</Text>
          <View style={styles.bandRow}>
            {stats.readiness.band ? <BandChip band={stats.readiness.band} /> : null}
            {stats.readiness.provisional ? (
              <Text style={styles.provisional}>Provisional</Text>
            ) : null}
          </View>
          {stats.readiness.provisional ? (
            <Text style={styles.explainer}>
              Based on limited data. Sit two mock tests for your full score.
            </Text>
          ) : null}
        </View>

        <View style={styles.card}>
          {stats.readiness.components.map((c) => (
            <View key={c.key} style={styles.row}>
              <Text style={styles.rowLabel}>
                {COMPONENT_LABEL[c.key]}{" "}
                <Text style={styles.rowWeight}>{Math.round(c.weight * 100)}%</Text>
              </Text>
              <View style={styles.miniTrack}>
                <View style={[styles.miniFill, { width: `${clamp01(c.value) * 100}%` }]} />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    content: { padding: t.space.lg, gap: t.space.md },
    lockedBody: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: t.space.xl,
    },
    lockedLine: { ...t.text(t.font.md), color: t.colors.textMuted, textAlign: "center" },
    card: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.card,
      borderWidth: 1,
      borderColor: t.colors.border,
      padding: t.space.lg,
      gap: t.space.md,
    },
    score: { ...t.text(t.font.xxl), fontWeight: "700", color: t.colors.text },
    bandRow: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
    provisional: { ...t.text(t.font.xs), color: t.colors.textMuted },
    explainer: { ...t.text(t.font.sm), color: t.colors.textMuted },
    row: { gap: t.space.xs },
    rowLabel: { ...t.text(t.font.xs), color: t.colors.text, fontWeight: "600" },
    rowWeight: { color: t.colors.textMuted, fontWeight: "400" },
    miniTrack: {
      height: 6,
      backgroundColor: t.colors.lockedBg,
      borderRadius: t.radius.pill,
      overflow: "hidden",
    },
    miniFill: { height: "100%", backgroundColor: t.colors.accent, borderRadius: t.radius.pill },
  });
