import { MOCK_DURATION_MS, MOCK_PASS_MARK, MOCK_TOTAL, MOCK_VIDEO_COUNT } from '@focus/engine';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { peekDanglingMock, useMockStore } from '@/stores/mockStore';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';

export default function MockStartScreen() {
  const styles = useThemedStyles(makeStyles);
  const [recheck, setRecheck] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const guardRef = useRef(false);

  const dangling = useMemo(() => {
    void recheck;
    return peekDanglingMock();
  }, [recheck]);

  const onStart = useCallback(() => {
    if (guardRef.current) return;
    guardRef.current = true;
    try {
      useMockStore.getState().startMock();
    } catch {
      guardRef.current = false;
      setUnavailable(true);
      return;
    }
    router.push('/mock/runner');
  }, []);

  const onResume = useCallback(() => {
    if (guardRef.current) return;
    guardRef.current = true;
    useMockStore.getState().resumeMock();
    router.push('/mock/runner');
  }, []);

  const onDiscard = useCallback(() => {
    useMockStore.getState().resumeMock();
    useMockStore.getState().discard();
    setRecheck((n) => n + 1);
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

      {dangling === 'live' ? (
        <>
          <View style={styles.body}>
            <Text style={styles.title}>Resume mock test</Text>
            <Text style={styles.explainer}>
              You left a mock test in progress. Resume it from where you stopped, or discard it
              and start over.
            </Text>
          </View>
          <View style={styles.footer}>
            <PrimaryButton title="Resume" onPress={onResume} />
            <PrimaryButton title="Discard" variant="secondary" onPress={onDiscard} />
          </View>
        </>
      ) : dangling === 'expired' ? (
        <>
          <View style={styles.body}>
            <Text style={styles.title}>Time ran out</Text>
            <Text style={styles.explainer}>
              Your mock test reached the 57-minute limit while you were away. The answers you
              gave were submitted automatically.
            </Text>
          </View>
          <View style={styles.footer}>
            <PrimaryButton title="View result" onPress={onResume} />
          </View>
        </>
      ) : (
        <>
          <View style={styles.body}>
            <Text style={styles.title}>Mock test</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaChip}>{MOCK_TOTAL} questions</Text>
              <Text style={styles.metaChip}>{MOCK_DURATION_MS / 60_000} minutes</Text>
              <Text style={styles.metaChip}>Pass mark {MOCK_PASS_MARK}</Text>
            </View>
            <Text style={styles.explainer}>
              Includes {MOCK_VIDEO_COUNT} silent video questions. Answer every question in one
              sitting — nothing is revealed until you submit.
            </Text>
            {unavailable ? (
              <Text style={styles.error}>Not enough questions available yet.</Text>
            ) : null}
          </View>
          <View style={styles.footer}>
            <PrimaryButton title="Start mock" onPress={onStart} />
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
