import { StyleSheet, Text, View } from 'react-native';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';

export function FeedbackBanner(props: { correct: boolean; explanation: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.banner, props.correct ? styles.success : styles.danger]}>
      <Text style={styles.title}>{props.correct ? 'Correct' : 'Not quite'}</Text>
      <Text style={styles.explanation} numberOfLines={3}>
        {props.explanation}
      </Text>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    banner: {
      borderRadius: t.radius.control,
      padding: t.space.lg,
      gap: t.space.xs,
    },
    success: { backgroundColor: t.colors.successSoft, borderWidth: 1, borderColor: t.colors.success },
    danger: { backgroundColor: t.colors.dangerSoft, borderWidth: 1, borderColor: t.colors.danger },
    title: { ...t.text(t.font.sm), fontWeight: '700', color: t.colors.text },
    explanation: { ...t.text(t.font.sm), color: t.colors.text },
  });
