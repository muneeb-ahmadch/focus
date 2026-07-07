import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { getDb } from '@/db';
import { getActivity, getActiveDays, getRecentAccuracy, getScoredCount } from '@/db/repo/activity';
import { getAllReviewItems, getDue } from '@/db/repo/reviews';
import { computeStreak } from '@focus/engine';
import { __getDayOffset, __setDayOffset, dayNumber, fromEpochMs, todayLocal } from '@/lib/clock';
import { queryClient } from '@/lib/queryClient';
import { rescheduleAll, scheduleTestNotification } from '@/notifications/scheduler';
import { colors, font, radius, space } from '@/theme/tokens';

interface ScheduledRow {
  body: string;
  fireAt: string;
}

export function DevPanel() {
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const [scheduled, setScheduled] = useState<ScheduledRow[]>([]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!open || Platform.OS === 'web') return;
    let cancelled = false;
    void Notifications.getAllScheduledNotificationsAsync().then((requests) => {
      if (cancelled) return;
      setScheduled(
        requests.map((r) => {
          const trigger = r.trigger;
          let fireAt = '?';
          if (trigger && typeof trigger === 'object' && 'value' in trigger) {
            fireAt = fromEpochMs(trigger.value as number).toLocaleString();
          }
          return { body: r.content.body ?? '', fireAt };
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [open, tick]);

  if (!__DEV__) return null;

  const db = getDb();
  const today = todayLocal();

  const bumpDay = (offset: number) => {
    __setDayOffset(offset);
    void queryClient.invalidateQueries();
    void rescheduleAll(db);
    refresh();
  };

  if (!open) {
    return (
      <Pressable style={styles.collapsed} onPress={() => { setOpen(true); refresh(); }}>
        <Text style={styles.collapsedText}>🛠 DevPanel</Text>
      </Pressable>
    );
  }

  const items = getAllReviewItems(db);
  const due = getDue(db, today);
  const activity = getActivity(db);
  const streak = computeStreak(getActiveDays(db).map(dayNumber), dayNumber(today));
  const scoredCount = getScoredCount(db);
  const accuracy = getRecentAccuracy(db);

  return (
    <View style={styles.panel}>
      <Pressable onPress={() => setOpen(false)}>
        <Text style={styles.title}>🛠 DevPanel (tap to collapse)</Text>
      </Pressable>

      <Text style={styles.line}>
        today: {today} (offset {__getDayOffset()}d)
      </Text>
      <View style={styles.row}>
        <Pressable style={styles.button} onPress={() => bumpDay(__getDayOffset() + 1)}>
          <Text style={styles.buttonText}>+1 day</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => bumpDay(0)}>
          <Text style={styles.buttonText}>reset</Text>
        </Pressable>
        <Pressable
          style={styles.button}
          onPress={() => {
            void scheduleTestNotification();
            refresh();
          }}
        >
          <Text style={styles.buttonText}>Test notif 10s</Text>
        </Pressable>
      </View>

      <Text style={styles.line}>due reviews: {due.length}</Text>
      <Text style={styles.heading}>review_item</Text>
      {items.length === 0 ? <Text style={styles.line}>(none)</Text> : null}
      {items.map((item) => (
        <Text key={item.concept_id} style={styles.mono}>
          {item.concept_id} · int {item.interval_days} · due {item.due_at} · lapses {item.lapses} ·{' '}
          {item.status}
        </Text>
      ))}

      <Text style={styles.heading}>daily_activity</Text>
      {activity.length === 0 ? <Text style={styles.line}>(none)</Text> : null}
      {activity.map((row) => (
        <Text key={row.day} style={styles.mono}>
          {row.day} · missions {row.missions_completed} · reviews {row.reviews_cleared} · answers{' '}
          {row.answers_scored}
        </Text>
      ))}

      <Text style={styles.line}>
        streak: {streak} · scored: {scoredCount} · recent accuracy: {(accuracy * 100).toFixed(0)}%
      </Text>

      <Text style={styles.heading}>scheduled notifications ({scheduled.length})</Text>
      {scheduled.length === 0 ? <Text style={styles.line}>(none)</Text> : null}
      {scheduled.map((row, i) => (
        <Text key={`${row.fireAt}-${i}`} style={styles.mono}>
          {row.fireAt} — {row.body}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  collapsed: {
    backgroundColor: colors.lockedBg,
    borderRadius: radius.control,
    padding: space.md,
    alignItems: 'center',
  },
  collapsedText: { fontSize: font.xs, color: colors.textMuted },
  panel: {
    backgroundColor: colors.lockedBg,
    borderRadius: radius.control,
    padding: space.md,
    gap: space.xs,
  },
  title: { fontSize: font.xs, fontWeight: '700', color: colors.text },
  heading: { fontSize: font.xs, fontWeight: '700', color: colors.textMuted, marginTop: space.xs },
  line: { fontSize: font.xs, color: colors.text },
  mono: { fontSize: 11, color: colors.text, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', gap: space.sm },
  button: {
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
  },
  buttonText: { fontSize: font.xs, color: colors.accent, fontWeight: '600' },
});
