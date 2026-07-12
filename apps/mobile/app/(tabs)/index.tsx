import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { BandChip } from "@/components/BandChip";
import { DevPanel } from "@/components/DevPanel";
import { PrimaryButton } from "@/components/PrimaryButton";
import { getRouteMissions } from "@/content";
import { getDb } from "@/db";
import { getMissionState, type MissionState } from "@/db/repo/missions";
import { buildStats } from "@/lib/stats";
import { type Theme } from "@/theme/tokens";
import { useThemedStyles } from "@/theme/useTheme";

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
  const styles = useThemedStyles(makeStyles);
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
        <View style={styles.statRow}>
          {stats.streak > 0 ? (
            <Text style={styles.streak}>🔥 {stats.streak}-day streak</Text>
          ) : (
            <Text style={styles.streakMuted}>Start your streak today</Text>
          )}
          <Text style={styles.xp}>⚡ {stats.xpTotal} XP</Text>
        </View>
        {stats.daysToTest !== null ? (
          <Text style={styles.testLine}>
            Your test is in {stats.daysToTest} day{stats.daysToTest === 1 ? "" : "s"}
          </Text>
        ) : null}
        <View style={styles.readinessRow}>
          {stats.readiness.score !== null && stats.readiness.band !== null ? (
            <>
              <BandChip band={stats.readiness.band} />
              {stats.readiness.provisional ? (
                <Text style={styles.provisional}>Provisional</Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.lockedLine}>
              Complete your first missions to unlock your readiness estimate.
            </Text>
          )}
        </View>
      </View>

      {stats.dueCount > 0 ? (
        <PrimaryButton
          title={`Clear ${stats.dueCount} review${stats.dueCount === 1 ? "" : "s"}`}
          onPress={() => router.push("/review-queue")}
        />
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

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    content: { padding: t.space.lg, gap: t.space.lg },
    greeting: { ...t.text(t.font.xl), fontWeight: "700", color: t.colors.text },
    card: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.card,
      borderWidth: 1,
      borderColor: t.colors.border,
      padding: t.space.lg,
      gap: t.space.sm,
    },
    statRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: t.space.sm,
    },
    streak: { ...t.text(t.font.md), fontWeight: "600", color: t.colors.text },
    streakMuted: { ...t.text(t.font.md), color: t.colors.textMuted },
    xp: { ...t.text(t.font.sm), fontWeight: "600", color: t.colors.accent },
    testLine: { ...t.text(t.font.sm), color: t.colors.text },
    readinessRow: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
    provisional: { ...t.text(t.font.xs), color: t.colors.textMuted },
    lockedLine: { ...t.text(t.font.xs), color: t.colors.textMuted, flex: 1 },
  });
