import { StyleSheet, View } from 'react-native';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';

export function PlayerProgressBar(props: { progress: number }) {
  const styles = useThemedStyles(makeStyles);
  const pct = Math.max(0, Math.min(1, props.progress)) * 100;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct}%` }]} />
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    track: {
      flex: 1,
      height: 8,
      backgroundColor: t.colors.lockedBg,
      borderRadius: t.radius.pill,
      overflow: 'hidden',
    },
    fill: { height: '100%', backgroundColor: t.colors.accent, borderRadius: t.radius.pill },
  });
