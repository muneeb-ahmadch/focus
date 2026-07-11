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
  p: {
    testDate: string;
    dailyMinutesTarget: number;
    studyDays?: number[];
    accessibility?: {
      autoPlayAudio: boolean;
      reduceMotion: boolean;
      highContrast: boolean;
      dyslexiaFont: boolean;
    };
  },
): void {
  const studyDaysJson = JSON.stringify(p.studyDays ?? [1, 2, 3, 4, 5, 6, 7]);
  if (p.accessibility) {
    db.run(
      `INSERT INTO user_profile
         (user_id, test_date, daily_minutes_target, study_days_json, created_at,
          auto_play_audio, reduce_motion, high_contrast, dyslexia_font)
       VALUES ('local', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.testDate,
        p.dailyMinutesTarget,
        studyDaysJson,
        todayLocal(),
        p.accessibility.autoPlayAudio ? 1 : 0,
        p.accessibility.reduceMotion ? 1 : 0,
        p.accessibility.highContrast ? 1 : 0,
        p.accessibility.dyslexiaFont ? 1 : 0,
      ],
    );
    return;
  }
  db.run(
    `INSERT INTO user_profile (user_id, test_date, daily_minutes_target, study_days_json, created_at)
     VALUES ('local', ?, ?, ?, ?)`,
    [p.testDate, p.dailyMinutesTarget, studyDaysJson, todayLocal()],
  );
}

export function getProfile(db: Db): UserProfile | undefined {
  return db.get<UserProfile>(`SELECT * FROM user_profile WHERE user_id = 'local'`);
}

type SettingsColumn = 'auto_play_audio' | 'reduce_motion' | 'high_contrast' | 'dyslexia_font';

export function updateProfileSettings(
  db: Db,
  patch: Partial<Record<SettingsColumn, 0 | 1>>,
): void {
  const entries = Object.entries(patch) as [SettingsColumn, 0 | 1][];
  if (entries.length === 0) return;
  const setClause = entries.map(([column]) => `${column} = ?`).join(', ');
  const values = entries.map(([, value]) => value);
  db.run(`UPDATE user_profile SET ${setClause} WHERE user_id = 'local'`, values);
}
