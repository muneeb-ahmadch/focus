import { router } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SettingRow } from "@/components/SettingRow";
import { TestDatePicker } from "@/components/TestDatePicker";
import { getDb } from "@/db";
import { createProfile, getProfile } from "@/db/repo/profile";
import { addDaysLocal, todayLocal } from "@/lib/clock";
import { queryClient } from "@/lib/queryClient";
import { useSettingsStore } from "@/stores/settingsStore";
import { type Theme } from "@/theme/tokens";
import { useThemedStyles } from "@/theme/useTheme";

const MINUTE_OPTIONS = [5, 10, 15, 20];

export default function OnboardingScreen() {
  const styles = useThemedStyles(makeStyles);
  const tomorrow = addDaysLocal(todayLocal(), 1);
  const [step, setStep] = useState<"plan" | "accessibility">("plan");
  const [testDate, setTestDate] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(10);
  const [autoPlayAudio, setAutoPlayAudio] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [dyslexiaFont, setDyslexiaFont] = useState(false);

  const started = useRef(false);

  const start = () => {
    if (!testDate || started.current) return;
    started.current = true;
    createProfile(getDb(), {
      testDate,
      dailyMinutesTarget: minutes,
      accessibility: { autoPlayAudio, reduceMotion, highContrast, dyslexiaFont },
    });
    useSettingsStore.getState().hydrate();
    // seed the cache before navigating so the Gate doesn't bounce back here
    // while the invalidated profile query is still refetching
    queryClient.setQueryData(["profile"], getProfile(getDb()) ?? null);
    void queryClient.invalidateQueries();
    router.replace("/(tabs)");
  };

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
          <Pressable
            onPress={() => setStep("plan")}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Text style={styles.backLink}>Back</Text>
          </Pressable>
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

      <View style={styles.footer}>
        {!testDate ? <Text style={styles.hint}>Pick your test date to continue</Text> : null}
        <PrimaryButton
          title="Continue"
          onPress={() => testDate && setStep("accessibility")}
          disabled={!testDate}
        />
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg, padding: t.space.xl, gap: t.space.md },
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
    chips: { flexDirection: "row", gap: t.space.sm },
    chip: {
      borderRadius: t.radius.pill,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
      paddingVertical: t.space.sm,
      paddingHorizontal: t.space.lg,
    },
    chipActive: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
    chipText: { ...t.text(t.font.sm), color: t.colors.text },
    chipTextActive: { color: t.colors.onAccent, fontWeight: "600" },
    footer: { marginTop: "auto", gap: t.space.sm },
    hint: { ...t.text(t.font.xs), color: t.colors.textMuted, textAlign: "center" },
    settingsGroup: { gap: t.space.md },
    backLink: { ...t.text(t.font.sm), color: t.colors.accent, textAlign: "center" },
  });
