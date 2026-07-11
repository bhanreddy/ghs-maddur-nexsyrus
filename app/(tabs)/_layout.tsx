import { Tabs } from 'expo-router';
import React from 'react';
import { View, StyleSheet } from 'react-native';
import * as Haptics from '@/src/utils/haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRequireRole } from '@/src/hooks/useRequireRole';
export { ErrorBoundary } from '@/src/components/ErrorBoundary';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/src/hooks/useAuth';
import { useFeatures } from '@/src/hooks/useFeatures';
import { useTheme } from '@/src/hooks/useTheme';

export default function TabLayout() {
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();
    const { user } = useAuth();
    const { isEnabled } = useFeatures();
    const { theme, isDark } = useTheme();
    useRequireRole('student', 'parent');

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarShowLabel: true,
                tabBarActiveTintColor: theme.colors.primaryLight,
                tabBarInactiveTintColor: theme.colors.textMuted,
                tabBarLabelStyle: {
                    fontSize: 11,
                    fontWeight: '700',
                    letterSpacing: 0.3,
                },
                tabBarStyle: {
                    height: 58 + insets.bottom,
                    paddingBottom: 6 + insets.bottom,
                    paddingTop: 8,
                    backgroundColor: theme.colors.surface,
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: theme.colors.border,
                    elevation: 8,
                    shadowColor: isDark ? '#000' : '#0F172A',
                    shadowOffset: { width: 0, height: -3 },
                    shadowOpacity: isDark ? 0.4 : 0.06,
                    shadowRadius: 8,
                },
            }}
            screenListeners={{
                tabPress: () => {
                    Haptics.selectionAsync();
                },
            }}
        >
            <Tabs.Screen
                name="home"
                options={{
                    headerShown: false,
                    tabBarLabel: t('dashboard.home', 'Home'),
                    tabBarIcon: ({ focused, color }) => (
                        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />
                            {focused && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color, position: 'absolute', bottom: -12 }} />}
                        </View>
                    ),
                }}
            />

            <Tabs.Screen
                name="timetable"
                options={{
                    headerShown: false,
                    // href:null removes the tab button when disabled; the route guard
                    // on the screen still redirects deep-links to Home.
                    href: isEnabled('nav.time_table') ? undefined : null,
                    tabBarLabel: t('timetable.title', 'TimeTable'),
                    tabBarIcon: ({ focused, color }) => (
                        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name={focused ? "calendar" : "calendar-outline"} size={22} color={color} />
                            {focused && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color, position: 'absolute', bottom: -12 }} />}
                        </View>
                    ),
                }}
            />
            <Tabs.Screen
                name="fees"
                options={{
                    headerShown: false,
                    href: isEnabled('nav.fees') ? undefined : null,
                    tabBarLabel: t('fees', 'Fees'),
                    tabBarIcon: ({ focused, color }) => (
                        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name={focused ? "wallet" : "wallet-outline"} size={22} color={color} />
                            {focused && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color, position: 'absolute', bottom: -12 }} />}
                        </View>
                    ),
                }}
            />
            <Tabs.Screen
                name="results"
                options={{
                    headerShown: false,
                    href: isEnabled('nav.results') ? undefined : null,
                    tabBarLabel: t('menu.results', 'Results'),
                    tabBarIcon: ({ focused, color }) => (
                        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name={focused ? "school" : "school-outline"} size={22} color={color} />
                            {focused && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color, position: 'absolute', bottom: -12 }} />}
                        </View>
                    ),
                }}
            />

        </Tabs>
    );
}
