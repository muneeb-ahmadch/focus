import { Ionicons } from '@expo/vector-icons';
import type { GestureResponderEvent } from 'react-native';
import { Pressable, StyleSheet } from 'react-native';
import { speak } from '@/lib/speech';
import { type Theme } from '@/theme/tokens';
import { useTheme, useThemedStyles } from '@/theme/useTheme';

export function AudioButton(props: { text: string; small?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const t = useTheme();

  const onPress = (e: GestureResponderEvent) => {
    e.stopPropagation();
    speak(props.text);
  };

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel="Play audio"
    >
      <Ionicons name="volume-medium" size={props.small ? 16 : 20} color={t.colors.accent} />
    </Pressable>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    button: { padding: t.space.xs },
  });
