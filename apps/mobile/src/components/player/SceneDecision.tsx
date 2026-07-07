import { StyleSheet, Text, View } from 'react-native';
import type { Step } from '@focus/shared';
import { colors, font, radius, space } from '@/theme/tokens';
import { AnswerOptions } from './AnswerOptions';
import { AudioButton } from './AudioButton';

export function SceneDecision(props: {
  step: Extract<Step, { type: 'scene_decision' }>;
  answered: boolean;
  selectedId?: string;
  onAnswer: (id: string) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.scene}>
        <Text style={styles.sceneText}>{props.step.scene}</Text>
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
  scene: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
  },
  sceneText: { fontSize: font.md, color: colors.text, fontStyle: 'italic' },
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  prompt: { flex: 1, fontSize: font.md, fontWeight: '600', color: colors.text },
});
