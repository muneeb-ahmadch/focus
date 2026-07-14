import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { type Theme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useTheme';

interface Tile {
  title: string;
  sublabel: string;
  onPress: () => void;
}

export default function PracticeHubScreen() {
  const styles = useThemedStyles(makeStyles);

  const tiles: Tile[] = [
    {
      title: 'Topic test',
      sublabel: 'Practice one concept family at a time',
      onPress: () => router.push({ pathname: '/practice/config', params: { kind: 'topic' } }),
    },
    {
      title: 'Route test',
      sublabel: 'Practice questions from one route',
      onPress: () => router.push({ pathname: '/practice/config', params: { kind: 'route' } }),
    },
    {
      title: 'Fix weak areas',
      sublabel: 'Practice concepts sitting in your review queue',
      onPress: () => router.push({ pathname: '/practice/config', params: { kind: 'weak' } }),
    },
    {
      title: 'Mini mock',
      sublabel: '10 questions, timed, pass mark 9',
      onPress: () => router.push('/practice/mini-mock'),
    },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Practice</Text>
      {tiles.map((tile) => (
        <Pressable
          key={tile.title}
          style={styles.tile}
          accessibilityRole="button"
          accessibilityLabel={tile.title}
          onPress={tile.onPress}
        >
          <Text style={styles.tileTitle}>{tile.title}</Text>
          <Text style={styles.tileSublabel}>{tile.sublabel}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    content: { padding: t.space.lg, gap: t.space.md },
    title: { ...t.text(t.font.xl), fontWeight: '700', color: t.colors.text },
    tile: {
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.card,
      padding: t.space.lg,
      gap: t.space.xs,
    },
    tileTitle: { ...t.text(t.font.md), fontWeight: '700', color: t.colors.text },
    tileSublabel: { ...t.text(t.font.xs), color: t.colors.textMuted },
  });
