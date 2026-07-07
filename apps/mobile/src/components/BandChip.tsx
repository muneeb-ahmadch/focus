import { StyleSheet, Text, View } from 'react-native';
import type { Band } from '@focus/engine';
import { colors, font, radius, space } from '@/theme/tokens';

const BAND_STYLE: Record<Band, { bg: string; label: string }> = {
  low: { bg: colors.danger, label: 'Low' },
  medium: { bg: colors.warning, label: 'Medium' },
  high: { bg: colors.success, label: 'High' },
};

export function BandChip(props: { band: Band }) {
  const cfg = BAND_STYLE[props.band];
  return (
    <View style={[styles.chip, { backgroundColor: cfg.bg }]}>
      <Text style={styles.label}>{cfg.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    alignSelf: 'flex-start',
  },
  label: { color: colors.surface, fontSize: font.xs, fontWeight: '700' },
});
