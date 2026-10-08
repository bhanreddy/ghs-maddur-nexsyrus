import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Href, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Image,
    Keyboard,
    Modal,
    Platform,
    Pressable,
    StatusBar,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    useWindowDimensions,
    View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    Extrapolation,
    interpolate,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useFeatures } from '../hooks/useFeatures';
import type { FeatureKey } from '../config/featureFlags';
import { schoolColorWithAlpha } from '../constants/schoolConfig';
import * as Haptics from '../utils/haptics';

/* ─── Color themes per Role ─── */
const ROLE_THEMES = {
    student: {
        roleBg: '#ECFDF5',
        roleText: '#065F46',
        roleBorder: '#A7F3D0',
    },
    staff: {
        roleBg: '#EEF2FF',
        roleText: '#3730A3',
        roleBorder: '#C7D2FE',
    },
    driver: {
        roleBg: '#FDF2F8',
        roleText: '#9D174D',
        roleBorder: '#FBCFE8',
    },
};

/* Desaturated pastel colors for soft claymorphic card tiles */
const pastelBackgrounds = {
    '#0D9488': { light: '#F0FAF8', dark: 'rgba(13, 148, 136, 0.08)' }, // DCGD / Teal
    '#6366F1': { light: '#F2F3FF', dark: 'rgba(99, 102, 241, 0.08)' }, // AI Doubt / Lilac-Blue
    '#10B981': { light: '#F0FAF4', dark: 'rgba(16, 185, 129, 0.08)' }, // Insurance / Mint
    '#8B5CF6': { light: '#F5F1FF', dark: 'rgba(139, 92, 246, 0.08)' }, // Money Science / Purple
    '#4F46E5': { light: '#F2F3FF', dark: 'rgba(79, 70, 229, 0.08)' },  // Mark Attendance / Indigo
    '#0EA5E9': { light: '#F0FAFF', dark: 'rgba(14, 165, 233, 0.08)' }, // Timetable / Sky
    '#EC4899': { light: '#FFF2F8', dark: 'rgba(236, 72, 153, 0.08)' }, // Route / Pink
    '#EF4444': { light: '#FFF5F5', dark: 'rgba(239, 68, 68, 0.08)' },  // Logout / Red
};

const pastelBorders = {
    '#0D9488': { light: 'rgba(13, 148, 136, 0.15)', dark: 'rgba(13, 148, 136, 0.22)' },
    '#6366F1': { light: 'rgba(99, 102, 241, 0.15)', dark: 'rgba(99, 102, 241, 0.22)' },
    '#10B981': { light: 'rgba(16, 185, 129, 0.15)', dark: 'rgba(16, 185, 129, 0.22)' },
    '#8B5CF6': { light: 'rgba(139, 92, 246, 0.15)', dark: 'rgba(139, 92, 246, 0.22)' },
    '#4F46E5': { light: 'rgba(79, 70, 229, 0.15)', dark: 'rgba(79, 70, 229, 0.22)' },
    '#0EA5E9': { light: 'rgba(14, 165, 233, 0.15)', dark: 'rgba(14, 165, 233, 0.22)' },
    '#EC4899': { light: 'rgba(236, 72, 153, 0.15)', dark: 'rgba(236, 72, 153, 0.22)' },
    '#EF4444': { light: 'rgba(239, 68, 68, 0.15)', dark: 'rgba(239, 68, 68, 0.22)' },
};

const getPastelStyles = (accent: string, isDark: boolean) => {
    const bgMap = pastelBackgrounds[accent as keyof typeof pastelBackgrounds];
    const borderMap = pastelBorders[accent as keyof typeof pastelBorders];
    
    return {
        background: bgMap ? (isDark ? bgMap.dark : bgMap.light) : (isDark ? 'rgba(255, 255, 255, 0.05)' : '#F4F6FB'),
        border: borderMap ? (isDark ? borderMap.dark : borderMap.light) : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)'),
    };
};

interface Props {
    visible: boolean;
    onClose: () => void;
    userType?: 'student' | 'staff' | 'driver';
    photoUrl?: string | null;
    menuItems?: MenuItem[];
    onNavigate?: (link: string) => void;
}

export interface MenuItem {
    group?: string;
    key: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    link: string;
    hint?: string;
    accent?: string;
    /** Feature-flag key gating this drawer item (student items only). */
    feature?: FeatureKey;
}

/* ─── Individual Menu Item with press animation ─── */
const MenuItemCard: React.FC<{ item: MenuItem; isDark: boolean; onPress: () => void }> = ({ item, isDark, onPress }) => {
    const accentColor = item.accent || '#4F46E5';
    const textClr = isDark ? '#E2E8F0' : '#1E293B';
    const hintClr = isDark ? '#94A3B8' : '#64748B';

    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={item.hint ? `${item.label}. ${item.hint}` : item.label}
            style={({ pressed }) => [
                styles.menuCard,
                pressed && { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(79,70,229,0.05)' },
                Platform.OS === 'web' && { cursor: 'pointer' },
            ]}
        >
            <View style={[styles.menuIconBox, { backgroundColor: schoolColorWithAlpha(accentColor, isDark ? 0.2 : 0.1) }]}>
                <Ionicons name={item.icon} size={17} color={accentColor} />
            </View>
            <View style={styles.menuCopy}>
                <Text style={[styles.menuLabel, { color: textClr }]} numberOfLines={1}>{item.label}</Text>
                {!!item.hint && <Text style={[styles.menuHint, { color: hintClr }]} numberOfLines={1}>{item.hint}</Text>}
            </View>
            <Ionicons name="chevron-forward" size={15} color={isDark ? '#64748B' : '#CBD5E1'} />
        </Pressable>
    );
};

/* ─── Main Component ─── */
const MenuOverlay: React.FC<Props> = ({ visible, onClose, userType = 'student', photoUrl, menuItems, onNavigate }) => {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    useEffect(() => { if (!visible) setQuery(''); }, [visible]);
    const router = useRouter();
    const { user, signOut } = useAuth();
    const { theme, isDark } = useTheme();
    const roleTheme = ROLE_THEMES[userType];

    const { width: screenWidth } = useWindowDimensions();
    const drawerWidth = Math.min(screenWidth * 0.82, 350);

    const translateX = useSharedValue(-350);
    const backdropOpacity = useSharedValue(0);

    /* ── Menu items ── */
    const studentMenuItems: MenuItem[] = [
        { key: 'daily', label: t('school_daily.title', 'SchoolIMS Daily'), icon: 'sunny-outline', link: '/Screen/schoolDaily', accent: '#2C68B0' },
        { key: 'calendar', label: 'School Calendar', icon: 'calendar-outline', link: '/Screen/calendar', accent: '#4F46E5' },
        { key: 'progress', label: 'My Progress', icon: 'sparkles-outline', link: '/Screen/studentProgress', accent: '#6366F1' },
        { key: 'dcgd', label: 'DCGD', icon: 'ribbon-outline', link: '/Screen/dcgd', accent: '#0D9488', feature: 'menu.dcgd' },
        { key: 'ai_doubt', label: 'AI Doubt Assist', icon: 'chatbubble-ellipses-outline', link: '/Screen/aiChat', accent: '#6366F1', feature: 'menu.ai_doubt_assist' },
        { key: 'insurance', label: 'Insurance', icon: 'shield-checkmark-outline', link: '/Screen/insurance', accent: '#10B981', feature: 'menu.insurance' },
        { key: 'hostel', label: 'Hostel', icon: 'bed-outline', link: '/Screen/hostel', accent: '#6366F1', feature: 'quick.hostel' },
        { key: 'money_science', label: 'Money Science', icon: 'cash-outline', link: '/Screen/moneyScience', accent: '#8B5CF6', feature: 'menu.money_science' },
    ];

    const staffMenuItems: MenuItem[] = [
        { key: 'daily', label: t('school_daily.title', 'SchoolIMS Daily'), icon: 'sunny-outline', link: '/Screen/schoolDaily', accent: '#2C68B0' },
        { key: 'calendar', label: 'Academic Calendar', icon: 'calendar-outline', link: '/staff/calendar', accent: '#4F46E5' },
        { key: 'attendance', label: 'Mark Attendance', icon: 'checkbox-outline', link: '/staff/manage-students', accent: '#4F46E5' },
        { key: 'timetable', label: 'My Timetable', icon: 'calendar-outline', link: '/staff/timetable', accent: '#0EA5E9' },
        { key: 'student_portfolio', label: 'Student Portfolio', icon: 'id-card-outline', link: '/staff/student-portfolio', accent: '#14B8A6' },
        { key: 'anecdotes', label: 'Observations & Anecdotes', icon: 'eye-outline', link: '/staff/anecdotes', accent: '#6366F1' },
        { key: 'student_intelligence', label: 'Student Intelligence', icon: 'sparkles-outline', link: '/staff/student-intelligence', accent: '#8B5CF6' },
        { key: 'upload_marks', label: 'Upload Marks', icon: 'cloud-upload-outline', link: '/staff/results', accent: '#8B5CF6' },
        { key: 'leaves', label: 'Apply Leave', icon: 'document-text-outline', link: '/staff/leaves', accent: '#F59E0B' },
        { key: 'profile', label: 'Staff Profile', icon: 'person-outline', link: '/staff/profile', accent: '#10B981' },
    ];

    const driverMenuItems: MenuItem[] = [
        { key: 'calendar', label: 'School Calendar', icon: 'calendar-outline', link: '/driver/calendar', accent: '#4F46E5' },
        { key: 'route', label: t('driver_ui.route'), icon: 'navigate-outline', link: '/driver/dashboard', accent: '#EC4899' },
        { key: 'students', label: t('driver_ui.students'), icon: 'people-outline', link: '/driver/students', accent: '#6366F1' },
        { key: 'profile', label: t('driver_ui.driver_profile'), icon: 'person-outline', link: '/driver/profile', accent: '#10B981' },
    ];

    const { isEnabled } = useFeatures();
    const baseItems = menuItems ?? (userType === 'driver' ? driverMenuItems : userType === 'staff' ? staffMenuItems : studentMenuItems);
    const normalizedQuery = query.trim().toLowerCase();
    const itemsToRender = baseItems.filter((it) => (!it.feature || isEnabled(it.feature))
        && (!normalizedQuery || `${it.label} ${it.hint || ''} ${it.group || ''}`.toLowerCase().includes(normalizedQuery)));
    const sections = useMemo(() => {
        const grouped: { title: string; items: MenuItem[] }[] = [];
        for (const item of itemsToRender) {
            const title = item.group || '';
            const current = grouped[grouped.length - 1];
            if (!current || current.title !== title) grouped.push({ title, items: [item] });
            else current.items.push(item);
        }
        return grouped;
    }, [itemsToRender]);

    /* ── Animations ── */
    useEffect(() => {
        if (visible) {
            translateX.value = withSpring(0, { damping: 18, stiffness: 150, mass: 0.9 });
            backdropOpacity.value = withTiming(1, { duration: 350 });
        } else {
            translateX.value = withTiming(-drawerWidth, { duration: 250 });
            backdropOpacity.value = withTiming(0, { duration: 200 });
        }
    }, [visible, drawerWidth, translateX, backdropOpacity]);

    const closeDrawer = useCallback(() => {
        translateX.value = withTiming(-drawerWidth, { duration: 250 });
        backdropOpacity.value = withTiming(0, { duration: 200 });
        setTimeout(onClose, 260);
    }, [onClose, drawerWidth, translateX, backdropOpacity]);

    /* ── Swipe gesture ── */
    const panGesture = Gesture.Pan()
        .activeOffsetX(-20)
        .failOffsetY([-12, 12])
        .onUpdate((e) => {
            if (e.translationX < 0) {
                translateX.value = e.translationX;
            }
        })
        .onEnd((e) => {
            if (e.translationX < -80 || e.velocityX < -500) {
                translateX.value = withTiming(-drawerWidth, { duration: 220 });
                backdropOpacity.value = withTiming(0, { duration: 200 });
                runOnJS(onClose)();
            } else {
                translateX.value = withSpring(0, { damping: 18, stiffness: 150, mass: 0.9 });
            }
        });

    /* ── Animated styles ── */
    const drawerStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: interpolate(backdropOpacity.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    }));

    /* ── Handlers ── */
    const handlePress = (link: string) => {
        console.debug('[MenuOverlay] handlePress start', { link });
        try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            closeDrawer();
            setTimeout(() => {
                try {
                    if (onNavigate) onNavigate(link);
                    else router.push(link as Href);
                    console.debug('[MenuOverlay] handlePress end', { link });
                } catch (e) {
                    console.error('Button action failed:', e);
                }
            }, 260);
        } catch (e) {
            console.error('Button action failed:', e);
        }
    };

    const handleLogout = async () => {
        console.debug('[MenuOverlay] handleLogout start');
        try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            closeDrawer();
            setTimeout(async () => {
                try {
                    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
                    const autoLoginKey = userType === 'staff' ? 'staff_auto_login'
                        : userType === 'driver' ? 'driver_auto_login'
                        : 'student_auto_login';
                    await AsyncStorage.removeItem(autoLoginKey);
                    await signOut();
                    router.replace('/welcome');
                    console.debug('[MenuOverlay] handleLogout end');
                } catch (e) {
                    console.error('Button action failed:', e);
                }
            }, 260);
        } catch (e) {
            console.error('Button action failed:', e);
        }
    };

    if (!visible) return null;

    const displayName = user?.displayName || (userType === 'driver'
        ? t('driver_ui.driver')
        : userType === 'staff' ? 'Staff Member' : 'Student');
    const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
    const { background: logoutBg, border: logoutBorder } = getPastelStyles('#EF4444', isDark);

    // Derived branded colors from schoolTheme
    const primaryColor = theme.colors.primary;
    const accentColor = theme.colors.accent;
    const primaryLightColor = theme.colors.primaryLight || primaryColor;
    const textPrimaryColor = theme.colors.textPrimary || (isDark ? '#F1F5F9' : '#0F172A');
    const borderThemeColor = theme.colors.border || (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)');
    
    const backgroundColors: [string, string] = isDark
        ? [schoolColorWithAlpha(theme.colors.primaryDark || '#0A1428', 0.90), schoolColorWithAlpha(theme.colors.background || '#0F172A', 0.94)]
        : [schoolColorWithAlpha(theme.colors.surface || '#FFFFFF', 0.85), schoolColorWithAlpha(theme.colors.background || '#F4F6F9', 0.92)];

    return (
        <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={closeDrawer}>
            <GestureHandlerRootView style={StyleSheet.absoluteFill}>
                <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

                {/* Dimmed backdrop */}
                <Animated.View style={[styles.backdrop, backdropStyle]}>
                    <Pressable
                        style={[StyleSheet.absoluteFill, Platform.OS === 'web' && { cursor: 'pointer' }]}
                        onPress={closeDrawer}
                    />
                </Animated.View>

                {/* Drawer panel */}
                <GestureDetector gesture={panGesture}>
                    <Animated.View style={[
                        styles.drawer,
                        {
                            width: drawerWidth,
                            borderColor: borderThemeColor
                        },
                        drawerStyle
                    ]}>
                        {/* Frosted Acrylic Blur Surface */}
                        <BlurView
                            intensity={isDark ? 50 : 70}
                            tint={isDark ? 'dark' : 'light'}
                            style={StyleSheet.absoluteFill}
                        />

                        {/* Branded gradient sheeting layer */}
                        <LinearGradient
                            colors={backgroundColors}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />

                        {/* Branded ambient decorative accent blob */}
                        <View style={[
                            styles.profileBlob,
                            { backgroundColor: schoolColorWithAlpha(accentColor, 0.08) }
                        ]} pointerEvents="none" />

                        <SafeAreaView style={styles.drawerInner} edges={['top', 'bottom']}>

                            {/* ── Profile Header ── */}
                            <View style={styles.profileSection}>
                                <View style={styles.avatarRow}>
                                    <Pressable
                                        style={styles.profileTap}
                                        disabled={userType !== 'staff'}
                                        onPress={userType === 'staff' ? () => handlePress('/staff/profile') : undefined}
                                        accessibilityRole={userType === 'staff' ? 'button' : undefined}
                                        accessibilityLabel={userType === 'staff' ? 'Open my profile' : undefined}
                                    >
                                    {/* Double ring avatar featuring school brand colors */}
                                    <LinearGradient
                                        colors={[accentColor, primaryLightColor]}
                                        style={[styles.avatarRing, { shadowColor: accentColor }]}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                    >
                                        <View style={[styles.avatarInner, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
                                            {photoUrl ? (
                                                <Image source={{ uri: photoUrl }} style={styles.avatarImage} />
                                            ) : (
                                                <Text style={[styles.avatarText, { color: primaryColor }]}>{initials}</Text>
                                            )}
                                        </View>
                                    </LinearGradient>
                                    <View style={styles.profileInfo}>
                                        <Text style={[styles.profileName, { color: textPrimaryColor }]} numberOfLines={1}>
                                            {displayName}
                                        </Text>
                                        <View style={[styles.roleBadge, {
                                            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : roleTheme.roleBg,
                                            borderColor: isDark ? 'rgba(255,255,255,0.1)' : roleTheme.roleBorder,
                                        }]}>
                                            <Text style={[styles.roleText, { color: isDark ? '#94A3B8' : roleTheme.roleText }]}>
                                                {userType === 'driver' ? t('driver_ui.driver') : userType === 'staff' ? 'Staff' : 'Student'}
                                            </Text>
                                        </View>
                                    </View>
                                    </Pressable>

                                    {/* Clean Header Close Button */}
                                    <Pressable
                                        style={({ pressed }) => [
                                            styles.headerCloseButton,
                                            { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : theme.colors.borderLight },
                                            pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] },
                                            Platform.OS === 'web' && { cursor: 'pointer' }
                                        ]}
                                        onPress={() => {
                                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                            closeDrawer();
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel={t('driver_ui.close_menu')}
                                    >
                                        <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
                                    </Pressable>
                                </View>
                                <View style={[styles.headerDivider, { backgroundColor: theme.colors.border }]} />
                            </View>

                            {userType === 'staff' && (
                                <View style={[styles.searchBox, { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF' }]}>
                                    <Ionicons name="search" size={16} color={theme.colors.textSecondary} />
                                    <TextInput
                                        value={query}
                                        onChangeText={setQuery}
                                        placeholder="Search by name or task"
                                        accessibilityLabel="Search staff tools"
                                        placeholderTextColor={theme.colors.textSecondary}
                                        style={[styles.searchInput, { color: theme.colors.textStrong }]}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        returnKeyType="search"
                                        onSubmitEditing={Keyboard.dismiss}
                                    />
                                    {query.length > 0 && (
                                        <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}>
                                            <Ionicons name="close-circle" size={18} color={theme.colors.textSecondary} />
                                        </Pressable>
                                    )}
                                </View>
                            )}
                            {/* ── Menu Items ── */}
                            <ScrollView
                                style={{ flex: 1, minHeight: 0 }}
                                contentContainerStyle={styles.menuList}
                                showsVerticalScrollIndicator={false}
                                keyboardShouldPersistTaps="handled"
                                keyboardDismissMode="on-drag"
                                nestedScrollEnabled
                                onScrollBeginDrag={Keyboard.dismiss}
                            >
                                {sections.map((section, sectionIndex) => (
                                    <View key={section.title || 'tools'}>
                                        {!!section.title && (
                                            <View style={[styles.groupHeader, sectionIndex === 0 && { marginTop: 4 }]}>
                                                <Text accessibilityRole="header" style={[styles.groupLabel, { color: theme.colors.textSecondary }]}>{section.title}</Text>
                                                <Text style={[styles.groupCount, { color: theme.colors.textSecondary }]}>{section.items.length}</Text>
                                            </View>
                                        )}
                                        <View style={[styles.sectionCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)' }]}>
                                            {section.items.map((item, index) => (
                                                <View key={item.key}>
                                                    {index > 0 && <View style={[styles.rowDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)' }]} />}
                                                    <MenuItemCard item={item} isDark={isDark} onPress={() => handlePress(item.link)} />
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                ))}
                                {itemsToRender.length === 0 && (
                                    <View style={styles.emptySearch}>
                                        <Text style={{ color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>No tools match “{query.trim()}”.</Text>
                                        <Pressable onPress={() => setQuery('')} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
                                            <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Clear search</Text>
                                        </Pressable>
                                    </View>
                                )}
                            </ScrollView>

                            {/* ── Logout Button ── */}
                            <View style={[styles.logoutWrap, { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)' }]}>
                                <Pressable
                                    style={Platform.OS === 'web' && { cursor: 'pointer' }}
                                    onPress={handleLogout}
                                    accessibilityRole="button"
                                    accessibilityLabel={userType === 'driver' ? t('driver_ui.logout') : t('logout')}
                                >
                                    <View style={[styles.logoutButton, { backgroundColor: logoutBg, borderColor: logoutBorder }]}>
                                        <View style={[styles.logoutIconBox, { backgroundColor: schoolColorWithAlpha('#EF4444', isDark ? 0.2 : 0.1) }]}>
                                            <Ionicons name="log-out-outline" size={18} color="#EF4444" />
                                        </View>
                                        <Text style={styles.logoutText}>{userType === 'driver' ? t('driver_ui.logout') : t('logout')}</Text>
                                        <Ionicons name="chevron-forward" size={16} color={isDark ? '#FCA5A5' : '#F87171'} />
                                    </View>
                                </Pressable>
                            </View>

                        </SafeAreaView>
                    </Animated.View>
                </GestureDetector>
            </GestureHandlerRootView>
        </Modal>
    );
};

export default MenuOverlay;

/* ======================= STYLES ======================= */

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15,23,42,0.3)',
    },

    drawer: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        borderTopRightRadius: 26,
        borderBottomRightRadius: 26,
        borderRightWidth: 1,
        shadowColor: '#0F172A',
        shadowOffset: { width: 8, height: 0 },
        shadowOpacity: 0.1,
        shadowRadius: 24,
        elevation: 20,
        overflow: 'hidden',
    },

    drawerInner: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 20,
    },

    profileBlob: {
        position: 'absolute',
        top: -80,
        left: -80,
        width: 260,
        height: 260,
        borderRadius: 130,
        opacity: 0.6,
    },

    /* ── Profile Header ── */
    profileSection: {
        marginBottom: 8,
    },

    avatarRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        gap: 8,
    },

    profileTap: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 52,
    },

    avatarRing: {
        width: 50,
        height: 50,
        borderRadius: 25,
        padding: 2.2,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 3,
    },

    avatarInner: {
        flex: 1,
        borderRadius: 23,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },

    avatarImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },

    avatarText: {
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 0.5,
    },

    profileInfo: {
        flex: 1,
        gap: 4,
    },

    profileName: {
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.1,
    },

    roleBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 2.5,
        borderRadius: 12,
        borderWidth: 1,
    },

    roleText: {
        fontSize: 9.5,
        fontWeight: '700',
        letterSpacing: 0.6,
        textTransform: 'uppercase',
    },

    headerCloseButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },

    headerDivider: {
        height: 1,
        marginTop: 4,
        marginBottom: 8,
    },

    /* ── Menu Items ── */
    searchBox: {
        marginBottom: 8,
        minHeight: 44,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderRadius: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },

    searchInput: {
        flex: 1,
        fontSize: 15,
        paddingVertical: 10,
    },

    groupHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 14,
        marginBottom: 8,
        paddingHorizontal: 4,
    },

    groupLabel: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },

    groupCount: {
        fontSize: 11,
        fontWeight: '700',
    },

    menuList: {
        gap: 4,
        paddingTop: 2,
        paddingBottom: 12,
    },

    sectionCard: {
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
    },

    rowDivider: {
        height: StyleSheet.hairlineWidth,
        marginLeft: 56,
    },

    menuCard: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 10,
        gap: 12,
        minHeight: 56,
    },

    menuIconBox: {
        width: 34,
        height: 34,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },

    menuCopy: {
        flex: 1,
        gap: 1,
    },

    menuLabel: {
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: -0.15,
    },

    menuHint: {
        fontSize: 12,
        fontWeight: '500',
    },

    emptySearch: {
        alignItems: 'center',
        paddingTop: 28,
        gap: 4,
    },

    /* ── Logout ── */
    logoutWrap: {
        marginTop: 4,
        paddingTop: 12,
        borderTopWidth: 1,
    },

    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 16,
        paddingVertical: 10,
        paddingHorizontal: 10,
        gap: 12,
        borderWidth: 1,
        minHeight: 52,
    },

    logoutIconBox: {
        width: 34,
        height: 34,
        borderRadius: 11,
        justifyContent: 'center',
        alignItems: 'center',
    },

    logoutText: {
        flex: 1,
        fontSize: 14.5,
        fontWeight: '700',
        letterSpacing: 0.1,
        color: '#EF4444',
    },
});
