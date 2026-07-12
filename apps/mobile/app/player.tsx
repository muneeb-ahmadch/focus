import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlayerScreen } from '@/components/player/PlayerScreen';
import { PrimaryButton } from '@/components/PrimaryButton';
import { getMission, ROUTES } from '@/content';
import { getDb } from '@/db';
import { getMissionState } from '@/db/repo/missions';
import { usePlayerStore, type ResumePayload } from '@/stores/playerStore';
import { parseResumePayload } from '@/stores/resumePayload';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';

export default function PlayerRoute() {
  const styles = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ mode?: string; missionId?: string }>();
  const active = usePlayerStore((s) => s.active);
  const startMission = usePlayerStore((s) => s.startMission);
  const startDrill = usePlayerStore((s) => s.startDrill);
  const [started, setStarted] = useState(false);

  const isDrill = params.mode === 'drill';
  useEffect(() => {
    if (isDrill) startDrill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const missionId = params.missionId;
  // A mount that names a mission owns the player: a session left active in the
  // store (rehab/drill/other mission abandoned without the exit confirm) must
  // not render under this URL. Abandon it (mission resume is persisted) and
  // fall through to the requested mission's intro.
  const hijacked = usePlayerStore(
    (s) => s.active && !!missionId && !(s.mode === 'mission' && s.missionId === missionId),
  );
  useEffect(() => {
    if (hijacked) usePlayerStore.getState().abandon();
  }, [hijacked]);
  const mission = useMemo(() => (missionId ? getMission(missionId) : undefined), [missionId]);
  const resume = useMemo<ResumePayload | undefined>(() => {
    if (isDrill || !missionId) return undefined;
    const state = getMissionState(getDb(), missionId);
    return state?.status === 'in_progress' ? parseResumePayload(state.resume_payload_json) : undefined;
  }, [isDrill, missionId]);

  if (active && !hijacked) return <PlayerScreen />;

  if (!isDrill && !mission) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.body}>
          <Text style={styles.title}>Mission not found</Text>
          <Text style={styles.explainer}>
            This mission isn&apos;t available. It may have been removed or the link is out of
            date.
          </Text>
        </View>
        <View style={styles.footer}>
          <PrimaryButton title="Go back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  if (isDrill || started || !mission) return <View style={styles.blank} />;

  const routeTitle = ROUTES.find((r) => r.routeId === mission.routeId)?.title ?? '';
  const teachSteps = mission.steps.filter((s) => s.type !== 'checkpoint');
  const conceptCount = new Set(teachSteps.map((s) => s.conceptId)).size;

  const begin = (payload?: ResumePayload) => {
    setStarted(true);
    startMission(mission.missionId, payload);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={styles.close}
        accessibilityLabel="Close"
      >
        <Text style={styles.closeText}>✕</Text>
      </Pressable>
      <View style={styles.body}>
        <Text style={styles.routeLabel}>{routeTitle}</Text>
        <Text style={styles.title}>{mission.title}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaChip}>~{mission.estimatedMinutes} min</Text>
          <Text style={styles.metaChip}>
            {teachSteps.length} card{teachSteps.length === 1 ? '' : 's'}
          </Text>
          <Text style={styles.metaChip}>
            {conceptCount} concept{conceptCount === 1 ? '' : 's'}
          </Text>
        </View>
        <Text style={styles.explainer}>
          {resume
            ? 'You left part-way through — pick up right where you stopped.'
            : 'Work through the cards, then pass a 5-question checkpoint to complete the mission.'}
        </Text>
      </View>
      <View style={styles.footer}>
        {resume ? (
          <>
            <PrimaryButton title="Resume mission" onPress={() => begin(resume)} />
            <PrimaryButton title="Start over" variant="secondary" onPress={() => begin()} />
          </>
        ) : (
          <PrimaryButton title="Start mission" onPress={() => begin()} />
        )}
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    blank: { flex: 1, backgroundColor: t.colors.bg },
    screen: { flex: 1, backgroundColor: t.colors.bg },
    close: {
      alignSelf: 'flex-start',
      paddingHorizontal: t.space.lg,
      paddingVertical: t.space.md,
    },
    closeText: { ...t.text(t.font.lg), color: t.colors.textMuted },
    body: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: t.space.xl,
      gap: t.space.md,
    },
    routeLabel: { ...t.text(t.font.sm), fontWeight: '600', color: t.colors.accent },
    title: { ...t.text(t.font.xxl), fontWeight: '700', color: t.colors.text, textAlign: 'center' },
    metaRow: { flexDirection: 'row', gap: t.space.sm, marginTop: t.space.xs },
    metaChip: {
      ...t.text(t.font.xs),
      color: t.colors.textMuted,
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.pill,
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.xs,
      overflow: 'hidden',
    },
    explainer: {
      ...t.text(t.font.md),
      color: t.colors.textMuted,
      textAlign: 'center',
      lineHeight: 24,
      marginTop: t.space.sm,
    },
    footer: { paddingHorizontal: t.space.xl, paddingBottom: t.space.lg, gap: t.space.md },
  });
