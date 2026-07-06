import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, font, radius, space } from '@/theme/tokens';

export function MasteryBar(props: { value: number; animateFrom?: number; showLabel?: boolean }) {
  const width = useSharedValue((props.animateFrom ?? props.value) * 100);

  useEffect(() => {
    width.value = withTiming(props.value * 100, { duration: 800 });
  }, [props.value, width]);

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

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  track: {
    flex: 1,
    height: 10,
    backgroundColor: colors.lockedBg,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.success, borderRadius: radius.pill },
  label: { fontSize: font.xs, color: colors.textMuted, minWidth: 36, textAlign: 'right' },
});
