import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { router, Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { getDb, initDb } from "@/db";
import { getProfile } from "@/db/repo/profile";
import { queryClient } from "@/lib/queryClient";
import { initNarrationVoice } from "@/lib/speech";
import { rescheduleAll } from "@/notifications/scheduler";

function Gate() {
  const segments = useSegments();
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
    <Stack>
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
    </Stack>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void initDb().then(() => setReady(true)); // open + migrate + sync route content before first render
    void initNarrationVoice();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void rescheduleAll(getDb());
    });
    return () => sub.remove();
  }, []);

  if (!ready) return null;
  return (
    <QueryClientProvider client={queryClient}>
      <Gate />
      <StatusBar style="dark" />
    </QueryClientProvider>
  );
}
