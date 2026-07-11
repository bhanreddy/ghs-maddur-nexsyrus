import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Pressable, StyleSheet, Dimensions, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
    FadeIn,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../hooks/useTheme';
import { useStaffPortalConfig } from '../hooks/useStaffPortalConfig';
import { BusAttendanceService } from '../services/busAttendanceService';

const { width } = Dimensions.get('window');

const TAB_CONFIG: Record<string, { icon: string; label: string }> = {
    'trip': { icon: 'navigate-outline', label: 'My Trip' },
    'dashboard': { icon: 'bus-outline', label: 'Route' },
    'students': { icon: 'people-outline', label: 'Students' },
    'bus-attendance': { icon: 'clipboard-outline', label: 'Attendance' },
    'payslip': { icon: 'wallet-outline', label: 'Payslips' },
    'profile': { icon: 'person-outline', label: 'Profile' },
};

const ORDERED_TABS = ['trip', 'dashboard', 'students', 'bus-attendance', 'payslip', 'profile'];

export default function DriverFooter({ state, descriptors, navigation }: MaterialTopTabBarProps) {
    const { t } = useTranslation();
    const { theme, isDark } = useTheme();
    const { payslipsEnabled } = useStaffPortalConfig();
    const [busAttendanceEnabled, setBusAttendanceEnabled] = React.useState(false);

    React.useEffect(() => {
        BusAttendanceService.isEnabled()
            .then(res => setBusAttendanceEnabled(res?.enabled))
            .catch(() => setBusAttendanceEnabled(false));
    }, []);

    let orderedTabs = ORDERED_TABS;
    if (!payslipsEnabled) {
        orderedTabs = orderedTabs.filter((tab) => tab !== 'payslip');
    }
    if (!busAttendanceEnabled) {
        orderedTabs = orderedTabs.filter((tab) => tab !== 'bus-attendance');
    }

    // Filter and sort routes to only show the main tabs
    const visibleRoutes = state.routes
        .filter(route => orderedTabs.includes(route.name))
        .sort((a, b) => orderedTabs.indexOf(a.name) - orderedTabs.indexOf(b.name));

    // Calculate active index relative to visible routes
    const currentRouteName = state.routes[state.index].name;
    const activeIndex = visibleRoutes.findIndex(route => route.name === currentRouteName);
    const isFooterVisible = activeIndex !== -1;

    // Calculate tab width
    const totalTabs = visibleRoutes.length;
    const tabWidth = (width - 40) / (totalTabs || 1);

    const indicatorPosition = useSharedValue(0);

    useEffect(() => {
        if (activeIndex !== -1) {
            indicatorPosition.value = withSpring(activeIndex * tabWidth, {
                damping: 15,
                stiffness: 150,
            });
        }
    }, [activeIndex, tabWidth]);

    const indicatorStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateX: indicatorPosition.value }],
            width: tabWidth,
            opacity: withTiming(isFooterVisible ? 1 : 0),
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
            height: 64,
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
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 0,
        },
        activeIndicator: {
            width: '70%',
            height: 60,
            borderRadius: theme.shape.borderRadiusXL + 2,
            shadowColor: theme.colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 6,
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
            fontSize: theme.typography.fontSizeXS,
            fontWeight: '600',
            letterSpacing: 0.2,
        },
    }), [theme]);

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
                            colors={[theme.colors.primary, theme.colors.primaryDark]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.activeIndicator}
                        />
                    </Animated.View>

                    {visibleRoutes.map((route) => {
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
                                navigation.navigate(route.name, route.params);
                            }
                        };

                        return (
                            <Pressable
                                key={route.key}
                                onPress={onPress}
                                style={[styles.tabItem, Platform.OS === 'web' && { cursor: 'pointer' }]}
                            >
                                <View style={styles.iconContainer}>
                                    <Ionicons
                                        name={config.icon as any}
                                        size={22}
                                        color={isFocused ? theme.colors.surface : theme.colors.textSecondary}
                                    />
                                </View>
                                {isFocused && (
                                    <Animated.Text
                                        entering={FadeIn.duration(200)}
                                        style={[styles.label, { color: theme.colors.surface }]}
                                        numberOfLines={1}
                                    >
                                        {t(`driver_ui.${route.name}`, config.label)}
                                    </Animated.Text>
                                )}
                            </Pressable>
                        );
                    })}
                </LinearGradient>
            </View>
        </View>
    );
}
