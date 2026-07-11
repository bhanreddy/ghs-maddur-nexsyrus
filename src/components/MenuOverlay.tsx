import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Href, useRouter } from 'expo-router';
import React, { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Image,
    Modal,
    Platform,
    Pressable,
    StatusBar,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    Extrapolation,
    FadeInLeft,
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
}

interface MenuItem {
    key: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    link: string;
    accent?: string;
    /** Feature-flag key gating this drawer item (student items only). */
    feature?: FeatureKey;
}

/* ─── Individual Menu Item with press animation ─── */
const MenuItemCard: React.FC<{ item: MenuItem; index: number; isDark: boolean; onPress: () => void }> = ({ item, index, isDark, onPress }) => {
    const scale = useSharedValue(1);

    const animStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const accentColor = item.accent || '#4F46E5';
    const { background: cardBg, border: cardBorder } = getPastelStyles(accentColor, isDark);
    
    const textClr = isDark ? '#E2E8F0' : '#2A3142';
    const shadowOpacity = isDark ? 0 : 0.04;

    return (
        <Animated.View entering={FadeInLeft.delay(80 + index * 50).springify().damping(16).stiffness(150)}>
            <Pressable
                onPressIn={() => { scale.value = withSpring(0.96, { damping: 15, stiffness: 350 }); }}
                onPressOut={() => { scale.value = withSpring(1, { damping: 12, stiffness: 220 }); }}
                onPress={onPress}
                style={Platform.OS === 'web' && { cursor: 'pointer' }}
            >
                <Animated.View style={[
                    styles.menuCard,
                    {
                        backgroundColor: cardBg,
                        borderColor: cardBorder,
                        shadowOpacity: shadowOpacity,
                        borderBottomWidth: isDark ? 1.2 : 2.5, // Puffy clay depth edge
                    },
                    animStyle
                ]}>
                    {/* Clay inner highlight top-left gradient */}
                    <LinearGradient
                        colors={isDark 
                            ? ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0)'] 
                            : ['rgba(255,255,255,0.65)', 'rgba(255,255,255,0)']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0.5, y: 0.8 }}
                        style={StyleSheet.absoluteFill}
                        pointerEvents="none"
                    />

                    {/* Icon Box with soft tint background */}
                    <View style={[
                        styles.menuIconBox, 
                        { 
                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#FFFFFF',
                            borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)',
                            borderWidth: 1,
                        }
                    ]}>
                        <Ionicons name={item.icon} size={18} color={accentColor} />
                    </View>
                    <Text style={[styles.menuLabel, { color: textClr }]}>{item.label}</Text>
                    <View style={[
                        styles.chevronBox, 
                        { 
                            backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF',
                            borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)',
                            borderWidth: 1,
                        }
                    ]}>
                        <Ionicons name="chevron-forward" size={13} color={isDark ? '#475569' : '#94A3B8'} />
                    </View>
                </Animated.View>
            </Pressable>
        </Animated.View>
    );
};

/* ─── Main Component ─── */
const MenuOverlay: React.FC<Props> = ({ visible, onClose, userType = 'student', photoUrl }) => {
    const { t } = useTranslation();
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
        { key: 'dcgd', label: 'DCGD', icon: 'ribbon-outline', link: '/Screen/dcgd', accent: '#0D9488', feature: 'menu.dcgd' },
        { key: 'ai_doubt', label: 'AI Doubt Assist', icon: 'chatbubble-ellipses-outline', link: '/Screen/aiChat', accent: '#6366F1', feature: 'menu.ai_doubt_assist' },
        { key: 'insurance', label: 'Insurance', icon: 'shield-checkmark-outline', link: '/Screen/insurance', accent: '#10B981', feature: 'menu.insurance' },
        { key: 'money_science', label: 'Money Science', icon: 'cash-outline', link: '/Screen/moneyScience', accent: '#8B5CF6', feature: 'menu.money_science' },
    ];

    const staffMenuItems: MenuItem[] = [
        { key: 'attendance', label: 'Mark Attendance', icon: 'checkbox-outline', link: '/staff/manage-students', accent: '#4F46E5' },
        { key: 'timetable', label: 'My Timetable', icon: 'calendar-outline', link: '/staff/timetable', accent: '#0EA5E9' },
        { key: 'upload_marks', label: 'Upload Marks', icon: 'cloud-upload-outline', link: '/staff/results', accent: '#8B5CF6' },
        { key: 'leaves', label: 'Apply Leave', icon: 'document-text-outline', link: '/staff/leaves', accent: '#F59E0B' },
        { key: 'profile', label: 'Staff Profile', icon: 'person-outline', link: '/staff/profile', accent: '#10B981' },
    ];

    const driverMenuItems: MenuItem[] = [
        { key: 'route', label: 'My Route', icon: 'navigate-outline', link: '/driver/dashboard', accent: '#EC4899' },
        { key: 'students', label: 'Students', icon: 'people-outline', link: '/driver/students', accent: '#6366F1' },
        { key: 'profile', label: 'Driver Profile', icon: 'person-outline', link: '/driver/profile', accent: '#10B981' },
    ];

    const { isEnabled } = useFeatures();
    const baseItems = userType === 'driver' ? driverMenuItems : userType === 'staff' ? staffMenuItems : studentMenuItems;
    const itemsToRender = baseItems.filter((it) => !it.feature || isEnabled(it.feature));

    /* ── Animations ── */
    useEffect(() => {
        if (visible) {
            translateX.value = withSpring(0, { damping: 18, stiffness: 150, mass: 0.9 });
            backdropOpacity.value = withTiming(1, { duration: 350 });
        } else {
            translateX.value = withTiming(-drawerWidth, { duration: 250 });
            backdropOpacity.value = withTiming(0, { duration: 200 });
        }
    }, [visible, drawerWidth]);

    const closeDrawer = useCallback(() => {
        translateX.value = withTiming(-drawerWidth, { duration: 250 });
        backdropOpacity.value = withTiming(0, { duration: 200 });
        setTimeout(onClose, 260);
    }, [onClose, drawerWidth]);

    /* ── Swipe gesture ── */
    const panGesture = Gesture.Pan()
        .activeOffsetX(-20)
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
                    router.push(link as Href);
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

    const displayName = user?.displayName || (userType === 'staff' ? 'Staff Member' : 'Student');
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
        <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
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
                                                {userType === 'driver' ? 'Driver' : userType === 'staff' ? 'Staff' : 'Student'}
                                            </Text>
                                        </View>
                                    </View>

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
                                    >
                                        <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
                                    </Pressable>
                                </View>
                                <View style={[styles.headerDivider, { backgroundColor: theme.colors.border }]} />
                            </View>

                            {/* ── Menu Items ── */}
                            <View style={styles.menuList}>
                                {itemsToRender.map((item, index) => (
                                    <MenuItemCard
                                        key={item.key}
                                        item={item}
                                        index={index}
                                        isDark={isDark}
                                        onPress={() => handlePress(item.link)}
                                    />
                                ))}
                            </View>

                            {/* ── Spacer ── */}
                            <View style={{ flex: 1 }} />

                            {/* ── Logout Button ── */}
                            <Animated.View entering={FadeInLeft.delay(80 + itemsToRender.length * 50).springify().damping(16).stiffness(150)}>
                                <Pressable
                                    style={Platform.OS === 'web' && { cursor: 'pointer' }}
                                    onPress={handleLogout}
                                >
                                    <View style={[
                                        styles.logoutButton,
                                        {
                                            backgroundColor: logoutBg,
                                            borderColor: logoutBorder,
                                            borderBottomWidth: isDark ? 1.2 : 2.5, // Clay depth edge
                                        }
                                    ]}>
                                        {/* Clay inner highlight top-left gradient */}
                                        <LinearGradient
                                            colors={isDark 
                                                ? ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0)'] 
                                                : ['rgba(255,255,255,0.65)', 'rgba(255,255,255,0)']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 0.5, y: 0.8 }}
                                            style={StyleSheet.absoluteFill}
                                            pointerEvents="none"
                                        />
                                        <View style={[
                                            styles.logoutIconBox, 
                                            { 
                                                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#FFFFFF',
                                                borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(239, 68, 68, 0.06)',
                                                borderWidth: 1,
                                            }
                                        ]}>
                                            <Ionicons name="log-out-outline" size={18} color="#EF4444" />
                                        </View>
                                        <Text style={styles.logoutText}>Logout</Text>
                                        <View style={[
                                            styles.chevronBox, 
                                            { 
                                                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF',
                                                borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(239, 68, 68, 0.06)',
                                                borderWidth: 1,
                                            }
                                        ]}>
                                            <Ionicons name="chevron-forward" size={13} color={isDark ? 'rgba(239, 68, 68, 0.4)' : '#FCA5A5'} />
                                        </View>
                                    </View>
                                </Pressable>
                            </Animated.View>

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
        paddingVertical: 14,
        gap: 12,
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
    menuList: {
        gap: 10,
        paddingTop: 6,
    },

    menuCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 20, // Puffy clay corners
        padding: 13,
        paddingHorizontal: 15,
        gap: 12,
        borderWidth: 1.2,
        overflow: 'hidden',
        shadowColor: '#6B7A99', // desaturated shadow color
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 12,
        elevation: 2,
    },

    menuIconBox: {
        width: 34,
        height: 34,
        borderRadius: 11,
        justifyContent: 'center',
        alignItems: 'center',
    },

    menuLabel: {
        flex: 1,
        fontSize: 14.5,
        fontWeight: '700', // Puffy font weight
        letterSpacing: 0.1,
    },

    chevronBox: {
        width: 22,
        height: 22,
        borderRadius: 11,
        justifyContent: 'center',
        alignItems: 'center',
    },

    /* ── Logout ── */
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 20, // Clay rounded corners
        padding: 13,
        paddingHorizontal: 15,
        gap: 12,
        borderWidth: 1.2,
        overflow: 'hidden',
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
