import 'react-native-url-polyfill/auto';
import React, { useEffect } from 'react';
import { Linking, View } from 'react-native';
import { Stack } from 'expo-router/stack';
import { ThemeProvider as NavThemeProvider, DarkTheme, DefaultTheme, router, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  useFonts, PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { ThemeProvider, useTheme, useThemePreference } from '@/theme/ThemeProvider';
import { useSession } from '@/state/session';
import { queryClient } from '@/hooks/queryClient';
import { backend } from '@/services/backend';
import { Toasts } from '@/components/common/Toasts';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Navigator() {
  const status = useSession((s) => s.status);
  const { colors, dark } = useTheme();
  const segments = useSegments();

  // Send people to the right place whenever the session state changes.
  useEffect(() => {
    // Deferred so it runs after Stack.Protected has reconciled the available routes.
    const t = setTimeout(() => {
      const top = segments[0] as string | undefined;
      if (status === 'onboarding' && top !== 'onboarding') router.replace('/onboarding');
      else if (status === 'ready' && (top === '(auth)' || top === 'onboarding' || top === 'reset-password')) router.replace('/');
      else if (status === 'recovery' && top !== 'reset-password') router.replace('/reset-password');
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  const navTheme = {
    ...(dark ? DarkTheme : DefaultTheme),
    colors: { ...(dark ? DarkTheme : DefaultTheme).colors, background: colors.background, card: colors.surface, primary: colors.primary, text: colors.text, border: colors.border },
  };
  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Protected guard={status === 'signedOut'}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
          <Stack.Protected guard={status === 'recovery'}>
            <Stack.Screen name="reset-password" />
          </Stack.Protected>
          <Stack.Protected guard={status === 'onboarding'}>
            <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          </Stack.Protected>
          <Stack.Protected guard={status === 'ready'}>
            <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
            <Stack.Screen name="chat/[id]" />
            <Stack.Screen name="chat/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="chat/info/[id]" />
            <Stack.Screen name="poll/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="plan/[id]" />
            <Stack.Screen name="plan/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="plan/availability/[id]" />
            <Stack.Screen name="assistant" />
            <Stack.Screen name="friends/index" />
            <Stack.Screen name="friends/add" />
            <Stack.Screen name="user/[id]" />
            <Stack.Screen name="saved" />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="settings/preferences" />
            <Stack.Screen name="settings/privacy" />
            <Stack.Screen name="settings/notifications" />
            <Stack.Screen name="settings/account" />
            <Stack.Screen name="premium" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          </Stack.Protected>
          <Stack.Protected guard={status === 'ready' || status === 'onboarding'}>
            <Stack.Screen name="settings/demo" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          </Stack.Protected>
        </Stack>
        <Toasts />
      </View>
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
  });
  const status = useSession((s) => s.status);

  useEffect(() => {
    useThemePreference.getState().hydrate();
    useSession.getState().boot();
  }, []);

  // Email confirmation / password-recovery deep links (gather://...)
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) backend().auth.handleAuthRedirect(url).catch(() => {});
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      backend().auth.handleAuthRedirect(url).catch(() => {});
    });
    return () => sub.remove();
  }, []);

  const ready = (fontsLoaded || !!fontError) && status !== 'booting';
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <Navigator />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
