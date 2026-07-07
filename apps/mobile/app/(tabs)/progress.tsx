import { useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { BandChip } from "@/components/BandChip";
import { getDb } from "@/db";
import { getActivity } from "@/db/repo/activity";
import { buildStats } from "@/lib/stats";
import { colors, font, radius, space } from "@/theme/tokens";

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export default function ProgressScreen() {
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

  const breakdown = [
    { label: "Coverage", weight: "38%", value: clamp01(stats.inputs.routeCoverage) },
    { label: "Review debt", weight: "23%", value: clamp01(1 - stats.inputs.dueReviews / 20) },
    { label: "Accuracy", weight: "23%", value: clamp01(stats.inputs.recentAccuracy) },
    { label: "Consistency", weight: "15%", value: clamp01(stats.inputs.consistency) },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        {stats.readiness.score !== null && stats.readiness.band !== null ? (
          <>
            <Text style={styles.score}>{stats.readiness.score}</Text>
            <View style={styles.bandRow}>
              <BandChip band={stats.readiness.band} />
              <Text style={styles.provisional}>Provisional</Text>
            </View>
          </>
        ) : (
          <Text style={styles.lockedLine}>
            Answer 20 questions to unlock your readiness estimate ({stats.scoredAnswers}/20)
          </Text>
        )}
        <View style={styles.breakdown}>
          {breakdown.map((row) => (
            <View key={row.label} style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>
                {row.label} <Text style={styles.breakdownWeight}>({row.weight})</Text>
              </Text>
              <View style={styles.miniTrack}>
                <View style={[styles.miniFill, { width: `${row.value * 100}%` }]} />
              </View>
            </View>
          ))}
        </View>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.md,
  },
  score: { fontSize: font.xxl, fontWeight: "700", color: colors.text },
  bandRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  provisional: { fontSize: font.xs, color: colors.textMuted },
  lockedLine: { fontSize: font.sm, color: colors.textMuted },
  breakdown: { gap: space.sm },
  breakdownRow: { gap: space.xs },
  breakdownLabel: { fontSize: font.xs, color: colors.text, fontWeight: "600" },
  breakdownWeight: { color: colors.textMuted, fontWeight: "400" },
  miniTrack: {
    height: 6,
    backgroundColor: colors.lockedBg,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  miniFill: { height: "100%", backgroundColor: colors.accent, borderRadius: radius.pill },
  testLine: { fontSize: font.sm, color: colors.text, paddingHorizontal: space.xs },
  sectionTitle: { fontSize: font.sm, fontWeight: "700", color: colors.text },
  dots: { flexDirection: "row", gap: space.xs, flexWrap: "wrap" },
  dot: {
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.lockedBg,
  },
  dotActive: { backgroundColor: colors.success },
  totalLine: { fontSize: font.sm, color: colors.text },
});
