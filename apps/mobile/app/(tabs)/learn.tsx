import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MasteryBar } from "@/components/MasteryBar";
import { getRouteMissions, ROUTES } from "@/content";
import { getDb } from "@/db";
import { getMissionState, type MissionState } from "@/db/repo/missions";
import { getRouteState } from "@/db/repo/routes";
import { colors, font, radius, space } from "@/theme/tokens";

export default function LearnScreen() {
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.md },
  routeCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.md,
  },
  routeTitle: { fontSize: font.lg, fontWeight: "700", color: colors.text },
  missionList: { gap: space.sm },
  missionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.bg,
    borderRadius: radius.control,
    padding: space.md,
  },
  missionLocked: { backgroundColor: colors.lockedBg },
  missionIcon: { fontSize: font.md, width: 28, textAlign: "center" },
  missionInfo: { flex: 1 },
  missionTitle: { fontSize: font.sm, fontWeight: "600", color: colors.text },
  mutedText: { color: colors.textMuted },
  missionMeta: { fontSize: font.xs, color: colors.textMuted },
  comingSoon: {
    backgroundColor: colors.lockedBg,
    borderRadius: radius.card,
    padding: space.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  comingSoonTitle: { fontSize: font.sm, fontWeight: "600", color: colors.textMuted },
  comingSoonTag: { fontSize: font.xs, color: colors.textMuted },
});
