import { todayLocal } from '@/lib/clock';
import type { Db } from '../adapter';

export interface UserProfile {
  user_id: string;
  test_date: string;
  daily_minutes_target: number;
  study_days_json: string;
  auto_play_audio: number;
  reduce_motion: number;
  high_contrast: number;
  dyslexia_font: number;
  created_at: string;
}

export function createProfile(
  db: Db,
  p: { testDate: string; dailyMinutesTarget: number },
): void {
  db.run(
    `INSERT INTO user_profile (user_id, test_date, daily_minutes_target, created_at)
     VALUES ('local', ?, ?, ?)`,
    [p.testDate, p.dailyMinutesTarget, todayLocal()],
  );
}

export function getProfile(db: Db): UserProfile | undefined {
  return db.get<UserProfile>(`SELECT * FROM user_profile WHERE user_id = 'local'`);
}
