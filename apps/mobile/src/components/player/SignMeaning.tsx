import { StyleSheet, Text, View } from 'react-native';
import type { Step } from '@focus/shared';
import { colors, font, space } from '@/theme/tokens';
import { AnswerOptions } from './AnswerOptions';
import { AudioButton } from './AudioButton';
import { SignView } from './SignView';

export function SignMeaning(props: {
  step: Extract<Step, { type: 'sign_meaning' }>;
  answered: boolean;
  selectedId?: string;
  onAnswer: (id: string) => void;
}) {
  return (
    <View style={styles.card}>
      <SignView
        shape={props.step.sign.shape}
        glyph={props.step.sign.glyph}
        label={props.step.sign.label}
      />
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
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  prompt: { flex: 1, fontSize: font.md, fontWeight: '600', color: colors.text },
});
