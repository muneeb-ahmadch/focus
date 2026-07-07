import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Question } from '@focus/shared';
import { colors, font, radius, space } from '@/theme/tokens';
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

const styles = StyleSheet.create({
  list: { gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  pressed: { opacity: 0.7 },
  correct: { borderColor: colors.success, backgroundColor: '#1E9E5A14' },
  wrong: { borderColor: colors.danger, backgroundColor: '#D9383814' },
  text: { flex: 1, fontSize: font.sm, color: colors.text },
});
