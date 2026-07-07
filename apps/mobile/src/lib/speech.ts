import * as Speech from 'expo-speech';

// Default en-GB voices are the low-quality compact ones; these sound close to human.
// iOS enhanced voices ship on-device once downloaded; Android list is Google TTS
// local variants only — network variants sound better but break offline-first.
const PREFERRED_VOICES = [
  'com.apple.voice.enhanced.en-GB.Stephanie',
  'com.apple.voice.enhanced.en-GB.Kate',
  'com.apple.voice.enhanced.en-GB.Serena',
  'com.apple.voice.enhanced.en-GB.Daniel',
  'en-gb-x-gbb-local',
  'en-gb-x-rjs-local',
  'en-gb-x-gba-local',
];

let voiceId: string | undefined;

export async function initNarrationVoice(): Promise<void> {
  let voices = await Speech.getAvailableVoicesAsync();
  if (voices.length === 0) {
    // Android TTS engine can still be warming up at cold start
    await new Promise((resolve) => setTimeout(resolve, 1500));
    voices = await Speech.getAvailableVoicesAsync();
  }
  const enGb = voices.filter((v) => v.language.replace('_', '-') === 'en-GB');
  voiceId =
    PREFERRED_VOICES.find((id) => enGb.some((v) => v.identifier === id)) ??
    enGb.find((v) => v.quality === Speech.VoiceQuality.Enhanced)?.identifier;
}

export function speak(text: string): void {
  Speech.stop();
  Speech.speak(text, { language: 'en-GB', voice: voiceId, rate: 0.95 });
}

export function stopSpeech(): void {
  Speech.stop();
}
