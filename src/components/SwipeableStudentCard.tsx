import React, { useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    useWindowDimensions,
    Platform,
    TouchableOpacity,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    runOnJS,
    interpolateColor,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTheme } from '../hooks/useTheme';
import { HapticFeedback } from '../utils/animations';


export interface StudentCardData {
    id: string;
    name: string;
    rollNo: string;
    className?: string | null;
    status: 'present' | 'absent' | 'unmarked';
    photoUrl?: string | null;
    consecutiveAbsenceDays?: number;
    absenceStreakStartDate?: string | null;
    absenceStreakEndDate?: string | null;
    absenceStreakDates?: { date: string; status: string }[];
    monthlyAttendancePercentage?: number | null;
    absenceRiskLevel?: string | null;
    isIrregular?: boolean;
    monthlyAbsentCount?: number;
}

interface Props {
    student: StudentCardData;
    onStatusChange: (id: string, status: 'present' | 'absent' | 'unmarked') => void;
    onPressStreak?: (student: StudentCardData) => void;
    isDark?: boolean;
    disabled?: boolean;
}

function formatDateLabel(dateStr?: string | null): string {
    if (!dateStr) return '';
    try {
        const [y, m, d] = dateStr.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        return dt.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
        });
    } catch {
        return dateStr;
    }
}

const SwipeableStudentCard: React.FC<Props> = ({
    student,
    onStatusChange,
    onPressStreak,
    isDark = false,
    disabled = false,
}) => {
    const { theme } = useTheme();
    const { width, fontScale } = useWindowDimensions();
    const compact = width < 500 || fontScale > 1.3;
    const swipeThreshold = Math.min(width, 900) * 0.28;
    const translateX = useSharedValue(0);
    const status = student.status;
    const styles = useMemo(() => getStyles(isDark), [isDark]);

    const streakDays = student.consecutiveAbsenceDays || 0;
    const hasStreak = streakDays > 0;
    const isSignificantStreak = streakDays >= 5;

    const streakDateRange = useMemo(() => {
        if (!student.absenceStreakStartDate) return '';
        const start = formatDateLabel(student.absenceStreakStartDate);
        if (!student.absenceStreakEndDate || student.absenceStreakStartDate === student.absenceStreakEndDate) {
            return start;
        }
        const end = formatDateLabel(student.absenceStreakEndDate);
        return `${start} → ${end}`;
    }, [student.absenceStreakStartDate, student.absenceStreakEndDate]);

    const statusColors = useMemo(
        () => ({
            unmarked: theme.colors.surface,
            present: isDark ? 'rgba(5,150,105,0.16)' : '#ECFDF5',
            absent: isDark ? 'rgba(225,29,72,0.16)' : '#FFF1F2',
        }),
        [isDark, theme.colors.surface]
    );

    const handlePresentPress = useCallback(() => {
        HapticFeedback.success();
        const next = status === 'present' ? 'unmarked' : 'present';
        onStatusChange(student.id, next);
    }, [status, student.id, onStatusChange]);

    const handleAbsentPress = useCallback(() => {
        HapticFeedback.error();
        const next = status === 'absent' ? 'unmarked' : 'absent';
        onStatusChange(student.id, next);
    }, [status, student.id, onStatusChange]);

    const handleCycleStatus = useCallback(() => {
        let nextStatus: 'present' | 'absent' | 'unmarked';
        if (status === 'unmarked') {
            HapticFeedback.success();
            nextStatus = 'present';
        } else if (status === 'present') {
            HapticFeedback.error();
            nextStatus = 'absent';
        } else {
            HapticFeedback.light();
            nextStatus = 'unmarked';
        }
        onStatusChange(student.id, nextStatus);
    }, [status, student.id, onStatusChange]);

    const handleStreakPress = useCallback(() => {
        HapticFeedback.light();
        if (onPressStreak) {
            onPressStreak(student);
        }
    }, [onPressStreak, student]);

    useEffect(() => {
        translateX.value = withSpring(0);
    }, [status, translateX]);

    const panGesture = Gesture.Pan()
        .enabled(!disabled)
        .activeOffsetX([-20, 20])
        .failOffsetY([-12, 12])
        .onUpdate((event) => {
            translateX.value = event.translationX;
        })
        .onEnd(() => {
            if (translateX.value > swipeThreshold) {
                runOnJS(HapticFeedback.success)();
                runOnJS(onStatusChange)(student.id, 'present');
            } else if (translateX.value < -swipeThreshold) {
                runOnJS(HapticFeedback.error)();
                runOnJS(onStatusChange)(student.id, 'absent');
            }
            translateX.value = withSpring(0);
        });

    const animatedStyle = useAnimatedStyle(() => {
        const base =
            status === 'present'
                ? statusColors.present
                : status === 'absent'
                ? statusColors.absent
                : statusColors.unmarked;

        const backgroundColor = interpolateColor(
            translateX.value,
            [-width, 0, width],
            [statusColors.absent, base, statusColors.present]
        );

        return {
            transform: [{ translateX: translateX.value }],
            backgroundColor,
        };
    });

    const avatarColors = useMemo((): [string, string] => {
        if (status === 'present') return ['#059669', '#34D399'];
        if (status === 'absent') return ['#E11D48', '#FB7185'];
        return isDark ? ['#4338CA', '#6366F1'] : ['#6366F1', '#818CF8'];
    }, [status, isDark]);

    return (
        <View style={styles.container}>
            <GestureDetector gesture={panGesture} touchAction="pan-y">
                <Animated.View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.shape.borderRadiusLG, opacity: disabled ? 0.65 : 1 }, animatedStyle]}>
                    <View style={[styles.cardContent, compact && { flexDirection: 'column', alignItems: 'stretch' }]}>
                        {/* Student Card Primary Tap Area (cycles unmarked -> present -> absent -> unmarked) */}
                        <TouchableOpacity
                            style={[styles.cardMainTapArea, { minHeight: 48 }]}
                            activeOpacity={0.78}
                            disabled={disabled}
                            accessibilityState={{ disabled }}
                            onPress={handleCycleStatus}
                            accessibilityRole="button"
                            accessibilityLabel={`${student.name}, currently marked ${status}. Tap to cycle status between present, absent, and unmarked.`}
                            accessibilityHint="Taps to cycle between present, absent, and unmark"
                        >
                            {/* Avatar */}
                            {student.photoUrl ? (
                                <Image
                                    source={{ uri: student.photoUrl }}
                                    style={styles.avatar}
                                    contentFit="cover"
                                    transition={200}
                                    cachePolicy="memory-disk"
                                />
                            ) : (
                                <LinearGradient
                                    colors={avatarColors}
                                    style={styles.avatar}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                >
                                    <Text style={styles.avatarText}>
                                        {student.name.charAt(0).toUpperCase()}
                                    </Text>
                                </LinearGradient>
                            )}

                            {/* Student Details & Streak */}
                            <View style={styles.info}>
                                <Text style={[styles.name, { color: theme.colors.textStrong }]}>
                                    {student.name}
                                </Text>

                                <View style={styles.metaRow}>
                                    {student.className ? (
                                        <Text style={styles.classText} numberOfLines={1}>
                                            {student.className}
                                        </Text>
                                    ) : null}
                                    <View style={styles.rollBadge}>
                                        <Text style={styles.rollLabel}>Roll</Text>
                                        <Text style={styles.roll}>{student.rollNo}</Text>
                                    </View>

                                    {/* Live Status Chip when marked */}
                                    {status !== 'unmarked' && (
                                        <View
                                            style={[
                                                styles.statusPill,
                                                status === 'present'
                                                    ? styles.statusPillPresent
                                                    : styles.statusPillAbsent,
                                            ]}
                                        >
                                            <Ionicons
                                                name={status === 'present' ? 'checkmark-circle' : 'close-circle'}
                                                size={11}
                                                color={status === 'present' ? '#059669' : '#E11D48'}
                                            />
                                            <Text
                                                style={[
                                                    styles.statusPillText,
                                                    status === 'present'
                                                        ? styles.statusPillTextPresent
                                                        : styles.statusPillTextAbsent,
                                                ]}
                                            >
                                                {status === 'present' ? 'Present' : 'Absent'}
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                {/* Consecutive Absence Streak Badge */}
                                {hasStreak ? (
                                    <TouchableOpacity
                                        activeOpacity={0.75}
                                        onPress={(e: any) => {
                                            e?.stopPropagation?.();
                                            handleStreakPress();
                                        }}
                                        style={[
                                            styles.streakBadge,
                                            isSignificantStreak && styles.streakBadgeAttention,
                                        ]}
                                        accessibilityRole="button"
                                        accessibilityLabel={`${streakDays} days absent, ${streakDateRange}. Tap for insight`}
                                    >
                                        <View style={styles.streakIndicatorDot} />
                                        <View style={styles.streakTextCol}>
                                            <Text style={styles.streakTitle}>
                                                {isSignificantStreak
                                                    ? `${streakDays} DAYS • ATTENTION`
                                                    : streakDays === 1
                                                    ? '1 DAY ABSENT'
                                                    : `${streakDays} DAYS ABSENT`}
                                            </Text>
                                            {streakDays >= 2 && streakDateRange ? (
                                                <Text style={styles.streakDates}>{streakDateRange}</Text>
                                            ) : null}
                                        </View>
                                        <Ionicons
                                            name="chevron-forward"
                                            size={12}
                                            color={isDark ? '#FDA4AF' : '#E11D48'}
                                            style={styles.streakChevron}
                                        />
                                    </TouchableOpacity>
                                ) : student.isIrregular ? (
                                    <TouchableOpacity
                                        activeOpacity={0.75}
                                        onPress={(e: any) => {
                                            e?.stopPropagation?.();
                                            handleStreakPress();
                                        }}
                                        style={styles.irregularPill}
                                        accessibilityRole="button"
                                        accessibilityLabel="Irregular attendance. Tap for details"
                                    >
                                        <Ionicons name="alert-circle" size={12} color="#D97706" />
                                        <Text style={styles.irregularPillText}>
                                            Irregular · {student.monthlyAbsentCount || 5} absent this month
                                        </Text>
                                    </TouchableOpacity>
                                ) : null}
                            </View>
                        </TouchableOpacity>

                        {/* Quick Attendance Action Buttons */}
                        <View style={[styles.actionsGroup, compact && { justifyContent: 'flex-end' }]}>
                            {/* Present Button */}
                            <TouchableOpacity
                                style={[
                                    styles.quickActionBtn,
                                    status === 'present'
                                        ? styles.quickActionPresent
                                        : styles.quickActionInactive,
                                ]}
                                activeOpacity={0.75}
                                disabled={disabled}
                                onPress={handlePresentPress}
                                accessibilityRole="button"
                                accessibilityState={{ selected: status === 'present', disabled }}
                                accessibilityLabel={`Mark ${student.name} present`}
                            >
                                <Ionicons
                                    name={status === 'present' ? 'checkmark' : 'checkmark-outline'}
                                    size={18}
                                    color={status === 'present' ? '#fff' : isDark ? '#6EE7B7' : '#059669'}
                                />
                                <Text
                                    style={[
                                        styles.quickActionLabel,
                                        { color: status === 'present' ? '#fff' : isDark ? '#6EE7B7' : '#059669' },
                                    ]}
                                >
                                    Present
                                </Text>
                            </TouchableOpacity>

                            {/* Absent Button */}
                            <TouchableOpacity
                                style={[
                                    styles.quickActionBtn,
                                    status === 'absent'
                                        ? styles.quickActionAbsent
                                        : styles.quickActionInactive,
                                ]}
                                activeOpacity={0.75}
                                disabled={disabled}
                                onPress={handleAbsentPress}
                                accessibilityRole="button"
                                accessibilityState={{ selected: status === 'absent', disabled }}
                                accessibilityLabel={`Mark ${student.name} absent`}
                            >
                                <Ionicons
                                    name={status === 'absent' ? 'close' : 'close-outline'}
                                    size={18}
                                    color={status === 'absent' ? '#fff' : isDark ? '#FDA4AF' : '#E11D48'}
                                />
                                <Text
                                    style={[
                                        styles.quickActionLabel,
                                        { color: status === 'absent' ? '#fff' : isDark ? '#FDA4AF' : '#E11D48' },
                                    ]}
                                >
                                    Absent
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Animated.View>
            </GestureDetector>
        </View>
    );
};

const getStyles = (isDark: boolean) =>
    StyleSheet.create({
        container: {
            marginBottom: 12,
            paddingHorizontal: 16,
        },
        card: {
            overflow: 'hidden',
        },
        sheen: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 40,
            zIndex: 1,
        },
        cardContent: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: 12,
            gap: 12,
        },
        cardMainTapArea: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
        },
        statusPill: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 6,
        },
        statusPillPresent: {
            backgroundColor: isDark ? 'rgba(5,150,105,0.22)' : '#D1FAE5',
        },
        statusPillAbsent: {
            backgroundColor: isDark ? 'rgba(225,29,72,0.22)' : '#FFE4E6',
        },
        statusPillText: {
            fontSize: 10,
            fontWeight: '800',
        },
        statusPillTextPresent: {
            color: isDark ? '#6EE7B7' : '#059669',
        },
        statusPillTextAbsent: {
            color: isDark ? '#FDA4AF' : '#E11D48',
        },
        avatar: {
            width: 48,
            height: 48,
            borderRadius: 16,
            justifyContent: 'center',
            alignItems: 'center',
        },
        avatarText: {
            fontSize: 20,
            fontWeight: '800',
            color: '#fff',
        },
        info: {
            flex: 1,
            gap: 4,
            justifyContent: 'center',
        },
        name: {
            fontSize: 15,
            fontWeight: '800',
            color: isDark ? '#F8FAFC' : '#0F172A',
            letterSpacing: -0.3,
        },
        metaRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
        },
        classText: {
            fontSize: 12,
            fontWeight: '600',
            color: isDark ? '#94A3B8' : '#64748B',
        },
        rollBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 7,
            paddingVertical: 2,
            borderRadius: 6,
            backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(99,102,241,0.08)',
        },
        rollLabel: {
            fontSize: 9,
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.45)',
        },
        roll: {
            fontSize: 11,
            fontWeight: '800',
            color: isDark ? '#CBD5E1' : '#475569',
        },
        streakBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-start',
            gap: 6,
            marginTop: 3,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 8,
            backgroundColor: isDark ? 'rgba(225,29,72,0.14)' : '#FFF1F2',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(225,29,72,0.28)' : '#FECDD3',
        },
        streakBadgeAttention: {
            backgroundColor: isDark ? 'rgba(225,29,72,0.24)' : '#FFE4E6',
            borderColor: isDark ? 'rgba(225,29,72,0.5)' : '#FDA4AF',
        },
        streakIndicatorDot: {
            width: 7,
            height: 7,
            borderRadius: 3.5,
            backgroundColor: '#E11D48',
        },
        streakTextCol: {
            gap: 1,
        },
        streakTitle: {
            fontSize: 11,
            fontWeight: '800',
            color: isDark ? '#FDA4AF' : '#E11D48',
            letterSpacing: 0.2,
        },
        streakDates: {
            fontSize: 10,
            fontWeight: '600',
            color: isDark ? '#CBD5E1' : '#64748B',
        },
        streakChevron: {
            marginLeft: 2,
            opacity: 0.7,
        },
        irregularPill: {
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-start',
            gap: 4,
            marginTop: 3,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 7,
            backgroundColor: isDark ? 'rgba(217,119,6,0.16)' : '#FFFBEB',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(217,119,6,0.3)' : '#FDE68A',
        },
        irregularPillText: {
            fontSize: 10,
            fontWeight: '700',
            color: isDark ? '#FDE68A' : '#B45309',
        },
        actionsGroup: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
        },
        quickActionBtn: {
            minWidth: 96,
            minHeight: 48,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1.5,
            flexDirection: 'row',
            gap: 6,
        },
        quickActionInactive: {
            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC',
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0',
        },
        quickActionPresent: {
            backgroundColor: '#059669',
            borderColor: '#047857',
            ...(Platform.select({
                ios: {
                    shadowColor: '#059669',
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: 0.35,
                    shadowRadius: 6,
                },
                android: { elevation: 3 },
                web: { boxShadow: '0 4px 10px rgba(5,150,105,0.3)' } as object,
                default: {},
            })),
        },
        quickActionAbsent: {
            backgroundColor: '#E11D48',
            borderColor: '#BE123C',
            ...(Platform.select({
                ios: {
                    shadowColor: '#E11D48',
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: 0.35,
                    shadowRadius: 6,
                },
                android: { elevation: 3 },
                web: { boxShadow: '0 4px 10px rgba(225,29,72,0.3)' } as object,
                default: {},
            })),
        },
        quickActionLabel: {
            fontSize: 13,
            fontWeight: '600',
        },
    });

export default React.memo(SwipeableStudentCard, (previous, next) =>
    previous.isDark === next.isDark &&
    previous.disabled === next.disabled &&
    previous.onStatusChange === next.onStatusChange &&
    previous.onPressStreak === next.onPressStreak &&
    Object.keys(previous.student).length === Object.keys(next.student).length &&
    Object.keys(previous.student).every((key) =>
        previous.student[key as keyof StudentCardData] === next.student[key as keyof StudentCardData]
    )
);
