import { StyleSheet, Text, View } from 'react-native';
import type { Step } from '@focus/shared';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';
import { stepNarration } from '@/lib/narration';
import { AnswerOptions } from './AnswerOptions';
import { AudioButton } from './AudioButton';

export function Contrast(props: {
  step: Extract<Step, { type: 'contrast' }>;
  answered: boolean;
  selectedId?: string;
  onAnswer: (id: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
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
        <AudioButton text={stepNarration(props.step)} />
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

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    card: { gap: t.space.lg },
    pair: { flexDirection: 'row', gap: t.space.sm },
    side: {
      flex: 1,
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.card,
      padding: t.space.md,
      borderWidth: 1,
      borderColor: t.colors.border,
      gap: t.space.xs,
    },
    label: { ...t.text(t.font.sm), fontWeight: '700', color: t.colors.accent },
    body: { ...t.text(t.font.sm), color: t.colors.text },
    promptRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
    prompt: { flex: 1, ...t.text(t.font.md), fontWeight: '600', color: t.colors.text },
  });
