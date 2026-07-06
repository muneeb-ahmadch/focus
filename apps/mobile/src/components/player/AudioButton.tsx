import { Pressable, StyleSheet, Text } from 'react-native';
import { speak } from '@/lib/speech';
import { space } from '@/theme/tokens';

export function AudioButton(props: { text: string; small?: boolean }) {
  return (
    <Pressable
      onPress={() => speak(props.text)}
      hitSlop={8}
      style={styles.button}
      accessibilityLabel="Play audio"
    >
      <Text style={{ fontSize: props.small ? 16 : 20 }}>🔊</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { padding: space.xs },
});
