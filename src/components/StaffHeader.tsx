import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from '../utils/haptics';
import { useRouter } from 'expo-router';

import MenuOverlay from './MenuOverlay';
import ClayIconButton from './ClayIconButton';
import { SCHOOL_NAME } from '../constants/school';
import { schoolColorWithAlpha } from '../constants/schoolConfig';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { Spacing } from '../theme/themes';

import Animated, { SharedValue, useAnimatedStyle, interpolateColor, interpolate, Extrapolation } from 'react-native-reanimated';

interface StaffHeaderProps {
    title: string;
    subtitle?: string;
    showMenuButton?: boolean;
    showProfileButton?: boolean;
    showBackButton?: boolean;
    onMenuPress?: () => void;
    onBack?: () => void;
    scrollY?: SharedValue<number>;
}

const StaffHeader: React.FC<StaffHeaderProps> = ({
    title = SCHOOL_NAME,
    subtitle,
    showMenuButton = true,
    showProfileButton = true,
    showBackButton = false,
    onMenuPress,
    onBack,
    scrollY
}) => {
    const router = useRouter();
    const { theme, isDark } = useTheme();
    const [menuVisible, setMenuVisible] = useState(false);
    const { user } = useAuth();

    const accent = theme.colors.primary;

    const handleMenuPress = () => {
        if (onMenuPress) {
            onMenuPress();
        } else {
            setMenuVisible(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
    };

    /* Solid clay tone the slab materializes into once the user scrolls. */
    const claySolid = isDark ? '#1C1630' : '#F6F2FC';
    const clayTransparent = isDark ? 'rgba(28,22,48,0)' : 'rgba(246,242,252,0)';

    const animatedStyle = useAnimatedStyle(() => {
        if (!scrollY) {
            return {
                backgroundColor: claySolid,
                shadowOpacity: isDark ? 0.4 : 0.16,
                borderBottomWidth: 1,
                borderBottomColor: schoolColorWithAlpha(accent, isDark ? 0.35 : 0.16),
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
    const isWeb = Platform.OS === 'web';
    const showNavBack = showBackButton || isWeb;
    const showNavMenu = showMenuButton && (!showBackButton || isWeb);

    const runBack = () => {
        if (onBack) onBack();
        else if (router.canGoBack()) router.back();
        else router.push('/staff/dashboard' as any);
    };

    return (
        <Animated.View style={[
            styles.container,
            styles.claySlab,
            // Safe-area inset is already applied globally (stackShell sits below
            // the school ribbon), so re-adding insets.top here double-counted it
            // and left a gap under the ribbon. Only a small breathing pad is needed.
            { paddingTop: isWeb ? 12 : Spacing.xs, shadowColor: accent },
            isAbsolute && styles.absoluteHeader,
            animatedStyle
        ]}>
            {/* Soft gloss sweeping across the top of the clay slab. */}
            {isWeb ? <View pointerEvents="none" style={styles.claySheen} /> : null}

            <View style={styles.contentRow}>
                {/* Left: native = menu on home, back on inner; web = both when menu enabled */}
                <View style={[styles.leftSection, showNavBack && showNavMenu && styles.leftSectionDual]}>
                    {showNavBack ? (
                        <ClayIconButton onPress={runBack} isDark={isDark} accent={accent}>
                            <Ionicons name="arrow-back" size={19} color={accent} />
                        </ClayIconButton>
                    ) : null}
                    {showNavMenu ? (
                        <ClayIconButton onPress={handleMenuPress} isDark={isDark} accent={accent}>
                            <Feather name="menu" size={19} color={accent} />
                        </ClayIconButton>
                    ) : null}
                </View>

                {/* Center: Branding */}
                <View style={styles.centerSection}>
                    <Text
                        style={[
                            styles.title,
                            { color: theme.colors.textStrong },
                            { textShadowColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.85)' },
                        ]}
                    >
                        {title}
                    </Text>
                    {subtitle && (
                        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>{subtitle}</Text>
                    )}
                </View>

                {/* Right: Actions */}
                <View style={styles.rightSection}>
                    {showProfileButton && (
                        <ClayIconButton
                            onPress={() => router.push('/staff/settings' as any)}
                            isDark={isDark}
                            accent={accent}
                            round
                            size={40}
                        >
                            <Ionicons name="settings-outline" size={18} color={accent} />
                        </ClayIconButton>
                    )}
                </View>
            </View>

            <MenuOverlay visible={menuVisible} onClose={() => setMenuVisible(false)} userType="staff" photoUrl={user?.photoUrl} />
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: Spacing.md,
        paddingBottom: Spacing.sm,
    },
    /* Puffed clay slab: rounded bottom edge + soft lifted shadow. */
    claySlab: {
        borderBottomLeftRadius: 26,
        borderBottomRightRadius: 26,
        shadowOffset: { width: 0, height: 10 },
        shadowRadius: 20,
    },
    claySheen: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '65%',
        borderBottomLeftRadius: 26,
        borderBottomRightRadius: 26,
        backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 100%)',
    } as object,
    contentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 54,
    },
    leftSection: {
        width: 84,
        alignItems: 'flex-start',
    },
    leftSectionDual: {
        width: 100,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    centerSection: {
        flex: 1,
        alignItems: 'center',
    },
    rightSection: {
        width: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
    },
    title: {
        fontSize: 17,
        fontWeight: '800',
        letterSpacing: -0.3,
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 0,
    },
    subtitle: {
        marginTop: 1,
        fontSize: 12.5,
        fontWeight: '600',
        letterSpacing: 0.15,
        opacity: 0.85,
    },
    absoluteHeader: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
    }
});

export default StaffHeader;
