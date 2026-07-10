import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SettingRow } from '@/components/SettingRow';
import { useSettingsStore } from '@/stores/settingsStore';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';

export default function AccessibilitySettingsScreen() {
  const styles = useThemedStyles(makeStyles);
  const autoPlayAudio = useSettingsStore((s) => s.autoPlayAudio);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const highContrast = useSettingsStore((s) => s.highContrast);
  const dyslexiaFont = useSettingsStore((s) => s.dyslexiaFont);
  const setSetting = useSettingsStore((s) => s.setSetting);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>Tune how lessons look and sound.</Text>

        <SettingRow
          label="Auto-play audio"
          description="Read each card aloud as it appears"
          value={autoPlayAudio}
          onToggle={(next) => setSetting('autoPlayAudio', next)}
        />
        <SettingRow
          label="Reduce motion"
          description="Minimise animations"
          value={reduceMotion}
          onToggle={(next) => setSetting('reduceMotion', next)}
        />
        <SettingRow
          label="High contrast"
          description="Stronger colours for readability"
          value={highContrast}
          onToggle={(next) => setSetting('highContrast', next)}
        />
        <SettingRow
          label="Dyslexia-friendly text"
          description="Wider spacing and taller lines"
          value={dyslexiaFont}
          onToggle={(next) => setSetting('dyslexiaFont', next)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    content: { padding: t.space.lg, gap: t.space.md },
    intro: { ...t.text(t.font.sm), color: t.colors.textMuted },
  });
