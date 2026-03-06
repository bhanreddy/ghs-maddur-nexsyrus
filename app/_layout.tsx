import { Stack } from 'expo-router';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import '../src/i18n';
import { AuthProvider } from '../src/hooks/useAuth';
import { ThemeProvider, ThemeContext } from '../src/context/ThemeContext';
import { ThemeProvider as NavThemeProvider, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useContext, useState } from 'react';

import { useNotifications } from '../src/hooks/useNotifications';
import { useAuthGuard } from '../src/hooks/useAuthGuard';
import { useNotificationObserver } from '../src/hooks/useNotificationObserver';
import { AuthGate } from '../src/components/AuthGate';

// NOTE: setNotificationHandler is set once in notificationManager.ts (module-level).
// NOTE: setBackgroundMessageHandler is registered in index.js (the JS entry point)
//       so it fires even when the app is killed and Android starts a headless JS task.

import { useFonts } from 'expo-font';
import { FontAwesome5 } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import AppSplash from '../src/components/AppSplash';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function Layout() {
  const [loaded, error] = useFonts({
    ...FontAwesome5.font
  });

  const [appReady, setAppReady] = useState(false);
  const [showCustomSplash, setShowCustomSplash] = useState(true);

  // One-time cleanup of stale ML Kit translation cache (remove after one release)
  useEffect(() => {
    const clearOldCache = async () => {
      const keys = await AsyncStorage.getAllKeys();
      const stale = keys.filter((k) => k.startsWith('mlkit_tx_') || k.startsWith('tx_cache_'));
      if (stale.length > 0) await AsyncStorage.multiRemove(stale);
    };
    clearOldCache();
  }, []);

  useEffect(() => {
    if (loaded || error) {
      setAppReady(true);
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!appReady) {
    return null;
  }

  return (
    <AuthProvider>
      <ThemeProvider>
        <ThemeSyncWrapper />
        {showCustomSplash && (
          <AppSplash onFinish={() => setShowCustomSplash(false)} />
        )}
      </ThemeProvider>
    </AuthProvider>);

}

function ThemeSyncWrapper() {
  const { theme, isDark } = useContext(ThemeContext);

  // Convert our custom theme to React Navigation theme format
  const baseNavTheme = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...baseNavTheme,
    dark: isDark,
    colors: {
      ...baseNavTheme.colors,
      primary: theme.colors.primary,
      background: theme.colors.background,
      card: theme.colors.card,
      text: theme.colors.text,
      border: theme.colors.border,
      notification: theme.colors.notification
    }
  };

  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={theme.colors.background} />
      <ErrorBoundary>
        <AuthGate>
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: theme.colors.background }
            }} />

        </AuthGate>
      </ErrorBoundary>
      {/* Auth guard and hooks run AFTER the Stack navigator has mounted */}
      <NavigationReady />

      {/* Global Animated Splash Screen Overlay removed - now native AnimatedSplash handles this */}
    </NavThemeProvider>);

}

/**
 * This component runs hooks that depend on React Navigation being fully mounted.
 * It must render AFTER the Stack navigator, not before.
 * Renders nothing visually.
 */
function NavigationReady() {
  useAuthGuard();
  useNotifications();
  useNotificationObserver();
  return null;
}