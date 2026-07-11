import React, { useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    Platform,
    ViewStyle,
} from 'react-native';
import { GestureDetector, Gesture, Pressable } from 'react-native-gesture-handler';
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
import { HapticFeedback } from '../utils/animations';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;
const IS_WEB = Platform.OS === 'web';

interface Student {
    id: string;
    name: string;
    rollNo: string;
    status: 'present' | 'absent' | 'unmarked';
    photoUrl?: string | null;
}

interface Props {
    student: Student;
    onStatusChange: (id: string, status: 'present' | 'absent' | 'unmarked') => void;
    isDark?: boolean;
}

function clayCard(isDark: boolean): ViewStyle {
    const base = isDark ? '#1E293B' : '#FFFFFF';
    return {
        backgroundColor: base,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.07)' : '#E7EBF0',
        ...(Platform.select({
            ios: {
                shadowColor: isDark ? '#000' : '#64748B',
                shadowOffset: { width: 0, height: 5 },
                shadowOpacity: isDark ? 0.4 : 0.08,
                shadowRadius: 14,
            },
            android: { elevation: 3 },
            web: {
                boxShadow: isDark
                    ? '0 8px 24px rgba(0,0,0,0.4)'
                    : '0 5px 18px rgba(100,116,139,0.12)',
            } as object,
            default: {},
        })),
    };
}

const SwipeableStudentCard: React.FC<Props> = ({ student, onStatusChange, isDark = false }) => {
    const translateX = useSharedValue(0);
    const status = student.status;
    const styles = useMemo(() => getStyles(isDark), [isDark]);

    const statusColors = useMemo(() => ({
        unmarked: isDark ? '#1E293B' : '#FFFFFF',
        present: isDark ? 'rgba(5,150,105,0.18)' : '#ECFDF5',
        absent: isDark ? 'rgba(225,29,72,0.18)' : '#FFF1F2',
    }), [isDark]);

    const cycleStatus = useCallback(() => {
        const next =
            status === 'unmarked' ? 'present' : status === 'present' ? 'absent' : 'unmarked';
        onStatusChange(student.id, next);
    }, [status, student.id, onStatusChange]);

    useEffect(() => {
        translateX.value = withSpring(0);
    }, [status, translateX]);

    const panGesture = Gesture.Pan()
        .activeOffsetX([-20, 20])
        .onUpdate((event) => {
            translateX.value = event.translationX;
        })
        .onEnd(() => {
            if (translateX.value > SWIPE_THRESHOLD) {
                runOnJS(HapticFeedback.success)();
                runOnJS(onStatusChange)(student.id, 'present');
            } else if (translateX.value < -SWIPE_THRESHOLD) {
                runOnJS(HapticFeedback.error)();
                runOnJS(onStatusChange)(student.id, 'absent');
            }
            translateX.value = withSpring(0);
        });

    const animatedStyle = useAnimatedStyle(() => {
        const base =
            status === 'present' ? statusColors.present
            : status === 'absent' ? statusColors.absent
            : statusColors.unmarked;

        const backgroundColor = interpolateColor(
            translateX.value,
            [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
            [statusColors.absent, base, statusColors.present],
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
            <GestureDetector gesture={panGesture}>
                <Animated.View style={[styles.card, clayCard(isDark), animatedStyle]}>
                    <LinearGradient
                        colors={isDark ? ['rgba(255,255,255,0.06)', 'transparent'] : ['rgba(255,255,255,0.65)', 'transparent']}
                        style={styles.sheen}
                        pointerEvents="none"
                    />
                    <Pressable
                        onPress={cycleStatus}
                        style={({ pressed }) => [
                            styles.cardContent,
                            pressed && styles.cardContentPressed,
                            IS_WEB && ({ cursor: 'pointer' } as object),
                        ]}
                    >
                        {student.photoUrl ? (
                            <Image
                                source={{ uri: student.photoUrl }}
                                style={styles.avatar}
                                contentFit="cover"
                                transition={200}
                                cachePolicy="memory-disk"
                            />
                        ) : (
                            <LinearGradient colors={avatarColors} style={styles.avatar} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                                <Text style={styles.avatarText}>{student.name.charAt(0).toUpperCase()}</Text>
                            </LinearGradient>
                        )}

                        <View style={styles.info}>
                            <Text style={styles.name} numberOfLines={1}>{student.name}</Text>
                            <View style={styles.rollBadge}>
                                <Text style={styles.rollLabel}>Roll</Text>
                                <Text style={styles.roll}>{student.rollNo}</Text>
                            </View>
                        </View>

                        <View style={styles.checkbox}>
                            <View
                                style={[
                                    styles.checkboxInner,
                                    status === 'present' && styles.checkboxPresent,
                                    status === 'absent' && styles.checkboxAbsent,
                                ]}
                            >
                                {status === 'present' && <Ionicons name="checkmark" size={18} color="#fff" />}
                                {status === 'absent' && <Ionicons name="close" size={18} color="#fff" />}
                            </View>
                        </View>
                    </Pressable>
                </Animated.View>
            </GestureDetector>
        </View>
    );
};

const getStyles = (isDark: boolean) => StyleSheet.create({
    container: {
        marginBottom: 14,
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
        height: 48,
        zIndex: 1,
    },
    cardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        gap: 12,
    },
    cardContentPressed: {
        opacity: 0.92,
    },
    avatar: {
        width: 52,
        height: 52,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 22,
        fontWeight: '800',
        color: '#fff',
    },
    info: {
        flex: 1,
        gap: 4,
    },
    name: {
        fontSize: 16,
        fontWeight: '800',
        color: isDark ? '#F8FAFC' : '#0F172A',
        letterSpacing: -0.3,
    },
    rollBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(99,102,241,0.1)',
    },
    rollLabel: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.45)',
    },
    roll: {
        fontSize: 13,
        fontWeight: '800',
        color: isDark ? '#CBD5E1' : '#475569',
    },
    checkbox: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxInner: {
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 2,
        borderColor: isDark ? 'rgba(255,255,255,0.2)' : '#CBD5E1',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC',
    },
    checkboxPresent: {
        backgroundColor: '#059669',
        borderColor: '#047857',
    },
    checkboxAbsent: {
        backgroundColor: '#E11D48',
        borderColor: '#BE123C',
    },
});

export default SwipeableStudentCard;
