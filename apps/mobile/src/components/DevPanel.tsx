import { computeStreak } from '@focus/engine';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { getDb } from '@/db';
import { getActivity, getActiveDays, getRecentAccuracy, getScoredCount } from '@/db/repo/activity';
import { getAllReviewItems, getDue } from '@/db/repo/reviews';
import { MOCKS_ENABLED } from '@/flags';
import { __getDayOffset, __setDayOffset, dayNumber, fromEpochMs, todayLocal } from '@/lib/clock';
import { queryClient } from '@/lib/queryClient';
import { rescheduleAll, scheduleTestNotification } from '@/notifications/scheduler';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';

interface ScheduledRow {
  body: string;
  fireAt: string;
}

export function DevPanel() {
  const styles = useThemedStyles(makeStyles);
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
  const analyticsQueueSize =
    db.get<{ n: number }>('SELECT COUNT(*) AS n FROM analytics_event')?.n ?? 0;

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
        {MOCKS_ENABLED ? (
          <Pressable style={styles.button} onPress={() => router.push('/mock')}>
            <Text style={styles.buttonText}>Mock (dev)</Text>
          </Pressable>
        ) : null}
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
          {row.answers_scored} · mocks {row.mocks_completed}
        </Text>
      ))}

      <Text style={styles.line}>
        streak: {streak} · scored: {scoredCount} · recent accuracy: {(accuracy * 100).toFixed(0)}%
      </Text>
      <Text style={styles.line}>analytics queue: {analyticsQueueSize}</Text>

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

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    collapsed: {
      backgroundColor: t.colors.lockedBg,
      borderRadius: t.radius.control,
      padding: t.space.md,
      alignItems: 'center',
    },
    collapsedText: { ...t.text(t.font.xs), color: t.colors.textMuted },
    panel: {
      backgroundColor: t.colors.lockedBg,
      borderRadius: t.radius.control,
      padding: t.space.md,
      gap: t.space.xs,
    },
    title: { ...t.text(t.font.xs), fontWeight: '700', color: t.colors.text },
    heading: {
      ...t.text(t.font.xs),
      fontWeight: '700',
      color: t.colors.textMuted,
      marginTop: t.space.xs,
    },
    line: { ...t.text(t.font.xs), color: t.colors.text },
    mono: { ...t.text(11), color: t.colors.text, fontVariant: ['tabular-nums'] },
    row: { flexDirection: 'row', gap: t.space.sm },
    button: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.control,
      borderWidth: 1,
      borderColor: t.colors.border,
      paddingVertical: t.space.xs,
      paddingHorizontal: t.space.md,
    },
    buttonText: { ...t.text(t.font.xs), color: t.colors.accent, fontWeight: '600' },
  });
