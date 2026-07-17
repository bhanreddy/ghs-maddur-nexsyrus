import React, { useEffect, useMemo } from 'react';
import { View, Pressable, StyleSheet, Dimensions, Text, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../hooks/useTheme';
import { useEffectiveStaffId } from '../hooks/useEffectiveStaffId';

const { width } = Dimensions.get('window');

/** Height of the floating pill tab bar (excludes bottom inset). */
export const STAFF_TAB_BAR_HEIGHT = 64;

/** Space to leave at the bottom so content/buttons clear the floating tab bar. */
export function staffTabBarReserve(spacing: { xl: number; lg?: number }) {
  return STAFF_TAB_BAR_HEIGHT + spacing.xl + (spacing.lg ?? 16) + 12;
}

// Map route names to icons and labels
const TAB_CONFIG: Record<string, { icon: string; iconFilled: string; label: string }> = {
    'dashboard': { icon: 'grid-outline', iconFilled: 'grid', label: 'Home' },
    'manage-students': { icon: 'people-outline', iconFilled: 'people', label: 'Attendance' },
    'timetable': { icon: 'calendar-outline', iconFilled: 'calendar', label: 'Schedule' },
    'results': { icon: 'school-outline', iconFilled: 'school', label: 'Results' },
};

// Define the desired order of tabs
const ORDERED_TABS = ['dashboard', 'manage-students', 'timetable', 'results'];

export default function StaffFooter({ state, descriptors, navigation }: any) {
    const { theme, isDark } = useTheme();
    const { staffId, isViewingAsAdmin, viewAsName, userId: viewAsUserId } = useEffectiveStaffId();

    // Filter and sort routes to only show the main 4 tabs
    const visibleRoutes = state.routes
        .filter((route: any) => ORDERED_TABS.includes(route.name))
        .sort((a: any, b: any) => ORDERED_TABS.indexOf(a.name) - ORDERED_TABS.indexOf(b.name));

    // Calculate active index relative to visible routes
    const currentRouteName = state.routes[state.index].name;
    const activeIndex = visibleRoutes.findIndex((route: any) => route.name === currentRouteName);

    // If the current route is not in the visible footer (e.g. profile), we might want to hide the indicator 
    // or just not render it. For now, we'll clamp it or handle it cleanly.
    // If activeIndex is -1, it means we are on a screen that isn't in the footer.
    // IMPORTANT: do NOT early-return here. StaffFooter is a single shared component
    // that the tab navigator re-renders on every route change. Returning before the
    // hooks below would run a different number of hooks between renders (Rules of
    // Hooks violation) and crash into the ErrorBoundary, producing a blank screen
    // when navigating to a non-footer route like settings/profile. Compute the flag
    // now and return only after all hooks have run (see below).
    const isFooterVisible = activeIndex !== -1;

    // Calculate tab width
    const totalTabs = visibleRoutes.length;
    const tabWidth = (width - 40) / (totalTabs || 1); // Avoid div by zero

    const indicatorPosition = useSharedValue(0);

    useEffect(() => {
        if (activeIndex !== -1) {
            indicatorPosition.value = withSpring(activeIndex * tabWidth, {
                damping: 20,
                stiffness: 140,
            });
        }
    }, [activeIndex, tabWidth]);

    const indicatorStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateX: indicatorPosition.value }],
            width: tabWidth,
            opacity: withTiming(isFooterVisible ? 1 : 0), // Hide indicator if not on a main tab
        };
    });

    const styles = useMemo(() => StyleSheet.create({
        container: {
            position: 'absolute',
            bottom: theme.spacing.xl,
            left: theme.spacing.xl,
            right: theme.spacing.xl,
            alignItems: 'center',
        },
        barWrapper: {
            flexDirection: 'row',
            width: '100%',
            height: STAFF_TAB_BAR_HEIGHT,
            borderRadius: theme.shape.borderRadiusFull,
            overflow: 'hidden',
            ...theme.shadows.md,
        },
        barContent: {
            flexDirection: 'row',
            width: '100%',
            height: '100%',
            alignItems: 'center',
            paddingHorizontal: 0,
            borderWidth: 1,
            borderRadius: theme.shape.borderRadiusFull,
        },
        activeIndicatorContainer: {
            position: 'absolute',
            height: '100%',
            justifyContent: 'flex-start',
            alignItems: 'center',
            zIndex: 0,
            paddingTop: 6,
        },
        activeIndicator: {
            width: 32,
            height: 3,
            borderRadius: 2,
            shadowColor: theme.colors.primary,
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.4,
            shadowRadius: 6,
            elevation: 4,
        },
        tabItem: {
            flex: 1,
            height: '100%',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1,
            flexDirection: 'column',
            gap: theme.spacing.xs,
        },
        iconContainer: {
            alignItems: 'center',
            justifyContent: 'center',
        },
        label: {
            fontSize: theme.typography.fontSizeXS - 1,
            fontWeight: '500',
            letterSpacing: 0.3,
            marginTop: 2,
        },
    }), [theme]);

    // Safe to bail out now that every hook above has run unconditionally.
    if (!isFooterVisible) return null;

    return (
        <View style={styles.container}>
            <View style={styles.barWrapper}>
                <BlurView
                    intensity={Platform.OS === 'ios' ? 80 : 30}
                    tint={isDark ? 'dark' : 'light'}
                    style={StyleSheet.absoluteFill}
                />
                <LinearGradient
                    colors={isDark
                        ? ['rgba(30, 41, 59, 0.7)', 'rgba(15, 23, 42, 0.8)']
                        : ['rgba(255, 255, 255, 0.8)', 'rgba(241, 245, 249, 0.9)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.barContent, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.6)' }]}
                >
                    <Animated.View style={[styles.activeIndicatorContainer, indicatorStyle]}>
                        <LinearGradient
                            colors={[theme.colors.primary, theme.colors.primaryLight]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.activeIndicator}
                        />
                    </Animated.View>

                    {visibleRoutes.map((route: any) => {
                        const { options } = descriptors[route.key];
                        const config = TAB_CONFIG[route.name] || { icon: 'ellipse', label: 'Tab' };
                        const isFocused = currentRouteName === route.name;

                        const onPress = () => {
                            const event = navigation.emit({
                                type: 'tabPress',
                                target: route.key,
                                canPreventDefault: true,
                            });

                            if (!isFocused && !event.defaultPrevented) {
                                navigation.navigate(route.name, isViewingAsAdmin
                                  ? { ...(route.params || {}), staffId, viewAsName, viewAsUserId }
                                  : route.params);
                            }
                        };

                        return (
                            <Pressable
                                key={route.key}
                                onPress={onPress}
                                style={[styles.tabItem, Platform.OS === 'web' && { cursor: 'pointer' }]}
                            >
                                <Animated.View style={[styles.iconContainer]}>
                                    <Ionicons
                                        name={(isFocused ? config.iconFilled : config.icon) as any}
                                        size={22}
                                        color={isFocused ? theme.colors.primary : theme.colors.textMuted}
                                    />
                                </Animated.View>
                                <Text
                                    style={[styles.label, {
                                        color: isFocused ? theme.colors.primary : theme.colors.textMuted,
                                        fontWeight: isFocused ? '700' : '500',
                                    }]}
                                    numberOfLines={1}
                                >
                                    {config.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </LinearGradient>
            </View>
        </View>
    );
}
