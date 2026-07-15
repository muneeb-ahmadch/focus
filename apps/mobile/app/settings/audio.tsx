import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { SettingRow } from '@/components/SettingRow';
import { speak, stopSpeech } from '@/lib/speech';
import { useSettingsStore } from '@/stores/settingsStore';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';

const SAMPLE = 'This is how your lessons will sound. Give way to traffic on the major road.';

export default function AudioSettingsScreen() {
  const styles = useThemedStyles(makeStyles);
  const autoPlayAudio = useSettingsStore((s) => s.autoPlayAudio);
  const setSetting = useSettingsStore((s) => s.setSetting);

  useEffect(() => () => stopSpeech(), []);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Every lesson card and answer can be read aloud in a UK voice.
        </Text>

        <SettingRow
          label="Auto-play audio"
          description="Read each card aloud as it appears"
          value={autoPlayAudio}
          onToggle={(next) => setSetting('autoPlayAudio', next)}
        />

        <View style={styles.sampleBlock}>
          <PrimaryButton title="Hear a sample" variant="secondary" onPress={() => speak(SAMPLE)} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    content: { padding: t.space.lg, gap: t.space.md },
    intro: { ...t.text(t.font.sm), color: t.colors.textMuted },
    sampleBlock: { marginTop: t.space.sm },
  });
