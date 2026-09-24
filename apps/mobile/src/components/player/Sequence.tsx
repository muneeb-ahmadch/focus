import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Step } from '@focus/shared';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';
import { stepNarration } from '@/lib/narration';
import { AudioButton } from './AudioButton';

export function Sequence(props: {
  step: Extract<Step, { type: 'sequence' }>;
  answered: boolean;
  onAnswer: (order: string[]) => void;
}) {
  const styles = useThemedStyles(makeStyles);
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
        <AudioButton text={stepNarration(props.step)} />
      </View>
      <View style={styles.list}>
        {props.step.items.map((item) => {
          const position = picked.indexOf(item.id);
          return (
            <View key={item.id} style={[styles.row, position >= 0 && styles.rowPicked]}>
              <Pressable
                onPress={() => toggle(item.id)}
                disabled={props.answered}
                accessibilityRole="button"
                accessibilityLabel={item.text}
                style={({ pressed }) => [styles.item, pressed && styles.pressed]}
              >
                <View style={[styles.chip, position >= 0 && styles.chipFilled]}>
                  <Text style={[styles.chipText, position >= 0 && styles.chipTextFilled]}>
                    {position >= 0 ? String(position + 1) : ''}
                  </Text>
                </View>
                <Text style={styles.text}>{item.text}</Text>
              </Pressable>
              <AudioButton text={item.text} small />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    card: { gap: t.space.lg },
    title: { ...t.text(t.font.lg), fontWeight: '700', color: t.colors.text },
    promptRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
    prompt: { flex: 1, ...t.text(t.font.md), fontWeight: '600', color: t.colors.text },
    list: { gap: t.space.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.sm,
      backgroundColor: t.colors.surface,
      borderWidth: 2,
      borderColor: t.colors.border,
      borderRadius: t.radius.control,
      paddingRight: t.space.md,
    },
    item: {
      flex: 1,
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.sm,
      paddingVertical: t.space.md,
      paddingLeft: t.space.md,
    },
    rowPicked: { borderColor: t.colors.accent },
    pressed: { opacity: 0.7 },
    chip: {
      width: 28,
      height: 28,
      borderRadius: t.radius.pill,
      borderWidth: 2,
      borderColor: t.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipFilled: { backgroundColor: t.colors.accent, borderColor: t.colors.accent },
    chipText: { ...t.text(t.font.sm), fontWeight: '700', color: t.colors.textMuted },
    chipTextFilled: { color: t.colors.onAccent },
    text: { flex: 1, ...t.text(t.font.sm), color: t.colors.text },
  });
