import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PrimaryButton } from "@/components/PrimaryButton";
import { TestDatePicker } from "@/components/TestDatePicker";
import { getDb } from "@/db";
import { createProfile, getProfile } from "@/db/repo/profile";
import { addDaysLocal, todayLocal } from "@/lib/clock";
import { queryClient } from "@/lib/queryClient";
import { colors, font, radius, space } from "@/theme/tokens";

const MINUTE_OPTIONS = [5, 10, 15, 20];

export default function OnboardingScreen() {
  const tomorrow = addDaysLocal(todayLocal(), 1);
  const [testDate, setTestDate] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(10);

  const start = () => {
    if (!testDate) return;
    createProfile(getDb(), { testDate, dailyMinutesTarget: minutes });
    // seed the cache before navigating so the Gate doesn't bounce back here
    // while the invalidated profile query is still refetching
    queryClient.setQueryData(["profile"], getProfile(getDb()) ?? null);
    void queryClient.invalidateQueries();
    router.replace("/(tabs)");
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.headline}>When is your theory test?</Text>
      <Text style={styles.sub}>
        We&apos;ll pace your missions and reviews so you&apos;re ready on the day.
      </Text>

      <View style={styles.pickerWrap}>
        <TestDatePicker
          value={testDate ?? tomorrow}
          min={tomorrow}
          onChange={setTestDate}
        />
      </View>

      <Text style={styles.section}>Daily study target</Text>
      <View style={styles.chips}>
        {MINUTE_OPTIONS.map((option) => (
          <Pressable
            key={option}
            onPress={() => setMinutes(option)}
            style={[styles.chip, minutes === option && styles.chipActive]}
          >
            <Text style={[styles.chipText, minutes === option && styles.chipTextActive]}>
              {option} min
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.footer}>
        {!testDate ? <Text style={styles.hint}>Pick your test date to continue</Text> : null}
        <PrimaryButton title="Start" onPress={start} disabled={!testDate} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: space.xl, gap: space.md },
  headline: { fontSize: font.xl, fontWeight: "700", color: colors.text },
  sub: { fontSize: font.sm, color: colors.textMuted },
  pickerWrap: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.sm,
  },
  section: { fontSize: font.sm, fontWeight: "600", color: colors.text, marginTop: space.sm },
  chips: { flexDirection: "row", gap: space.sm },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: font.sm, color: colors.text },
  chipTextActive: { color: colors.surface, fontWeight: "600" },
  footer: { marginTop: "auto", gap: space.sm },
  hint: { fontSize: font.xs, color: colors.textMuted, textAlign: "center" },
});
