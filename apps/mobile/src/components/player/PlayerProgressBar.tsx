import { StyleSheet, View } from 'react-native';
import { colors, radius } from '@/theme/tokens';

export function PlayerProgressBar(props: { progress: number }) {
  const pct = Math.max(0, Math.min(1, props.progress)) * 100;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flex: 1,
    height: 8,
    backgroundColor: colors.lockedBg,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.accent, borderRadius: radius.pill },
});
