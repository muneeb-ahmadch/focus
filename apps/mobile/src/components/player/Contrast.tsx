import { StyleSheet, Text, View } from 'react-native';
import type { Step } from '@focus/shared';
import { colors, font, radius, space } from '@/theme/tokens';
import { AnswerOptions } from './AnswerOptions';
import { AudioButton } from './AudioButton';

export function Contrast(props: {
  step: Extract<Step, { type: 'contrast' }>;
  answered: boolean;
  selectedId?: string;
  onAnswer: (id: string) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.pair}>
        <View style={styles.side}>
          <Text style={styles.label}>{props.step.a.label}</Text>
          <Text style={styles.body}>{props.step.a.body}</Text>
        </View>
        <View style={styles.side}>
          <Text style={styles.label}>{props.step.b.label}</Text>
          <Text style={styles.body}>{props.step.b.body}</Text>
        </View>
      </View>
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
  pair: { flexDirection: 'row', gap: space.sm },
  side: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: space.xs,
  },
  label: { fontSize: font.sm, fontWeight: '700', color: colors.accent },
  body: { fontSize: font.sm, color: colors.text },
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  prompt: { flex: 1, fontSize: font.md, fontWeight: '600', color: colors.text },
});
