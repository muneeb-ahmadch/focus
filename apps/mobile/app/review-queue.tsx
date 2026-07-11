import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { conceptLabel } from '@/content';
import { getDb } from '@/db';
import { getDue, snoozeItem, type ReviewOrigin } from '@/db/repo/reviews';
import { todayLocal } from '@/lib/clock';
import { queryClient } from '@/lib/queryClient';
import { usePlayerStore } from '@/stores/playerStore';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';

const ORIGIN_LABEL: Record<ReviewOrigin, string> = {
  wrong: 'Got it wrong',
  unsure: 'Felt unsure',
  slow: 'Slow to answer',
  hint_heavy: 'Needed a hint',
};

export default function ReviewQueueScreen() {
  const styles = useThemedStyles(makeStyles);
  const navGuardRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      navGuardRef.current = false;
    }, []),
  );
  const { data } = useQuery({
    queryKey: ['review-queue'],
    queryFn: () => getDue(getDb(), todayLocal()),
  });

  if (!data) return <View style={styles.screen} />;

  const guardedNav = (fn: () => void) => {
    if (navGuardRef.current) return;
    navGuardRef.current = true;
    fn();
  };

  const onFixNow = (conceptId: string) =>
    guardedNav(() => {
      usePlayerStore.getState().startRehab(conceptId);
      router.push('/player');
    });

  const onClearAll = () =>
    guardedNav(() => {
      usePlayerStore.getState().startDrill();
      router.push('/player');
    });

  const onSnooze = (conceptId: string) => {
    snoozeItem(getDb(), conceptId, todayLocal());
    void queryClient.invalidateQueries({ queryKey: ['review-queue'] });
  };

  return (
    <View style={styles.screen}>
      {data.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>All caught up</Text>
          <Text style={styles.emptyBody}>Nothing due for review right now.</Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            {data.map((item) => (
              <View key={item.concept_id} style={styles.row}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowLabel}>{conceptLabel(item.concept_id)}</Text>
                  <Text style={styles.rowOrigin}>{ORIGIN_LABEL[item.origin_type]}</Text>
                </View>
                <View style={styles.rowActions}>
                  <PrimaryButton title="Fix now" onPress={() => onFixNow(item.concept_id)} />
                  <PrimaryButton
                    title="Snooze 3 days"
                    variant="secondary"
                    onPress={() => onSnooze(item.concept_id)}
                  />
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={styles.footer}>
            <PrimaryButton title={`Clear all ${data.length}`} onPress={onClearAll} />
          </View>
        </>
      )}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    content: { padding: t.space.lg, gap: t.space.md },
    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: t.space.sm,
      padding: t.space.xl,
    },
    emptyTitle: { ...t.text(t.font.lg), fontWeight: '700', color: t.colors.text },
    emptyBody: { ...t.text(t.font.sm), color: t.colors.textMuted, textAlign: 'center' },
    row: {
      backgroundColor: t.colors.surface,
      borderRadius: t.radius.card,
      borderWidth: 1,
      borderColor: t.colors.border,
      padding: t.space.lg,
      gap: t.space.md,
    },
    rowInfo: { gap: t.space.xs },
    rowLabel: { ...t.text(t.font.md), fontWeight: '600', color: t.colors.text },
    rowOrigin: { ...t.text(t.font.xs), color: t.colors.textMuted },
    rowActions: { flexDirection: 'row', gap: t.space.sm },
    footer: {
      paddingHorizontal: t.space.lg,
      paddingVertical: t.space.md,
      borderTopWidth: 1,
      borderTopColor: t.colors.border,
    },
  });
