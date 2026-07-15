import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { router, Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { AppState, useColorScheme } from "react-native";
import { BootError } from "@/components/BootError";
import { getDb, initDb } from "@/db";
import { getProfile } from "@/db/repo/profile";
import { bootAnalytics } from "@/lib/analytics";
import { queryClient } from "@/lib/queryClient";
import { initNarrationVoice } from "@/lib/speech";
import { rescheduleAll } from "@/notifications/scheduler";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTheme } from "@/theme/useTheme";

function Gate() {
  const segments = useSegments();
  const t = useTheme();
  const { data: profile, isPending } = useQuery({
    queryKey: ["profile"],
    queryFn: () => getProfile(getDb()) ?? null,
  });
  const first: string = segments[0] ?? "";
  const needsOnboarding = !isPending && !profile && first !== "onboarding";
  useEffect(() => {
    if (needsOnboarding) router.replace("/onboarding");
  }, [needsOnboarding]);
  if (isPending) return null;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.colors.surface },
        headerTintColor: t.colors.text,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen
        name="player"
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="mission-complete"
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen name="route/[routeId]" options={{ title: "" }} />
      <Stack.Screen name="settings/accessibility" options={{ title: "Accessibility" }} />
      <Stack.Screen name="settings/schedule" options={{ title: "Schedule" }} />
      <Stack.Screen name="settings/test-date" options={{ title: "Test date" }} />
      <Stack.Screen name="settings/audio" options={{ title: "Audio" }} />
      <Stack.Screen name="settings/reset" options={{ title: "Reset app" }} />
      <Stack.Screen name="activity" options={{ title: "Activity" }} />
      <Stack.Screen
        name="practice/config"
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="practice/mini-mock"
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen name="review-queue" options={{ title: "Review queue" }} />
      <Stack.Screen name="readiness" options={{ title: "Readiness" }} />
      <Stack.Screen
        name="mock/index"
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="mock/runner"
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="mock/review"
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="mock/results"
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="mock/mistakes"
        options={{ headerShown: false, gestureEnabled: false }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [bootFailed, setBootFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const scheme = useColorScheme();

  useEffect(() => {
    let cancelled = false;
    initDb()
      .then(() => {
        if (cancelled) return;
        useSettingsStore.getState().hydrate();
        bootAnalytics();
        setReady(true); // open + migrate + sync route content + settings before first render
      })
      .catch(() => {
        if (!cancelled) setBootFailed(true); // corrupt/locked DB: show recovery, not a blank splash
      });
    void initNarrationVoice();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void rescheduleAll(getDb());
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [attempt]);

  if (bootFailed)
    return (
      <BootError
        onRetry={() => {
          setBootFailed(false);
          setAttempt((n) => n + 1);
        }}
      />
    );
  if (!ready) return null;
  return (
    <QueryClientProvider client={queryClient}>
      <Gate />
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
    </QueryClientProvider>
  );
}
