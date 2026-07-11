import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Platform, Switch, ViewStyle, TextStyle, useWindowDimensions } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Haptics from '../utils/haptics';
import { isTelugu as isTeluguCheck } from '../utils/lang';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { interpolateColor, interpolate, useAnimatedStyle, Extrapolation, SharedValue } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import MenuOverlay from './MenuOverlay';
import ClayIconButton from './ClayIconButton';
import { Shadows, Spacing } from '../theme/themes';
import { useTheme } from '../hooks/useTheme';
import { useFeatures } from '../hooks/useFeatures';
import { useAuth } from '../hooks/useAuth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { schoolColorWithAlpha } from '../constants/schoolConfig';

/** Brand violet used to tint every clay puck's shadow across the app. */
const CLAY_ACCENT = '#7C6BB8';

/** Reanimated can wrap the vector icon; it must not be nested inside `Animated.Text` (causes "Text strings must be rendered within a <Text> component" on Android). */

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

type HeaderQuickCardProps = {
    label: string;
    colors: readonly [string, string];
    shadowColor: string;
    icon: React.ReactNode;
    compact: boolean;
    onPress: () => void;
};

/** Small navigation card that stays legible over both hero and scrolled headers. */
function HeaderQuickCard({ label, colors, shadowColor, icon, compact, onPress }: HeaderQuickCardProps) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            hitSlop={4}
            onPress={onPress}
            style={({ pressed }) => [
                styles.quickCardPressable,
                compact && styles.quickCardPressableCompact,
                { shadowColor },
                Platform.OS === 'web' && ({ cursor: 'pointer' } as unknown as ViewStyle),
                pressed && styles.quickCardPressed,
            ]}
        >
            <LinearGradient
                colors={colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.quickCardGradient, compact && styles.quickCardGradientCompact]}
            >
                <View style={styles.quickCardGlow} />
                <View style={[styles.tabIconBox, compact && styles.tabIconBoxCompact]}>{icon}</View>
                <Animated.Text style={[styles.tabText, compact && styles.tabTextCompact]} numberOfLines={1}>
                    {label}
                </Animated.Text>
                {!compact && (
                    <View style={styles.quickCardArrow}>
                        <Ionicons name="chevron-forward" size={12} color="#FFFFFF" />
                    </View>
                )}
            </LinearGradient>
        </Pressable>
    );
}

const StudentHeader: React.FC<StudentHeaderProps & { showBackButton?: boolean, title?: string, showSettingsButton?: boolean, rightAction?: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void } }> = ({ onMenuPress, showBackButton = false, title, showSettingsButton = true, rightAction, scrollY, menuUserType = 'student', style: containerStyleOverride, titleStyle: titleStyleOverride }) => {
    const router = useRouter();
    const { isDark } = useTheme();
    const { isEnabled } = useFeatures();
    const { t, i18n } = useTranslation();
    const [isTeluguLang, setIsTeluguLang] = useState(isTeluguCheck(i18n.language));
    const [menuVisible, setMenuVisible] = useState(false);
    const insets = useSafeAreaInsets();
    const { user } = useAuth();
    const { width: viewportWidth } = useWindowDimensions();
    const useCompactQuickCards = viewportWidth < 720;

    React.useEffect(() => {
        setIsTeluguLang(isTeluguCheck(i18n.language));
    }, [i18n.language]);

    const toggleLanguage = async () => {
        const newLang = isTeluguLang ? 'en' : 'te';
        setIsTeluguLang(!isTeluguLang);
        i18n.changeLanguage(newLang);
        await AsyncStorage.setItem('appLanguage', newLang);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const handleMenuPress = () => {
        if (onMenuPress) {
            onMenuPress();
        } else {
            setMenuVisible(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
    };

    const handleTabPress = (tabName: string) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (tabName === 'Diary') {
            router.push('/Screen/diary' as any);
        } else if (tabName === 'LMS') {
            router.push('/Screen/lms' as any);
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
    const showNavBack = showBackButton || isWeb;
    const showNavMenu = !showBackButton || isWeb;

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

    return (
        <Animated.View style={[
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

            {/* Left: native = menu on home, back on subpages; web = both.
                Pucks are always dark-clay — the header's brand identity is dark/cosmic
                whether it's overlaying a hero image or scrolled into a solid app bar. */}
            <View style={[styles.leftNav, showNavBack && showNavMenu && styles.leftNavDual]}>
                {showNavBack ? (
                    <ClayIconButton onPress={handleBack} isDark accent={CLAY_ACCENT}>
                        <Ionicons name="arrow-back" size={19} color="#F4F0FB" />
                    </ClayIconButton>
                ) : null}
                {showNavMenu ? (
                    <ClayIconButton onPress={handleMenuPress} isDark accent={CLAY_ACCENT}>
                        <Ionicons name="menu" size={19} color="#F4F0FB" />
                    </ClayIconButton>
                ) : null}
            </View>

            {/* Center: title (sub-pages) OR school name + Diary/LMS (home). Single flex:1 region avoids overlap with rightActions. */}
            <View style={styles.centerRegion}>
                {title ? (
                    <Animated.Text style={[styles.headerTitle, fontColorStyle, titleStyleOverride]} numberOfLines={1}>
                        {title}
                    </Animated.Text>
                ) : !showBackButton ? (
                    <View style={styles.homeTitleRow}>

                        <View style={styles.tabsContainer}>
                            {isEnabled('topbar.diary') && (
                            <HeaderQuickCard
                                label={t('diary', 'Diary')}
                                colors={['#38BDF8', '#2563EB']}
                                shadowColor="#2563EB"
                                compact={useCompactQuickCards}
                                onPress={() => handleTabPress('Diary')}
                                icon={<Ionicons name="book" size={17} color="#FFFFFF" />}
                            />
                            )}

                            {isEnabled('topbar.lms') && (
                            <HeaderQuickCard
                                label={t('lMS', 'LMS')}
                                colors={['#34D399', '#059669']}
                                shadowColor="#059669"
                                compact={useCompactQuickCards}
                                onPress={() => handleTabPress('LMS')}
                                icon={<MaterialIcons name="computer" size={17} color="#FFFFFF" />}
                            />
                            )}
                        </View>
                    </View>
                ) : null}
            </View>

            <View style={styles.rightActions}>
                {/* Language Switch (Native Toggle) */}
                <View style={styles.langSwitch}>
                    <Animated.Text
                        style={[
                            styles.langLabelBase,
                            fontColorStyle,
                            { opacity: !isTeluguLang ? 1 : 0.42, fontWeight: !isTeluguLang ? '800' : '600' },
                        ]}
                    >
                        En
                    </Animated.Text>
                    <Switch
                        value={isTeluguLang}
                        onValueChange={toggleLanguage}
                        trackColor={
                            isDark
                                ? { false: 'rgba(255,255,255,0.25)', true: 'rgba(255,255,255,0.25)' }
                                : { false: 'rgba(15,23,42,0.22)', true: 'rgba(15,23,42,0.22)' }
                        }
                        thumbColor={isTeluguLang ? '#FFFFFF' : '#FFFFFF'}
                        ios_backgroundColor={isDark ? 'rgba(255,255,255,0.15)' : 'rgba(15,23,42,0.12)'}
                        style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                    />
                    <Animated.Text
                        style={[
                            styles.langLabelBase,
                            fontColorStyle,
                            { opacity: isTeluguLang ? 1 : 0.42, fontWeight: isTeluguLang ? '800' : '600' },
                        ]}
                    >
                        Te
                    </Animated.Text>
                </View>

                {/* Optional page-specific action (e.g. compose a new message) */}
                {rightAction && (
                    <ClayIconButton
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            rightAction.onPress();
                        }}
                        isDark
                        accent={CLAY_ACCENT}
                        round
                        size={38}
                    >
                        <Ionicons name={rightAction.icon} size={18} color="#F4F0FB" />
                    </ClayIconButton>
                )}

                {/* Settings Button */}
                {showSettingsButton && (
                    <ClayIconButton
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            router.push('/Screen/settings' as any);
                        }}
                        isDark
                        accent={CLAY_ACCENT}
                        round
                        size={38}
                    >
                        <Ionicons name="settings-outline" size={17} color="#F4F0FB" />
                    </ClayIconButton>
                )}
            </View>

            <MenuOverlay visible={menuVisible} onClose={() => setMenuVisible(false)} userType={menuUserType} photoUrl={user?.photoUrl} />
        </Animated.View>
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
    leftNav: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    leftNavDual: {
        gap: 10,
    },
    centerRegion: {
        flex: 1,
        minWidth: 0,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 6,
    },
    homeTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        minWidth: 0,
        maxWidth: '100%',
    },
    tabsContainer: {
        flexDirection: 'row',
        flexShrink: 0,
        gap: 10,
    },
    quickCardPressable: {
        minWidth: 124,
        borderRadius: 16,
        shadowOffset: { width: 0, height: 7 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 6,
    },
    quickCardPressableCompact: {
        minWidth: 0,
        borderRadius: 14,
    },
    quickCardPressed: {
        transform: [{ translateY: 2 }, { scale: 0.98 }],
        shadowOpacity: 0.16,
        shadowRadius: 5,
        elevation: 3,
    },
    quickCardGradient: {
        height: 48,
        paddingHorizontal: 10,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.28)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        overflow: 'hidden',
    },
    quickCardGradientCompact: {
        height: 42,
        paddingHorizontal: 9,
        borderRadius: 14,
        gap: 7,
    },
    quickCardGlow: {
        position: 'absolute',
        width: 64,
        height: 64,
        borderRadius: 32,
        top: -40,
        right: -12,
        backgroundColor: 'rgba(255,255,255,0.22)',
    },
    tabIconBox: {
        width: 30,
        height: 30,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.18)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
    },
    tabIconBoxCompact: {
        width: 26,
        height: 26,
        borderRadius: 8,
    },
    tabText: {
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: 0.2,
        color: '#FFFFFF',
        flexGrow: 1,
    },
    tabTextCompact: {
        fontSize: 13,
    },
    quickCardArrow: {
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.12)',
    },
    rightActions: {
        flexShrink: 0,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingRight: Spacing.xs,
    },
    langSwitch: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    langLabelBase: {
        fontSize: 11,
        letterSpacing: 0.3,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '800',
        letterSpacing: 0.2,
    },
    headerTitleHome: {
        flexShrink: 1,
        marginLeft: 0,
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
