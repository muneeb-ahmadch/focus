import { StyleSheet, Text, View } from 'react-native';
import type { Band } from '@focus/engine';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles, useTheme } from '@/theme/useTheme';

const BAND_LABEL: Record<Band, string> = { low: 'Low', medium: 'Medium', high: 'High' };

function bandColor(t: Theme, band: Band): string {
  if (band === 'low') return t.colors.danger;
  if (band === 'medium') return t.colors.warning;
  return t.colors.success;
}

export function BandChip(props: { band: Band }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.chip, { backgroundColor: bandColor(theme, props.band) }]}>
      <Text style={styles.label}>{BAND_LABEL[props.band]}</Text>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    chip: {
      borderRadius: t.radius.pill,
      paddingHorizontal: t.space.md,
      paddingVertical: t.space.xs,
      alignSelf: 'flex-start',
    },
    label: { color: t.colors.onAccent, ...t.text(t.font.xs), fontWeight: '700' },
  });
