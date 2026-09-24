import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { bankAsset } from '@/content/bankAssets';
import type { PlayerQuestion } from '@/stores/playerStore';
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
  question: PlayerQuestion;
  answered: boolean;
  selectedId?: string;
  hintOptionId?: string;
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
        const isHinted = props.hintOptionId === option.id;
        const disabled = props.answered || isHinted;
        // an image option is audible via its authored altText (rule 8)
        const label = option.text ?? option.altText ?? '';
        return (
          <Pressable
            key={option.id}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled }}
            aria-disabled={disabled}
            onPress={() => props.onAnswer(option.id)}
            style={({ pressed }) => [
              styles.row,
              pressed && styles.pressed,
              showCorrect && styles.correct,
              showWrong && styles.wrong,
              isHinted && styles.hinted,
            ]}
          >
            {option.imageRef ? (
              <Image
                source={bankAsset(option.imageRef)}
                accessibilityRole="image"
                accessibilityLabel={option.altText}
                resizeMode="contain"
                style={styles.image}
              />
            ) : (
              <Text style={styles.text}>{option.text}</Text>
            )}
            <AudioButton text={label} small />
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
    hinted: { backgroundColor: t.colors.lockedBg, opacity: 0.5 },
    text: { flex: 1, ...t.text(t.font.sm), color: t.colors.text },
    image: { flex: 1, height: 96, alignSelf: 'stretch' },
  });
