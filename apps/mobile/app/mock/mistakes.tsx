import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMockPool } from '@/lib/mockPool';
import { useMockStore } from '@/stores/mockStore';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';

export default function MistakeReviewScreen() {
  const styles = useThemedStyles(makeStyles);
  const wrongQuestionIds = useMockStore((s) => s.wrongQuestionIds);
  const answers = useMockStore((s) => s.answers);
  const { questionById } = getMockPool();

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Mistakes</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {wrongQuestionIds.map((id) => {
          const question = questionById.get(id);
          if (!question) return null;
          const chosen = question.options.find((o) => o.id === answers[id]);
          const correctOption = question.options.find((o) => o.correct);
          return (
            <View key={id} style={styles.item}>
              <Text style={styles.prompt}>{question.prompt}</Text>
              <View style={styles.answerBlock}>
                <Text style={styles.answerLabel}>Your answer</Text>
                <Text style={styles.wrongAnswer}>{chosen?.text ?? chosen?.altText ?? '—'}</Text>
              </View>
              <View style={styles.answerBlock}>
                <Text style={styles.answerLabel}>Correct answer</Text>
                <Text style={styles.rightAnswer}>
                  {correctOption?.text ?? correctOption?.altText ?? '—'}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.sm,
      paddingHorizontal: t.space.lg,
      paddingVertical: t.space.md,
      borderBottomWidth: 1,
      borderBottomColor: t.colors.border,
    },
    backButton: { paddingVertical: t.space.xs, paddingRight: t.space.sm },
    backText: { ...t.text(t.font.md), color: t.colors.accent, fontWeight: '600' },
    headerTitle: { ...t.text(t.font.md), color: t.colors.text, fontWeight: '700' },
    content: { padding: t.space.lg, gap: t.space.lg },
    item: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.card,
      borderWidth: 1,
      borderColor: t.colors.border,
      padding: t.space.lg,
      gap: t.space.md,
    },
    prompt: { ...t.text(t.font.md), color: t.colors.text, fontWeight: '600' },
    answerBlock: { gap: t.space.xs },
    answerLabel: { ...t.text(t.font.xs), color: t.colors.textMuted, fontWeight: '600' },
    wrongAnswer: {
      ...t.text(t.font.sm),
      color: t.colors.danger,
      borderWidth: 1,
      borderColor: t.colors.danger,
      borderRadius: t.radius.control,
      padding: t.space.sm,
    },
    rightAnswer: {
      ...t.text(t.font.sm),
      color: t.colors.success,
      borderWidth: 1,
      borderColor: t.colors.success,
      borderRadius: t.radius.control,
      padding: t.space.sm,
    },
  });
