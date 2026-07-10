import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';

export function SettingRow(props: {
  label: string;
  description?: string;
  value: boolean;
  onToggle: (next: boolean) => void;
}) {
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      style={styles.row}
      accessibilityRole="switch"
      accessibilityLabel={props.label}
      accessibilityState={{ checked: props.value }}
      aria-checked={props.value}
      onPress={() => props.onToggle(!props.value)}
    >
      <View style={styles.textCol}>
        <Text style={styles.label}>{props.label}</Text>
        {props.description ? <Text style={styles.description}>{props.description}</Text> : null}
      </View>
      <View style={[styles.track, props.value && styles.trackOn]}>
        <View style={[styles.knob, props.value && styles.knobOn]} />
      </View>
    </Pressable>
  );
}

const TRACK_WIDTH = 44;
const TRACK_HEIGHT = 26;
const KNOB_SIZE = 22;
const KNOB_INSET = (TRACK_HEIGHT - KNOB_SIZE) / 2;

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.control,
      padding: t.space.lg,
      gap: t.space.md,
    },
    textCol: { flex: 1, gap: t.space.xs },
    label: { ...t.text(t.font.md), color: t.colors.text },
    description: { ...t.text(t.font.xs), color: t.colors.textMuted },
    track: {
      width: TRACK_WIDTH,
      height: TRACK_HEIGHT,
      borderRadius: t.radius.pill,
      backgroundColor: t.colors.lockedBg,
      padding: KNOB_INSET,
      justifyContent: 'center',
    },
    trackOn: { backgroundColor: t.colors.accent },
    knob: {
      width: KNOB_SIZE,
      height: KNOB_SIZE,
      borderRadius: t.radius.pill,
      backgroundColor: t.colors.surface,
    },
    knobOn: { alignSelf: 'flex-end' },
  });
