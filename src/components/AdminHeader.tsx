import React from 'react';
import { View, Text, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from '../utils/haptics';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ADMIN_THEME } from '../constants/adminTheme';
import { schoolColorWithAlpha } from '../constants/schoolConfig';
import { SCHOOL_NAME } from '../constants/school';
import ClayIconButton from './ClayIconButton';

import Animated, { SharedValue, useAnimatedStyle, interpolateColor, interpolate, Extrapolation } from 'react-native-reanimated';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';

interface AdminHeaderProps {
    title: string;
    showMenuButton?: boolean;
    showProfileButton?: boolean;
    showBackButton?: boolean;
    showNotification?: boolean;
    rightAction?: {
        icon: keyof typeof Ionicons.glyphMap;
        onPress: () => void;
    };
    scrollY?: SharedValue<number>;
    onMenuPress?: () => void;
}

const isWeb = Platform.OS === 'web';

const AdminHeader: React.FC<AdminHeaderProps> = ({
    title = SCHOOL_NAME,
    showMenuButton = true,
    showProfileButton = true,
    showBackButton = false,
    showNotification = false,
    rightAction,
    scrollY,
    onMenuPress
}) => {
    const router = useRouter();
    const { user } = useAuth();
    const { isDark } = useTheme();
    const { width: windowWidth } = useWindowDimensions();
    const isWideWeb = isWeb && windowWidth >= 768;

    const textPrimary = isDark ? '#F8FAFC' : ADMIN_THEME.colors.text.primary;
    const accent = ADMIN_THEME.colors.primary;

    /* Solid clay tone the mobile slab materializes into once the user scrolls. */
    const claySolid = isDark ? '#1C1630' : '#F6F2FC';
    const clayTransparent = isDark ? 'rgba(28,22,48,0)' : 'rgba(246,242,252,0)';

    const handleBack = () => {
        if (router.canGoBack()) {
            router.back();
        } else {
            const roleCode = typeof user?.role === 'object' && user?.role !== null ? (user.role as any).code : user?.role;
            if (roleCode === 'accountant') router.push('/accounts/dashboard');
            else router.push('/admin/dashboard');
        }
    };

    const handleSettings = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const roleCode = typeof user?.role === 'object' && user?.role !== null ? (user.role as any).code : user?.role;
        if (roleCode === 'accountant') {
            router.push('/accounts/settings');
        } else if (roleCode === 'staff' || roleCode === 'teacher') {
            router.push('/staff/dashboard');
        } else {
            router.push('/admin/settings');
        }
    };

    const animatedStyle = useAnimatedStyle(() => {
        if (!scrollY) {
            if (isWideWeb) {
                return {
                    backgroundColor: isDark ? 'rgba(11,15,23,0.85)' : 'rgba(255,255,255,0.85)',
                    borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.08)',
                    shadowOpacity: 0,
                };
            }
            return {
                backgroundColor: claySolid,
                borderBottomColor: schoolColorWithAlpha(accent, isDark ? 0.35 : 0.16),
                shadowOpacity: isDark ? 0.4 : 0.16,
            };
        }

        if (isWideWeb) {
            const lightBg0 = 'rgba(255,255,255,0)';
            const lightBg1 = 'rgba(255,255,255,0.95)';
            const darkBg0 = 'rgba(11,15,23,0)';
            const darkBg1 = 'rgba(11,15,23,0.92)';

            const bgColor = interpolateColor(
                scrollY.value,
                [0, 50],
                isDark ? [darkBg0, darkBg1] : [lightBg0, lightBg1]
            );
            const borderColor = interpolateColor(
                scrollY.value,
                [0, 50],
                isDark
                    ? ['rgba(255,255,255,0)', 'rgba(255,255,255,0.08)']
                    : ['rgba(226,232,240,0)', ADMIN_THEME.colors.border]
            );
            const shadowOpacity = interpolate(
                scrollY.value,
                [0, 50],
                [0, 0.06],
                Extrapolation.CLAMP
            );

            return {
                backgroundColor: bgColor,
                borderBottomColor: borderColor,
                shadowOpacity,
            };
        }

        const bgColor = interpolateColor(
            scrollY.value,
            [0, 50],
            [clayTransparent, claySolid]
        );
        const shadowOpacity = interpolate(
            scrollY.value,
            [0, 50],
            [0, isDark ? 0.4 : 0.18],
            Extrapolation.CLAMP
        );
        const borderBottomWidth = interpolate(scrollY.value, [0, 50], [0, 1], Extrapolation.CLAMP);

        return {
            backgroundColor: bgColor,
            shadowOpacity,
            borderBottomWidth,
            borderBottomColor: schoolColorWithAlpha(accent, isDark ? 0.35 : 0.16),
        };
    });

    const isAbsolute = !!scrollY;
    const headerContentHeight = isWideWeb ? 56 : 50;
    const horizontalPad = isWideWeb ? 20 : ADMIN_THEME.spacing.m;

    const showBack = showBackButton || isWeb;
    const showMenu =
        showMenuButton && (!showBackButton || (isWeb && !!onMenuPress));
    const dualLeftNav = isWeb && showBack && showMenu;

    return (
        <Animated.View style={[
            styles.container,
            !isWideWeb && styles.claySlab,
            // Global stackShell places this header just under the school ribbon's
            // wave; without a little top padding the buttons ride up under it.
            // Applied on all native screens (in-flow and absolute alike) so the
            // header sits consistently below the ribbon everywhere. This restores
            // the header's intended ~74px height (16 top + 50 content + 8 bottom),
            // which the absolute screens' content offsets already reserve for.
            !isWeb && { paddingTop: ADMIN_THEME.spacing.m },
            { shadowColor: accent },
            isAbsolute && styles.absoluteHeader,
            isWideWeb && styles.containerWide,
            isWideWeb && styles.containerWideZ,
            animatedStyle
        ]}>
            <View style={[styles.content, { paddingHorizontal: horizontalPad, height: headerContentHeight }]}>
                <View
                    style={[
                        styles.leftContainer,
                        dualLeftNav && styles.leftContainerWide,
                    ]}
                >
                    {showBack ? (
                        <ClayIconButton
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                handleBack();
                            }}
                            isDark={isDark}
                            accent={accent}
                        >
                            <Ionicons name="arrow-back" size={19} color={accent} />
                        </ClayIconButton>
                    ) : null}
                    {showMenu ? (
                        <ClayIconButton
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                if (onMenuPress) onMenuPress();
                            }}
                            isDark={isDark}
                            accent={accent}
                        >
                            <Feather name="menu" size={19} color={accent} />
                        </ClayIconButton>
                    ) : null}
                </View>

                <Text style={[
                    styles.title,
                    isWideWeb && styles.titleWide,
                    { color: textPrimary },
                ]} numberOfLines={1}>{title}</Text>

                <View style={styles.rightContainer}>
                    {rightAction && (
                        <ClayIconButton
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                rightAction.onPress();
                            }}
                            isDark={isDark}
                            accent={accent}
                            style={{ marginRight: 8 }}
                        >
                            <Ionicons name={rightAction.icon} size={19} color={accent} />
                        </ClayIconButton>
                    )}
                    {showNotification && (
                        <ClayIconButton
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                router.push('/admin/notifications' as any);
                            }}
                            isDark={isDark}
                            accent={accent}
                            style={{ marginRight: 8 }}
                        >
                            <Ionicons name="notifications-outline" size={19} color={accent} />
                        </ClayIconButton>
                    )}
                    {showProfileButton && (
                        <ClayIconButton onPress={handleSettings} isDark={isDark} accent={accent} round size={40}>
                            <Ionicons name="settings-outline" size={18} color={accent} />
                        </ClayIconButton>
                    )}
                </View>
            </View>
            {isWideWeb ? (
                <>
                    <View
                        style={{
                            height: StyleSheet.hairlineWidth,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.08)',
                        }}
                    />
                    <View style={{ height: 2, overflow: 'hidden' }}>
                        <LinearGradient
                            colors={['#3B82F6', '#8B5CF6', 'transparent']}
                            start={{ x: 0, y: 0.5 }}
                            end={{ x: 1, y: 0.5 }}
                            style={{ flex: 1 }}
                        />
                    </View>
                </>
            ) : null}
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: ADMIN_THEME.colors.background.surface,
        borderBottomWidth: 1,
        borderBottomColor: ADMIN_THEME.colors.border,
        ...ADMIN_THEME.shadows.sm,
        paddingBottom: ADMIN_THEME.spacing.s,
    },
    /* Puffed clay slab (mobile only — the full-bleed desktop toolbar stays flat/glassy). */
    claySlab: {
        borderBottomLeftRadius: 26,
        borderBottomRightRadius: 26,
        shadowOffset: { width: 0, height: 10 },
        shadowRadius: 20,
        overflow: 'hidden',
    },
    containerWide: {
        paddingBottom: 0,
        borderBottomWidth: 0,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    title: {
        flex: 1,
        marginHorizontal: 12,
        fontSize: ADMIN_THEME.typography.size.m,
        fontWeight: '600',
        color: ADMIN_THEME.colors.text.primary,
        letterSpacing: 0.3,
        textAlign: 'center',
    },
    titleWide: {
        fontWeight: '800',
        letterSpacing: 0.35,
        fontSize: 17,
    },
    rightContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
    },
    leftContainer: {
        minWidth: 40,
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
    },
    leftContainerWide: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minWidth: 96,
    },
    containerWideZ: {
        zIndex: 100,
    },
    absoluteHeader: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
    }
});

export default AdminHeader;
