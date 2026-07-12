import { MOCK_PASS_MARK, MOCK_TOTAL } from '@focus/engine';
import { router } from 'expo-router';
import { useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ROUTES } from '@/content';
import { getMockPool } from '@/lib/mockPool';
import { useMockStore } from '@/stores/mockStore';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';

function topMistakeRoute(wrongQuestionIds: string[]): { routeId: string; count: number } | null {
  const { questionById } = getMockPool();
  const counts = new Map<string, number>();
  for (const id of wrongQuestionIds) {
    const routeId = questionById.get(id)?.routeId;
    if (!routeId) continue;
    counts.set(routeId, (counts.get(routeId) ?? 0) + 1);
  }
  let best: { routeId: string; count: number } | null = null;
  for (const [routeId, count] of counts) {
    if (!best || count > best.count) best = { routeId, count };
  }
  return best;
}

export default function MockResultsScreen() {
  const styles = useThemedStyles(makeStyles);
  const phase = useMockStore((s) => s.phase);
  const score = useMockStore((s) => s.score);
  const passed = useMockStore((s) => s.passed);
  const wrongQuestionIds = useMockStore((s) => s.wrongQuestionIds);
  const savedConceptIds = useMockStore((s) => s.savedConceptIds);
  const answers = useMockStore((s) => s.answers);
  const leaveGuardRef = useRef(false);

  if (phase !== 'submitted' && phase !== 'expired') return <View style={styles.screen} />;

  const unanswered = MOCK_TOTAL - Object.keys(answers).length;
  const topRoute = topMistakeRoute(wrongQuestionIds);
  const rebuildRoute =
    topRoute && topRoute.count >= 3 ? ROUTES.find((r) => r.routeId === topRoute.routeId) : undefined;

  const onReviewMistakes = () => router.push('/mock/mistakes');

  const onFixThemNow = () => {
    if (leaveGuardRef.current) return;
    leaveGuardRef.current = true;
    useMockStore.getState().discard();
    router.replace('/review-queue');
  };

  const onRebuildRoute = () => {
    if (leaveGuardRef.current || !rebuildRoute) return;
    leaveGuardRef.current = true;
    useMockStore.getState().discard();
    router.replace(`/route/${rebuildRoute.routeId}`);
  };

  const onDone = () => {
    if (leaveGuardRef.current) return;
    leaveGuardRef.current = true;
    useMockStore.getState().discard();
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{phase === 'expired' ? "Time's up" : 'Mock complete'}</Text>
        {phase === 'expired' ? (
          <Text style={styles.explainer}>Your answers were submitted automatically.</Text>
        ) : null}
        <Text style={styles.score}>
          {score ?? 0} / {MOCK_TOTAL}
        </Text>
        <Text style={styles.passMark}>Pass mark: {MOCK_PASS_MARK}</Text>
        <Text style={passed ? styles.passLine : styles.failLine}>
          {passed ? 'Pass' : 'Below pass mark'}
        </Text>

        {wrongQuestionIds.length > 0 || unanswered > 0 ? (
          <Text style={styles.mistakesLine}>
            {wrongQuestionIds.length} wrong · {unanswered} unanswered
          </Text>
        ) : null}

        {wrongQuestionIds.length > 0 ? (
          <PrimaryButton title="Review mistakes" variant="secondary" onPress={onReviewMistakes} />
        ) : null}

        {savedConceptIds.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardText}>
              {savedConceptIds.length} concept{savedConceptIds.length === 1 ? '' : 's'} added to
              your review queue
            </Text>
            <PrimaryButton title="Fix them now" onPress={onFixThemNow} />
          </View>
        ) : null}

        {rebuildRoute ? (
          <View style={styles.card}>
            <Text style={styles.cardText}>Most of your mistakes came from {rebuildRoute.title}</Text>
            <PrimaryButton title="Rebuild this route" onPress={onRebuildRoute} />
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton title="Done" onPress={onDone} />
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    content: { padding: t.space.xl, gap: t.space.md, alignItems: 'center' },
    title: { ...t.text(t.font.xxl), fontWeight: '700', color: t.colors.text, textAlign: 'center' },
    explainer: { ...t.text(t.font.md), color: t.colors.textMuted, textAlign: 'center' },
    score: { ...t.text(t.font.xxl), fontWeight: '700', color: t.colors.text, marginTop: t.space.sm },
    passMark: { ...t.text(t.font.sm), color: t.colors.textMuted },
    passLine: { ...t.text(t.font.lg), fontWeight: '700', color: t.colors.success },
    failLine: { ...t.text(t.font.lg), fontWeight: '700', color: t.colors.danger },
    mistakesLine: { ...t.text(t.font.sm), color: t.colors.textMuted },
    card: {
      width: '100%',
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.card,
      borderWidth: 1,
      borderColor: t.colors.border,
      padding: t.space.lg,
      gap: t.space.md,
      marginTop: t.space.md,
    },
    cardText: { ...t.text(t.font.md), color: t.colors.text },
    footer: { paddingHorizontal: t.space.xl, paddingBottom: t.space.lg },
  });
