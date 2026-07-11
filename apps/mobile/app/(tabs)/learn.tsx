import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MasteryBar } from "@/components/MasteryBar";
import { ROUTES } from "@/content";
import { getDb } from "@/db";
import { getAllRouteStates, type RouteState } from "@/db/repo/routes";
import { type Theme } from "@/theme/tokens";
import { useThemedStyles } from "@/theme/useTheme";

export default function LearnScreen() {
  const styles = useThemedStyles(makeStyles);
  const { data } = useQuery({
    queryKey: ["learn"],
    queryFn: () => {
      const states = new Map<string, RouteState>();
      for (const state of getAllRouteStates(getDb())) states.set(state.route_id, state);
      return states;
    },
  });
  if (!data) return <View style={styles.screen} />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {ROUTES.map((route, i) => {
        const state = data.get(route.routeId);
        const hasContent = route.missions.length > 0;
        if (!hasContent) {
          return (
            <View key={route.routeId} style={styles.comingSoon}>
              <Text style={styles.comingSoonTitle}>
                Route {i + 1} · {route.title}
              </Text>
              <Text style={styles.comingSoonTag}>Coming soon</Text>
            </View>
          );
        }
        const completed = state?.completed_missions ?? 0;
        const due = state?.due_review_count ?? 0;
        return (
          <Pressable
            key={route.routeId}
            onPress={() => router.push(`/route/${route.routeId}`)}
            accessibilityRole="button"
            accessibilityLabel={`Route ${i + 1}, ${route.title}`}
            style={styles.routeCard}
          >
            <View style={styles.routeHeader}>
              <Text style={styles.routeTitle}>
                Route {i + 1} · {route.title}
              </Text>
              <Text style={styles.chevron}>›</Text>
            </View>
            <MasteryBar value={state?.mastery ?? 0} />
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>
                {completed}/{route.missions.length} missions
              </Text>
              {due > 0 ? (
                <Text style={styles.dueBadge}>
                  {due} review{due === 1 ? "" : "s"} due
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
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
    routeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    routeTitle: { ...t.text(t.font.lg), fontWeight: "700", color: t.colors.text },
    chevron: { ...t.text(t.font.lg), color: t.colors.textMuted },
    metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    metaText: { ...t.text(t.font.xs), color: t.colors.textMuted },
    dueBadge: { ...t.text(t.font.xs), fontWeight: "600", color: t.colors.warning },
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
