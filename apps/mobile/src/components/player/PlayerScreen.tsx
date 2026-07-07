import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { getDb } from '@/db';
import { getProfile } from '@/db/repo/profile';
import { speak, stopSpeech } from '@/lib/speech';
import { usePlayerStore, type PlayerCard } from '@/stores/playerStore';
import { colors, font, radius, space } from '@/theme/tokens';
import { ConfidenceFooter } from './ConfidenceFooter';
import { FeedbackBanner } from './FeedbackBanner';
import { PlayerProgressBar } from './PlayerProgressBar';
import { StepRenderer } from './StepRenderer';

function promptText(card: PlayerCard): string {
  if (card.kind !== 'step') return card.question.prompt;
  const step = card.step;
  switch (step.type) {
    case 'rule_card':
      return `${step.title}. ${step.body}. ${step.question.prompt}`;
    case 'scene_decision':
    case 'hazard_cue':
      return `${step.scene}. ${step.question.prompt}`;
    case 'sign_meaning':
      return step.question.prompt;
    case 'contrast':
      return `${step.a.label}: ${step.a.body}. ${step.b.label}: ${step.b.body}. ${step.question.prompt}`;
    case 'sequence':
      return step.prompt;
    case 'misconception':
      return `Some people think: ${step.wrongBelief}. ${step.question.prompt}`;
    case 'checkpoint':
      return '';
  }
}

function explanationFor(card: PlayerCard): string {
  if (card.kind !== 'step') return card.question.explanation;
  const step = card.step;
  if (step.type === 'sequence') return step.explanation;
  if (step.type === 'checkpoint') return '';
  return step.question.explanation;
}

export function PlayerScreen() {
  const store = usePlayerStore();
  const card = store.queue[store.index];
  const autoPlay = useMemo(() => (getProfile(getDb())?.auto_play_audio ?? 1) === 1, []);
  const [confirmExit, setConfirmExit] = useState(false);

  useEffect(() => {
    if (store.phase === 'card' && card && autoPlay) speak(promptText(card));
  }, [card, store.phase === 'card', autoPlay]);

  useEffect(() => () => stopSpeech(), []);

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
        <PrimaryButton title="Done" onPress={() => router.replace('/(tabs)')} />
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
        <PrimaryButton title="Back to Home" onPress={() => router.replace('/(tabs)')} />
      </View>
    );
  } else if (card) {
    content = (
      <View style={styles.cardArea}>
        <StepRenderer
          card={card}
          heading={heading}
          answered={store.phase === 'feedback'}
          selectedId={store.lastAnswer?.optionId}
          onAnswer={onAnswer}
        />
        {store.phase === 'feedback' && store.lastAnswer ? (
          <View style={styles.feedbackArea}>
            <FeedbackBanner correct={store.lastAnswer.correct} explanation={explanationFor(card)} />
            {store.lastAnswer.correct ? (
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
              {store.mode === 'mission' ? 'Leave mission?' : 'Leave review?'}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  close: { padding: space.xs },
  closeText: { fontSize: font.lg, color: colors.textMuted },
  cardArea: { flex: 1, paddingHorizontal: space.lg, gap: space.lg },
  feedbackArea: { marginTop: 'auto', gap: space.md, paddingBottom: space.lg },
  interstitial: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    gap: space.lg,
  },
  interTitle: { fontSize: font.xl, fontWeight: '700', color: colors.text, textAlign: 'center' },
  interBody: { fontSize: font.md, color: colors.textMuted, textAlign: 'center' },
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: space.xl,
  },
  confirmCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space.xl,
    gap: space.md,
  },
  confirmTitle: { fontSize: font.lg, fontWeight: '700', color: colors.text, textAlign: 'center' },
  confirmBody: { fontSize: font.md, color: colors.textMuted, textAlign: 'center' },
});
