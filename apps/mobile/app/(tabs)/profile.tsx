import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { type Theme } from "@/theme/tokens";
import { useThemedStyles, useTheme } from "@/theme/useTheme";

export default function ProfileScreen() {
  const styles = useThemedStyles(makeStyles);
  const t = useTheme();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Profile</Text>

      <Text style={styles.sectionTitle}>Settings</Text>
      <Pressable
        style={styles.row}
        accessibilityRole="button"
        onPress={() => router.push("/settings/accessibility")}
      >
        <Text style={styles.rowLabel}>Accessibility</Text>
        <Ionicons name="chevron-forward" size={20} color={t.colors.textMuted} />
      </Pressable>
    </ScrollView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    content: { padding: t.space.lg, gap: t.space.md },
    title: { ...t.text(t.font.xl), fontWeight: "700", color: t.colors.text },
    sectionTitle: {
      ...t.text(t.font.sm),
      fontWeight: "700",
      color: t.colors.text,
      marginTop: t.space.sm,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.control,
      padding: t.space.lg,
    },
    rowLabel: { ...t.text(t.font.md), color: t.colors.text },
  });
