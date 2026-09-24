import { Image, StyleSheet, Text, View } from 'react-native';
import type { Step } from '@focus/shared';
import { bankAsset } from '@/content/bankAssets';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';
import { stepNarration } from '@/lib/narration';
import { AnswerOptions } from './AnswerOptions';
import { AudioButton } from './AudioButton';
import { SignView } from './SignView';

export function SignMeaning(props: {
  step: Extract<Step, { type: 'sign_meaning' }>;
  answered: boolean;
  selectedId?: string;
  hintOptionId?: string;
  onAnswer: (id: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { sign } = props.step;
  return (
    <View style={styles.card}>
      {sign.imageRef ? (
        <Image
          source={bankAsset(sign.imageRef)}
          accessibilityRole="image"
          accessibilityLabel={sign.label ?? 'Sign'}
          resizeMode="contain"
          style={styles.signImage}
        />
      ) : (
        <SignView shape={sign.shape} glyph={sign.glyph} label={sign.label} />
      )}
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
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    card: { gap: t.space.lg },
    signImage: { width: '100%', height: 140 },
    promptRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
    prompt: { flex: 1, ...t.text(t.font.md), fontWeight: '600', color: t.colors.text },
  });
