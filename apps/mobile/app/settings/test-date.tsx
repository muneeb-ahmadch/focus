import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TestDatePicker } from '@/components/TestDatePicker';
import { getDb } from '@/db';
import { getProfile, updateTestDate } from '@/db/repo/profile';
import { addDaysLocal, todayLocal } from '@/lib/clock';
import { queryClient } from '@/lib/queryClient';
import { rescheduleAll } from '@/notifications/scheduler';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';

export default function TestDateEditorScreen() {
  const styles = useThemedStyles(makeStyles);
  const [profile] = useState(() => getProfile(getDb())!);
  const [picked, setPicked] = useState<string | null>(null);
  const [confirmDate, setConfirmDate] = useState<string | null>(null);
  const [floorHint, setFloorHint] = useState(false);
  const savedRef = useRef(false);

  const persist = (date: string) => {
    if (savedRef.current) return;
    savedRef.current = true;
    updateTestDate(getDb(), date);
    void rescheduleAll(getDb());
    void queryClient.invalidateQueries();
    router.back();
  };

  const onSave = () => {
    const newDate = picked ?? profile.test_date;
    // the picker's min is a UI hint only — web date inputs accept typed
    // values below it, so the save path owns the floor (QA V9-Q2)
    if (newDate < addDaysLocal(todayLocal(), 1)) {
      setFloorHint(true);
      return;
    }
    if (newDate >= profile.test_date) {
      persist(newDate);
      return;
    }
    setConfirmDate(newDate);
  };

  const onConfirmUpdate = () => {
    if (confirmDate) persist(confirmDate);
  };

  const onKeepCurrent = () => {
    setConfirmDate(null);
    setPicked(null);
  };

  if (confirmDate) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.content}>
          <Text style={styles.headline}>Your test just moved closer</Text>
          <Text style={styles.body}>
            Your daily plan and reminders will refocus around {confirmDate}.
          </Text>
        </View>
        <View style={styles.footer}>
          <PrimaryButton title="Update my plan" onPress={onConfirmUpdate} />
          <Pressable
            onPress={onKeepCurrent}
            accessibilityRole="button"
            accessibilityLabel="Keep my current date"
          >
            <Text style={styles.secondaryLink}>Keep my current date</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.pickerWrap}>
          <TestDatePicker
            value={picked ?? profile.test_date}
            min={addDaysLocal(todayLocal(), 1)}
            onChange={(d) => {
              setPicked(d);
              setFloorHint(false);
            }}
          />
        </View>
      </View>
      <View style={styles.footer}>
        {floorHint ? <Text style={styles.hint}>Pick a date after today</Text> : null}
        <PrimaryButton title="Save" onPress={onSave} />
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    content: { flex: 1, padding: t.space.lg, gap: t.space.md },
    headline: { ...t.text(t.font.xl), fontWeight: '700', color: t.colors.text },
    body: { ...t.text(t.font.md), color: t.colors.textMuted },
    pickerWrap: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.card,
      borderWidth: 1,
      borderColor: t.colors.border,
      padding: t.space.sm,
    },
    footer: { padding: t.space.lg, gap: t.space.sm },
    hint: { ...t.text(t.font.xs), color: t.colors.textMuted, textAlign: 'center' },
    secondaryLink: { ...t.text(t.font.sm), color: t.colors.accent, textAlign: 'center' },
  });
