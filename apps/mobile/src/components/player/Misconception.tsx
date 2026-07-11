import { StyleSheet, Text, View } from 'react-native';
import type { Step } from '@focus/shared';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';
import { stepNarration } from '@/lib/narration';
import { AnswerOptions } from './AnswerOptions';
import { AudioButton } from './AudioButton';

export function Misconception(props: {
  step: Extract<Step, { type: 'misconception' }>;
  answered: boolean;
  selectedId?: string;
  hintOptionId?: string;
  onAnswer: (id: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.card}>
      <View style={styles.belief}>
        <Text style={styles.beliefLabel}>Some people think…</Text>
        <Text style={styles.beliefText}>“{props.step.wrongBelief}”</Text>
      </View>
      <View style={styles.promptRow}>
        <Text style={styles.prompt}>{props.step.question.prompt}</Text>
        <AudioButton text={stepNarration(props.step)} />
      </View>
      <AnswerOptions
        question={props.step.question}
        answered={props.answered}
        selectedId={props.selectedId}
        hintOptionId={props.hintOptionId}
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

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    card: { gap: t.space.lg },
    belief: {
      backgroundColor: t.colors.lockedBg,
      borderRadius: t.radius.card,
      padding: t.space.lg,
      gap: t.space.xs,
    },
    beliefLabel: { ...t.text(t.font.xs), fontWeight: '700', color: t.colors.textMuted },
    beliefText: { ...t.text(t.font.md), color: t.colors.text, fontStyle: 'italic' },
    promptRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
    prompt: { flex: 1, ...t.text(t.font.md), fontWeight: '600', color: t.colors.text },
    repair: {
      backgroundColor: t.colors.accentSoft,
      borderRadius: t.radius.control,
      padding: t.space.md,
      borderWidth: 1,
      borderColor: t.colors.accent,
    },
    repairText: { ...t.text(t.font.sm), color: t.colors.text },
  });
