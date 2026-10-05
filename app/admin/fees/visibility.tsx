import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, Pressable,
    ActivityIndicator, StatusBar, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
    FadeIn, FadeInDown, FadeOut,
    useSharedValue, useAnimatedStyle, withSpring, withRepeat, withTiming,
    interpolateColor, Easing,
    type SharedValue,
} from 'react-native-reanimated';
import AdminHeader from '../../../src/components/AdminHeader';
import { AdminService } from '../../../src/services/adminService';
import { useAuth } from '../../../src/hooks/useAuth';
import { useTheme } from '../../../src/hooks/useTheme';
import { Theme, Spacing, Radii, Elevation } from '../../../src/theme/themes';
import { alertCompat } from '../../../src/utils/crossPlatformAlert';
import {
    ACCOUNTS_STAT_KEYS,
    normalizeAccountsDashboardConfig,
    toggleAccountsDashboardStat,
} from '../../../src/utils/constants';
import { invalidateApiQueryCache } from '../../../src/hooks/useApiQuery';
import * as Haptics from '../../../src/utils/haptics';

/* ─── Stat metadata ─────────────────────────────────────────────── */

type StatMeta = {
    label: string;
    hint: string;
    icon: keyof typeof Ionicons.glyphMap;
    tint: string;
    tintBg: string;
    group: 'finance' | 'performance';
};

const STAT_META: Record<string, StatMeta> = {
    total_collection_month: {
        label: 'Total Collection',
        hint: 'This month’s fee collection total',
        icon: 'wallet-outline',
        tint: '#4F46E5',
        tintBg: '#EEF2FF',
        group: 'finance',
    },
    todays_collection: {
        label: "Today’s Collection",
        hint: 'Fees collected since midnight',
        icon: 'cash-outline',
        tint: '#059669',
        tintBg: '#ECFDF5',
        group: 'finance',
    },
    pending_dues: {
        label: 'Pending Dues',
        hint: 'Outstanding balances across classes',
        icon: 'alert-circle-outline',
        tint: '#DC2626',
        tintBg: '#FEF2F2',
        group: 'finance',
    },
    revenue_trend: {
        label: 'Revenue Trend',
        hint: 'Financial performance over time',
        icon: 'trending-up-outline',
        tint: '#2563EB',
        tintBg: '#EFF6FF',
        group: 'finance',
    },
    collection_efficiency: {
        label: 'Collection Efficiency',
        hint: 'Collected vs. billed percentage',
        icon: 'calculator-outline',
        tint: '#D97706',
        tintBg: '#FFFBEB',
        group: 'finance',
    },
    avg_attendance: {
        label: 'Avg Attendance',
        hint: 'School-wide attendance average',
        icon: 'people-outline',
        tint: '#0891B2',
        tintBg: '#ECFEFF',
        group: 'performance',
    },
    academic_score: {
        label: 'Academic Score',
        hint: 'Aggregate academic performance',
        icon: 'school-outline',
        tint: '#7C3AED',
        tintBg: '#F5F3FF',
        group: 'performance',
    },
    system_insights: {
        label: 'System Insights',
        hint: 'Smart tips & operational signals',
        icon: 'bulb-outline',
        tint: '#DB2777',
        tintBg: '#FDF2F8',
        group: 'performance',
    },
};

const GROUPS: { id: 'finance' | 'performance'; title: string; subtitle: string }[] = [
    { id: 'finance', title: 'Finance', subtitle: 'Collections, dues & revenue' },
    { id: 'performance', title: 'Performance', subtitle: 'Attendance, academics & insights' },
];

/* ─── Spring toggle ─────────────────────────────────────────────── */

/** Visual-only spring toggle — parent row owns the press (avoids double-fire). */
function SoftToggle({ value, activeColor }: { value: boolean; activeColor: string }) {
    const p = useSharedValue(value ? 1 : 0);

    useEffect(() => {
        p.value = withSpring(value ? 1 : 0, { damping: 16, stiffness: 220 });
    }, [value]);

    const knob = useAnimatedStyle(() => ({
        transform: [{ translateX: p.value * 22 }],
    }));

    const track = useAnimatedStyle(() => ({
        backgroundColor: interpolateColor(
            p.value,
            [0, 1],
            ['rgba(100,116,139,0.22)', activeColor]
        ),
    }));

    return (
        <Animated.View
            style={[toggleStyles.track, track]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
        >
            <Animated.View style={[toggleStyles.knob, knob]} />
        </Animated.View>
    );
}

const toggleStyles = StyleSheet.create({
    track: {
        width: 52,
        height: 30,
        borderRadius: 15,
        padding: 3,
        justifyContent: 'center',
    },
    knob: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        ...(Platform.OS === 'android'
            ? { elevation: 2 }
            : {
                shadowColor: '#0F172A',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.18,
                shadowRadius: 2.5,
            }),
    },
});

/* ─── Skeleton ──────────────────────────────────────────────────── */

function useShimmer() {
    const p = useSharedValue(0);
    useEffect(() => {
        p.value = withRepeat(
            withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
            -1,
            false
        );
    }, []);
    return p;
}

function SkeletonBlock({
    shimmer,
    width,
    height,
    radius = 12,
    style,
}: {
    shimmer: SharedValue<number>;
    width: number | `${number}%`;
    height: number;
    radius?: number;
    style?: object;
}) {
    const a = useAnimatedStyle(() => ({
        opacity: 0.42 + 0.32 * Math.sin(shimmer.value * Math.PI),
    }));
    return (
        <Animated.View
            style={[
                {
                    width,
                    height,
                    borderRadius: radius,
                    backgroundColor: 'rgba(100,116,139,0.14)',
                },
                a,
                style,
            ]}
        />
    );
}

function VisibilitySkeleton({ isDark }: { isDark: boolean }) {
    const shimmer = useShimmer();
    const bg = isDark ? '#0B0F19' : '#F1F5F9';
    return (
        <View style={[styles.skeletonWrap, { backgroundColor: bg }]}>
            <SkeletonBlock shimmer={shimmer} width="100%" height={110} radius={24} />
            <View style={{ height: 16 }} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
                <SkeletonBlock shimmer={shimmer} width="48%" height={44} radius={14} />
                <SkeletonBlock shimmer={shimmer} width="48%" height={44} radius={14} />
            </View>
            <View style={{ height: 22 }} />
            {[0, 1, 2, 3, 4].map((i) => (
                <SkeletonBlock
                    key={i}
                    shimmer={shimmer}
                    width="100%"
                    height={72}
                    radius={18}
                    style={{ marginBottom: 10 }}
                />
            ))}
        </View>
    );
}

/* ─── Stat row ──────────────────────────────────────────────────── */

const StatRow = React.memo(function StatRow({
    meta,
    enabled,
    onToggle,
    index,
    isDark,
    cardBg,
    textColor,
    mutedColor,
}: {
    meta: StatMeta;
    enabled: boolean;
    onToggle: () => void;
    index: number;
    isDark: boolean;
    cardBg: string;
    textColor: string;
    mutedColor: string;
}) {
    const tintBg = isDark ? `${meta.tint}22` : meta.tintBg;
    const iconColor = enabled ? meta.tint : mutedColor;

    return (
        <Animated.View entering={FadeInDown.delay(80 + index * 40).duration(280)}>
            <Pressable
                onPress={onToggle}
                style={({ pressed }) => [
                    styles.statRow,
                    {
                        backgroundColor: cardBg,
                        borderColor: enabled
                            ? isDark
                                ? `${meta.tint}55`
                                : `${meta.tint}33`
                            : isDark
                                ? 'rgba(148,163,184,0.12)'
                                : 'rgba(100,116,139,0.10)',
                        opacity: enabled ? 1 : 0.72,
                    },
                    pressed && styles.statRowPressed,
                ]}
                accessibilityRole="switch"
                accessibilityState={{ checked: enabled }}
                accessibilityLabel={`${meta.label}. ${meta.hint}`}
                accessibilityHint={enabled ? 'Double tap to hide' : 'Double tap to show'}
            >
                <View style={[styles.iconPuck, { backgroundColor: tintBg }]}>
                    <Ionicons name={meta.icon} size={18} color={iconColor} />
                </View>
                <View style={styles.statCopy}>
                    <Text style={[styles.statLabel, { color: textColor }]} numberOfLines={1}>
                        {meta.label}
                    </Text>
                    <Text style={[styles.statHint, { color: mutedColor }]} numberOfLines={1}>
                        {meta.hint}
                    </Text>
                </View>
                <SoftToggle value={enabled} activeColor={meta.tint} />
            </Pressable>
        </Animated.View>
    );
});

/* ─── Screen ────────────────────────────────────────────────────── */

export default function AccountsDashboardVisibilityScreen() {
    const { theme, isDark } = useTheme();
    const { authChecked, session } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const stylesThemed = useMemo(() => getThemed(theme, isDark), [theme, isDark]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [config, setConfig] = useState<Record<string, boolean>>({});
    const [savedConfig, setSavedConfig] = useState<Record<string, boolean>>({});

    const buildDefaultConfig = useCallback(
        (): Record<string, boolean> => normalizeAccountsDashboardConfig(),
        []
    );

    const loadConfig = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            const res = await AdminService.getAccountsDashboardConfig();
            const resolved =
                res?.config ??
                (res && typeof res === 'object' && !('config' in res)
                    ? (res as Record<string, boolean>)
                    : null);
            const next = normalizeAccountsDashboardConfig(
                resolved && typeof resolved === 'object' ? resolved : undefined
            );
            if (!resolved || typeof resolved !== 'object') {
                console.warn('Unexpected config response shape, using defaults:', res);
            }
            setConfig(next);
            setSavedConfig(next);
        } catch (err: any) {
            console.error('Failed to load accounts visibility config:', err);
            const detail = err?.message || 'Unknown error';
            alertCompat('Error', `Failed to load configuration settings.\n\n${detail}`);
            const fallback = buildDefaultConfig();
            setConfig(fallback);
            setSavedConfig(fallback);
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, [buildDefaultConfig]);

    useEffect(() => {
        if (!authChecked || !session) return;
        loadConfig();
    }, [authChecked, session, loadConfig]);

    const visibleCount = useMemo(
        () => ACCOUNTS_STAT_KEYS.filter((k) => config[k] !== false).length,
        [config]
    );
    const totalCount = ACCOUNTS_STAT_KEYS.length as number;
    const isDirty = useMemo(
        () => ACCOUNTS_STAT_KEYS.some((k) => (config[k] !== false) !== (savedConfig[k] !== false)),
        [config, savedConfig]
    );

    const handleToggle = useCallback((key: string) => {
        Haptics.selectionAsync();
        setConfig((prev) => toggleAccountsDashboardStat(prev, key));
    }, []);

    const handleSetAll = useCallback((value: boolean) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const updated = normalizeAccountsDashboardConfig();
        ACCOUNTS_STAT_KEYS.forEach((key) => {
            updated[key] = value;
        });
        setConfig(updated);
    }, []);

    const handleSave = useCallback(async () => {
        if (!isDirty || saving) return;
        setSaving(true);
        const payload = normalizeAccountsDashboardConfig(config);
        try {
            await AdminService.updateAccountsDashboardConfig(payload);
            invalidateApiQueryCache('accounts-dashboard-stats');
            setConfig(payload);
            setSavedConfig(payload);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            alertCompat('Saved', 'Accounts dashboard visibility updated.', [
                { text: 'OK', onPress: () => router.back() },
            ]);
        } catch (err: any) {
            console.error('Failed to save accounts visibility config:', err);
            const detail = err?.message || 'Unknown error';
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            alertCompat('Error', `Failed to save configuration settings.\n\n${detail}`);
        } finally {
            setSaving(false);
        }
    }, [config, isDirty, saving, router]);

    if (loading) {
        return (
            <View style={[styles.container, { backgroundColor: stylesThemed.screenBg }]}>
                <StatusBar
                    barStyle={isDark ? 'light-content' : 'dark-content'}
                    backgroundColor={stylesThemed.screenBg}
                />
                <AdminHeader title="Accounts Visibility" showBackButton={true} />
                <VisibilitySkeleton isDark={isDark} />
            </View>
        );
    }

    const progressPct = totalCount > 0 ? visibleCount / totalCount : 0;

    return (
        <View style={[styles.container, { backgroundColor: stylesThemed.screenBg }]}>
            <StatusBar
                barStyle={isDark ? 'light-content' : 'dark-content'}
                backgroundColor={stylesThemed.screenBg}
            />
            <TourTarget id="screen.admin-fees-visibility.overview"><AdminHeader title="Accounts Visibility" showBackButton={true} /></TourTarget>

            <TourTarget id="screen.admin-fees-visibility.workspace" native><TourScrollView
                contentContainerStyle={[
                    styles.scroll,
                    { paddingBottom: 108 + insets.bottom },
                ]}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero */}
                <Animated.View entering={FadeInDown.duration(320)} style={styles.heroOuter}>
                    <View
                        style={[
                            styles.heroCard,
                            {
                                backgroundColor: stylesThemed.heroBg,
                                borderColor: stylesThemed.heroBorder,
                            },
                        ]}
                    >
                        <LinearGradient
                            colors={
                                isDark
                                    ? ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']
                                    : ['rgba(255,255,255,0.72)', 'rgba(255,255,255,0)']
                            }
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0.7, y: 0.9 }}
                            style={StyleSheet.absoluteFill}
                            pointerEvents="none"
                        />
                        <View style={styles.heroTop}>
                            <View
                                style={[
                                    styles.heroIcon,
                                    { backgroundColor: isDark ? 'rgba(79,70,229,0.25)' : '#EEF2FF' },
                                ]}
                            >
                                <Ionicons name="eye" size={22} color={theme.colors.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.heroTitle, { color: theme.colors.textStrong }]}>
                                    Dashboard visibility
                                </Text>
                                <Text style={[styles.heroDesc, { color: theme.colors.textSecondary }]}>
                                    Choose which stats the accounts team sees. Hidden metrics stay off their dashboard.
                                </Text>
                            </View>
                        </View>

                        <View style={styles.progressBlock}>
                            <View style={styles.progressMeta}>
                                <Text style={[styles.progressCount, { color: theme.colors.textStrong }]}>
                                    {visibleCount}
                                    <Text style={{ color: theme.colors.textTertiary, fontWeight: '500' }}>
                                        {' '}
                                        / {totalCount}
                                    </Text>
                                </Text>
                                <Text style={[styles.progressLabel, { color: theme.colors.textSecondary }]}>
                                    metrics visible
                                </Text>
                            </View>
                            <View
                                style={[
                                    styles.progressTrack,
                                    { backgroundColor: isDark ? 'rgba(148,163,184,0.18)' : 'rgba(79,70,229,0.12)' },
                                ]}
                            >
                                <View
                                    style={[
                                        styles.progressFill,
                                        {
                                            width: `${Math.round(progressPct * 100)}%` as `${number}%`,
                                            backgroundColor: theme.colors.primary,
                                        },
                                    ]}
                                />
                            </View>
                        </View>
                    </View>
                </Animated.View>

                {/* Error */}
                {loadError && (
                    <Animated.View
                        entering={FadeInDown.delay(40).duration(280)}
                        style={[
                            styles.errorBanner,
                            {
                                backgroundColor: theme.colors.alertBgDanger,
                                borderColor: theme.colors.alertBorderDanger,
                            },
                        ]}
                    >
                        <Ionicons name="warning-outline" size={18} color={theme.colors.alertIconDanger} />
                        <Text style={[styles.errorText, { color: theme.colors.alertTextDanger }]}>
                            Couldn’t load saved settings. Showing defaults — your changes will still save.
                        </Text>
                        <Pressable
                            onPress={loadConfig}
                            style={({ pressed }) => [
                                styles.retryChip,
                                { backgroundColor: isDark ? 'rgba(129,140,248,0.2)' : '#EEF2FF' },
                                pressed && { opacity: 0.85 },
                            ]}
                        >
                            <Ionicons name="refresh-outline" size={14} color={theme.colors.primary} />
                            <Text style={[styles.retryText, { color: theme.colors.primary }]}>Retry</Text>
                        </Pressable>
                    </Animated.View>
                )}

                {/* Bulk actions */}
                <Animated.View entering={FadeInDown.delay(60).duration(280)} style={styles.bulkRow}>
                    <Pressable
                        onPress={() => handleSetAll(true)}
                        style={({ pressed }) => [
                            styles.bulkBtn,
                            {
                                backgroundColor: isDark ? 'rgba(16,185,129,0.12)' : '#ECFDF5',
                                borderColor: isDark ? 'rgba(52,211,153,0.28)' : '#A7F3D0',
                            },
                            pressed && styles.bulkPressed,
                        ]}
                    >
                        <Ionicons name="eye-outline" size={16} color={theme.colors.success} />
                        <Text style={[styles.bulkLabel, { color: isDark ? '#34D399' : '#047857' }]}>
                            Show all
                        </Text>
                    </Pressable>
                    <Pressable
                        onPress={() => handleSetAll(false)}
                        style={({ pressed }) => [
                            styles.bulkBtn,
                            {
                                backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#FEF2F2',
                                borderColor: isDark ? 'rgba(248,113,113,0.28)' : '#FECACA',
                            },
                            pressed && styles.bulkPressed,
                        ]}
                    >
                        <Ionicons name="eye-off-outline" size={16} color={theme.colors.danger} />
                        <Text style={[styles.bulkLabel, { color: isDark ? '#F87171' : '#B91C1C' }]}>
                            Hide all
                        </Text>
                    </Pressable>
                </Animated.View>

                {/* Grouped lists */}
                {GROUPS.map((group, gIdx) => {
                    const keys = ACCOUNTS_STAT_KEYS.filter((k) => STAT_META[k]?.group === group.id);
                    return (
                        <Animated.View
                            key={group.id}
                            entering={FadeInDown.delay(100 + gIdx * 50).duration(300)}
                            style={styles.groupBlock}
                        >
                            <View style={styles.groupHeader}>
                                <Text style={[styles.groupTitle, { color: theme.colors.textStrong }]}>
                                    {group.title}
                                </Text>
                                <Text style={[styles.groupSubtitle, { color: theme.colors.textTertiary }]}>
                                    {group.subtitle}
                                </Text>
                            </View>
                            {keys.map((key, index) => {
                                const meta = STAT_META[key];
                                const enabled = config[key] !== false;
                                return (
                                    <StatRow
                                        key={key}
                                        meta={meta}
                                        enabled={enabled}
                                        onToggle={() => handleToggle(key)}
                                        index={gIdx * 5 + index}
                                        isDark={isDark}
                                        cardBg={stylesThemed.cardBg}
                                        textColor={theme.colors.textStrong}
                                        mutedColor={theme.colors.textSecondary}
                                    />
                                );
                            })}
                        </Animated.View>
                    );
                })}
            </TourScrollView></TourTarget>

            {/* Sticky save bar — thumb zone */}
            <View
                style={[
                    styles.saveBar,
                    {
                        paddingBottom: Math.max(insets.bottom, 14),
                        backgroundColor: stylesThemed.saveBarBg,
                        borderTopColor: stylesThemed.saveBarBorder,
                    },
                ]}
            >
                {isDirty ? (
                    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.dirtyChip}>
                        <View style={styles.dirtyDot} />
                        <Text style={[styles.dirtyText, { color: theme.colors.warning }]}>Unsaved changes</Text>
                    </Animated.View>
                ) : (
                    <Text style={[styles.syncedText, { color: theme.colors.textTertiary }]}>
                        All changes saved
                    </Text>
                )}

                <Pressable
                    onPress={handleSave}
                    disabled={!isDirty || saving}
                    style={({ pressed }) => [
                        styles.saveBtn,
                        (!isDirty || saving) && styles.saveBtnDisabled,
                        pressed && isDirty && !saving && styles.saveBtnPressed,
                    ]}
                >
                    <LinearGradient
                        colors={
                            !isDirty || saving
                                ? isDark
                                    ? ['#334155', '#334155']
                                    : ['#C7D2FE', '#C7D2FE']
                                : [theme.colors.primaryDark, theme.colors.primary]
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                        pointerEvents="none"
                    />
                    {!isDirty && !saving ? null : (
                        <LinearGradient
                            colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0, y: 1 }}
                            style={StyleSheet.absoluteFill}
                            pointerEvents="none"
                        />
                    )}
                    {saving ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <>
                            <Ionicons
                                name={isDirty ? 'checkmark-circle' : 'cloud-done-outline'}
                                size={18}
                                color="#fff"
                            />
                            <Text style={styles.saveText}>
                                {isDirty ? 'Save configuration' : 'Up to date'}
                            </Text>
                        </>
                    )}
                </Pressable>
            </View>
        </View>
    );
}

/* ─── Themed tokens ─────────────────────────────────────────────── */

function getThemed(theme: Theme, isDark: boolean) {
    return {
        screenBg: isDark ? theme.colors.background : '#EEF1F7',
        heroBg: isDark ? theme.colors.card : '#F4F6FC',
        heroBorder: isDark ? theme.colors.border : 'rgba(79,70,229,0.12)',
        cardBg: isDark ? theme.colors.card : '#F8FAFD',
        saveBarBg: isDark ? 'rgba(21,27,43,0.96)' : 'rgba(248,250,252,0.94)',
        saveBarBorder: isDark ? theme.colors.border : 'rgba(148,163,184,0.22)',
    };
}

/* ─── Styles ────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
    container: { flex: 1 },
    skeletonWrap: { flex: 1, padding: Spacing.md, paddingTop: Spacing.sm },
    scroll: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },

    heroOuter: {
        marginBottom: Spacing.md,
        ...Platform.select({
            ios: {
                shadowColor: '#6B7A99',
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.14,
                shadowRadius: 18,
            },
            android: { elevation: 4 },
            default: {},
        }),
    },
    heroCard: {
        borderRadius: Radii.xxl,
        padding: Spacing.md,
        overflow: 'hidden',
        borderWidth: 1,
        borderBottomWidth: 1.5,
        borderBottomColor: 'rgba(76,90,120,0.10)',
    },
    heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
    heroIcon: {
        width: 48,
        height: 48,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroTitle: {
        fontSize: 17,
        fontWeight: '700',
        letterSpacing: -0.3,
        marginBottom: 4,
    },
    heroDesc: {
        fontSize: 13,
        lineHeight: 18,
        fontWeight: '400',
    },
    progressBlock: { marginTop: Spacing.md },
    progressMeta: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    progressCount: { fontSize: 22, fontWeight: '700', letterSpacing: -0.6 },
    progressLabel: { fontSize: 12, fontWeight: '500' },
    progressTrack: {
        height: 8,
        borderRadius: 999,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 999,
    },

    errorBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 14,
        borderRadius: Radii.lg,
        borderWidth: 1,
        marginBottom: Spacing.md,
        flexWrap: 'wrap',
    },
    errorText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '500' },
    retryChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: Radii.sm,
    },
    retryText: { fontSize: 12, fontWeight: '700' },

    bulkRow: { flexDirection: 'row', gap: 10, marginBottom: Spacing.lg },
    bulkBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 46,
        borderRadius: Radii.lg,
        borderWidth: 1,
    },
    bulkPressed: { opacity: 0.88, transform: [{ scale: 0.97 }] },
    bulkLabel: { fontSize: 13, fontWeight: '700' },

    groupBlock: { marginBottom: Spacing.lg },
    groupHeader: { marginBottom: 10, paddingHorizontal: 2 },
    groupTitle: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
    groupSubtitle: { fontSize: 12, fontWeight: '500', marginTop: 2 },

    statRow: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 72,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 18,
        marginBottom: 10,
        borderWidth: 1,
    },
    statRowPressed: { opacity: 0.92, transform: [{ scale: 0.985 }] },
    iconPuck: {
        width: 40,
        height: 40,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    statCopy: { flex: 1, paddingRight: 10 },
    statLabel: { fontSize: 15, fontWeight: '600', letterSpacing: -0.15 },
    statHint: { fontSize: 12, fontWeight: '400', marginTop: 2, lineHeight: 16 },

    saveBar: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: Spacing.md,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        gap: 10,
    },
    dirtyChip: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        gap: 6,
    },
    dirtyDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: '#F59E0B',
    },
    dirtyText: { fontSize: 12, fontWeight: '600' },
    syncedText: {
        fontSize: 12,
        fontWeight: '500',
        textAlign: 'center',
    },
    saveBtn: {
        height: 54,
        borderRadius: Radii.lg,
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderBottomWidth: 1.5,
        borderBottomColor: 'rgba(0,0,0,0.14)',
        ...Elevation.level2,
    },
    saveBtnDisabled: {
        borderBottomColor: 'transparent',
        ...Elevation.level0,
    },
    saveBtnPressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },
    saveText: { fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: 0.15 },
});
