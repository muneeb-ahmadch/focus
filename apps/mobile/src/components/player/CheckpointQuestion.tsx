import { StyleSheet, Text, View } from 'react-native';
import type { Question } from '@focus/shared';
import { colors, font, space } from '@/theme/tokens';
import { AnswerOptions } from './AnswerOptions';
import { AudioButton } from './AudioButton';

export function CheckpointQuestion(props: {
  question: Question;
  heading: string;
  answered: boolean;
  selectedId?: string;
  onAnswer: (id: string) => void;
}) {
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
        onAnswer={props.onAnswer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.lg },
  heading: { fontSize: font.xs, fontWeight: '700', color: colors.textMuted, letterSpacing: 1 },
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  prompt: { flex: 1, fontSize: font.md, fontWeight: '600', color: colors.text },
});
