import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BandChip } from "@/components/BandChip";
import { DevPanel } from "@/components/DevPanel";
import { PrimaryButton } from "@/components/PrimaryButton";
import { getRouteMissions } from "@/content";
import { getDb } from "@/db";
import { getMissionState, type MissionState } from "@/db/repo/missions";
import { buildStats } from "@/lib/stats";
import { colors, font, radius, space } from "@/theme/tokens";

interface NextMission {
  label: string;
  missionId: string | null;
}

function nextMission(states: (MissionState | undefined)[]): NextMission {
  const missions = getRouteMissions("route-1");
  const inProgress = missions.findIndex(
    (m, i) => states[i]?.status === "in_progress" && states[i]?.resume_payload_json,
  );
  if (inProgress >= 0) {
    const mission = missions[inProgress];
    return {
      label: `Continue Mission ${inProgress + 1}`,
      missionId: mission ? mission.missionId : null,
    };
  }
  const next = missions.findIndex((m, i) => states[i]?.status !== "completed");
  if (next < 0) return { label: "Route 1 complete!", missionId: null };
  const mission = missions[next];
  return { label: "Start today's mission", missionId: mission ? mission.missionId : null };
}

export default function HomeScreen() {
  const { data } = useQuery({
    queryKey: ["home"],
    queryFn: () => {
      const db = getDb();
      const stats = buildStats(db);
      const states = getRouteMissions("route-1").map((m) => getMissionState(db, m.missionId));
      return { stats, next: nextMission(states) };
    },
  });
  if (!data) return <View style={styles.screen} />;
  const { stats, next } = data;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.greeting}>Hi there 👋</Text>

      <View style={styles.card}>
        {stats.streak > 0 ? (
          <Text style={styles.streak}>🔥 {stats.streak}-day streak</Text>
        ) : (
          <Text style={styles.streakMuted}>Start your streak today</Text>
        )}
        {stats.daysToTest !== null ? (
          <Text style={styles.testLine}>
            Your test is in {stats.daysToTest} day{stats.daysToTest === 1 ? "" : "s"}
          </Text>
        ) : null}
        <View style={styles.readinessRow}>
          {stats.readiness.score !== null && stats.readiness.band !== null ? (
            <>
              <BandChip band={stats.readiness.band} />
              <Text style={styles.provisional}>Provisional</Text>
            </>
          ) : (
            <Text style={styles.lockedLine}>
              Answer 20 questions to unlock your readiness estimate ({stats.scoredAnswers}/20)
            </Text>
          )}
        </View>
      </View>

      {stats.dueCount > 0 ? (
        <Pressable
          style={styles.reviewPill}
          onPress={() => router.push({ pathname: "/player", params: { mode: "drill" } })}
        >
          <Text style={styles.reviewPillText}>
            Clear {stats.dueCount} review{stats.dueCount === 1 ? "" : "s"}
          </Text>
        </Pressable>
      ) : null}

      <PrimaryButton
        title={next.label}
        disabled={next.missionId === null}
        onPress={() => {
          if (next.missionId) {
            router.push({
              pathname: "/player",
              params: { mode: "mission", missionId: next.missionId },
            });
          }
        }}
      />

      <DevPanel />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.lg },
  greeting: { fontSize: font.xl, fontWeight: "700", color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.sm,
  },
  streak: { fontSize: font.md, fontWeight: "600", color: colors.text },
  streakMuted: { fontSize: font.md, color: colors.textMuted },
  testLine: { fontSize: font.sm, color: colors.text },
  readinessRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  provisional: { fontSize: font.xs, color: colors.textMuted },
  lockedLine: { fontSize: font.xs, color: colors.textMuted, flex: 1 },
  reviewPill: {
    backgroundColor: colors.warning,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: "center",
  },
  reviewPillText: { color: colors.surface, fontSize: font.sm, fontWeight: "700" },
});
