import { StyleSheet, Text, View } from 'react-native';
import type { Step } from '@focus/shared';
import { colors, font, radius, space } from '@/theme/tokens';
import { AnswerOptions } from './AnswerOptions';
import { AudioButton } from './AudioButton';

export function Misconception(props: {
  step: Extract<Step, { type: 'misconception' }>;
  answered: boolean;
  selectedId?: string;
  onAnswer: (id: string) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.belief}>
        <Text style={styles.beliefLabel}>Some people think…</Text>
        <Text style={styles.beliefText}>“{props.step.wrongBelief}”</Text>
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
      {props.answered ? (
        <View style={styles.repair}>
          <Text style={styles.repairText}>{props.step.repairNote}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.lg },
  belief: {
    backgroundColor: colors.lockedBg,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.xs,
  },
  beliefLabel: { fontSize: font.xs, fontWeight: '700', color: colors.textMuted },
  beliefText: { fontSize: font.md, color: colors.text, fontStyle: 'italic' },
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  prompt: { flex: 1, fontSize: font.md, fontWeight: '600', color: colors.text },
  repair: {
    backgroundColor: '#2E6BE614',
    borderRadius: radius.control,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  repairText: { fontSize: font.sm, color: colors.text },
});
