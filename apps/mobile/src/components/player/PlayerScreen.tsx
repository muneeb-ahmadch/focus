import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { cardNarration } from '@/lib/narration';
import { speak, stopSpeech } from '@/lib/speech';
import { useSettingsStore } from '@/stores/settingsStore';
import { usePlayerStore, type PlayerCard } from '@/stores/playerStore';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';
import { ConfidenceFooter } from './ConfidenceFooter';
import { FeedbackBanner } from './FeedbackBanner';
import { PlayerProgressBar } from './PlayerProgressBar';
import { StepRenderer } from './StepRenderer';

function explanationFor(card: PlayerCard): string {
  if (card.kind !== 'step') return card.question.explanation;
  const step = card.step;
  if (step.type === 'sequence') return step.explanation;
  if (step.type === 'checkpoint') return '';
  return step.question.explanation;
}

export function PlayerScreen() {
  const styles = useThemedStyles(makeStyles);
  const store = usePlayerStore();
  const card = store.queue[store.index];
  const autoPlay = useSettingsStore((s) => s.autoPlayAudio);
  const [confirmExit, setConfirmExit] = useState(false);

  const isCardPhase = store.phase === 'card';
  useEffect(() => {
    if (isCardPhase && card && autoPlay) speak(cardNarration(card));
  }, [isCardPhase, card, autoPlay]);

  useEffect(() => {
    if (!autoPlay) stopSpeech();
  }, [autoPlay]);

  useEffect(() => () => stopSpeech(), []);

  const interstitialActionRef = useRef(false);
  useEffect(() => {
    interstitialActionRef.current = false;
  }, [store.phase]);

  const onDismissDone = () => {
    if (interstitialActionRef.current) return;
    interstitialActionRef.current = true;
    store.dismiss();
    router.replace('/(tabs)');
  };

  const onFixNow = () => {
    if (interstitialActionRef.current) return;
    interstitialActionRef.current = true;
    store.startDrill(store.missedConcepts);
  };

  const onExit = () => {
    stopSpeech();
    setConfirmExit(true);
  };

  const onLeave = () => {
    setConfirmExit(false);
    store.abandon();
    router.back();
  };

  const onAnswer = (input: string | string[]) => {
    stopSpeech();
    store.answer(input);
  };

  const repairConceptCount = new Set(
    store.queue.filter((c) => c.kind === 'step').map((c) => c.conceptId),
  ).size;

  const checkpointTotal = store.queue.filter((c) => c.kind === 'checkpoint-q').length;
  const checkpointPosition =
    card?.kind === 'checkpoint-q'
      ? store.queue.slice(0, store.index + 1).filter((c) => c.kind === 'checkpoint-q').length
      : 0;
  const heading =
    card?.kind === 'drill-q'
      ? 'Review'
      : store.inRepair
        ? 'Repair quiz'
        : `Checkpoint · Question ${checkpointPosition} of ${checkpointTotal}`;

  let content = null;
  if (store.phase === 'checkpoint-intro') {
    content = (
      <View style={styles.interstitial}>
        <Text style={styles.interTitle}>Checkpoint</Text>
        <Text style={styles.interBody}>
          5 questions on what you just learned. Get 4 right to pass.
        </Text>
        <PrimaryButton title="Start checkpoint" onPress={store.advance} />
      </View>
    );
  } else if (store.phase === 'repair-intro') {
    content = (
      <View style={styles.interstitial}>
        <Text style={styles.interTitle}>
          Let&apos;s fix {repairConceptCount} thing{repairConceptCount === 1 ? '' : 's'}
        </Text>
        <Text style={styles.interBody}>
          A quick look back at what tripped you up, then we&apos;ll try those questions again.
        </Text>
        <PrimaryButton title="Continue" onPress={store.advance} />
      </View>
    );
  } else if (store.phase === 'drill-summary') {
    content = (
      <View style={styles.interstitial}>
        <Text style={styles.interTitle}>Reviews cleared</Text>
        <Text style={styles.interBody}>
          {store.drillCorrect}/{store.queue.length} correct
        </Text>
        <PrimaryButton title="Done" onPress={onDismissDone} />
      </View>
    );
  } else if (store.phase === 'practice-summary') {
    content = (
      <View style={styles.interstitial}>
        <Text style={styles.interTitle}>Session complete</Text>
        <Text style={styles.interBody}>
          {store.drillCorrect}/{store.queue.length} correct
        </Text>
        {store.missedConcepts.length > 0 ? (
          <Text style={styles.interMuted}>
            {store.missedConcepts.length} added to your review queue
          </Text>
        ) : null}
        <PrimaryButton title="Done" onPress={onDismissDone} />
      </View>
    );
  } else if (store.phase === 'rehab-summary') {
    content = (
      <View style={styles.interstitial}>
        <Text style={styles.interTitle}>
          {store.rehabCleared ? 'Out of your review queue' : 'Keep at it'}
        </Text>
        <Text style={styles.interBody}>
          {store.rehabCleared
            ? "You fixed this one with confidence. It's gone from your reviews."
            : 'Not quite locked in yet — this one stays in your queue for tomorrow.'}
        </Text>
        <PrimaryButton title="Done" onPress={onDismissDone} />
      </View>
    );
  } else if (store.phase === 'failed') {
    content = (
      <View style={styles.interstitial}>
        <Text style={styles.interTitle}>Not this time</Text>
        <Text style={styles.interBody}>
          Those concepts are in your review queue now — clear them tomorrow and this mission will
          feel easy. You can replay it any time.
        </Text>
        <PrimaryButton title="Fix these now" onPress={onFixNow} />
        <PrimaryButton title="Back to Home" variant="secondary" onPress={onDismissDone} />
      </View>
    );
  } else if (card) {
    const showHint =
      store.phase === 'card' &&
      store.mode === 'mission' &&
      card.kind === 'step' &&
      card.step.type !== 'sequence' &&
      card.step.type !== 'checkpoint';
    content = (
      <View style={styles.cardArea}>
        <StepRenderer
          key={`${store.index}:${card.stepId}`}
          card={card}
          heading={heading}
          answered={store.phase === 'feedback'}
          selectedId={store.lastAnswer?.optionId}
          hintOptionId={store.hintOptionId}
          onAnswer={onAnswer}
        />
        {showHint ? (
          <Pressable
            onPress={store.useHint}
            accessibilityRole="button"
            accessibilityLabel="Show a hint"
            style={styles.hintButton}
          >
            <Text style={styles.hintText}>Hint</Text>
          </Pressable>
        ) : null}
        {store.phase === 'feedback' && store.lastAnswer ? (
          <View style={styles.feedbackArea}>
            <FeedbackBanner correct={store.lastAnswer.correct} explanation={explanationFor(card)} />
            {store.lastAnswer.correct && store.mode !== 'practice' ? (
              <ConfidenceFooter mode={store.mode} onSelect={store.confirmConfidence} />
            ) : (
              <PrimaryButton title="Continue" onPress={store.advance} />
            )}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={onExit} hitSlop={12} style={styles.close}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
        <PlayerProgressBar
          progress={store.queue.length === 0 ? 0 : store.index / store.queue.length}
        />
      </View>
      {content}
      {confirmExit ? (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>
              {store.mode === 'mission'
                ? 'Leave mission?'
                : store.mode === 'practice'
                  ? 'Leave practice?'
                  : 'Leave review?'}
            </Text>
            {store.mode === 'mission' ? (
              <Text style={styles.confirmBody}>
                Your progress is saved — you can resume later.
              </Text>
            ) : null}
            <PrimaryButton title="Keep going" onPress={() => setConfirmExit(false)} />
            <PrimaryButton title="Leave" variant="danger" onPress={onLeave} />
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.md,
      paddingHorizontal: t.space.lg,
      paddingVertical: t.space.md,
    },
    close: { padding: t.space.xs },
    closeText: { ...t.text(t.font.lg), color: t.colors.textMuted },
    cardArea: { flex: 1, paddingHorizontal: t.space.lg, gap: t.space.lg },
    hintButton: { alignSelf: 'flex-start', paddingVertical: t.space.xs },
    hintText: { ...t.text(t.font.sm), color: t.colors.accent, fontWeight: '600' },
    feedbackArea: { marginTop: 'auto', gap: t.space.md, paddingBottom: t.space.lg },
    interstitial: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: t.space.xl,
      gap: t.space.lg,
    },
    interTitle: {
      ...t.text(t.font.xl),
      fontWeight: '700',
      color: t.colors.text,
      textAlign: 'center',
    },
    interBody: { ...t.text(t.font.md), color: t.colors.textMuted, textAlign: 'center' },
    interMuted: { ...t.text(t.font.sm), color: t.colors.textMuted, textAlign: 'center' },
    confirmOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: t.colors.overlay,
      justifyContent: 'center',
      padding: t.space.xl,
    },
    confirmCard: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.card,
      padding: t.space.xl,
      gap: t.space.md,
    },
    confirmTitle: {
      ...t.text(t.font.lg),
      fontWeight: '700',
      color: t.colors.text,
      textAlign: 'center',
    },
    confirmBody: { ...t.text(t.font.md), color: t.colors.textMuted, textAlign: 'center' },
  });
