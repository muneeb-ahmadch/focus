import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/PrimaryButton';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';

// Shown when initDb() fails at boot (corrupt/locked SQLite) instead of hanging on
// a blank splash — the one place the app can't fall back to cached UI.
export function BootError({ onRetry }: { onRetry: () => void }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>
        <Text style={styles.title}>Couldn&apos;t load your data</Text>
        <Text style={styles.explainer}>
          Something went wrong opening your progress on this device. Try again — your data is still
          here.
        </Text>
      </View>
      <View style={styles.footer}>
        <PrimaryButton title="Try again" onPress={onRetry} />
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    body: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: t.space.xl,
      gap: t.space.md,
    },
    title: { ...t.text(t.font.xl), fontWeight: '700', color: t.colors.text, textAlign: 'center' },
    explainer: {
      ...t.text(t.font.md),
      color: t.colors.textMuted,
      textAlign: 'center',
      lineHeight: 24,
    },
    footer: { paddingHorizontal: t.space.xl, paddingBottom: t.space.lg },
  });
