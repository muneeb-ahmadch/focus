import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { getDb } from '@/db';
import { getProfile, updateSchedule } from '@/db/repo/profile';
import { queryClient } from '@/lib/queryClient';
import { rescheduleAll } from '@/notifications/scheduler';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';

const MINUTE_OPTIONS = [5, 10, 15, 20];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function parseStudyDays(json: string): number[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [1, 2, 3, 4, 5, 6, 7];
  }
  if (Array.isArray(parsed) && parsed.every((d) => typeof d === 'number' && d >= 1 && d <= 7)) {
    return parsed;
  }
  return [1, 2, 3, 4, 5, 6, 7];
}

export default function ScheduleEditorScreen() {
  const styles = useThemedStyles(makeStyles);
  const [profile] = useState(() => getProfile(getDb())!);
  const [minutes, setMinutes] = useState(profile.daily_minutes_target);
  const [studyDays, setStudyDays] = useState<number[]>(() => parseStudyDays(profile.study_days_json));
  const savedRef = useRef(false);

  const toggleDay = (day: number) => {
    setStudyDays((days) =>
      days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b),
    );
  };

  const onSave = () => {
    if (studyDays.length === 0 || savedRef.current) return;
    savedRef.current = true;
    updateSchedule(getDb(), { dailyMinutesTarget: minutes, studyDays });
    void rescheduleAll(getDb());
    void queryClient.invalidateQueries();
    router.back();
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
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

        {studyDays.length === 0 ? <Text style={styles.hint}>Pick at least one study day</Text> : null}
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton title="Save" onPress={onSave} disabled={studyDays.length === 0} />
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    content: { padding: t.space.lg, gap: t.space.md },
    section: { ...t.text(t.font.sm), fontWeight: '600', color: t.colors.text },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
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
    chipTextActive: { color: t.colors.onAccent, fontWeight: '600' },
    hint: { ...t.text(t.font.xs), color: t.colors.textMuted },
    footer: { padding: t.space.lg },
  });
