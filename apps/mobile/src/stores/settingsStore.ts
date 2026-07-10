import { create } from 'zustand';
import { getDb } from '@/db';
import { getProfile, updateProfileSettings } from '@/db/repo/profile';

export type SettingKey = 'autoPlayAudio' | 'reduceMotion' | 'highContrast' | 'dyslexiaFont';

interface SettingsState {
  autoPlayAudio: boolean;
  reduceMotion: boolean;
  highContrast: boolean;
  dyslexiaFont: boolean;
  hydrate(): void;
  setSetting(key: SettingKey, value: boolean): void;
}

const SETTING_COLUMN: Record<
  SettingKey,
  'auto_play_audio' | 'reduce_motion' | 'high_contrast' | 'dyslexia_font'
> = {
  autoPlayAudio: 'auto_play_audio',
  reduceMotion: 'reduce_motion',
  highContrast: 'high_contrast',
  dyslexiaFont: 'dyslexia_font',
};

export const useSettingsStore = create<SettingsState>()((set) => ({
  autoPlayAudio: true,
  reduceMotion: false,
  highContrast: false,
  dyslexiaFont: false,

  hydrate() {
    const profile = getProfile(getDb());
    set({
      autoPlayAudio: profile ? profile.auto_play_audio === 1 : true,
      reduceMotion: profile ? profile.reduce_motion === 1 : false,
      highContrast: profile ? profile.high_contrast === 1 : false,
      dyslexiaFont: profile ? profile.dyslexia_font === 1 : false,
    });
  },

  setSetting(key, value) {
    set({ [key]: value } as Partial<SettingsState>);
    updateProfileSettings(getDb(), { [SETTING_COLUMN[key]]: value ? 1 : 0 });
  },
}));
