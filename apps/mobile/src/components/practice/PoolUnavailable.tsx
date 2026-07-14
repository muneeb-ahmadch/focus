import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/PrimaryButton';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';

const COPY: Record<'thin' | 'weak-empty', { title: string; body: string }> = {
  thin: {
    title: 'Not enough questions yet',
    body: 'There aren’t enough questions in this set to build a fair session yet.',
  },
  'weak-empty': {
    title: 'Nothing to fix right now',
    body: 'Your review queue is clear. Keep learning — anything you miss lands here.',
  },
};

export function PoolUnavailable(props: { variant: 'thin' | 'weak-empty' }) {
  const styles = useThemedStyles(makeStyles);
  const copy = COPY[props.variant];

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>
      <PrimaryButton title="Back" variant="secondary" onPress={() => router.back()} />
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: t.space.md,
      padding: t.space.xl,
    },
    title: { ...t.text(t.font.lg), fontWeight: '700', color: t.colors.text, textAlign: 'center' },
    body: { ...t.text(t.font.md), color: t.colors.textMuted, textAlign: 'center' },
  });
