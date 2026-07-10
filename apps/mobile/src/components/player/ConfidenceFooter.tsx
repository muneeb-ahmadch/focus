import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';

type Choice = 'sure' | 'unsure' | 'easy' | 'okay';

export function ConfidenceFooter(props: {
  mode: 'mission' | 'drill';
  onSelect: (c: Choice) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const choices: { label: string; value: Choice }[] =
    props.mode === 'mission'
      ? [
          { label: 'I was sure', value: 'sure' },
          { label: 'Not sure', value: 'unsure' },
        ]
      : [
          { label: 'Easy', value: 'easy' },
          { label: 'Got it', value: 'okay' },
          { label: 'Not sure', value: 'unsure' },
        ];
  return (
    <View style={styles.footer}>
      <Text style={styles.prompt}>
        {props.mode === 'mission' ? 'Were you sure?' : 'How did that feel?'}
      </Text>
      <View style={styles.row}>
        {choices.map((choice) => (
          <Pressable
            key={choice.value}
            onPress={() => props.onSelect(choice.value)}
            accessibilityRole="button"
            accessibilityLabel={choice.label}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
          >
            <Text style={styles.chipLabel}>{choice.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    footer: { gap: t.space.sm },
    prompt: { ...t.text(t.font.sm), color: t.colors.textMuted, textAlign: 'center' },
    row: { flexDirection: 'row', gap: t.space.sm, justifyContent: 'center' },
    chip: {
      flex: 1,
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.accent,
      borderRadius: t.radius.control,
      paddingVertical: t.space.md,
      alignItems: 'center',
    },
    pressed: { opacity: 0.7 },
    chipLabel: { color: t.colors.accent, ...t.text(t.font.sm), fontWeight: '600' },
  });
