import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
// import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useStore } from '@/src/store/useStore';
import { CurrencyUtils } from '@/src/utils/currencyUtils';
import { MeshBackground } from '@/components/MeshBackground';
import '../global.css';

SplashScreen.preventAutoHideAsync();

// Set nav theme background to match the MeshBackground base color
const AppTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#F2F0E8',
  },
};

export default function RootLayout() {
  const currencyRates = useStore(state => state.currencyRates);
  const cacheRates = useStore(state => state.cacheRates);

  useEffect(() => {
    SplashScreen.hideAsync();
    CurrencyUtils.fetchRates(currencyRates, cacheRates).catch(console.error);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={AppTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="create-plan" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="create-activity" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="add-expense/[activityId]" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="trip/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" options={{ title: 'Oops!' }} />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
