import { AppTourHeaderButton, TourTarget } from '@/src/features/app-tour';
import React, { useState } from 'react';
import { View, StyleSheet, Platform, ViewStyle, TextStyle, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Haptics from '../utils/haptics';
import { isTelugu as isTeluguCheck } from '../utils/lang';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { interpolateColor, interpolate, useAnimatedStyle, Extrapolation, SharedValue } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import MenuOverlay from './MenuOverlay';
import ClayIconButton from './ClayIconButton';
import LanguageToggle from './LanguageToggle';
import { Shadows, Spacing } from '../theme/themes';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { notificationInboxService } from '../services/notificationInboxService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { schoolColorWithAlpha } from '../constants/schoolConfig';

/** Brand violet used to tint every clay puck's shadow across the app. */
const CLAY_ACCENT = '#7C6BB8';
const ICON_SIZE = 36;

interface StudentHeaderProps {
    onMenuPress?: () => void;
    scrollY?: SharedValue<number>;
    menuUserType?: 'student' | 'staff' | 'driver';
    /** Override container style (e.g. transparent background) */
    style?: ViewStyle;
    /** Override title text style */
    titleStyle?: TextStyle;
}

const isWeb = Platform.OS === 'web';

const StudentHeader: React.FC<StudentHeaderProps & { showBackButton?: boolean, title?: string, showSettingsButton?: boolean, rightAction?: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void } }> = ({ onMenuPress, showBackButton = false, title, showSettingsButton = true, rightAction, scrollY, menuUserType = 'student', style: containerStyleOverride, titleStyle: titleStyleOverride }) => {
    const router = useRouter();
    const { isDark } = useTheme();
    const { i18n } = useTranslation();
    const [isTeluguLang, setIsTeluguLang] = useState(isTeluguCheck(i18n.language));
    const [menuVisible, setMenuVisible] = useState(false);
    const insets = useSafeAreaInsets();
    const { user } = useAuth();
    const { width } = useWindowDimensions();
    const isCompact = width < 420;

    React.useEffect(() => {
        setIsTeluguLang(isTeluguCheck(i18n.language));
    }, [i18n.language]);

    const setLanguage = async (language: 'en' | 'te') => {
        const nextIsTelugu = language === 'te';
        if (nextIsTelugu === isTeluguLang) return;

        setIsTeluguLang(nextIsTelugu);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await Promise.all([
            i18n.changeLanguage(language),
            AsyncStorage.setItem('appLanguage', language),
        ]);
    };

    const handleMenuPress = () => {
        if (onMenuPress) {
            onMenuPress();
        } else {
            setMenuVisible(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
    };

    const handleBack = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (router.canGoBack()) {
            router.back();
        } else {
            router.replace('/(tabs)/home');
        }
    };

    const animatedStyle = useAnimatedStyle(() => {
        if (!scrollY) {
            /* The cosmic gradient (below) always paints over this — only the lifted shadow matters here. */
            return { backgroundColor: 'transparent', borderBottomColor: 'transparent', shadowOpacity: 0.35 };
        }

        const bgEnd = isDark ? 'rgba(15,23,42,0.97)' : 'rgba(255,255,255,0.95)';
        const borderEnd = schoolColorWithAlpha(CLAY_ACCENT, isDark ? 0.4 : 0.2);
        const bgColor = interpolateColor(
            scrollY.value,
            [0, 50],
            ['rgba(255,255,255,0)', bgEnd]
        );
        const borderColor = interpolateColor(
            scrollY.value,
            [0, 50],
            [schoolColorWithAlpha(CLAY_ACCENT, 0), borderEnd]
        );
        const shadowOpacity = interpolate(
            scrollY.value,
            [0, 50],
            [0, isDark ? 0.35 : 0.16],
            Extrapolation.CLAMP
        );

        return {
            backgroundColor: bgColor,
            borderBottomColor: borderColor,
            shadowOpacity,
        };
    }, [isDark]);

    const isAbsolute = !!scrollY;
    /** Students use the bottom dock — never show a header back affordance. */
    const showNavBack = menuUserType === 'driver' ? showBackButton : false;
    // Student navigation now lives in the bottom dock. Keep the drawer trigger
    // only for driver screens that still use MenuOverlay.
    const showNavMenu = menuUserType !== 'student'
      && (!showBackButton || isWeb || menuUserType === 'driver');

    const fontColorStyle = useAnimatedStyle(() => {
        if (!scrollY) return { color: '#FFFFFF' };
        const end = isDark ? '#F1F5F9' : '#1F2937';
        return {
            color: interpolateColor(
                scrollY.value,
                [0, 50],
                ['#FFFFFF', end]
            )
        };
    }, [isDark]);

    // Without scrollY this header always uses the cosmic navy gradient, even
    // while the app is in light mode. Base the toggle contrast on its actual
    // surface instead of the global theme.
    const languageOnDarkSurface = !scrollY || isDark;

    // Solid fills (no LinearGradient / elevation) — Android otherwise paints a
    // white rectangle over the inactive segment.
    const langSwitch = (
        <LanguageToggle
            compact={isCompact || !!scrollY}
            language={isTeluguLang ? 'te' : 'en'}
            onLanguageChange={setLanguage}
            darkBackground={languageOnDarkSurface}
            trackColor={languageOnDarkSurface ? 'rgba(116,101,184,0.24)' : 'rgba(124,107,184,0.12)'}
            borderColor={languageOnDarkSurface ? 'rgba(222,216,255,0.30)' : 'rgba(124,107,184,0.22)'}
            activeBackgroundColor={languageOnDarkSurface ? '#7568CF' : '#6B5CC4'}
            activeLabelColor="#FFFFFF"
            inactiveLabelColor={languageOnDarkSurface ? '#E9E5FF' : 'rgba(55,48,107,0.72)'}
        />
    );

    const rightCount = 1 + (rightAction ? 1 : 0) + (showSettingsButton ? 1 : 0);
    const leftCount = 1 + (showNavBack ? 1 : 0) + (showNavMenu ? 1 : 0);

    return (
        <TourTarget id={menuUserType === 'driver' ? 'driver.navigation' : menuUserType === 'staff' ? 'staff.navigation' : 'student.header'} native><Animated.View style={[
            styles.container,
            // On the student tabs the header sits inside a nested SafeAreaProvider
            // (ScreenLayout), so insets.top collapses to ~0 and the header rode up
            // under the school ribbon. The global stackShell already applies the real
            // safe-area offset, so a small fixed floor is all that's needed to clear
            // the ribbon's wave without re-introducing a large gap.
            { paddingTop: isWeb ? 12 : Math.max(insets.top, 16), shadowColor: CLAY_ACCENT },
            isAbsolute && styles.absoluteHeader,
            animatedStyle,
            containerStyleOverride,
        ]}>
            {!scrollY && (
                <LinearGradient
                    colors={['#05050A', '#13132B']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
            )}

            {/* Left: language first, then nav — one-thumb reachable. */}
            <View style={[styles.sideRegion, styles.leftRegion]}>
                {langSwitch}
                {showNavBack ? (
                    <ClayIconButton onPress={handleBack} isDark accent={CLAY_ACCENT} round size={ICON_SIZE}>
                        <Ionicons name="arrow-back" size={18} color="#F4F0FB" />
                    </ClayIconButton>
                ) : null}
                {showNavMenu ? (
                    <ClayIconButton onPress={handleMenuPress} isDark accent={CLAY_ACCENT} round size={ICON_SIZE}>
                        <Ionicons name="menu" size={18} color="#F4F0FB" />
                    </ClayIconButton>
                ) : null}
                {/* Spacer keeps left/right visual weight closer when sides differ. */}
                {leftCount < rightCount ? <View style={styles.sideBalance} /> : null}
            </View>

            {/* Center: page title only. */}
            <View style={styles.centerRegion} pointerEvents="none">
                {title ? (
                    <Animated.Text style={[styles.headerTitle, fontColorStyle, titleStyleOverride]} numberOfLines={1}>
                        {title}
                    </Animated.Text>
                ) : null}
            </View>

            <View style={[styles.sideRegion, styles.rightRegion]}>
                <AppTourHeaderButton color="#F4F0FB" />
                {rightCount < leftCount ? <View style={styles.sideBalance} /> : null}

                <ClayIconButton
                    onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        void notificationInboxService.markAllRead();
                        router.push('/notifications' as any);
                    }}
                    isDark
                    accent={CLAY_ACCENT}
                    round
                    size={ICON_SIZE}
                >
                    <Ionicons name="notifications-outline" size={17} color="#F4F0FB" />
                </ClayIconButton>

                {rightAction && (
                    <ClayIconButton
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            rightAction.onPress();
                        }}
                        isDark
                        accent={CLAY_ACCENT}
                        round
                        size={ICON_SIZE}
                    >
                        <Ionicons name={rightAction.icon} size={17} color="#F4F0FB" />
                    </ClayIconButton>
                )}

                {showSettingsButton && (
                    <ClayIconButton
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            router.push('/Screen/settings' as any);
                        }}
                        isDark
                        accent={CLAY_ACCENT}
                        round
                        size={ICON_SIZE}
                    >
                        <Ionicons name="settings-outline" size={16} color="#F4F0FB" />
                    </ClayIconButton>
                )}
            </View>

            {menuUserType !== 'student' && (
                <MenuOverlay visible={menuVisible} onClose={() => setMenuVisible(false)} userType={menuUserType} photoUrl={user?.photoUrl} />
            )}
        </Animated.View></TourTarget>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingBottom: Spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'transparent',
        borderBottomLeftRadius: 26,
        borderBottomRightRadius: 26,
        overflow: 'hidden',
        ...Shadows.sm,
        shadowOffset: { width: 0, height: 10 },
        shadowRadius: 20,
    },
    sideRegion: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexGrow: 1,
        flexShrink: 0,
        flexBasis: 0,
        minWidth: 72,
    },
    leftRegion: {
        justifyContent: 'flex-start',
    },
    rightRegion: {
        justifyContent: 'flex-end',
        flexBasis: 'auto',
        flexGrow: 0,
    },
    sideBalance: {
        width: ICON_SIZE,
        height: ICON_SIZE,
        opacity: 0,
    },
    centerRegion: {
        flexGrow: 0,
        flexShrink: 1,
        maxWidth: '46%',
        minWidth: 0,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 6,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '800',
        letterSpacing: 0.2,
        textAlign: 'center',
    },
    absoluteHeader: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
    },
});

export default StudentHeader;
