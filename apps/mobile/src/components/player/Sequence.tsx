import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Step } from '@focus/shared';
import { colors, font, radius, space } from '@/theme/tokens';
import { AudioButton } from './AudioButton';

export function Sequence(props: {
  step: Extract<Step, { type: 'sequence' }>;
  answered: boolean;
  onAnswer: (order: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (!props.answered && picked.length === props.step.items.length) {
      props.onAnswer(picked);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);

  const toggle = (id: string) => {
    if (props.answered || picked.includes(id)) return;
    setPicked([...picked, id]);
  };

  return (
    <View style={styles.card}>
      {props.step.title ? <Text style={styles.title}>{props.step.title}</Text> : null}
      <View style={styles.promptRow}>
        <Text style={styles.prompt}>{props.step.prompt}</Text>
        <AudioButton text={props.step.prompt} />
      </View>
      <View style={styles.list}>
        {props.step.items.map((item) => {
          const position = picked.indexOf(item.id);
          return (
            <Pressable
              key={item.id}
              onPress={() => toggle(item.id)}
              disabled={props.answered}
              style={({ pressed }) => [
                styles.row,
                position >= 0 && styles.rowPicked,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.chip, position >= 0 && styles.chipFilled]}>
                <Text style={[styles.chipText, position >= 0 && styles.chipTextFilled]}>
                  {position >= 0 ? String(position + 1) : ''}
                </Text>
              </View>
              <Text style={styles.text}>{item.text}</Text>
              <AudioButton text={item.text} small />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.lg },
  title: { fontSize: font.lg, fontWeight: '700', color: colors.text },
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  prompt: { flex: 1, fontSize: font.md, fontWeight: '600', color: colors.text },
  list: { gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.control,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
  },
  rowPicked: { borderColor: colors.accent },
  pressed: { opacity: 0.7 },
  chip: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipFilled: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: font.sm, fontWeight: '700', color: colors.textMuted },
  chipTextFilled: { color: colors.surface },
  text: { flex: 1, fontSize: font.sm, color: colors.text },
});
