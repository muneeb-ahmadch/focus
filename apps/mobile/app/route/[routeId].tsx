import { useQuery } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MasteryBar } from "@/components/MasteryBar";
import { getRouteMissions, ROUTES } from "@/content";
import { getDb } from "@/db";
import { getMissionState, type MissionState } from "@/db/repo/missions";
import { getRouteState } from "@/db/repo/routes";
import { type Theme } from "@/theme/tokens";
import { useThemedStyles } from "@/theme/useTheme";

export default function RouteOverviewScreen() {
  const styles = useThemedStyles(makeStyles);
  const { routeId } = useLocalSearchParams<{ routeId: string }>();
  const route = ROUTES.find((r) => r.routeId === routeId);
  const { data } = useQuery({
    queryKey: ["route", routeId],
    queryFn: () => {
      const db = getDb();
      const missions = getRouteMissions(routeId!);
      return {
        state: getRouteState(db, routeId!),
        states: missions.map((m) => getMissionState(db, m.missionId)),
        missions,
      };
    },
    enabled: !!route,
  });

  if (!route) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: "Route" }} />
        <Text style={styles.notFound}>This route isn&apos;t available.</Text>
      </View>
    );
  }
  if (!data) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: route.title }} />
      </View>
    );
  }

  const firstIncomplete = data.missions.findIndex(
    (_, i) => data.states[i]?.status !== "completed",
  );
  const weak = data.state?.weak_concept_count ?? 0;
  const due = data.state?.due_review_count ?? 0;

  const nodeFor = (state: MissionState | undefined, i: number) => {
    const status = state?.status ?? "not_started";
    if (status === "completed") return { icon: "✓", locked: false };
    if (status === "failed_checkpoint") return { icon: "↻", locked: false };
    if (i === firstIncomplete) return { icon: "▶", locked: false };
    return { icon: "🔒", locked: true };
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: route.title }} />
      <View style={styles.header}>
        <MasteryBar value={data.state?.mastery ?? 0} />
        <View style={styles.statsRow}>
          <Text style={styles.stat}>
            {data.state?.completed_missions ?? 0}/{data.missions.length} missions
          </Text>
          {weak > 0 ? (
            <Text style={styles.statWarn}>
              {weak} weak concept{weak === 1 ? "" : "s"}
            </Text>
          ) : null}
          {due > 0 ? (
            <Text style={styles.statWarn}>
              {due} review{due === 1 ? "" : "s"} due
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.missionList}>
        {data.missions.map((mission, i) => {
          const node = nodeFor(data.states[i], i);
          return (
            <Pressable
              key={mission.missionId}
              onPress={() => {
                if (node.locked) {
                  Alert.alert("Locked", `Finish Mission ${firstIncomplete + 1} first`);
                  return;
                }
                router.push({
                  pathname: "/player",
                  params: { mode: "mission", missionId: mission.missionId },
                });
              }}
              accessibilityRole="button"
              accessibilityLabel={`Mission ${i + 1}, ${mission.title}`}
              style={[styles.missionRow, node.locked && styles.missionLocked]}
            >
              <Text style={styles.missionIcon}>{node.icon}</Text>
              <View style={styles.missionInfo}>
                <Text style={[styles.missionTitle, node.locked && styles.mutedText]}>
                  Mission {i + 1} · {mission.title}
                </Text>
                <Text style={styles.missionMeta}>~{mission.estimatedMinutes} min</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    content: { padding: t.space.lg, gap: t.space.md },
    notFound: { ...t.text(t.font.md), color: t.colors.textMuted, padding: t.space.xl },
    header: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.card,
      borderWidth: 1,
      borderColor: t.colors.border,
      padding: t.space.lg,
      gap: t.space.md,
    },
    statsRow: { flexDirection: "row", gap: t.space.md },
    stat: { ...t.text(t.font.xs), color: t.colors.textMuted },
    statWarn: { ...t.text(t.font.xs), fontWeight: "600", color: t.colors.warning },
    missionList: { gap: t.space.sm },
    missionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.space.md,
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.control,
      borderWidth: 1,
      borderColor: t.colors.border,
      padding: t.space.md,
    },
    missionLocked: { backgroundColor: t.colors.lockedBg },
    missionIcon: { ...t.text(t.font.md), width: 28, textAlign: "center", color: t.colors.text },
    missionInfo: { flex: 1 },
    missionTitle: { ...t.text(t.font.sm), fontWeight: "600", color: t.colors.text },
    mutedText: { color: t.colors.textMuted },
    missionMeta: { ...t.text(t.font.xs), color: t.colors.textMuted },
  });
