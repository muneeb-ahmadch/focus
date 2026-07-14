import { router } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SettingRow } from "@/components/SettingRow";
import { TestDatePicker } from "@/components/TestDatePicker";
import { getDb } from "@/db";
import { createProfile, getProfile } from "@/db/repo/profile";
import { flush, track } from "@/lib/analytics";
import { addDaysLocal, todayLocal } from "@/lib/clock";
import { queryClient } from "@/lib/queryClient";
import { useSettingsStore } from "@/stores/settingsStore";
import { type Theme } from "@/theme/tokens";
import { useThemedStyles } from "@/theme/useTheme";

const MINUTE_OPTIONS = [5, 10, 15, 20];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type OnboardingStep = "welcome" | "date" | "schedule" | "accessibility";

export default function OnboardingScreen() {
  const styles = useThemedStyles(makeStyles);
  const tomorrow = addDaysLocal(todayLocal(), 1);
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [testDate, setTestDate] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(10);
  const [studyDays, setStudyDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [autoPlayAudio, setAutoPlayAudio] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [dyslexiaFont, setDyslexiaFont] = useState(false);

  const started = useRef(false);

  const toggleDay = (day: number) => {
    setStudyDays((days) =>
      days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b),
    );
  };

  const start = () => {
    if (!testDate || started.current) return;
    started.current = true;
    createProfile(getDb(), {
      testDate,
      dailyMinutesTarget: minutes,
      studyDays,
      accessibility: { autoPlayAudio, reduceMotion, highContrast, dyslexiaFont },
    });
    track('onboarding_completed');
    void flush();
    useSettingsStore.getState().hydrate();
    // seed the cache before navigating so the Gate doesn't bounce back here
    // while the invalidated profile query is still refetching
    queryClient.setQueryData(["profile"], getProfile(getDb()) ?? null);
    void queryClient.invalidateQueries();
    router.replace("/(tabs)");
  };

  const back = (to: OnboardingStep) => (
    <Pressable onPress={() => setStep(to)} accessibilityRole="button" accessibilityLabel="Back">
      <Text style={styles.backLink}>Back</Text>
    </Pressable>
  );

  if (step === "welcome") {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.welcomeBody}>
          <Text style={styles.headline}>Pass your theory test with judgment, not memorisation</Text>
          <View style={styles.pitchList}>
            <Text style={styles.pitchItem}>🛣️ Learn through route missions, not question dumps</Text>
            <Text style={styles.pitchItem}>🔁 Fix the mistakes that keep costing you marks</Text>
            <Text style={styles.pitchItem}>📈 Know when you&apos;re actually ready for the test</Text>
          </View>
        </View>
        <View style={styles.footer}>
          <PrimaryButton title="Get started" onPress={() => setStep("date")} />
        </View>
      </SafeAreaView>
    );
  }

  if (step === "schedule") {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.headline}>Set your study rhythm</Text>
        <Text style={styles.sub}>Short, regular sessions beat cramming.</Text>

        <Text style={styles.section}>Daily study target</Text>
        <View style={styles.chips}>
          {MINUTE_OPTIONS.map((option) => (
            <Pressable
              key={option}
              onPress={() => setMinutes(option)}
              accessibilityRole="button"
              accessibilityLabel={`${option} minutes`}
              style={[styles.chip, minutes === option && styles.chipActive]}
            >
              <Text style={[styles.chipText, minutes === option && styles.chipTextActive]}>
                {option} min
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.section}>Study days</Text>
        <View style={styles.chips}>
          {DAY_LABELS.map((label, i) => {
            const day = i + 1;
            const active = studyDays.includes(day);
            return (
              <Pressable
                key={label}
                onPress={() => toggleDay(day)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={label}
                style={[styles.dayChip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.footer}>
          {studyDays.length === 0 ? (
            <Text style={styles.hint}>Pick at least one study day</Text>
          ) : null}
          {back("date")}
          <PrimaryButton
            title="Continue"
            onPress={() => studyDays.length > 0 && setStep("accessibility")}
            disabled={studyDays.length === 0}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (step === "accessibility") {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.headline}>Make it yours</Text>
        <Text style={styles.sub}>You can change these any time in Profile.</Text>

        <View style={styles.settingsGroup}>
          <SettingRow
            label="Auto-play audio"
            description="Read each card aloud as it appears"
            value={autoPlayAudio}
            onToggle={setAutoPlayAudio}
          />
          <SettingRow
            label="Reduce motion"
            description="Minimise animations"
            value={reduceMotion}
            onToggle={setReduceMotion}
          />
          <SettingRow
            label="High contrast"
            description="Stronger colours for readability"
            value={highContrast}
            onToggle={setHighContrast}
          />
          <SettingRow
            label="Dyslexia-friendly text"
            description="Wider spacing and taller lines"
            value={dyslexiaFont}
            onToggle={setDyslexiaFont}
          />
        </View>

        <View style={styles.footer}>
          {back("schedule")}
          <PrimaryButton title="Start" onPress={start} />
        </View>
      </SafeAreaView>
    );
  }

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

      <View style={styles.footer}>
        {!testDate ? <Text style={styles.hint}>Pick your test date to continue</Text> : null}
        {back("welcome")}
        <PrimaryButton
          title="Continue"
          onPress={() => testDate && setStep("schedule")}
          disabled={!testDate}
        />
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg, padding: t.space.xl, gap: t.space.md },
    welcomeBody: { flex: 1, justifyContent: "center", gap: t.space.xl },
    pitchList: { gap: t.space.md },
    pitchItem: { ...t.text(t.font.md), color: t.colors.text, lineHeight: 24 },
    headline: { ...t.text(t.font.xl), fontWeight: "700", color: t.colors.text },
    sub: { ...t.text(t.font.sm), color: t.colors.textMuted },
    pickerWrap: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.card,
      borderWidth: 1,
      borderColor: t.colors.border,
      padding: t.space.sm,
    },
    section: { ...t.text(t.font.sm), fontWeight: "600", color: t.colors.text, marginTop: t.space.sm },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: t.space.sm },
    chip: {
      borderRadius: t.radius.pill,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
      paddingVertical: t.space.sm,
      paddingHorizontal: t.space.lg,
    },
    dayChip: {
      borderRadius: t.radius.pill,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
      paddingVertical: t.space.sm,
      paddingHorizontal: t.space.md,
    },
    chipActive: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
    chipText: { ...t.text(t.font.sm), color: t.colors.text },
    chipTextActive: { color: t.colors.onAccent, fontWeight: "600" },
    footer: { marginTop: "auto", gap: t.space.sm },
    hint: { ...t.text(t.font.xs), color: t.colors.textMuted, textAlign: "center" },
    settingsGroup: { gap: t.space.md },
    backLink: { ...t.text(t.font.sm), color: t.colors.accent, textAlign: "center" },
  });
