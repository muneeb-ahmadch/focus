import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MasteryBar } from "@/components/MasteryBar";
import { PrimaryButton } from "@/components/PrimaryButton";
import { getDb } from "@/db";
import { getMeta } from "@/db/repo/meta";
import { requestPermissionOnce } from "@/notifications/scheduler";
import { usePlayerStore } from "@/stores/playerStore";
import { type Theme } from "@/theme/tokens";
import { useThemedStyles } from "@/theme/useTheme";

export default function MissionCompleteRoute() {
  const styles = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{
    missionId?: string;
    score?: string;
    streak?: string;
    milestone?: string;
    masteryBefore?: string;
    masteryAfter?: string;
    newReviews?: string;
    missed?: string;
    xp?: string;
    repaired?: string;
  }>();

  const score = Number(params.score ?? 0);
  const repaired = params.repaired === "1";
  const streak = Number(params.streak ?? 0);
  const milestone = params.milestone ? Number(params.milestone) : null;
  const masteryBefore = Number(params.masteryBefore ?? 0);
  const masteryAfter = Number(params.masteryAfter ?? 0);
  const newReviews = Number(params.newReviews ?? 0);
  const missed = (params.missed ?? "").split(",").filter(Boolean);
  const xp = Number(params.xp ?? 0);

  const navGuardRef = useRef(false);
  const guardedNav = (fn: () => void) => {
    if (navGuardRef.current) return;
    navGuardRef.current = true;
    fn();
  };
  const onFixThemNow = () =>
    guardedNav(() => {
      usePlayerStore.getState().startDrill(missed);
      router.replace("/player");
    });
  const onLater = () => guardedNav(() => router.replace("/(tabs)"));
  const onContinue = () => guardedNav(() => router.replace("/(tabs)"));

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
          <Text style={styles.ringLabel}>{repaired ? "→ Repaired ✓" : "checkpoint"}</Text>
        </View>

        {xp > 0 ? <Text style={styles.xpLine}>⚡ +{xp} XP</Text> : null}

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
            {repaired
              ? `${newReviews === 1 ? "This" : "These"} ${newReviews} concept${
                  newReviews === 1 ? " is" : "s are"
                } in tomorrow's review`
              : `${newReviews} item${newReviews === 1 ? "" : "s"} added to review`}
          </Text>
        ) : null}
      </View>

      {newReviews > 0 ? (
        <View style={styles.actions}>
          <PrimaryButton title="Fix them now" onPress={onFixThemNow} />
          <PrimaryButton title="Later" variant="secondary" onPress={onLater} />
        </View>
      ) : (
        <PrimaryButton title="Continue" onPress={onContinue} />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg, padding: t.space.xl },
    actions: { gap: t.space.sm },
    body: { flex: 1, alignItems: "center", justifyContent: "center", gap: t.space.lg },
    title: { ...t.text(t.font.xl), fontWeight: "700", color: t.colors.text },
    ring: {
      width: 140,
      height: 140,
      borderRadius: t.radius.pill,
      borderWidth: 10,
      borderColor: t.colors.success,
      backgroundColor: t.colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    ringScore: { ...t.text(t.font.xxl), fontWeight: "700", color: t.colors.text },
    ringLabel: { ...t.text(t.font.xs), color: t.colors.textMuted },
    milestone: {
      backgroundColor: t.colors.warning,
      borderRadius: t.radius.pill,
      paddingHorizontal: t.space.lg,
      paddingVertical: t.space.sm,
    },
    milestoneText: { color: t.colors.onAccent, ...t.text(t.font.md), fontWeight: "700" },
    streakLine: { ...t.text(t.font.md), color: t.colors.text },
    xpLine: { ...t.text(t.font.md), fontWeight: "700", color: t.colors.accent },
    masteryBlock: { alignSelf: "stretch", gap: t.space.sm },
    masteryLabel: { ...t.text(t.font.sm), fontWeight: "600", color: t.colors.text },
    reviewLine: { ...t.text(t.font.sm), color: t.colors.textMuted },
  });
