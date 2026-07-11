import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    RefreshControl,
    Dimensions,
    StatusBar,
    Pressable,
    Platform,
    ViewStyle,
    LayoutChangeEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    FadeInDown,
    FadeInUp,
    ZoomIn,
    Layout,
    useSharedValue,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    useAnimatedProps,
    withTiming,
    withSpring,
    withDelay,
    withRepeat,
    Easing,
    SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import StaffHeader from '../../src/components/StaffHeader';
import ViewAsBanner from '../../src/components/ViewAsBanner';
import { api } from '../../src/services/apiClient';
import { useEffectiveStaffId } from '../../src/hooks/useEffectiveStaffId';

const { width: SW } = Dimensions.get('window');
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const RING_SIZE = Math.min(SW * 0.26, 108);
const RING_STROKE = 10;

// ─── Types ─────────────────────────────────────────────────────────────────
type StatusKey = 'present' | 'absent' | 'half_day';
type FilterValue = 'all' | StatusKey;

interface AttendanceRecord {
    id: string | number;
    attendance_date: string;
    status: string;
    marked_at: string;
}

interface Stats {
    present: number;
    half: number;
    absent: number;
}

interface Arc {
    color: string;
    length: number;
    offset: number;
}

interface WeekGroup {
    key: string;
    label: string;
    records: AttendanceRecord[];
}

// ─── Status meta (clay-tinted, per status) ─────────────────────────────────
const STATUS_META: Record<StatusKey, {
    label: string;
    accent: string;
    icon: keyof typeof Ionicons.glyphMap;
    bgDark: string;
    bgLight: string;
    textDark: string;
    textLight: string;
}> = {
    present: {
        label: 'Present',
        accent: '#00C48C',
        icon: 'checkmark-circle',
        bgDark: 'rgba(0,196,140,0.16)',
        bgLight: 'rgba(0,196,140,0.12)',
        textDark: '#2DE0A8',
        textLight: '#00875F',
    },
    half_day: {
        label: 'Half-Day',
        accent: '#FFB800',
        icon: 'time',
        bgDark: 'rgba(255,184,0,0.16)',
        bgLight: 'rgba(255,184,0,0.12)',
        textDark: '#FFC94D',
        textLight: '#A05500',
    },
    absent: {
        label: 'Absent',
        accent: '#FF4D6A',
        icon: 'close-circle',
        bgDark: 'rgba(255,77,106,0.16)',
        bgLight: 'rgba(255,77,106,0.12)',
        textDark: '#FF7A90',
        textLight: '#C21F41',
    },
};

const FILTER_OPTIONS: { label: string; value: FilterValue }[] = [
    { label: 'All', value: 'all' },
    { label: 'Present', value: 'present' },
    { label: 'Half', value: 'half_day' },
    { label: 'Absent', value: 'absent' },
];

// ─── Clay shadow helper ─────────────────────────────────────────────────────
function clayShadow(isDark: boolean, intensity: 'soft' | 'medium' = 'soft'): ViewStyle {
    return Platform.select<ViewStyle>({
        ios: {
            shadowColor: isDark ? '#000000' : '#94A3B8',
            shadowOffset: { width: 0, height: intensity === 'medium' ? 14 : 8 },
            shadowOpacity: isDark ? (intensity === 'medium' ? 0.45 : 0.32) : (intensity === 'medium' ? 0.16 : 0.10),
            shadowRadius: intensity === 'medium' ? 24 : 14,
        },
        android: {
            elevation: intensity === 'medium' ? 9 : 4,
        },
        default: {},
    }) as ViewStyle;
}

// ─── Ring math ──────────────────────────────────────────────────────────────
function buildArcs(stats: Stats, circumference: number): Arc[] {
    const total = stats.present + stats.half + stats.absent;
    if (total <= 0) return [];
    const segments: { value: number; color: string }[] = [
        { value: stats.present, color: STATUS_META.present.accent },
        { value: stats.half, color: STATUS_META.half_day.accent },
        { value: stats.absent, color: STATUS_META.absent.accent },
    ];
    let cursor = 0;
    const arcs: Arc[] = [];
    segments.forEach((seg) => {
        if (seg.value <= 0) return;
        const length = (seg.value / total) * circumference;
        arcs.push({ color: seg.color, length, offset: cursor });
        cursor += length;
    });
    return arcs;
}

// ─── Week grouping (structure = information: a real chronological sequence) ─
function getMonday(date: Date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function formatWeekLabel(monday: Date) {
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${fmt(monday).toUpperCase()} – ${fmt(sunday).toUpperCase()}`;
}

function groupByWeek(records: AttendanceRecord[]): WeekGroup[] {
    const sorted = [...records].sort(
        (a, b) => new Date(a.attendance_date).getTime() - new Date(b.attendance_date).getTime()
    );
    const groups: WeekGroup[] = [];
    sorted.forEach((record) => {
        const monday = getMonday(new Date(record.attendance_date));
        const key = monday.toISOString().split('T')[0];
        let group = groups.find((g) => g.key === key);
        if (!group) {
            group = { key, label: formatWeekLabel(monday), records: [] };
            groups.push(group);
        }
        group.records.push(record);
    });
    return groups;
}

// ─── Shared press-scale interaction (used by nav buttons + rows) ───────────
function usePressScale(minScale: number = 0.96) {
    const scale = useSharedValue(1);
    const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
    const onPressIn = () => {
        scale.value = withTiming(minScale, { duration: 90 });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    };
    const onPressOut = () => {
        scale.value = withSpring(1, { damping: 14, stiffness: 220 });
    };
    return { style, onPressIn, onPressOut };
}

// ─── Attendance Ring (signature element — Apple Health style clay donut) ───
function ArcSegment({
    arc,
    size,
    radius,
    strokeWidth,
    circumference,
    progress,
}: {
    arc: Arc;
    size: number;
    radius: number;
    strokeWidth: number;
    circumference: number;
    progress: SharedValue<number>;
}) {
    const animatedProps = useAnimatedProps(() => {
        const length = arc.length * progress.value;
        return {
            strokeDasharray: `${length} ${circumference}`,
        } as any;
    });

    return (
        <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={arc.color}
            strokeWidth={strokeWidth}
            strokeDashoffset={-arc.offset}
            strokeLinecap="round"
            fill="none"
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
            animatedProps={animatedProps}
        />
    );
}

function AttendanceRing({ stats, isDark, size, strokeWidth }: { stats: Stats; isDark: boolean; size: number; strokeWidth: number; }) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const total = stats.present + stats.half + stats.absent;
    const percentage = total > 0 ? Math.round((stats.present / total) * 100) : 0;
    const progress = useSharedValue(0);

    const arcs = useMemo(() => buildArcs(stats, circumference), [stats.present, stats.half, stats.absent, circumference]);
    const trackColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(17,24,39,0.06)';

    useEffect(() => {
        progress.value = 0;
        progress.value = withDelay(150, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stats.present, stats.half, stats.absent]);

    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={size} height={size}>
                <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
                {arcs.map((arc, i) => (
                    <ArcSegment
                        key={`${arc.color}-${i}`}
                        arc={arc}
                        size={size}
                        radius={radius}
                        strokeWidth={strokeWidth}
                        circumference={circumference}
                        progress={progress}
                    />
                ))}
            </Svg>
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={[styles.ringPercent, { color: isDark ? '#FFFFFF' : '#111827' }]}>
                        {total > 0 ? `${percentage}%` : '—'}
                    </Text>
                    <Text style={[styles.ringSub, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(17,24,39,0.5)' }]}>
                        {total > 0 ? 'present' : 'no data'}
                    </Text>
                </View>
            </View>
        </View>
    );
}

// ─── Stat pill (clay chip) ──────────────────────────────────────────────────
function StatPill({ label, value, color, icon, isDark }: { label: string; value: number; color: string; icon: keyof typeof Ionicons.glyphMap; isDark: boolean; }) {
    const bg = isDark ? `${color}22` : `${color}14`;
    return (
        <View style={[styles.statPill, { backgroundColor: bg }]}>
            <View style={styles.statPillTop}>
                <Ionicons name={icon} size={12} color={color} />
                <Text style={[styles.statPillValue, { color: isDark ? '#FFFFFF' : '#111827' }]}>{value}</Text>
            </View>
            <Text style={[styles.statPillLabel, { color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(17,24,39,0.55)' }]} numberOfLines={1}>
                {label}
            </Text>
        </View>
    );
}

// ─── Segmented control (Material 3 / Linear style sliding thumb) ──────────
function SegmentedControl({ options, value, onChange, isDark }: { options: { label: string; value: FilterValue }[]; value: FilterValue; onChange: (v: FilterValue) => void; isDark: boolean; }) {
    const [trackWidth, setTrackWidth] = useState(0);
    const activeIndex = Math.max(0, options.findIndex((o) => o.value === value));
    const segmentWidth = trackWidth / options.length;
    const translateX = useSharedValue(0);

    useEffect(() => {
        if (trackWidth > 0) {
            translateX.value = withSpring(activeIndex * segmentWidth, { damping: 20, stiffness: 200, mass: 0.5 });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeIndex, trackWidth]);

    const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

    const trackBg = isDark ? 'rgba(255,255,255,0.05)' : '#EEF0F6';
    const indicatorBg = isDark ? '#2A2B3D' : '#FFFFFF';

    return (
        <View onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)} style={[styles.segmentTrack, { backgroundColor: trackBg }]}>
            {trackWidth > 0 && (
                <Animated.View
                    style={[
                        styles.segmentIndicator,
                        { width: segmentWidth, backgroundColor: indicatorBg },
                        !isDark && clayShadow(false, 'soft'),
                        indicatorStyle,
                    ]}
                />
            )}
            {options.map((opt) => {
                const active = opt.value === value;
                return (
                    <Pressable
                        key={opt.value}
                        onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            onChange(opt.value);
                        }}
                        style={styles.segmentItem}
                        hitSlop={6}
                    >
                        <Text
                            numberOfLines={1}
                            style={[
                                styles.segmentLabel,
                                { color: active ? (isDark ? '#FFFFFF' : '#111827') : (isDark ? 'rgba(255,255,255,0.45)' : '#9AA1B1') },
                            ]}
                        >
                            {opt.label}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

// ─── Record row (inside a grouped clay card, Notion/Stripe-style list row) ─
function RecordRow({
    record,
    meta,
    isDark,
    isLast,
    titleColor,
    subColor,
    dividerColor,
}: {
    record: AttendanceRecord;
    meta: typeof STATUS_META[StatusKey];
    isDark: boolean;
    isLast: boolean;
    titleColor: string;
    subColor: string;
    dividerColor: string;
}) {
    const { style: pressStyle, onPressIn, onPressOut } = usePressScale(0.98);
    const dateObj = new Date(record.attendance_date);
    const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    const weekdayShort = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNum = dateObj.getDate();
    const markedTime = record.marked_at
        ? new Date(record.marked_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : '—';
    const badgeBg = isDark ? meta.bgDark : meta.bgLight;
    const badgeText = isDark ? meta.textDark : meta.textLight;

    return (
        <AnimatedPressable
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            style={[
                styles.recordRow,
                !isLast && { borderBottomWidth: 1, borderBottomColor: dividerColor },
                pressStyle,
            ]}
        >
            <View style={[styles.dateBadge, { backgroundColor: badgeBg }]}>
                <Text style={[styles.dateBadgeDay, { color: badgeText }]}>{dayNum}</Text>
                <Text style={[styles.dateBadgeWeekday, { color: badgeText }]}>{weekdayShort.toUpperCase()}</Text>
            </View>

            <View style={styles.recordInfo}>
                <Text style={[styles.recordWeekday, { color: titleColor }]} numberOfLines={1}>{weekday}</Text>
                <Text style={[styles.recordTime, { color: subColor }]} numberOfLines={1}>Marked at {markedTime}</Text>
            </View>

            <View style={[styles.statusPill, { backgroundColor: badgeBg }]}>
                <Ionicons name={meta.icon} size={13} color={badgeText} style={{ marginRight: 4 }} />
                <Text style={[styles.statusPillText, { color: badgeText }]}>{meta.label}</Text>
            </View>
        </AnimatedPressable>
    );
}

// ─── Empty state ────────────────────────────────────────────────────────────
function EmptyState({ filter, titleColor, subColor }: { filter: FilterValue; titleColor: string; subColor: string; }) {
    return (
        <Animated.View entering={ZoomIn.duration(400)} style={styles.emptyBox}>
            <View style={styles.emptyIconRing}>
                <Ionicons name="calendar-clear-outline" size={30} color="#7C6FFF" />
            </View>
            <Text style={[styles.emptyTitle, { color: titleColor }]}>No records here</Text>
            <Text style={[styles.emptySub, { color: subColor }]}>
                {filter === 'all' ? 'Nothing logged for this month yet.' : `No ${filter.replace('_', '-')} days this month.`}
            </Text>
        </Animated.View>
    );
}

// ─── Skeleton loading (Stripe/Linear style, replaces spinner) ──────────────
function SkeletonBlock({ style, isDark }: { style?: any; isDark: boolean; }) {
    const opacity = useSharedValue(0.5);
    useEffect(() => {
        opacity.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
    const bg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(17,24,39,0.06)';
    return <Animated.View style={[{ backgroundColor: bg, borderRadius: 12 }, style, animatedStyle]} />;
}

function AttendanceSkeleton({ isDark, cardBg, cardBorder }: { isDark: boolean; cardBg: string; cardBorder: string; }) {
    return (
        <View style={styles.scrollContent}>
            <View style={[styles.heroCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <SkeletonBlock isDark={isDark} style={{ width: 120, height: 14, marginBottom: 10 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <SkeletonBlock isDark={isDark} style={{ width: RING_SIZE, height: RING_SIZE, borderRadius: RING_SIZE / 2 }} />
                    <View style={{ flex: 1, gap: 6 }}>
                        <SkeletonBlock isDark={isDark} style={{ height: 40, borderRadius: 12 }} />
                        <SkeletonBlock isDark={isDark} style={{ height: 40, borderRadius: 12 }} />
                        <SkeletonBlock isDark={isDark} style={{ height: 40, borderRadius: 12 }} />
                    </View>
                </View>
            </View>
            <SkeletonBlock isDark={isDark} style={{ height: 46, borderRadius: 18, marginBottom: 20 }} />
            {[0, 1, 2].map((i) => (
                <SkeletonBlock key={i} isDark={isDark} style={{ height: 76, borderRadius: 20, marginBottom: 12 }} />
            ))}
        </View>
    );
}

// ─── Main screen ────────────────────────────────────────────────────────────
export default function StaffMyAttendanceScreen() {
    const { isDark } = useTheme();
    const { t } = useTranslation();
    const router = useRouter();
    const { isViewingAsAdmin, viewAsName } = useEffectiveStaffId();

    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [records, setRecords] = useState<AttendanceRecord[]>([]);

    const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
    const [activeFilter, setActiveFilter] = useState<FilterValue>('all');

    const scrollY = useSharedValue(0);
    const onScroll = useAnimatedScrollHandler({
        onScroll: (e) => { scrollY.value = e.contentOffset.y; },
    });

    const prevBtn = usePressScale(0.9);
    const nextBtn = usePressScale(0.9);

    // ── Theme tokens ─────────────────────────────────────────────────────────
    const pageBg = isDark ? '#0E0F1A' : '#F4F5F9';
    const cardBg = isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF';
    const cardBorder = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
    const titleColor = isDark ? '#FFFFFF' : '#111827';
    const subColor = isDark ? 'rgba(255,255,255,0.50)' : 'rgba(0,0,0,0.50)';
    const navBtnBg = isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB';
    const orb1Color = isDark ? 'rgba(124,111,255,0.08)' : 'rgba(124,111,255,0.04)';
    const orb2Color = isDark ? 'rgba(0,196,140,0.06)' : 'rgba(0,196,140,0.04)';

    // ── Date range ───────────────────────────────────────────────────────────
    const firstDay = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 0).toISOString().split('T')[0];

    // ── Data fetching (unchanged business logic) ────────────────────────────
    const fetchAttendance = useCallback(async () => {
        try {
            setLoading(true);
            const data = await api.get<AttendanceRecord[]>('/attendance/staff/me', { from_date: firstDay, to_date: lastDay });
            setRecords(data || []);
        } catch (error) {
            console.error('Failed to fetch attendance:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [firstDay, lastDay]);

    useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

    const onRefresh = () => { setRefreshing(true); fetchAttendance(); };

    const changeMonth = (offset: number) => {
        Haptics.selectionAsync().catch(() => {});
        const newDate = new Date(currentMonthDate);
        newDate.setMonth(newDate.getMonth() + offset);
        setCurrentMonthDate(newDate);
    };

    // ── Derived state ────────────────────────────────────────────────────────
    const stats = useMemo<Stats>(() => {
        return records.reduce<Stats>((acc, curr) => {
            if (curr.status === 'present') acc.present += 1;
            else if (curr.status === 'absent') acc.absent += 1;
            else if (curr.status === 'half_day') acc.half += 1;
            return acc;
        }, { present: 0, absent: 0, half: 0 });
    }, [records]);

    const totalDays = stats.present + stats.absent + stats.half;

    const filteredRecords = useMemo(() => {
        if (activeFilter === 'all') return records;
        return records.filter((r) => r.status === activeFilter);
    }, [records, activeFilter]);

    const groupedRecords = useMemo(() => groupByWeek(filteredRecords), [filteredRecords]);

    const currentMonthStr = currentMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <View style={[styles.container, { backgroundColor: pageBg }]}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={pageBg} />

            <View style={[styles.orb1, { backgroundColor: orb1Color }]} />
            <View style={[styles.orb2, { backgroundColor: orb2Color }]} />

            <StaffHeader title="Attendance" scrollY={scrollY} onBack={() => router.back()} showMenuButton={false} />
            {isViewingAsAdmin && <ViewAsBanner name={viewAsName} limited />}

            {loading && !refreshing ? (
                <AttendanceSkeleton isDark={isDark} cardBg={cardBg} cardBorder={cardBorder} />
            ) : (
                <Animated.ScrollView
                    onScroll={onScroll}
                    scrollEventThrottle={16}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? '#FFF' : '#7C6FFF'} />
                    }
                >
                    {/* ── Hero: clay overview card with attendance ring ─────────────── */}
                    <Animated.View
                        entering={FadeInDown.duration(500).springify()}
                        style={[styles.heroShadowWrap, { backgroundColor: cardBg }, clayShadow(isDark, 'medium')]}
                    >
                        <View style={[styles.heroCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                            <LinearGradient
                                colors={isDark ? ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.7)', 'rgba(255,255,255,0)']}
                                style={styles.heroSheen}
                            />

                            <View style={styles.heroTitleRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.heroTitle, { color: titleColor }]}>{currentMonthStr}</Text>
                                    <Text style={[styles.heroCaption, { color: subColor }]}>
                                        {totalDays > 0 ? `${totalDays} day${totalDays === 1 ? '' : 's'} logged` : 'No attendance logged yet'}
                                    </Text>
                                </View>
                                <View style={styles.navButtons}>
                                    <AnimatedPressable
                                        onPress={() => changeMonth(-1)}
                                        onPressIn={prevBtn.onPressIn}
                                        onPressOut={prevBtn.onPressOut}
                                        hitSlop={8}
                                        style={[styles.navBtn, { backgroundColor: navBtnBg, borderColor: cardBorder }, prevBtn.style]}
                                    >
                                        <Ionicons name="chevron-back" size={16} color={subColor} />
                                    </AnimatedPressable>
                                    <AnimatedPressable
                                        onPress={() => changeMonth(1)}
                                        onPressIn={nextBtn.onPressIn}
                                        onPressOut={nextBtn.onPressOut}
                                        hitSlop={8}
                                        style={[styles.navBtn, { backgroundColor: navBtnBg, borderColor: cardBorder }, nextBtn.style]}
                                    >
                                        <Ionicons name="chevron-forward" size={16} color={subColor} />
                                    </AnimatedPressable>
                                </View>
                            </View>

                            <View style={styles.heroBodyRow}>
                                <View style={styles.ringWrap}>
                                    <AttendanceRing stats={stats} isDark={isDark} size={RING_SIZE} strokeWidth={RING_STROKE} />
                                </View>
                                <View style={styles.statPillsRow}>
                                    <StatPill label="Present" value={stats.present} color={STATUS_META.present.accent} icon="checkmark-circle" isDark={isDark} />
                                    <StatPill label="Half" value={stats.half} color={STATUS_META.half_day.accent} icon="time" isDark={isDark} />
                                    <StatPill label="Absent" value={stats.absent} color={STATUS_META.absent.accent} icon="close-circle" isDark={isDark} />
                                </View>
                            </View>
                        </View>
                    </Animated.View>

                    {/* ── Segmented filter control ──────────────────────────────────── */}
                    <Animated.View entering={FadeInDown.delay(80).duration(400)} style={{ marginBottom: 20 }}>
                        <SegmentedControl options={FILTER_OPTIONS} value={activeFilter} onChange={setActiveFilter} isDark={isDark} />
                    </Animated.View>

                    {/* ── List, grouped by week ──────────────────────────────────────── */}
                    {filteredRecords.length === 0 ? (
                        <EmptyState filter={activeFilter} titleColor={titleColor} subColor={subColor} />
                    ) : (
                        <View>
                            {groupedRecords.map((group, gi) => (
                                <Animated.View
                                    key={group.key}
                                    entering={FadeInUp.delay(Math.min(gi * 60, 240)).duration(400).springify()}
                                    layout={Layout.springify()}
                                    style={[styles.groupShadowWrap, { backgroundColor: cardBg }, clayShadow(isDark)]}
                                >
                                    <View style={[styles.groupCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                                        <LinearGradient
                                            colors={isDark ? ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.6)', 'rgba(255,255,255,0)']}
                                            style={styles.groupSheen}
                                        />
                                        <Text style={[styles.groupLabel, { color: subColor }]}>{group.label}</Text>
                                        {group.records.map((record, ri) => {
                                            const meta = STATUS_META[(record.status as StatusKey)] ?? STATUS_META.absent;
                                            return (
                                                <RecordRow
                                                    key={record.id}
                                                    record={record}
                                                    meta={meta}
                                                    isDark={isDark}
                                                    isLast={ri === group.records.length - 1}
                                                    titleColor={titleColor}
                                                    subColor={subColor}
                                                    dividerColor={cardBorder}
                                                />
                                            );
                                        })}
                                    </View>
                                </Animated.View>
                            ))}
                        </View>
                    )}
                </Animated.ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    orb1: { position: 'absolute', width: 350, height: 350, borderRadius: 175, top: -100, right: -120 },
    orb2: { position: 'absolute', width: 250, height: 250, borderRadius: 125, bottom: 100, left: -100 },

    scrollContent: { paddingTop: 76, paddingHorizontal: 20, paddingBottom: 60 },

    // Hero card
    heroShadowWrap: { borderRadius: 24, marginBottom: 14 },
    heroCard: { borderRadius: 24, padding: 14, borderWidth: 1, overflow: 'hidden' },
    heroSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 64 },
    heroTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    heroTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
    navButtons: { flexDirection: 'row', gap: 6 },
    navBtn: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    heroCaption: { fontSize: 11, fontWeight: '500', marginTop: 2 },

    heroBodyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    ringWrap: { alignItems: 'center', justifyContent: 'center' },
    ringPercent: { fontSize: 20, fontWeight: '800', letterSpacing: -0.6 },
    ringSub: { fontSize: 10, fontWeight: '600', letterSpacing: 0.2, marginTop: 1 },

    statPillsRow: { flex: 1, gap: 6 },
    statPill: { paddingVertical: 8, paddingHorizontal: 8, borderRadius: 12, gap: 2 },
    statPillTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    statPillValue: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
    statPillLabel: { fontSize: 9, fontWeight: '600', letterSpacing: 0.2 },

    // Segmented control
    segmentTrack: { flexDirection: 'row', height: 46, borderRadius: 18, padding: 4, position: 'relative' },
    segmentIndicator: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: 14 },
    segmentItem: { flex: 1, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
    segmentLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.1 },

    // Grouped list card
    groupShadowWrap: { borderRadius: 28, marginBottom: 14 },
    groupCard: { borderRadius: 28, borderWidth: 1, overflow: 'hidden', paddingBottom: 4 },
    groupSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 56 },
    groupLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8 },

    recordRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 12 },
    dateBadge: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    dateBadgeDay: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3, lineHeight: 18 },
    dateBadgeWeekday: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, marginTop: 2 },

    recordInfo: { flex: 1 },
    recordWeekday: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2, marginBottom: 3 },
    recordTime: { fontSize: 12, fontWeight: '500' },

    statusPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
    statusPillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },

    // Empty state
    emptyBox: { alignItems: 'center', paddingTop: 60, gap: 12 },
    emptyIconRing: {
        width: 80, height: 80, borderRadius: 40,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 6, backgroundColor: 'rgba(124,111,255,0.08)',
    },
    emptyTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
    emptySub: { fontSize: 14, fontWeight: '500', textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
});