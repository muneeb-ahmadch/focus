import { StyleSheet, Text, View } from 'react-native';
import type { Step } from '@focus/shared';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';
import { stepNarration } from '@/lib/narration';
import { AnswerOptions } from './AnswerOptions';
import { AudioButton } from './AudioButton';

export function SceneDecision(props: {
  step: Extract<Step, { type: 'scene_decision' }>;
  answered: boolean;
  selectedId?: string;
  onAnswer: (id: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.card}>
      <View style={styles.scene}>
        <Text style={styles.sceneText}>{props.step.scene}</Text>
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
    scene: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.card,
      padding: t.space.lg,
      borderLeftWidth: 4,
      borderLeftColor: t.colors.accent,
    },
    sceneText: { ...t.text(t.font.md), color: t.colors.text, fontStyle: 'italic' },
    promptRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
    prompt: { flex: 1, ...t.text(t.font.md), fontWeight: '600', color: t.colors.text },
  });
