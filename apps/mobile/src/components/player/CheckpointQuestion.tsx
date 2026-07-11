import { StyleSheet, Text, View } from 'react-native';
import type { Question } from '@focus/shared';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';
import { AnswerOptions } from './AnswerOptions';
import { AudioButton } from './AudioButton';

export function CheckpointQuestion(props: {
  question: Question;
  heading: string;
  answered: boolean;
  selectedId?: string;
  hintOptionId?: string;
  onAnswer: (id: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>{props.heading}</Text>
      <View style={styles.promptRow}>
        <Text style={styles.prompt}>{props.question.prompt}</Text>
        <AudioButton text={props.question.prompt} />
      </View>
      <AnswerOptions
        question={props.question}
        answered={props.answered}
        selectedId={props.selectedId}
        hintOptionId={props.hintOptionId}
        onAnswer={props.onAnswer}
      />
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    card: { gap: t.space.lg },
    heading: {
      ...t.text(t.font.xs),
      fontWeight: '700',
      color: t.colors.textMuted,
      letterSpacing: 1,
    },
    promptRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
    prompt: { flex: 1, ...t.text(t.font.md), fontWeight: '600', color: t.colors.text },
  });
