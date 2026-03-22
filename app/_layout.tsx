import { DefaultTheme, DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useStore } from '@/src/store/useStore';
import { CurrencyUtils } from '@/src/utils/currencyUtils';
import { Platform } from 'react-native';
import { initializeDB } from '@/src/storage/localDB';
import { useNetworkStatus } from '@/src/hooks/useNetworkStatus';

import '../global.css';

SplashScreen.preventAutoHideAsync();

// Initialize SQLite tables synchronously at module scope —
// must happen before any screen reads from localDB (e.g. app/index.tsx → getSyncMeta).
// expo-sqlite is synchronous on native; skip on web.
if (Platform.OS !== 'web') {
  initializeDB();
}

// Set nav theme background to match the MeshBackground base color
export default function RootLayout() {
  const { theme } = useStore();
  const isDark = theme === 'dark';

  const AppTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: isDark ? '#1A1C18' : '#F2F0E8',
    },
  };

  const currencyRates = useStore(state => state.currencyRates);
  const cacheRates = useStore(state => state.cacheRates);

  // Start network monitoring — triggers sync on reconnection
  useNetworkStatus();

  useEffect(() => {
    // Hide splash screen when root layout is mounted
    SplashScreen.hideAsync();

    // Periodically fetch currency rates
    CurrencyUtils.fetchRates(currencyRates, cacheRates).catch(console.error);
  }, []);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(isDark ? '#1A1C18' : '#F2F0E8').catch(console.error);
  }, [isDark]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: isDark ? '#1A1C18' : '#F2F0E8' }}>
      <ThemeProvider value={AppTheme}>
        <Stack screenOptions={{ contentStyle: { backgroundColor: 'transparent' } }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="create-plan" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="create-activity" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="add-expense/[activityId]" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="trip/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="auth/callback" options={{ headerShown: false, animation: 'none' }} />
          <Stack.Screen name="+not-found" options={{ title: 'Oops!' }} />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
