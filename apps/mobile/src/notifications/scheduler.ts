import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Db } from '@/db/adapter';
import { getActiveDays } from '@/db/repo/activity';
import { getMeta, setMeta } from '@/db/repo/meta';
import { getProfile } from '@/db/repo/profile';
import { countActiveDueOnOrBefore } from '@/db/repo/reviews';
import { computeStreak } from '@/engine/streak';
import { addDaysLocal, diffDaysLocal, localDayToDate, now, todayLocal } from '@/lib/clock';

// expo-notifications has no web support — every export must no-op there
const isWeb = Platform.OS === 'web';

if (!isWeb) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function requestPermissionOnce(db: Db): Promise<void> {
  if (isWeb) return;
  if (getMeta(db, 'notif_asked') === '1') return;
  setMeta(db, 'notif_asked', '1');
  await Notifications.requestPermissionsAsync();
  await rescheduleAll(db);
}

export async function rescheduleAll(db: Db): Promise<void> {
  if (isWeb) return;
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  await Notifications.cancelAllScheduledNotificationsAsync();   // idempotent by design
  const profile = getProfile(db);
  if (!profile) return;
  const streak = computeStreak(getActiveDays(db), todayLocal());
  for (let i = 0; i < 7; i++) {
    const day = addDaysLocal(todayLocal(), i);
    const fireAt = localDayToDate(day, 18, 0);
    if (fireAt.getTime() <= now().getTime()) continue;
    const daysToTest = diffDaysLocal(day, profile.test_date);
    if (daysToTest < 0) break;
    const due = countActiveDueOnOrBefore(db, day);
    const body =
      due >= 5           ? `You have ${due} reviews due — clear them before they pile up.`
      : streak >= 3 && i <= 1 ? `Don't lose your ${streak}-day streak — today's mission takes ~6 minutes.`
      :                    `Your test is in ${daysToTest} days — today's mission takes ~6 minutes.`;
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Focus', body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
    });
  }
}

export async function scheduleTestNotification(): Promise<void> {
  if (isWeb) return;
  await Notifications.requestPermissionsAsync();
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Focus', body: 'Test notification — delivery works.' },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 10,
    },
  });
}
