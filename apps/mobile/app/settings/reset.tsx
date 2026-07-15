import { router } from 'expo-router';
import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { getDb } from '@/db';
import { resetDatabase } from '@/db/reset';
import { queryClient } from '@/lib/queryClient';
import { rescheduleAll } from '@/notifications/scheduler';
import { useSettingsStore } from '@/stores/settingsStore';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';

const LOSES = [
  'Your streak, XP and all mission progress',
  'Your review queue and mock history',
  'Your test date, schedule and settings',
];

export default function ResetConfirmScreen() {
  const styles = useThemedStyles(makeStyles);
  const doneRef = useRef(false);

  const onReset = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    resetDatabase(getDb());
    // back to a fresh install: settings to defaults, no reminders, caches dropped
    // so the Gate re-reads a null profile, then straight into onboarding.
    useSettingsStore.getState().hydrate();
    void rescheduleAll(getDb());
    void queryClient.invalidateQueries();
    router.replace('/onboarding');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.headline}>Reset the app?</Text>
        <Text style={styles.body}>
          This permanently deletes everything on this device and starts you over from onboarding.
          It can&apos;t be undone.
        </Text>
        <View style={styles.list}>
          {LOSES.map((line) => (
            <Text key={line} style={styles.listItem}>
              • {line}
            </Text>
          ))}
        </View>
      </View>
      <View style={styles.footer}>
        <PrimaryButton title="Delete everything" variant="danger" onPress={onReset} />
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    content: { flex: 1, padding: t.space.lg, gap: t.space.md },
    headline: { ...t.text(t.font.xl), fontWeight: '700', color: t.colors.text },
    body: { ...t.text(t.font.md), color: t.colors.textMuted, lineHeight: 24 },
    list: { gap: t.space.sm, marginTop: t.space.sm },
    listItem: { ...t.text(t.font.md), color: t.colors.text },
    footer: { padding: t.space.lg, gap: t.space.sm },
    cancel: { ...t.text(t.font.md), color: t.colors.accent, textAlign: 'center', paddingVertical: t.space.sm },
  });
