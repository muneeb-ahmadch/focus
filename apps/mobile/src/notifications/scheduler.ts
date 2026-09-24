import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Db } from '@/db/adapter';
import { getMeta, setMeta } from '@/db/repo/meta';
import { localDayToDate, now, todayLocal } from '@/lib/clock';
import { planNotifications } from '@/notifications/plan';

// expo-notifications has no web support — every export must no-op there
const isWeb = Platform.OS === 'web';

if (!isWeb) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
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
  const plan = planNotifications(db, todayLocal());
  for (const entry of plan) {
    const fireAt = localDayToDate(entry.day, 18, 0);
    if (fireAt.getTime() <= now().getTime()) continue;
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Focus', body: entry.body },
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
