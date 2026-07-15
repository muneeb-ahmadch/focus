import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { type Theme } from "@/theme/tokens";
import { useThemedStyles, useTheme } from "@/theme/useTheme";

type Row = { label: string; route: string; danger?: boolean };

const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: "Your plan",
    rows: [
      { label: "Schedule", route: "/settings/schedule" },
      { label: "Test date", route: "/settings/test-date" },
    ],
  },
  {
    title: "Preferences",
    rows: [
      { label: "Audio", route: "/settings/audio" },
      { label: "Accessibility", route: "/settings/accessibility" },
    ],
  },
  {
    title: "Progress",
    rows: [{ label: "Activity", route: "/activity" }],
  },
  {
    title: "Data",
    rows: [{ label: "Reset app", route: "/settings/reset", danger: true }],
  },
];

export default function ProfileScreen() {
  const styles = useThemedStyles(makeStyles);
  const t = useTheme();
  const version = Constants.expoConfig?.version ?? "";

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Profile</Text>

      {SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.rows.map((row) => (
            <Pressable
              key={row.label}
              style={styles.row}
              accessibilityRole="button"
              onPress={() => router.push(row.route)}
            >
              <Text style={[styles.rowLabel, row.danger && styles.dangerLabel]}>{row.label}</Text>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={row.danger ? t.colors.danger : t.colors.textMuted}
              />
            </Pressable>
          ))}
        </View>
      ))}

      {version ? <Text style={styles.version}>Focus v{version}</Text> : null}
    </ScrollView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    content: { padding: t.space.lg, gap: t.space.lg },
    title: { ...t.text(t.font.xl), fontWeight: "700", color: t.colors.text },
    section: { gap: t.space.sm },
    sectionTitle: {
      ...t.text(t.font.sm),
      fontWeight: "700",
      color: t.colors.textMuted,
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
    dangerLabel: { color: t.colors.danger },
    version: {
      ...t.text(t.font.xs),
      color: t.colors.textMuted,
      textAlign: "center",
      marginTop: t.space.md,
    },
  });
