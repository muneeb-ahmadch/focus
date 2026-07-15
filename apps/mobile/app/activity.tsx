import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { computeStreak } from '@focus/engine';
import { getActiveDays, getTotalXp } from '@/db/repo/activity';
import { getDb } from '@/db';
import { dayNumber, formatHumanDay, localDayToDate, todayLocal } from '@/lib/clock';
import { type Theme } from '@/theme/tokens';
import { useTheme, useThemedStyles } from '@/theme/useTheme';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n: number) => String(n).padStart(2, '0');
const isoWeekday = (day: string) => {
  const js = localDayToDate(day).getDay(); // Sun=0
  return js === 0 ? 7 : js; // Mon=1..Sun=7
};

// current month + `offset` months, as {year, month(1-12)} — pure integer math off
// today's local day, so no raw Date construction (APP TIME SOURCE tripwire).
function monthOf(today: string, offset: number): { year: number; month: number } {
  const [y, m] = today.split('-').map(Number);
  const idx = y * 12 + (m - 1) + offset;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

function daysInMonth(year: number, month: number): number {
  const first = `${year}-${pad(month)}-01`;
  const nextFirst = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;
  return dayNumber(nextFirst) - dayNumber(first);
}

export default function ActivityScreen() {
  const styles = useThemedStyles(makeStyles);
  const t = useTheme();
  const [offset, setOffset] = useState(0);

  const { activeSet, streak, xpTotal, today } = useMemo(() => {
    const db = getDb();
    const days = getActiveDays(db);
    const now = todayLocal();
    return {
      activeSet: new Set(days),
      streak: computeStreak(days.map(dayNumber), dayNumber(now)),
      xpTotal: getTotalXp(db),
      today: now,
    };
  }, []);

  const { year, month } = monthOf(today, offset);
  const weeks = useMemo(() => {
    const total = daysInMonth(year, month);
    const lead = isoWeekday(`${year}-${pad(month)}-01`) - 1;
    const cells: (number | null)[] = [...Array(lead).fill(null)];
    for (let d = 1; d <= total; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [year, month]);

  const atCurrentMonth = offset >= 0;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summary}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>🔥 {streak}</Text>
            <Text style={styles.statLabel}>day streak</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>⚡ {xpTotal}</Text>
            <Text style={styles.statLabel}>total XP</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{activeSet.size}</Text>
            <Text style={styles.statLabel}>active days</Text>
          </View>
        </View>

        <View style={styles.monthHeader}>
          <Pressable
            onPress={() => setOffset((o) => o - 1)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
          >
            <Ionicons name="chevron-back" size={22} color={t.colors.text} />
          </Pressable>
          <Text style={styles.monthLabel}>
            {MONTHS[month - 1]} {year}
          </Text>
          <Pressable
            onPress={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={atCurrentMonth}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Next month"
          >
            <Ionicons
              name="chevron-forward"
              size={22}
              color={atCurrentMonth ? t.colors.border : t.colors.text}
            />
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {WEEKDAYS.map((d, i) => (
            <Text key={i} style={styles.weekday}>
              {d}
            </Text>
          ))}
        </View>

        {weeks.map((row, ri) => (
          <View key={ri} style={styles.weekRow}>
            {row.map((d, ci) => {
              if (d === null) return <View key={ci} style={styles.cell} />;
              const dayStr = `${year}-${pad(month)}-${pad(d)}`;
              const active = activeSet.has(dayStr);
              const isToday = dayStr === today;
              return (
                <View
                  key={ci}
                  style={styles.cell}
                  accessibilityLabel={`${formatHumanDay(dayStr)}${active ? ', active' : ''}${
                    isToday ? ', today' : ''
                  }`}
                >
                  <View
                    style={[styles.dayDot, active && styles.dayActive, isToday && styles.dayToday]}
                  >
                    <Text style={[styles.dayNum, active && styles.dayNumActive]}>{d}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ))}

        {activeSet.size === 0 ? (
          <Text style={styles.empty}>
            No activity yet — finish a mission to light up your first day.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.colors.bg },
    content: { padding: t.space.lg, gap: t.space.md },
    summary: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      backgroundColor: t.colors.surface,
      borderWidth: 1,
      borderColor: t.colors.border,
      borderRadius: t.radius.card,
      paddingVertical: t.space.lg,
    },
    stat: { alignItems: 'center', gap: t.space.xs },
    statValue: { ...t.text(t.font.lg), fontWeight: '700', color: t.colors.text },
    statLabel: { ...t.text(t.font.xs), color: t.colors.textMuted },
    monthHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: t.space.sm,
    },
    monthLabel: { ...t.text(t.font.md), fontWeight: '700', color: t.colors.text },
    weekRow: { flexDirection: 'row' },
    weekday: {
      flex: 1,
      textAlign: 'center',
      ...t.text(t.font.xs),
      color: t.colors.textMuted,
      fontWeight: '600',
    },
    cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
    dayDot: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayActive: { backgroundColor: t.colors.accent },
    dayToday: { borderWidth: 2, borderColor: t.colors.accent },
    dayNum: { ...t.text(t.font.sm), color: t.colors.text },
    dayNumActive: { color: t.colors.onAccent, fontWeight: '700' },
    empty: {
      ...t.text(t.font.sm),
      color: t.colors.textMuted,
      textAlign: 'center',
      marginTop: t.space.md,
    },
  });
