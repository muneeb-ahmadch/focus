import { mockRemainingMs } from '@focus/engine';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { now } from '@/lib/clock';
import { getMockPool } from '@/lib/mockPool';
import { useMockStore } from '@/stores/mockStore';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';

function formatCountdown(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  const seconds = String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export default function MockRunnerScreen() {
  const styles = useThemedStyles(makeStyles);
  const phase = useMockStore((s) => s.phase);
  const paper = useMockStore((s) => s.paper);
  const startedAt = useMockStore((s) => s.startedAt);
  const index = useMockStore((s) => s.index);
  const answers = useMockStore((s) => s.answers);
  const flags = useMockStore((s) => s.flags);
  const runConfig = useMockStore((s) => s.runConfig);
  const [, forceTick] = useState(0);
  const resultsNavGuardRef = useRef(false);

  useEffect(() => {
    if (phase !== 'running' && phase !== 'submit-confirm') return;
    const id = setInterval(() => {
      useMockStore.getState().tick();
      forceTick((n) => n + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'expired' && phase !== 'submitted') return;
    if (resultsNavGuardRef.current) return;
    resultsNavGuardRef.current = true;
    router.replace('/mock/results');
  }, [phase]);

  if (phase === 'idle') return <View style={styles.screen} />;

  if (phase === 'expired' || phase === 'submitted') return <View style={styles.screen} />;

  if (!paper) return <View style={styles.screen} />;

  const { questionById } = getMockPool();
  const questionId = paper.questionIds[index]!;
  const question = questionById.get(questionId)!;
  const remaining = mockRemainingMs(startedAt, now().getTime(), runConfig.durationMs);
  const flagged = flags.includes(questionId);
  const answeredCount = paper.questionIds.filter((id) => answers[id] !== undefined).length;
  const unansweredCount = paper.questionIds.length - answeredCount;
  const isFirst = index === 0;
  const isLast = index === paper.questionIds.length - 1;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.countdown}>{formatCountdown(remaining)}</Text>
        <Text style={styles.progress}>
          Question {index + 1} of {paper.questionIds.length}
        </Text>
        <Pressable
          onPress={() => useMockStore.getState().toggleFlag(questionId)}
          accessibilityRole="button"
          accessibilityLabel="Flag question"
          accessibilityState={{ selected: flagged }}
          style={[styles.headerButton, flagged && styles.headerButtonActive]}
        >
          <Text style={[styles.headerButtonText, flagged && styles.headerButtonTextActive]}>
            {flagged ? 'Flagged' : 'Flag'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/mock/review')}
          accessibilityRole="button"
          accessibilityLabel="Review"
          style={styles.headerButton}
        >
          <Text style={styles.headerButtonText}>Review</Text>
        </Pressable>
        <Pressable
          onPress={() => useMockStore.getState().requestSubmit()}
          accessibilityRole="button"
          accessibilityLabel="Finish"
          style={styles.headerButton}
        >
          <Text style={styles.headerButtonText}>Finish</Text>
        </Pressable>
      </View>

      {phase === 'submit-confirm' ? (
        <View style={styles.body}>
          <Text style={styles.confirmLine}>
            {unansweredCount === 0 ? 'All answered' : `${unansweredCount} unanswered`}
          </Text>
          <PrimaryButton title="Submit" onPress={() => useMockStore.getState().confirmSubmit()} />
          <PrimaryButton
            title="Go back"
            variant="secondary"
            onPress={() => useMockStore.getState().cancelSubmit()}
          />
        </View>
      ) : (
        <>
          <View style={styles.body}>
            {paper.videoQuestionIds.includes(questionId) ? (
              <View style={styles.videoFrame}>
                <Text style={styles.videoText}>Silent video clip — placeholder</Text>
              </View>
            ) : null}
            <Text style={styles.prompt}>{question.prompt}</Text>
            <View style={styles.options}>
              {question.options.map((option) => {
                const selected = answers[questionId] === option.id;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => useMockStore.getState().answer(questionId, option.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    aria-selected={selected}
                    style={[styles.option, selected && styles.optionSelected]}
                  >
                    <Text style={styles.optionText}>{option.text}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={styles.footer}>
            <View style={styles.navRow}>
              <Pressable
                onPress={() => !isFirst && useMockStore.getState().goTo(index - 1)}
                disabled={isFirst}
                accessibilityRole="button"
                accessibilityLabel="Previous"
                accessibilityState={{ disabled: isFirst }}
                style={[styles.navButton, isFirst && styles.navButtonDisabled]}
              >
                <Text style={styles.navButtonText}>Previous</Text>
              </Pressable>
              <Pressable
                onPress={() => !isLast && useMockStore.getState().goTo(index + 1)}
                disabled={isLast}
                accessibilityRole="button"
                accessibilityLabel="Next"
                accessibilityState={{ disabled: isLast }}
                style={[styles.navButton, isLast && styles.navButtonDisabled]}
              >
                <Text style={styles.navButtonText}>Next</Text>
              </Pressable>
            </View>
          </View>
        </>
      )}
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
    countdown: {
      ...t.text(t.font.md),
      color: t.colors.text,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    progress: { ...t.text(t.font.xs), color: t.colors.textMuted, flex: 1 },
    headerButton: {
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.control,
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.xs,
    },
    headerButtonActive: { backgroundColor: t.colors.accentSoft, borderColor: t.colors.accent },
    headerButtonText: { ...t.text(t.font.xs), color: t.colors.text, fontWeight: '600' },
    headerButtonTextActive: { color: t.colors.accent },
    body: { flex: 1, padding: t.space.lg, gap: t.space.lg },
    videoFrame: {
      aspectRatio: 16 / 9,
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.card,
      borderWidth: 1,
      borderColor: t.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    videoText: { ...t.text(t.font.sm), color: t.colors.textMuted },
    prompt: { ...t.text(t.font.lg), color: t.colors.text, fontWeight: '600' },
    options: { gap: t.space.sm },
    option: {
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.control,
      padding: t.space.md,
    },
    optionSelected: { borderColor: t.colors.accent, backgroundColor: t.colors.accentSoft },
    optionText: { ...t.text(t.font.md), color: t.colors.text },
    footer: { paddingHorizontal: t.space.lg, paddingBottom: t.space.lg, gap: t.space.md },
    navRow: { flexDirection: 'row', gap: t.space.md },
    navButton: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.control,
      paddingVertical: t.space.md,
    },
    navButtonDisabled: { opacity: 0.4 },
    navButtonText: { ...t.text(t.font.md), color: t.colors.text, fontWeight: '600' },
    confirmLine: { ...t.text(t.font.lg), color: t.colors.text, textAlign: 'center' },
  });
