import { buildPracticeSet, filterPracticePool, PRACTICE_MIN_POOL, type PracticeFilter } from '@focus/engine';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { PoolUnavailable } from '@/components/practice/PoolUnavailable';
import { getRouteManifest, ROUTES } from '@/content';
import { getDb } from '@/db';
import { getPracticePool, getPracticeTopics, getWeakConceptIds } from '@/lib/practicePool';
import { usePlayerStore } from '@/stores/playerStore';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';

type Kind = 'topic' | 'route' | 'weak';
const LENGTH_OPTIONS = [10, 20];

export default function PracticeConfigScreen() {
  const styles = useThemedStyles(makeStyles);
  const { kind: kindParam } = useLocalSearchParams<{ kind: string }>();
  const kind: Kind = kindParam === 'route' || kindParam === 'weak' ? kindParam : 'topic';

  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [length, setLength] = useState(10);
  const [unavailable, setUnavailable] = useState(false);
  const startGuardRef = useRef(false);

  // backing out of a started session returns to this same mounted instance —
  // the one-shot guard must unburn on refocus (V9-D1's class)
  useFocusEffect(
    useCallback(() => {
      startGuardRef.current = false;
    }, []),
  );

  const pool = useMemo(() => getPracticePool(), []);
  const topics = useMemo(() => getPracticeTopics(), []);
  const routeChoices = useMemo(
    () =>
      getRouteManifest()
        .filter(
          (r) =>
            r.totalMissions > 0 &&
            // never offer a route whose pool can't build a session (topic
            // picker already hides thin topics — same rule here)
            pool.filter((q) => q.routeId === r.routeId).length >= PRACTICE_MIN_POOL,
        )
        .map((r) => ({ routeId: r.routeId, title: ROUTES.find((x) => x.routeId === r.routeId)!.title })),
    [pool],
  );
  const weakConceptIds = useMemo(() => (kind === 'weak' ? getWeakConceptIds(getDb()) : []), [kind]);

  if (kind === 'weak' && weakConceptIds.length === 0) {
    return <PoolUnavailable variant="weak-empty" />;
  }

  const weakFiltered =
    kind === 'weak'
      ? filterPracticePool(pool, { kind: 'weak', conceptIds: weakConceptIds })
      : [];
  if (kind === 'weak' && weakFiltered.length < PRACTICE_MIN_POOL) {
    return <PoolUnavailable variant="thin" />;
  }

  if (unavailable) {
    return <PoolUnavailable variant="thin" />;
  }

  const filter: PracticeFilter | null =
    kind === 'topic'
      ? selectedTopic
        ? { kind: 'topic', topic: selectedTopic }
        : null
      : kind === 'route'
        ? selectedRouteId
          ? { kind: 'route', routeId: selectedRouteId }
          : null
        : { kind: 'weak', conceptIds: weakConceptIds };

  const contentLabel =
    kind === 'topic' ? `topic:${selectedTopic}` : kind === 'route' ? `route:${selectedRouteId}` : 'weak';

  const onStart = () => {
    if (startGuardRef.current || !filter) return;
    startGuardRef.current = true;
    const ids = buildPracticeSet(pool, filter, length, Math.random);
    if (!ids) {
      startGuardRef.current = false;
      setUnavailable(true);
      return;
    }
    usePlayerStore.getState().startPractice(ids, contentLabel);
    router.push('/player');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {kind === 'topic' ? (
          <>
            <Text style={styles.section}>Topic</Text>
            <View style={styles.chips}>
              {topics.map((t) => {
                const active = selectedTopic === t.topic;
                return (
                  <Pressable
                    key={t.topic}
                    onPress={() => setSelectedTopic(t.topic)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    aria-checked={active}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.label}</Text>
                    <Text style={[styles.chipSubtext, active && styles.chipTextActive]}>
                      {t.count} available
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {kind === 'route' ? (
          <>
            <Text style={styles.section}>Route</Text>
            <View style={styles.chips}>
              {routeChoices.map((r) => {
                const active = selectedRouteId === r.routeId;
                return (
                  <Pressable
                    key={r.routeId}
                    onPress={() => setSelectedRouteId(r.routeId)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    aria-checked={active}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{r.title}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {kind === 'weak' ? (
          <Text style={styles.section}>
            {weakConceptIds.length === 1
              ? '1 concept needs work'
              : `${weakConceptIds.length} concepts need work`}
          </Text>
        ) : null}

        <Text style={styles.section}>Length</Text>
        <View style={styles.chips}>
          {LENGTH_OPTIONS.map((option) => (
            <Pressable
              key={option}
              onPress={() => setLength(option)}
              accessibilityRole="button"
              accessibilityState={{ selected: length === option }}
              aria-checked={length === option}
              style={[styles.chip, length === option && styles.chipActive]}
            >
              <Text style={[styles.chipText, length === option && styles.chipTextActive]}>
                {option} questions
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton title="Start" onPress={onStart} />
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    content: { padding: t.space.lg, gap: t.space.md },
    section: { ...t.text(t.font.sm), fontWeight: '600', color: t.colors.text },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
    chip: {
      borderRadius: t.radius.pill,
      borderWidth: 1,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surface,
      paddingVertical: t.space.sm,
      paddingHorizontal: t.space.lg,
      gap: 2,
    },
    chipActive: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
    chipText: { ...t.text(t.font.sm), color: t.colors.text },
    chipSubtext: { ...t.text(t.font.xs), color: t.colors.textMuted },
    chipTextActive: { color: t.colors.onAccent, fontWeight: '600' },
    footer: { padding: t.space.lg },
  });
