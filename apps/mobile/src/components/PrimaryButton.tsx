import { Pressable, StyleSheet, Text } from 'react-native';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';

export function PrimaryButton(props: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const variant = props.variant ?? 'primary';
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.title}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        (pressed || props.disabled) && styles.pressed,
      ]}
    >
      <Text style={[styles.label, variant === 'secondary' && styles.secondaryLabel]}>
        {props.title}
      </Text>
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    button: {
      backgroundColor: t.colors.accent,
      borderRadius: t.radius.control,
      paddingVertical: t.space.md,
      paddingHorizontal: t.space.xl,
      alignItems: 'center',
    },
    secondary: {
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
    },
    danger: { backgroundColor: t.colors.danger },
    pressed: { opacity: 0.7 },
    label: { color: t.colors.onAccent, ...t.text(t.font.md), fontWeight: '600' },
    secondaryLabel: { color: t.colors.text },
  });
