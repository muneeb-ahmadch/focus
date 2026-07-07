import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '@/theme/tokens';

type Choice = 'sure' | 'unsure' | 'easy' | 'okay';

export function ConfidenceFooter(props: {
  mode: 'mission' | 'drill';
  onSelect: (c: Choice) => void;
}) {
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
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
          >
            <Text style={styles.chipLabel}>{choice.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { gap: space.sm },
  prompt: { fontSize: font.sm, color: colors.textMuted, textAlign: 'center' },
  row: { flexDirection: 'row', gap: space.sm, justifyContent: 'center' },
  chip: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.control,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  pressed: { opacity: 0.7 },
  chipLabel: { color: colors.accent, fontSize: font.sm, fontWeight: '600' },
});
