import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { BandChip } from "@/components/BandChip";
import { DevPanel } from "@/components/DevPanel";
import { PrimaryButton } from "@/components/PrimaryButton";
import { getRouteMissions } from "@/content";
import { getDb } from "@/db";
import { getMissionState } from "@/db/repo/missions";
import { buildStats, testDateLine } from "@/lib/stats";
import { type Theme } from "@/theme/tokens";
import { useThemedStyles } from "@/theme/useTheme";
import type { PlanItem } from "@focus/engine";

function resolveResumeLabel(db: ReturnType<typeof getDb>, resumeMissionId: string | null): string {
  if (!resumeMissionId) return "Continue your mission";
  const mission = getMissionState(db, resumeMissionId);
  if (!mission) return "Continue your mission";
  const idx = getRouteMissions(mission.route_id).findIndex((m) => m.missionId === resumeMissionId);
  return idx >= 0 ? `Continue Mission ${idx + 1}` : "Continue your mission";
}

interface ResolvedMission {
  missionId: string;
  title: string;
}

function resolveMissionByRoute(
  db: ReturnType<typeof getDb>,
  plan: PlanItem[],
): Record<string, ResolvedMission | null> {
  const byRoute: Record<string, ResolvedMission | null> = {};
  for (const item of plan) {
    if (item.kind !== "mission" || !item.routeId) continue;
    const missions = getRouteMissions(item.routeId);
    const nextIdx = missions.findIndex(
      (m) => getMissionState(db, m.missionId)?.status !== "completed",
    );
    if (nextIdx < 0) {
      byRoute[item.routeId] = null;
      continue;
    }
    const next = missions[nextIdx]!;
    const state = getMissionState(db, next.missionId);
    // a mission with saved progress is never offered as "Start" (QA V9-Q3)
    const inProgress = state?.status === "in_progress" && state.resume_payload_json;
    byRoute[item.routeId] = {
      missionId: next.missionId,
      title: inProgress ? `Continue Mission ${nextIdx + 1}` : "Start today's mission",
    };
  }
  return byRoute;
}

export default function HomeScreen() {
  const styles = useThemedStyles(makeStyles);
  const { data } = useQuery({
    queryKey: ["home"],
    queryFn: () => {
      const db = getDb();
      const stats = buildStats(db);
      const resumeLabel = resolveResumeLabel(db, stats.resumeMissionId);
      const missionByRoute = resolveMissionByRoute(db, stats.plan);
      return { stats, resumeLabel, missionByRoute };
    },
  });
  if (!data) return <View style={styles.screen} />;
  const { stats, resumeLabel, missionByRoute } = data;

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
          <Text style={styles.testLine}>{testDateLine(stats.daysToTest)}</Text>
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

      <View style={styles.card}>
        <Text style={styles.planHeading}>Today&apos;s plan</Text>
        {stats.plan.length === 0 ? (
          <Text style={styles.lockedLine}>All caught up — nothing due today.</Text>
        ) : (
          stats.plan.map((item, i) => {
            if (item.kind === "resume") {
              return (
                <PrimaryButton
                  key={i}
                  title={resumeLabel}
                  onPress={() => {
                    if (stats.resumeMissionId) {
                      router.push({
                        pathname: "/player",
                        params: { mode: "mission", missionId: stats.resumeMissionId },
                      });
                    }
                  }}
                />
              );
            }
            if (item.kind === "reviews") {
              return (
                <PrimaryButton
                  key={i}
                  title={`Clear ${stats.dueCount} review${stats.dueCount === 1 ? "" : "s"}`}
                  onPress={() => router.push("/review-queue")}
                />
              );
            }
            if (item.kind === "mission") {
              const resolved = item.routeId ? missionByRoute[item.routeId] : null;
              // the resume CTA already owns this mission — never offer it twice
              if (!resolved || resolved.missionId === stats.resumeMissionId) return null;
              return (
                <View key={i} style={styles.missionItem}>
                  <Text style={styles.subLabel}>~6 minutes</Text>
                  <PrimaryButton
                    title={resolved.title}
                    onPress={() =>
                      router.push({
                        pathname: "/player",
                        params: { mode: "mission", missionId: resolved.missionId },
                      })
                    }
                  />
                </View>
              );
            }
            if (item.kind === "mock") {
              return <PrimaryButton key={i} title="Sit a mock" onPress={() => router.push("/mock")} />;
            }
            return null;
          })
        )}
      </View>

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
    planHeading: { ...t.text(t.font.md), fontWeight: "700", color: t.colors.text },
    missionItem: { gap: t.space.sm },
    subLabel: { ...t.text(t.font.xs), color: t.colors.textMuted },
  });
