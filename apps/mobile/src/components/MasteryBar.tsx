import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { type Theme } from '@/theme/tokens';
import { useTheme, useThemedStyles } from '@/theme/useTheme';
import { useMotion } from '@/theme/useMotion';

export function MasteryBar(props: { value: number; animateFrom?: number; showLabel?: boolean }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { ms } = useMotion();
  const width = useSharedValue((props.animateFrom ?? props.value) * 100);

  useEffect(() => {
    width.value = withTiming(props.value * 100, { duration: ms(theme.motion.slow) });
  }, [props.value, width, ms, theme.motion.slow]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fillStyle]} />
      </View>
      {props.showLabel !== false ? (
        <Text style={styles.label}>{Math.round(props.value * 100)}%</Text>
      ) : null}
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
    track: {
      flex: 1,
      height: 10,
      backgroundColor: t.colors.lockedBg,
      borderRadius: t.radius.pill,
      overflow: 'hidden',
    },
    fill: { height: '100%', backgroundColor: t.colors.success, borderRadius: t.radius.pill },
    label: { ...t.text(t.font.xs), color: t.colors.textMuted, minWidth: 36, textAlign: 'right' },
  });
