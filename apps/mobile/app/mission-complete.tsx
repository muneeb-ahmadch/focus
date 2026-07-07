import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MasteryBar } from "@/components/MasteryBar";
import { PrimaryButton } from "@/components/PrimaryButton";
import { getDb } from "@/db";
import { getMeta } from "@/db/repo/meta";
import { requestPermissionOnce } from "@/notifications/scheduler";
import { colors, font, radius, space } from "@/theme/tokens";

export default function MissionCompleteRoute() {
  const params = useLocalSearchParams<{
    missionId?: string;
    score?: string;
    streak?: string;
    milestone?: string;
    masteryBefore?: string;
    masteryAfter?: string;
    newReviews?: string;
  }>();

  const score = Number(params.score ?? 0);
  const streak = Number(params.streak ?? 0);
  const milestone = params.milestone ? Number(params.milestone) : null;
  const masteryBefore = Number(params.masteryBefore ?? 0);
  const masteryAfter = Number(params.masteryAfter ?? 0);
  const newReviews = Number(params.newReviews ?? 0);

  useEffect(() => {
    const db = getDb();
    if (getMeta(db, "notif_asked") !== "1") {
      const timer = setTimeout(() => {
        void requestPermissionOnce(db);
      }, 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, []);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>
        <Text style={styles.title}>Mission complete</Text>

        <View style={styles.ring}>
          <Text style={styles.ringScore}>{Math.round(score * 5)}/5</Text>
          <Text style={styles.ringLabel}>checkpoint</Text>
        </View>

        {milestone !== null ? (
          <View style={styles.milestone}>
            <Text style={styles.milestoneText}>🔥 {milestone}-day streak!</Text>
          </View>
        ) : (
          <Text style={styles.streakLine}>🔥 {streak}-day streak</Text>
        )}

        <View style={styles.masteryBlock}>
          <Text style={styles.masteryLabel}>Route mastery</Text>
          <MasteryBar value={masteryAfter} animateFrom={masteryBefore} />
        </View>

        {newReviews > 0 ? (
          <Text style={styles.reviewLine}>
            {newReviews} item{newReviews === 1 ? "" : "s"} added to review
          </Text>
        ) : null}
      </View>

      <PrimaryButton title="Continue" onPress={() => router.replace("/(tabs)")} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: space.xl },
  body: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.lg },
  title: { fontSize: font.xl, fontWeight: "700", color: colors.text },
  ring: {
    width: 140,
    height: 140,
    borderRadius: radius.pill,
    borderWidth: 10,
    borderColor: colors.success,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  ringScore: { fontSize: font.xxl, fontWeight: "700", color: colors.text },
  ringLabel: { fontSize: font.xs, color: colors.textMuted },
  milestone: {
    backgroundColor: colors.warning,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  milestoneText: { color: colors.surface, fontSize: font.md, fontWeight: "700" },
  streakLine: { fontSize: font.md, color: colors.text },
  masteryBlock: { alignSelf: "stretch", gap: space.sm },
  masteryLabel: { fontSize: font.sm, fontWeight: "600", color: colors.text },
  reviewLine: { fontSize: font.sm, color: colors.textMuted },
});
