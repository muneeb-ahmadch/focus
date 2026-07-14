import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { MINI_MOCK_CONFIG, useMockStore } from '@/stores/mockStore';
import { usePlayerStore } from '@/stores/playerStore';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';

export default function MiniMockScreen() {
  const styles = useThemedStyles(makeStyles);
  const phase = useMockStore((s) => s.phase);
  const runConfig = useMockStore((s) => s.runConfig);
  const [unavailable, setUnavailable] = useState(false);
  const startGuardRef = useRef(false);
  const discardGuardRef = useRef(false);

  const live = phase === 'running' || phase === 'submit-confirm';
  // only a mini mock is this screen's session; a live REAL paper must never be
  // resumable-as-mini or discardable from here (QA V10-Q1)
  const inSession = live && runConfig.contentId === 'mini-mock';
  const realMockLive = live && runConfig.attemptType === 'mock';

  // the guard unburns on REFOCUS only (returning from the runner), never on
  // the variant flip itself — an immediate unburn would let a fast double-tap
  // stack a second runner
  useFocusEffect(
    useCallback(() => {
      startGuardRef.current = false;
    }, []),
  );

  const onStart = useCallback(() => {
    if (startGuardRef.current) return;
    startGuardRef.current = true;
    // keep the single-session world consistent: an in-memory lesson/practice
    // session can't survive the attempt sweep the next startAttempt performs
    if (usePlayerStore.getState().active) usePlayerStore.getState().abandon();
    try {
      useMockStore.getState().startMock(MINI_MOCK_CONFIG);
    } catch {
      startGuardRef.current = false;
      setUnavailable(true);
      return;
    }
    router.push('/mock/runner');
  }, []);

  const onResume = useCallback(() => {
    if (startGuardRef.current) return;
    startGuardRef.current = true;
    router.push('/mock/runner');
  }, []);

  const onDiscard = useCallback(() => {
    if (discardGuardRef.current) return;
    discardGuardRef.current = true;
    useMockStore.getState().discard();
    discardGuardRef.current = false;
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={styles.close}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Text style={styles.closeText}>✕</Text>
      </Pressable>

      {realMockLive ? (
        <>
          <View style={styles.body}>
            <Text style={styles.title}>Mock test in progress</Text>
            <Text style={styles.explainer}>
              You have a full mock test in progress. Finish it before starting a mini mock.
            </Text>
          </View>
          <View style={styles.footer}>
            <PrimaryButton title="Resume" onPress={onResume} />
          </View>
        </>
      ) : inSession ? (
        <>
          <View style={styles.body}>
            <Text style={styles.title}>Resume mini mock</Text>
            <Text style={styles.explainer}>
              You left a mini mock in progress. Resume it from where you stopped, or discard it
              and start over.
            </Text>
          </View>
          <View style={styles.footer}>
            <PrimaryButton title="Resume" onPress={onResume} />
            <PrimaryButton title="Discard" variant="secondary" onPress={onDiscard} />
          </View>
        </>
      ) : (
        <>
          <View style={styles.body}>
            <Text style={styles.title}>Mini mock</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaChip}>{MINI_MOCK_CONFIG.blueprint.total} questions</Text>
              <Text style={styles.metaChip}>
                {Math.round(MINI_MOCK_CONFIG.durationMs / 60_000)} minutes
              </Text>
              <Text style={styles.metaChip}>Pass mark {MINI_MOCK_CONFIG.passMark}</Text>
            </View>
            <Text style={styles.explainer}>
              A shorter timed paper drawn from the full question bank. No videos. Nothing is
              revealed until you submit.
            </Text>
            {unavailable ? (
              <Text style={styles.error}>Not enough questions available yet.</Text>
            ) : null}
          </View>
          <View style={styles.footer}>
            <PrimaryButton title="Start mini mock" onPress={onStart} />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
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
    title: { ...t.text(t.font.xxl), fontWeight: '700', color: t.colors.text, textAlign: 'center' },
    metaRow: { flexDirection: 'row', gap: t.space.sm, flexWrap: 'wrap', justifyContent: 'center' },
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
    error: { ...t.text(t.font.sm), color: t.colors.danger, textAlign: 'center' },
    footer: { paddingHorizontal: t.space.xl, paddingBottom: t.space.lg, gap: t.space.md },
  });
