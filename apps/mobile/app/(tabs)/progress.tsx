import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BandChip } from "@/components/BandChip";
import { getDb } from "@/db";
import { getActivity } from "@/db/repo/activity";
import { buildStats } from "@/lib/stats";
import { type Theme } from "@/theme/tokens";
import { useThemedStyles } from "@/theme/useTheme";

export default function ProgressScreen() {
  const styles = useThemedStyles(makeStyles);
  const { data } = useQuery({
    queryKey: ["progress"],
    queryFn: () => {
      const db = getDb();
      const stats = buildStats(db);
      const activity = getActivity(db);
      return {
        stats,
        totals: {
          missions: activity.reduce((a, r) => a + r.missions_completed, 0),
          reviews: activity.reduce((a, r) => a + r.reviews_cleared, 0),
          answers: stats.scoredAnswers,
        },
      };
    },
  });
  if (!data) return <View style={styles.screen} />;
  const { stats, totals } = data;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        {stats.readiness.score !== null && stats.readiness.band !== null ? (
          <>
            <Text style={styles.score}>{stats.readiness.score}</Text>
            <View style={styles.bandRow}>
              <BandChip band={stats.readiness.band} />
              {stats.readiness.provisional ? (
                <Text style={styles.provisional}>Provisional</Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => router.push("/readiness")}
              accessibilityRole="button"
              accessibilityLabel="See breakdown"
              style={styles.breakdownLink}
            >
              <Text style={styles.breakdownLinkText}>See breakdown</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.lockedLine}>
              Complete your first missions to unlock your readiness estimate.
            </Text>
            <Text style={styles.lockedHint}>{stats.scoredAnswers}/20 answers</Text>
          </>
        )}
      </View>

      {stats.daysToTest !== null ? (
        <Text style={styles.testLine}>
          Your test is in {stats.daysToTest} day{stats.daysToTest === 1 ? "" : "s"}
        </Text>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Last 14 days</Text>
        <View style={styles.dots}>
          {stats.activeDotsLast14.map((active, i) => (
            <View key={i} style={[styles.dot, active && styles.dotActive]} />
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Totals</Text>
        <Text style={styles.totalLine}>Missions completed: {totals.missions}</Text>
        <Text style={styles.totalLine}>Reviews cleared: {totals.reviews}</Text>
        <Text style={styles.totalLine}>Answers: {totals.answers}</Text>
      </View>
    </ScrollView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    content: { padding: t.space.lg, gap: t.space.md },
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
    lockedLine: { ...t.text(t.font.sm), color: t.colors.textMuted },
    lockedHint: { ...t.text(t.font.xs), color: t.colors.textMuted },
    breakdownLink: { alignSelf: "flex-start" },
    breakdownLinkText: { ...t.text(t.font.sm), color: t.colors.accent, fontWeight: "600" },
    testLine: { ...t.text(t.font.sm), color: t.colors.text, paddingHorizontal: t.space.xs },
    sectionTitle: { ...t.text(t.font.sm), fontWeight: "700", color: t.colors.text },
    dots: { flexDirection: "row", gap: t.space.xs, flexWrap: "wrap" },
    dot: {
      width: 16,
      height: 16,
      borderRadius: t.radius.pill,
      backgroundColor: t.colors.lockedBg,
    },
    dotActive: { backgroundColor: t.colors.success },
    totalLine: { ...t.text(t.font.sm), color: t.colors.text },
  });
