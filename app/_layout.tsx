import { Stack } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { CustomAlertProvider, ensurePortalRoot } from '../src/components/CustomAlert';
export { ErrorBoundary } from '@/src/components/ErrorBoundary';
import { validateBuildConfig } from '../src/constants/school';
import '../src/i18n';
import { AuthService } from '../src/services/authService';
import { AuthProvider, useAuth } from '../src/hooks/useAuth';
import { ThemeProvider, ThemeContext } from '../src/context/ThemeContext';
import { ThemeProvider as NavThemeProvider, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useContext, useState, useEffect } from 'react';
import { View, Text, ScrollView, Platform, StyleSheet, Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { toastConfig } from '../src/components/CustomToast';
import * as IntentLauncher from 'expo-intent-launcher';
import { useNotifications } from '../src/hooks/useNotifications';
import { useAuthGuard } from '../src/hooks/useAuthGuard';
import { useNotificationObserver } from '../src/hooks/useNotificationObserver';
import { AuthGate } from '../src/components/AuthGate';
import SchoolRibbon, {
  MOBILE_RIBBON_CONTENT_HEIGHT,
  SCHOOL_RIBBON_OVERLAP,
} from '../src/components/SchoolRibbon';
import { useSchoolHeader } from '../src/hooks/useSchoolHeader';
import { notificationManager } from '../src/services/notificationManager';

// NOTE: setNotificationHandler is set once in notificationManager.ts (module-level).
// NOTE: setBackgroundMessageHandler is registered in index.js (the JS entry point)
//       so it fires even when the app is killed and Android starts a headless JS task.

import { useFonts } from 'expo-font';
import { FontAwesome5 } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import ForceUpdateScreen from '../src/components/ForceUpdateScreen';
import { useVersionCheck } from '../src/hooks/useVersionCheck';
import FestivalPosterGate from '../src/components/FestivalPosterGate';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function Layout() {
  const [loaded, error] = useFonts({
    ...FontAwesome5.font
  });

  const [appReady, setAppReady] = useState(false);
  const [buildConfigError, setBuildConfigError] = useState<string | null>(null);
  const { updateRequired } = useVersionCheck();

  // Inject portal root for web (must happen before any alert can fire)
  useEffect(() => {
    ensurePortalRoot();
  }, []);

  // Validate build configuration on startup
  useEffect(() => {
    try {
      validateBuildConfig();
    } catch (e: any) {
      setBuildConfigError(e.message);
    }
  }, []);
  useEffect(() => {
    const clearOldCache = async () => {
      const keys = await AsyncStorage.getAllKeys();
      const stale = keys.filter((k) => k.startsWith('mlkit_tx_') || k.startsWith('tx_cache_'));
      if (stale.length > 0) await AsyncStorage.multiRemove(stale);
    };
    clearOldCache();

    // Cache invalidation based on app version updates
    const checkAppVersion = async () => {
      const currentVersion = Constants.expoConfig?.version || '1.0.0';
      const storedVersion = await AsyncStorage.getItem('app_version');
      if (storedVersion && storedVersion !== currentVersion) {
        // App updated, clear all offline caches starting with @app_
        const keys = await AsyncStorage.getAllKeys();
        const cacheKeys = keys.filter((k) => k.startsWith('@app_'));
        if (cacheKeys.length > 0) {
          await AsyncStorage.multiRemove(cacheKeys);
        }
        if (__DEV__) console.log(`[Cache Invalidation] Flushed cache for new version ${currentVersion}`);
        // FIX 4 APPLIED — Version bump explicitly clears data cache only, never auth keys
      }
      await AsyncStorage.setItem('app_version', currentVersion);
    };
    checkAppVersion();

    // Note: scheduleMidnightCheck was removed from AuthService if it existed
  }, []);

  // Initialize notification channels once at app startup
  useEffect(() => {
    if (Platform.OS === 'android') {
      notificationManager.createChannels();
    }
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

  if (updateRequired) {
    return <ForceUpdateScreen />;
  }

  if (buildConfigError && __DEV__) {
    return (
      <View style={{ flex: 1, backgroundColor: '#ffebe6', padding: 24, justifyContent: 'center' }}>
        <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#DE350B', marginBottom: 12 }}>
          Build Configuration Error
        </Text>
        <ScrollView style={{ backgroundColor: 'white', padding: 16, borderRadius: 8, maxHeight: 300 }}>
          <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: '#172B4D' }}>
            {buildConfigError}
          </Text>
        </ScrollView>
        <Text style={{ marginTop: 24, fontSize: 16, color: '#42526E', textAlign: 'center' }}>
          Please fix your .env file and restart the bundler (e.g. npx expo start --clear).
        </Text>
      </View>
    );
  }

  return (
    <AuthProvider>
      <ThemeProvider>
        <CustomAlertProvider>
          <ThemeSyncWrapper />
        </CustomAlertProvider>
      </ThemeProvider>
    </AuthProvider>);

}

function ThemeSyncWrapper() {
  const { theme, isDark } = useContext(ThemeContext);
  const getSchoolHeader = useSchoolHeader();
  const insets = useSafeAreaInsets();

  // Content row + small bottom pad; overlap pulls page under the wave cutout.
  const stackTopInset =
    insets.top + MOBILE_RIBBON_CONTENT_HEIGHT - SCHOOL_RIBBON_OVERLAP;

  // Convert our custom SchoolTheme to React Navigation theme format
  const baseNavTheme = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...baseNavTheme,
    dark: isDark,
    colors: {
      ...baseNavTheme.colors,
      primary: theme.colors.primary,
      background: theme.colors.background,
      card: theme.colors.card,
      text: theme.colors.textPrimary,
      border: theme.colors.border,
      notification: theme.colors.notification
    }
  };

  const isWeb = Platform.OS === 'web';

  return (
    <NavThemeProvider value={navTheme}>
      <GestureHandlerRootView
        style={[
          styles.gestureRoot,
          { backgroundColor: theme.colors.background },
        ]}
      >
        <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={theme.colors.background} />
        <View style={styles.appFrame}>
          {isWeb ? <SchoolRibbon /> : null}
          <View
            style={[
              styles.stackShell,
              !isWeb && { paddingTop: stackTopInset },
              { backgroundColor: theme.colors.background },
            ]}
          >
            <AuthGate>
              <Stack
                screenOptions={{
                  headerShown: false,
                  animation: 'slide_from_right',
                  contentStyle: { backgroundColor: theme.colors.background },
                }}
              >
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="driver" options={{ headerShown: false }} />
                <Stack.Screen name="admin" options={{ headerShown: false }} />
                <Stack.Screen name="staff" options={{ headerShown: false }} />
                <Stack.Screen name="accounts" options={{ headerShown: false }} />
                <Stack.Screen name="Screen" options={{ headerShown: false }} />
              </Stack>
            </AuthGate>
          </View>
          {!isWeb ? <SchoolRibbon /> : null}
        </View>
        {/* Auth guard and hooks run AFTER the Stack navigator has mounted */}
        <NavigationReady />
        {/* Festival poster popup (SuperAdmin-uploaded), once per user per poster */}
        <FestivalPosterGate />

        <Toast config={toastConfig} />
        {/* Global Animated Splash Screen Overlay removed - now native AnimatedSplash handles this */}
      </GestureHandlerRootView>
    </NavThemeProvider>);

}

const styles = StyleSheet.create({
  gestureRoot: { flex: 1 },
  appFrame: {
    flex: 1,
    position: 'relative',
  },
  stackShell: { flex: 1 },
});

/**
 * This component runs hooks that depend on React Navigation being fully mounted.
 * It must render AFTER the Stack navigator, not before.
 * Renders nothing visually.
 */
function NavigationReady() {
  const { user, authChecked } = useAuth();
  useAuthGuard();
  useNotifications();
  useNotificationObserver();

  // OEM Battery Prompt Check - only after login
  useEffect(() => {
    const checkBatteryPrompt = async () => {
      if (Platform.OS !== 'android' || !user || !authChecked) return;
      const shown = await SecureStore.getItemAsync('battery_prompt_shown');
      if (shown !== 'true') {
        Alert.alert(
          "Keep App Running",
          "To prevent getting logged out, please disable battery optimization for this app.",
          [
            { text: "Skip", onPress: () => SecureStore.setItemAsync('battery_prompt_shown', 'true').catch(() => {}) },
            {
              text: "Open Settings",
              onPress: async () => {
                await SecureStore.setItemAsync('battery_prompt_shown', 'true').catch(() => {});
                IntentLauncher.startActivityAsync(
                  IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS
                ).catch(() => {});
              }
            }
          ]
        );
      }
    };
    // Delay to avoid clashing with splash screen / other prompts
    setTimeout(checkBatteryPrompt, 2000);
  }, [user, authChecked]);

  return null;
}