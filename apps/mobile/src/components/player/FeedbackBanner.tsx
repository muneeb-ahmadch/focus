import { StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, space } from '@/theme/tokens';

export function FeedbackBanner(props: { correct: boolean; explanation: string }) {
  return (
    <View style={[styles.banner, props.correct ? styles.success : styles.danger]}>
      <Text style={styles.title}>{props.correct ? 'Correct' : 'Not quite'}</Text>
      <Text style={styles.explanation} numberOfLines={3}>
        {props.explanation}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: radius.control,
    padding: space.lg,
    gap: space.xs,
  },
  success: { backgroundColor: '#1E9E5A1F', borderWidth: 1, borderColor: colors.success },
  danger: { backgroundColor: '#D938381F', borderWidth: 1, borderColor: colors.danger },
  title: { fontSize: font.sm, fontWeight: '700', color: colors.text },
  explanation: { fontSize: font.sm, color: colors.text },
});
