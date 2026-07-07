import { StyleSheet, Text, View } from 'react-native';
import type { Step } from '@focus/shared';
import { colors, font, radius, space } from '@/theme/tokens';
import { AnswerOptions } from './AnswerOptions';
import { AudioButton } from './AudioButton';

export function RuleCard(props: {
  step: Extract<Step, { type: 'rule_card' }>;
  answered: boolean;
  selectedId?: string;
  onAnswer: (id: string) => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{props.step.title}</Text>
      <Text style={styles.body}>{props.step.body}</Text>
      <View style={styles.promptRow}>
        <Text style={styles.prompt}>{props.step.question.prompt}</Text>
        <AudioButton text={props.step.question.prompt} />
      </View>
      <AnswerOptions
        question={props.step.question}
        answered={props.answered}
        selectedId={props.selectedId}
        onAnswer={props.onAnswer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.lg },
  title: { fontSize: font.lg, fontWeight: '700', color: colors.text },
  body: {
    fontSize: font.md,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  prompt: { flex: 1, fontSize: font.md, fontWeight: '600', color: colors.text },
});
