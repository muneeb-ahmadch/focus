import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useMockStore } from '@/stores/mockStore';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';

export default function MockReviewGridScreen() {
  const styles = useThemedStyles(makeStyles);
  const phase = useMockStore((s) => s.phase);
  const paper = useMockStore((s) => s.paper);
  const answers = useMockStore((s) => s.answers);
  const flags = useMockStore((s) => s.flags);

  if (phase !== 'running' || !paper) return <View style={styles.screen} />;

  const onCellPress = (i: number) => {
    useMockStore.getState().goTo(i);
    router.back();
  };

  const onFinish = () => {
    useMockStore.getState().requestSubmit();
    router.back();
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.grid}>
        {paper.questionIds.map((id, i) => {
          const answered = answers[id] !== undefined;
          const flagged = flags.includes(id);
          const label = flagged
            ? `Question ${i + 1}, flagged, ${answered ? 'answered' : 'unanswered'}`
            : `Question ${i + 1}, ${answered ? 'answered' : 'unanswered'}`;
          return (
            <Pressable
              key={id}
              onPress={() => onCellPress(i)}
              accessibilityRole="button"
              accessibilityLabel={label}
              style={[styles.cell, answered && styles.cellAnswered, flagged && styles.cellFlagged]}
            >
              <Text style={[styles.cellText, answered && styles.cellTextAnswered]}>{i + 1}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.footer}>
        <PrimaryButton title="Finish" onPress={onFinish} />
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    grid: {
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: t.space.sm,
      padding: t.space.lg,
      alignContent: 'flex-start',
    },
    cell: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.lockedBg,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.control,
    },
    cellAnswered: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
    cellFlagged: { borderColor: t.colors.warning, borderWidth: 2 },
    cellText: { ...t.text(t.font.sm), color: t.colors.textMuted, fontWeight: '600' },
    cellTextAnswered: { color: t.colors.onAccent },
    footer: { paddingHorizontal: t.space.xl, paddingBottom: t.space.lg },
  });
