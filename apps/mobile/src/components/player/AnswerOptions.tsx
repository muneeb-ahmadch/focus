import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Question } from '@focus/shared';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';
import { AudioButton } from './AudioButton';

function shuffle<T>(input: T[]): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

export function AnswerOptions(props: {
  question: Question;
  answered: boolean;
  selectedId?: string;
  onAnswer: (optionId: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const [options] = useState(() => shuffle(props.question.options));
  return (
    <View style={styles.list}>
      {options.map((option) => {
        const isSelected = props.answered && props.selectedId === option.id;
        const showCorrect = props.answered && option.correct;
        const showWrong = isSelected && !option.correct;
        return (
          <Pressable
            key={option.id}
            disabled={props.answered}
            accessibilityRole="button"
            accessibilityLabel={option.text}
            onPress={() => props.onAnswer(option.id)}
            style={({ pressed }) => [
              styles.row,
              pressed && styles.pressed,
              showCorrect && styles.correct,
              showWrong && styles.wrong,
            ]}
          >
            <Text style={styles.text}>{option.text}</Text>
            <AudioButton text={option.text} small />
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    list: { gap: t.space.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: t.colors.surface,
      borderWidth: 2,
      borderColor: t.colors.border,
      borderRadius: t.radius.control,
      paddingVertical: t.space.md,
      paddingHorizontal: t.space.lg,
      gap: t.space.sm,
    },
    pressed: { opacity: 0.7 },
    correct: { borderColor: t.colors.success, backgroundColor: t.colors.successSoft },
    wrong: { borderColor: t.colors.danger, backgroundColor: t.colors.dangerSoft },
    text: { flex: 1, ...t.text(t.font.sm), color: t.colors.text },
  });
