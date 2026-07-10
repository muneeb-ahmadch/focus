import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MasteryBar } from "@/components/MasteryBar";
import { getRouteMissions, ROUTES } from "@/content";
import { getDb } from "@/db";
import { getMissionState, type MissionState } from "@/db/repo/missions";
import { getRouteState } from "@/db/repo/routes";
import { type Theme } from "@/theme/tokens";
import { useThemedStyles } from "@/theme/useTheme";

export default function LearnScreen() {
  const styles = useThemedStyles(makeStyles);
  const { data } = useQuery({
    queryKey: ["learn"],
    queryFn: () => {
      const db = getDb();
      const missions = getRouteMissions("route-1");
      return {
        mastery: getRouteState(db, "route-1")?.mastery ?? 0,
        states: missions.map((m) => getMissionState(db, m.missionId)),
        missions,
      };
    },
  });
  if (!data) return <View style={styles.screen} />;

  const firstIncomplete = data.missions.findIndex(
    (_, i) => data.states[i]?.status !== "completed",
  );

  const nodeFor = (state: MissionState | undefined, i: number) => {
    const status = state?.status ?? "not_started";
    if (status === "completed") return { icon: "✓", locked: false };
    if (status === "failed_checkpoint") return { icon: "↻", locked: false };
    if (i === firstIncomplete) return { icon: "▶", locked: false };
    return { icon: "🔒", locked: true };
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.routeCard}>
        <Text style={styles.routeTitle}>Route 1 · Road Basics</Text>
        <MasteryBar value={data.mastery} />
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
      </View>

      {ROUTES.filter((r) => r.missions.length === 0).map((route) => (
        <View key={route.routeId} style={styles.comingSoon}>
          <Text style={styles.comingSoonTitle}>{route.title}</Text>
          <Text style={styles.comingSoonTag}>Coming soon</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    content: { padding: t.space.lg, gap: t.space.md },
    routeCard: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.card,
      borderWidth: 1,
      borderColor: t.colors.border,
      padding: t.space.lg,
      gap: t.space.md,
    },
    routeTitle: { ...t.text(t.font.lg), fontWeight: "700", color: t.colors.text },
    missionList: { gap: t.space.sm },
    missionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.space.md,
      backgroundColor: t.colors.bg,
      borderRadius: t.radius.control,
      padding: t.space.md,
    },
    missionLocked: { backgroundColor: t.colors.lockedBg },
    missionIcon: { ...t.text(t.font.md), width: 28, textAlign: "center", color: t.colors.text },
    missionInfo: { flex: 1 },
    missionTitle: { ...t.text(t.font.sm), fontWeight: "600", color: t.colors.text },
    mutedText: { color: t.colors.textMuted },
    missionMeta: { ...t.text(t.font.xs), color: t.colors.textMuted },
    comingSoon: {
      backgroundColor: t.colors.lockedBg,
      borderRadius: t.radius.card,
      padding: t.space.lg,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    comingSoonTitle: { ...t.text(t.font.sm), fontWeight: "600", color: t.colors.textMuted },
    comingSoonTag: { ...t.text(t.font.xs), color: t.colors.textMuted },
  });
