import { TourTarget } from '@/src/features/app-tour';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform, Pressable, Modal, ScrollView, TouchableOpacity } from 'react-native';
import {
  KeyboardAvoidingView,
  KeyboardAwareScrollView,
} from 'react-native-keyboard-controller';
import AppTextInput from '../../src/components/AppTextInput';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import {
  TimetableService,
  TimetableSlot,
  Period,
  DayOfWeek,
  TIMETABLE_DAYS,
  TIMETABLE_DAY_LABELS,
} from '../../src/services/timetableService';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown, FadeIn, useSharedValue,
  useAnimatedStyle, withRepeat, withSequence,
  withTiming, withDelay, withSpring, Easing } from
'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../src/hooks/useTheme';
import { format } from 'date-fns';
import { Svg, Path, Circle, Rect, Line, Ellipse } from 'react-native-svg';
import LogoLoader from '../../src/components/LogoLoader';
import ViewAsBanner from '../../src/components/ViewAsBanner';
import { useEffectiveStaffId } from '../../src/hooks/useEffectiveStaffId';
import {
  ExamTimetableService,
  ExamAllocationService,
  ExamScheduleSlot,
  ExamSyllabusItem,
  ExamDuty,
  groupSlotsByExam,
  ymd,
} from '../../src/services/examService';
import { examCategoryFor } from '../../src/constants/examCategories';
import { t_field } from '../../src/utils/lang';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  MySubstitution,
  SubstitutionService,
} from '../../src/services/substitutionService';

const { width, height } = Dimensions.get('window');
const FONT_FAMILY = Platform.OS === 'ios' ? 'SF Pro Display' : 'sans-serif';

// ─── Clay Helpers ──────────────────────────────────────────────────
function clay(isDark: boolean, raised: 'sm' | 'md' | 'lg' = 'md'): any {
  const spread = raised === 'lg' ? 24 : raised === 'sm' ? 12 : 18;
  const dy = raised === 'lg' ? 12 : raised === 'sm' ? 6 : 9;
  if (Platform.OS === 'web') {
    const drop = isDark ? 'rgba(0,0,0,0.60)' : 'rgba(166,180,200,0.55)';
    const light = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,1)';
    const innerHi = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.9)';
    const innerLo = isDark ? 'rgba(0,0,0,0.4)' : 'rgba(166,180,200,0.35)';
    return {
      boxShadow:
        `${dy}px ${dy}px ${spread}px ${drop}, ` +
        `-${dy}px -${dy}px ${spread}px ${light}, ` +
        `inset 3px 3px 6px ${innerHi}, ` +
        `inset -3px -3px 6px ${innerLo}`,
    };
  }
  return {
    shadowColor: isDark ? '#000000' : '#94A3B8',
    shadowOffset: { width: 0, height: dy },
    shadowOpacity: isDark ? 0.45 : 0.26,
    shadowRadius: spread,
    elevation: raised === 'lg' ? 10 : raised === 'sm' ? 4 : 7,
  };
}

function clayInset(isDark: boolean): any {
  if (Platform.OS === 'web') {
    const innerLo = isDark ? 'rgba(0,0,0,0.4)' : 'rgba(166,180,200,0.45)';
    const innerHi = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.95)';
    return {
      boxShadow: `inset 4px 4px 8px ${innerLo}, inset -4px -4px 8px ${innerHi}`,
    };
  }
  return {
    borderWidth: 1,
    borderColor: isDark ? 'rgba(0,0,0,0.22)' : 'rgba(148,163,184,0.20)',
  };
}

function clayCard(isDark: boolean, raised: 'sm' | 'md' | 'lg' = 'md'): any {
  return {
    backgroundColor: isDark ? '#1A2332' : '#EFF2F9',
    borderRadius: raised === 'lg' ? 30 : 24,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.7)',
    ...clay(isDark, raised),
  };
}

// ─── Subject Themes ────────────────────────────────────────────────
const getSubjectTheme = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes('math'))
  return { bg: 'rgba(16,185,129,0.10)', bgStrong: 'rgba(16,185,129,0.18)', text: '#065F46', accent: '#10B981', glow: 'rgba(16,185,129,0.25)', label: 'Mathematics' };
  if (lower.includes('sci'))
  return { bg: 'rgba(249,115,22,0.10)', bgStrong: 'rgba(249,115,22,0.18)', text: '#9A3412', accent: '#F97316', glow: 'rgba(249,115,22,0.25)', label: 'Science' };
  if (lower.includes('eng'))
  return { bg: 'rgba(139,92,246,0.10)', bgStrong: 'rgba(139,92,246,0.18)', text: '#581C87', accent: '#8B5CF6', glow: 'rgba(139,92,246,0.25)', label: 'English' };
  if (lower.includes('hind'))
  return { bg: 'rgba(107,47,160,0.10)', bgStrong: 'rgba(107,47,160,0.18)', text: '#4A1A75', accent: '#6B2FA0', glow: 'rgba(107,47,160,0.25)', label: 'Hindi' };
  if (lower.includes('hist'))
  return { bg: 'rgba(236,72,153,0.10)', bgStrong: 'rgba(236,72,153,0.18)', text: '#9D174D', accent: '#EC4899', glow: 'rgba(236,72,153,0.25)', label: 'History' };
  if (lower.includes('geo'))
  return { bg: 'rgba(6,182,212,0.10)', bgStrong: 'rgba(6,182,212,0.18)', text: '#155E75', accent: '#06B6D4', glow: 'rgba(6,182,212,0.25)', label: 'Geography' };
  if (lower.includes('comp'))
  return { bg: 'rgba(59,130,246,0.10)', bgStrong: 'rgba(59,130,246,0.18)', text: '#1E40AF', accent: '#3B82F6', glow: 'rgba(59,130,246,0.25)', label: 'Computer' };
  if (lower.includes('art'))
  return { bg: 'rgba(244,63,94,0.10)', bgStrong: 'rgba(244,63,94,0.18)', text: '#9F1239', accent: '#F43F5E', glow: 'rgba(244,63,94,0.25)', label: 'Art' };
  if (lower.includes('music'))
  return { bg: 'rgba(168,85,247,0.10)', bgStrong: 'rgba(168,85,247,0.18)', text: '#6B21A8', accent: '#A855F7', glow: 'rgba(168,85,247,0.25)', label: 'Music' };
  if (lower.includes('sport') || lower.includes('phy'))
  return { bg: 'rgba(34,197,94,0.10)', bgStrong: 'rgba(34,197,94,0.18)', text: '#166534', accent: '#22C55E', glow: 'rgba(34,197,94,0.25)', label: 'Sports' };
  return { bg: 'rgba(100,116,139,0.10)', bgStrong: 'rgba(100,116,139,0.18)', text: '#334155', accent: '#64748B', glow: 'rgba(100,116,139,0.20)', label: 'Subject' };
};

// ─── Subject-Specific Anime Avatars ────────────────────────────────
const SubjectAvatar = ({ size = 44, subject = '' }: {size?: number;subject?: string;}) => {
  const theme = getSubjectTheme(subject);
  const lower = subject.toLowerCase();

  if (lower.includes('math')) {
    return (
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Circle cx="24" cy="24" r="22" fill={theme.bg.replace('0.10', '0.40')} />
        <Circle cx="24" cy="20" r="10" fill="#D1FAE5" />
        <Circle cx="20" cy="19" r="3" fill="none" stroke="#065F46" strokeWidth="1.5" />
        <Circle cx="28" cy="19" r="3" fill="none" stroke="#065F46" strokeWidth="1.5" />
        <Line x1="23" y1="19" x2="25" y2="19" stroke="#065F46" strokeWidth="1.2" />
        <Circle cx="20" cy="19" r="1.2" fill="#065F46" />
        <Circle cx="28" cy="19" r="1.2" fill="#065F46" />
        <Path d="M21 24 Q24 27 27 24" stroke="#065F46" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <Rect x="34" y="10" width="4" height="18" rx="1" fill="#10B981" fillOpacity="0.6" />
        <Line x1="34" y1="14" x2="36" y2="14" stroke="#fff" strokeWidth="0.8" />
        <Line x1="34" y1="18" x2="36" y2="18" stroke="#fff" strokeWidth="0.8" />
        <Line x1="34" y1="22" x2="36" y2="22" stroke="#fff" strokeWidth="0.8" />
        <Path d="M14 18 Q16 8 24 10 Q32 8 34 18" fill="#065F46" fillOpacity="0.3" />
      </Svg>);

  }

  if (lower.includes('sci')) {
    return (
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Circle cx="24" cy="24" r="22" fill={theme.bg.replace('0.10', '0.40')} />
        <Circle cx="24" cy="20" r="10" fill="#FFEDD5" />
        <Rect x="16" y="16" width="7" height="5" rx="2" fill="none" stroke="#9A3412" strokeWidth="1.5" />
        <Rect x="25" y="16" width="7" height="5" rx="2" fill="none" stroke="#9A3412" strokeWidth="1.5" />
        <Line x1="23" y1="18.5" x2="25" y2="18.5" stroke="#9A3412" strokeWidth="1.2" />
        <Circle cx="19.5" cy="18.5" r="1" fill="#9A3412" />
        <Circle cx="28.5" cy="18.5" r="1" fill="#9A3412" />
        <Path d="M21 24.5 Q24 27 27 24.5" stroke="#9A3412" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <Path d="M36 28 L33 18 L37 18 L40 28 Q40 34 36 34 Q32 34 32 28 Z" fill="#F97316" fillOpacity="0.5" />
        <Ellipse cx="36" cy="30" rx="3" ry="1.5" fill="#FDBA74" fillOpacity="0.6" />
      </Svg>);

  }

  if (lower.includes('eng')) {
    return (
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Circle cx="24" cy="24" r="22" fill={theme.bg.replace('0.10', '0.40')} />
        <Circle cx="24" cy="20" r="10" fill="#EDE9FE" />
        <Ellipse cx="20" cy="19" rx="1.5" ry="2" fill="#581C87" />
        <Ellipse cx="28" cy="19" rx="1.5" ry="2" fill="#581C87" />
        <Path d="M21 24 Q24 27 27 24" stroke="#581C87" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <Ellipse cx="16" cy="22" rx="2.5" ry="1.5" fill="#DDD6FE" fillOpacity="0.7" />
        <Ellipse cx="32" cy="22" rx="2.5" ry="1.5" fill="#DDD6FE" fillOpacity="0.7" />
        <Path d="M35 8 Q38 14 36 22 L34 20 Q36 14 35 8 Z" fill="#8B5CF6" fillOpacity="0.6" />
        <Line x1="36" y1="22" x2="37" y2="28" stroke="#8B5CF6" strokeWidth="1" />
      </Svg>);

  }

  if (lower.includes('hind')) {
    return (
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Circle cx="24" cy="24" r="22" fill={theme.bg.replace('0.10', '0.40')} />
        <Circle cx="24" cy="20" r="10" fill="#E0E7FF" />
        <Circle cx="20" cy="19" r="1.5" fill="#3730A3" />
        <Circle cx="28" cy="19" r="1.5" fill="#3730A3" />
        <Path d="M21 24 Q24 28 27 24" stroke="#3730A3" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        <Circle cx="24" cy="14" r="1.2" fill="#EF4444" />
        <Rect x="8" y="28" width="10" height="8" rx="1" fill="#4F46E5" fillOpacity="0.5" />
        <Line x1="13" y1="28" x2="13" y2="36" stroke="#E0E7FF" strokeWidth="0.8" />
        <Line x1="36" y1="14" x2="40" y2="32" stroke="#4F46E5" strokeWidth="1.5" strokeLinecap="round" />
        <Circle cx="40" cy="33" r="1" fill="#4F46E5" />
      </Svg>);

  }

  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Circle cx="24" cy="24" r="22" fill={theme.bg.replace('0.10', '0.40')} />
      <Circle cx="24" cy="20" r="10" fill={theme.accent + '25'} />
      <Circle cx="20" cy="19" r="1.5" fill={theme.text} />
      <Circle cx="28" cy="19" r="1.5" fill={theme.text} />
      <Path d="M21 24 Q24 27 27 24" stroke={theme.text} strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <Path d="M36 12 L37.5 16 L42 16 L38.5 19 L39.5 23 L36 20.5 L32.5 23 L33.5 19 L30 16 L34.5 16 Z" fill={theme.accent} fillOpacity="0.4" />
    </Svg>);

};

// ─── Floating Sparkle ──────────────────────────────────────────────
const FloatingElement = ({ delay, top, left, size, color, opacity

}: {delay: number;top: number;left: number;size: number;color: string;opacity: number;}) => {
  const translateY = useSharedValue(0);
  useEffect(() => {
    translateY.value = withDelay(delay, withRepeat(
      withSequence(
        withTiming(14, { duration: 4500, easing: Easing.inOut(Easing.ease) }),
        withTiming(-14, { duration: 4500, easing: Easing.inOut(Easing.ease) })
      ), -1, true
    ));
  }, []);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  return (
    <Animated.View style={[{ position: 'absolute', top, left }, animatedStyle]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d="M12 0C12 6.627 17.373 12 24 12C17.373 12 12 17.373 12 24C12 17.373 6.627 12 0 12C6.627 12 12 6.627 12 0Z"
          fill={color} fillOpacity={opacity} />

      </Svg>
    </Animated.View>);

};

// ─── Progress Helpers ──────────────────────────────────────────────
const timeToMinutes = (timeStr: string): number => {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

const timeLabel = (timeStr: string): string =>
  format(new Date(`2000-01-01T${timeStr}`), 'h:mm a');

const shortPeriodLabel = (name: string | null | undefined, fallback: number): string => {
  const number = String(name || '').match(/\d+/)?.[0];
  return number ? `P${number}` : `P${fallback}`;
};

// A period counts as a break if it's flagged is_break or named like one.
const isBreakPeriod = (p: Period): boolean =>
  p.is_break === true || /break|lunch|recess|interval/i.test(p.name || '');

const getPeriodStatus = (startStr: string, endStr: string, now: Date): 'upcoming' | 'active' | 'completed' => {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = timeToMinutes(startStr);
  const endMin = timeToMinutes(endStr);
  if (nowMin < startMin) return 'upcoming';
  if (nowMin > endMin) return 'completed';
  return 'active';
};

const getPeriodProgress = (startStr: string, endStr: string, now: Date): number => {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = timeToMinutes(startStr);
  const endMin = timeToMinutes(endStr);
  if (nowMin <= startMin) return 0;
  if (nowMin >= endMin) return 1;
  return (nowMin - startMin) / (endMin - startMin);
};

// ─── Animated Progress Bar ─────────────────────────────────────────
const AnimatedProgressBar = ({ progress, accent }: {progress: number;accent: string;}) => {
  const animWidth = useSharedValue(0);
  useEffect(() => {
    animWidth.value = withTiming(progress, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [progress]);

  const barStyle = useAnimatedStyle(() => ({ width: `${animWidth.value * 100}%` }));

  return (
    <View style={styles.progressBarContainer}>
      <View style={styles.progressBarTrack}>
        <Animated.View style={[styles.progressBarFill, { backgroundColor: accent }, barStyle]}>
          <LinearGradient
            colors={[accent + 'EE', accent + '88']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill} />

        </Animated.View>
      </View>
      <Text style={[styles.progressText, { color: accent }]}>{Math.round(progress * 100)}%</Text>
    </View>);

};

// ─── Live Time Indicator ───────────────────────────────────────────
const LiveTimeIndicator = ({ isDark: _isDark }: {isDark: boolean;}) => {
  const { theme } = useTheme();
  const pulse = useSharedValue(0.5);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.5, { duration: 900, easing: Easing.inOut(Easing.ease) })
      ), -1, true
    );
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View style={[styles.liveIndicator, pulseStyle]}>
      <View style={[styles.liveIndicatorDiamond, { backgroundColor: theme.colors.primary }]} />
      <View style={[styles.liveIndicatorLine, { backgroundColor: theme.colors.primary }]} />
    </Animated.View>);

};

// ─── Slot Item Component ───────────────────────────────────────────
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SlotItem = ({ item, index, currentTime, isDark, totalSlots, onOpenAttendance, isUpNext

}: {
  item: TimetableSlot;
  index: number;
  currentTime: Date;
  isDark: boolean;
  totalSlots: number;
  onOpenAttendance?: () => void;
  isUpNext?: boolean;
}) => {
  const { theme } = useTheme();
  const router = useRouter();
  const status = getPeriodStatus(item.start_time, item.end_time, currentTime);
  const isActive = status === 'active';
  const isCompleted = status === 'completed';
  const subjectTheme = getSubjectTheme(item.subject_name || '');
  const progress = isActive ? getPeriodProgress(item.start_time, item.end_time, currentTime) : 0;

  const scale = useSharedValue(1);
  const handlePressIn = () => {scale.value = withSpring(0.975, { damping: 18, stiffness: 220 });};
  const handlePressOut = () => {scale.value = withSpring(1, { damping: 18, stiffness: 220 });};
  const animatedPressableStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const pulseOpacity = useSharedValue(0.2);
  useEffect(() => {
    if (isActive) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.75, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.2, { duration: 1100, easing: Easing.inOut(Easing.ease) })
        ), -1, true
      );
    }
  }, [isActive]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 90).duration(320).easing(Easing.out(Easing.cubic))}
      style={styles.timelineRow}>

      {/* ── Left: Time Column ── */}
      <View style={styles.timeColumn}>
        <Text style={[
        styles.startTime,
        { color: isActive ? subjectTheme.accent : theme.colors.textSecondary },
        isActive && styles.activeStartTime]
        }>
          {item.start_time.substring(0, 5)}
        </Text>
        <Text style={[styles.endTime, { color: isDark ? '#3E4A5C' : '#A8B4C4' }]}>
          {item.end_time.substring(0, 5)}
        </Text>
      </View>

      {/* ── Center: Timeline ── */}
      <View style={styles.timelineCenter}>
        {index > 0 &&
        <View style={styles.timelineLineSegment}>
            <View style={[styles.timelineLineBg, { backgroundColor: isDark ? '#18202E' : '#E8EEF6' }]} />
            {(isCompleted || isActive) &&
          <View style={[styles.timelineLineFilled, {
            backgroundColor: isCompleted ?
            isDark ? '#2C3A50' : '#C8D6E5' :
            subjectTheme.accent
          }]} />
          }
          </View>
        }
        {index === 0 && <View style={{ height: 22 }} />}

        <View style={styles.dotContainer}>
          {isActive &&
          <Animated.View style={[styles.dotPulse, { backgroundColor: subjectTheme.accent }, pulseStyle]} />
          }
          {isActive &&
          <View style={[styles.dotRing, { borderColor: subjectTheme.accent + '40' }]} />
          }
          <View style={[
          styles.timelineDot,
          {
            backgroundColor: isActive ?
            subjectTheme.accent :
            isCompleted ?
            isDark ? '#2C3A50' : '#C8D6E5' :
            isDark ? '#141B2A' : '#F4F7FC',
            borderColor: isActive ?
            subjectTheme.accent :
            isCompleted ?
            isDark ? '#3E4F66' : '#DAEAF8' :
            isDark ? '#252F42' : '#DDE5F0',
            shadowColor: isActive ? subjectTheme.accent : 'transparent',
            shadowOpacity: isActive ? 0.5 : 0,
            shadowRadius: isActive ? 8 : 0,
            shadowOffset: { width: 0, height: 0 },
            elevation: isActive ? 6 : 0
          }]
          }>
            {isCompleted && <Ionicons name="checkmark" size={8} color={isDark ? '#7A90AA' : '#fff'} />}
            {isActive && <View style={[styles.dotInnerGlow, { backgroundColor: '#fff' }]} />}
          </View>
        </View>

        {isActive && index < totalSlots - 1 && <LiveTimeIndicator isDark={isDark} />}

        {index < totalSlots - 1 && !isActive &&
        <View style={[styles.timelineLineSegment, { flex: 1 }]}>
            <View style={[styles.timelineLineBg, { backgroundColor: isDark ? '#18202E' : '#E8EEF6' }]} />
            {isCompleted && <View style={[styles.timelineLineFilled, { backgroundColor: isDark ? '#2C3A50' : '#C8D6E5' }]} />}
          </View>
        }
        {isActive &&
        <View style={[styles.timelineLineSegment, { flex: 1 }]}>
            <View style={[styles.timelineLineBg, { backgroundColor: isDark ? '#18202E' : '#E8EEF6' }]} />
          </View>
        }
        {index === totalSlots - 1 && <View style={{ flex: 1 }} />}
      </View>

      {/* ── Right: Glass Card ── */}
      <AnimatedPressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.cardWrapper, animatedPressableStyle, isCompleted && { opacity: 0.72 }]}>

        {/* Active glow bloom */}
        {isActive &&
        <View style={[
        styles.cardGlowBloom,
        {
          backgroundColor: subjectTheme.glow,
          shadowColor: subjectTheme.accent
        }]
        } />
        }

        <View
          style={[
          styles.cardBlur,
          {
            backgroundColor: theme.colors.card,
            borderColor: isActive
              ? subjectTheme.accent + '66'
              : theme.colors.border,
            ...(Platform.OS === 'web'
              ? {
                  boxShadow: isActive
                    ? `0 14px 32px ${subjectTheme.glow}`
                    : isDark
                      ? '0 10px 24px rgba(0,0,0,0.28)'
                      : '0 10px 24px rgba(15,23,42,0.06)',
                }
              : {
                  shadowColor: isActive ? subjectTheme.accent : '#0F172A',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: isDark ? 0.28 : isActive ? 0.16 : 0.06,
                  shadowRadius: 16,
                  elevation: isActive ? 5 : 2,
                }),
          }]
          }>

          <View style={[
          styles.cardContent,
          {
            backgroundColor: isDark ?
            isActive ? 'rgba(22,18,60,0.65)' : 'transparent' :
            isActive ? 'rgba(255,255,255,0.76)' : 'transparent'
          }]
          }>
            {/* Accent bar — wider, pill-shaped */}
            <LinearGradient
              colors={[subjectTheme.accent, subjectTheme.accent + (isActive ? 'CC' : '66')]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={[styles.cardAccentBar, { opacity: isActive ? 1 : 0.55 }]} />

            {/* Card header */}
            <View style={styles.cardHeader}>
              <View style={[
              styles.periodBadge,
              {
                backgroundColor: isActive ? subjectTheme.bgStrong : subjectTheme.bg,
                borderColor: isActive ? subjectTheme.accent + '30' : 'transparent',
                borderWidth: 1
              }]
              }>
                <Text style={[styles.periodText, { color: subjectTheme.accent, fontFamily: FONT_FAMILY }]}>
                  {item.period_name || `Period ${item.period_number}`}
                </Text>
              </View>
              {item.is_substitution && (
                <View style={[styles.coverInlineTag, { backgroundColor: theme.colors.alertBg }]}>
                  <Ionicons name="swap-horizontal" size={11} color={theme.colors.primary} />
                  <Text style={[styles.coverInlineTagText, { color: theme.colors.primary }]}>
                    One-day cover
                  </Text>
                </View>
              )}
              {isActive &&
              <Animated.View
                entering={FadeIn.duration(280)}
                style={[styles.activeTag, { backgroundColor: subjectTheme.accent + '18', borderColor: subjectTheme.accent + '30', borderWidth: 1 }]}>

                  <View style={[styles.activeTagDot, { backgroundColor: subjectTheme.accent }]} />
                  <Text style={[styles.activeTagText, { color: subjectTheme.accent, fontFamily: FONT_FAMILY }]}>Live</Text>
                </Animated.View>
              }
              {isUpNext && !isActive &&
              <View style={[styles.activeTag, { backgroundColor: theme.colors.navPill, borderColor: theme.colors.border, borderWidth: 1 }]}>
                  <Text style={[styles.activeTagText, { color: theme.colors.textSecondary, fontFamily: FONT_FAMILY }]}>Up next</Text>
                </View>
              }
            </View>

            {/* Card body */}
            <View style={styles.cardBodyRow}>
              <View style={styles.cardTextContent}>
                <Text style={[styles.subjectName, { color: theme.colors.textStrong, fontFamily: FONT_FAMILY }]}>
                  {item.subject_name}
                </Text>
                <View style={styles.metaRow}>
                  <View style={[styles.classChip, { backgroundColor: subjectTheme.bg }]}>
                    <Ionicons name="people" size={12} color={subjectTheme.accent} />
                    <Text style={[styles.classChipText, { color: isDark ? '#E2E8F0' : subjectTheme.text, fontFamily: FONT_FAMILY }]}>
                      {item.class_name} · {item.section_name}
                    </Text>
                  </View>
                  {item.room_no ? (
                    <View style={[styles.classChip, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F8FAFC' }]}>
                      <Ionicons name="location-outline" size={12} color={theme.colors.textSecondary} />
                      <Text style={[styles.classChipText, { color: isDark ? '#CBD5E1' : '#475569', fontFamily: FONT_FAMILY }]}>
                        {item.room_no}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {item.is_substitution && item.absent_teacher_name ? (
                  <View style={[styles.detailItem, { marginTop: 4 }]}>
                    <Ionicons name="person-outline" size={12} color={theme.colors.primary} />
                    <Text style={[styles.detailText, { color: theme.colors.primary, fontFamily: FONT_FAMILY }]}>
                      Covering for {item.absent_teacher_name}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={[
              styles.avatarWrapper,
              {
                backgroundColor: isActive ? subjectTheme.bg : 'transparent',
                borderColor: isActive ? subjectTheme.accent + '20' : 'transparent',
                borderWidth: 1
              }]
              }>
                <SubjectAvatar size={44} subject={item.subject_name || 'N/A'} />
              </View>
            </View>

            <Pressable
              onPress={() => router.push('/staff/academic-today')}
              style={[styles.openClassButton, { backgroundColor: subjectTheme.accent }]}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.subject_name || 'class'}`}
            >
              <Ionicons name="enter-outline" size={15} color="#FFFFFF" />
              <Text style={styles.openClassText}>Open class</Text>
              <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
            </Pressable>

            {item.attendance_session ? (
              <Pressable
                onPress={onOpenAttendance}
                style={[styles.coverCardAttendanceButton, { backgroundColor: subjectTheme.accent }]}
              >
                <Ionicons name="checkbox-outline" size={15} color="#FFFFFF" />
                <Text style={styles.coverCardAttendanceText}>
                  Mark {item.attendance_session} attendance
                </Text>
                <Ionicons name="arrow-forward" size={13} color="#FFFFFF" />
              </Pressable>
            ) : null}

            {isActive &&
            <Animated.View entering={FadeIn.duration(320)}>
                <AnimatedProgressBar progress={progress} accent={subjectTheme.accent} />
              </Animated.View>
            }
          </View>
        </View>
      </AnimatedPressable>
    </Animated.View>);

};

// ─── Break / Lunch Row ─────────────────────────────────────────────
const BreakRow = ({ period, index, isDark }: {period: Period;index: number;isDark: boolean;}) => {
  const mins = Math.max(0, timeToMinutes(period.end_time) - timeToMinutes(period.start_time));
  const isLunch = mins >= 30 || /lunch/i.test(period.name || '');
  const label = isLunch ? 'LUNCH' : 'BREAK';
  const accent = isDark ? '#F0A85C' : '#D97706';
  const tint = isDark ? 'rgba(217,119,6,0.14)' : 'rgba(217,119,6,0.10)';
  const lineColor = isDark ? '#2A2113' : '#F1E4CE';

  return (
    <Animated.View
      entering={FadeIn.delay(index * 60).duration(320)}
      style={styles.breakRow}>

      {/* ── Left: Time Column ── */}
      <View style={styles.timeColumn}>
        <Text style={[styles.breakStartTime, { color: isDark ? '#6E6250' : '#B08A55' }]}>
          {period.start_time.substring(0, 5)}
        </Text>
      </View>

      {/* ── Center: Timeline node ── */}
      <View style={styles.timelineCenter}>
        <View style={[styles.breakLineSegment, { backgroundColor: lineColor }]} />
        <View style={[styles.breakDot, { backgroundColor: tint, borderColor: accent + '55' }]}>
          <Ionicons name="cafe" size={9} color={accent} />
        </View>
        <View style={[styles.breakLineSegment, { flex: 1, backgroundColor: lineColor }]} />
      </View>

      {/* ── Right: Break pill ── */}
      <View style={styles.breakPillWrapper}>
        <View style={[styles.breakPill, { backgroundColor: tint, borderColor: accent + '2E' }]}>
          <Ionicons name="cafe-outline" size={13} color={accent} />
          <Text style={[styles.breakPillLabel, { color: accent, fontFamily: FONT_FAMILY }]}>
            {label} · {mins}m
          </Text>
        </View>
      </View>
    </Animated.View>);

};

// ─── Premium Stats Capsule ─────────────────────────────────────────
const StatsCapsule = ({ completed, total }: {completed: number;total: number;}) => {
  const { theme, isDark } = useTheme();
  const progress = total > 0 ? completed / total : 0;

  const capsuleScale = useSharedValue(0.90);
  const capsuleOpacity = useSharedValue(0);
  const numberScale = useSharedValue(0.7);

  useEffect(() => {
    capsuleOpacity.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) });
    capsuleScale.value = withSpring(1, { damping: 18, stiffness: 200 });
    numberScale.value = withDelay(120, withSpring(1, { damping: 14, stiffness: 220 }));
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: capsuleOpacity.value,
    transform: [{ scale: capsuleScale.value }]
  }));
  const numStyle = useAnimatedStyle(() => ({
    transform: [{ scale: numberScale.value }]
  }));

  // Small arc ring — 36px diameter
  const R = 14,CX = 18,CY = 18;
  const polarToCartesian = (angle: number) => {
    const rad = (angle - 90) * Math.PI / 180;
    return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
  };
  const describeArc = (endAngle: number) => {
    const s = polarToCartesian(0);
    const e = polarToCartesian(Math.min(endAngle, 359.9));
    const large = endAngle > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${R} ${R} 0 ${large} 1 ${e.x} ${e.y}`;
  };
  const arcEnd = Math.max(0.01, progress) * 360;

  const accent = theme.colors.primary;
  const accentLight = theme.colors.primary;
  const trackColor = isDark ? 'rgba(255,255,255,0.12)' : theme.colors.alertBg;
  const borderColor = theme.colors.border;

  return (
    <Animated.View style={[capsuleStyles.outerWrap, containerStyle, { shadowColor: accent }]}>
      {/* Soft ambient glow */}
      <View style={[capsuleStyles.blurWrap, { borderColor, backgroundColor: theme.colors.card, borderRadius: 22, borderWidth: 1 }]}>

        <View style={[capsuleStyles.inner, {
          backgroundColor: isDark ? 'transparent' : 'transparent'
        }]}>

          {/* ── LEFT: arc ring + done ── */}
          <View style={capsuleStyles.side}>
            {/* Tiny arc ring */}
            <View style={capsuleStyles.miniRingWrap}>
              <Svg width={36} height={36} viewBox="0 0 36 36">
                <Circle cx={CX} cy={CY} r={R} fill="none" stroke={trackColor} strokeWidth={3} />
                {progress > 0 &&
                <Path
                  d={describeArc(arcEnd)}
                  fill="none"
                  stroke={accent}
                  strokeWidth={3}
                  strokeLinecap="round" />

                }
              </Svg>
              {/* Number inside ring */}
              <Animated.View style={[capsuleStyles.ringCenter, numStyle]}>
                <Text style={[capsuleStyles.ringNumber, { color: accentLight, fontFamily: FONT_FAMILY }]}>
                  {completed}
                </Text>
              </Animated.View>
            </View>

            {/* Label */}
            <View style={[capsuleStyles.labelPill, { backgroundColor: accent + '18', borderColor: accent + '30' }]}>
              <View style={[capsuleStyles.labelDot, { backgroundColor: accent }]} />
              <Text style={[capsuleStyles.labelText, { color: accent, fontFamily: FONT_FAMILY }]}>DONE</Text>
            </View>
          </View>

          {/* ── DIVIDER ── */}
          <View style={[capsuleStyles.divider, {
            backgroundColor: theme.colors.border
          }]} />

          {/* ── RIGHT: total ── */}
          <View style={capsuleStyles.side}>
            <Animated.Text style={[capsuleStyles.totalNumber, numStyle, {
              color: theme.colors.textStrong, fontFamily: FONT_FAMILY
            }]}>
              {total}
            </Animated.Text>
            <View style={[capsuleStyles.labelPill, {
              backgroundColor: theme.colors.navPill,
              borderColor: theme.colors.border
            }]}>
              <Text style={[capsuleStyles.labelText, {
                color: theme.colors.textMuted, fontFamily: FONT_FAMILY
              }]}>TOTAL</Text>
            </View>
          </View>

        </View>
      </View>
    </Animated.View>);

};

const capsuleStyles = StyleSheet.create({
  outerWrap: {
    borderRadius: 26,
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7
  },
  ambientGlow: {
    position: 'absolute',
    top: 4, left: 4, right: 4, bottom: -6,
    borderRadius: 26
  },
  blurWrap: {
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth
  },
  topShimmer: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 1,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderRadius: 26
  },
  side: {
    alignItems: 'center',
    gap: 6,
    width: 52
  },
  // Mini ring
  miniRingWrap: {
    width: 36,
    height: 36,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center'
  },
  ringCenter: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center'
  },
  ringNumber: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: -0.5
  },
  // Total number
  totalNumber: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -1.2,
    lineHeight: 28
  },
  // Label pill
  labelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1
  },
  labelDot: {
    width: 4,
    height: 4,
    borderRadius: 2
  },
  labelText: {
    fontSize: 7.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.9
  },
  // Divider
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 40,
    borderRadius: 1
  }
});

// ─── Main Screen ───────────────────────────────────────────────────
const TimeTableScreen = () => {
  const { isDark, theme } = useTheme();
  const router = useRouter();
  const { staffId, isViewingAsAdmin, viewAsName } = useEffectiveStaffId();
  const [loading, setLoading] = useState(true);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [todaySubstitutions, setTodaySubstitutions] = useState<MySubstitution[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(() => {
    const idx = new Date().getDay(); // 0=Sun..6=Sat
    return idx >= 1 && idx <= 6 ? TIMETABLE_DAYS[idx - 1] : 'monday';
  });
  const [viewMode, setViewMode] = useState<'class' | 'exam'>('class');
  const [examSlots, setExamSlots] = useState<ExamScheduleSlot[]>([]);
  const [duties, setDuties] = useState<ExamDuty[]>([]);
  const [examLoading, setExamLoading] = useState(false);
  const [examLoaded, setExamLoaded] = useState(false);
  const [openSyllabusId, setOpenSyllabusId] = useState<string | null>(null);
  const [editSlot, setEditSlot] = useState<ExamScheduleSlot | null>(null);
  const todayDay = useMemo<DayOfWeek>(() => {
    const index = currentTime.getDay();
    return index >= 1 && index <= 6 ? TIMETABLE_DAYS[index - 1] : 'monday';
  }, [currentTime]);

  // Per-day school if the teacher's slots span more than one weekday.
  const isPerDay = useMemo(() => {
    const days = new Set(slots.map((s) => s.day_of_week).filter(Boolean));
    return days.size > 1;
  }, [slots]);

  const coverSlots = useMemo<TimetableSlot[]>(
    () =>
      todaySubstitutions.map((cover) => ({
        id: `substitution-${cover.id}`,
        period_number: cover.period_number,
        period_name: cover.period_name,
        day_of_week: todayDay,
        start_time: cover.start_time,
        end_time: cover.end_time,
        subject_id: cover.subject_id,
        subject_name: cover.subject_name,
        room_no: cover.room_no || undefined,
        class_name: cover.class_name,
        section_name: cover.section_name,
        is_substitution: true,
        substitution_date: cover.substitution_date,
        absent_teacher_name: cover.absent_teacher_name,
        attendance_session: cover.attendance_session,
      })),
    [todayDay, todaySubstitutions]
  );

  const periodNameByOrder = useMemo(
    () => new Map(periods.map((period) => [period.sort_order, period.name])),
    [periods]
  );

  const visibleSlots = useMemo(() => {
    const base = !isPerDay ? slots : slots.filter((s) => (s.day_of_week || 'monday') === selectedDay);
    const covers = !isPerDay || selectedDay === todayDay ? coverSlots : [];
    return [...base, ...covers]
      .map((slot) => ({
        ...slot,
        period_name: slot.period_name || periodNameByOrder.get(slot.period_number) || null,
      }))
      .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
  }, [slots, isPerDay, selectedDay, todayDay, coverSlots, periodNameByOrder]);

  const todayScheduleSlots = useMemo(() => {
    const permanent = !isPerDay
      ? slots
      : slots.filter((slot) => (slot.day_of_week || 'monday') === todayDay);
    return [...permanent, ...coverSlots]
      .map((slot) => ({
        ...slot,
        period_name: slot.period_name || periodNameByOrder.get(slot.period_number) || null,
      }))
      .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
  }, [slots, isPerDay, todayDay, coverSlots, periodNameByOrder]);

  // School bell-schedule breaks (lunch / recess), ordered by start time.
  const breakPeriods = useMemo(
    () =>
      periods
        .filter(isBreakPeriod)
        .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time)),
    [periods]
  );

  // Interleave break rows into the teaching slots wherever a break falls inside
  // the gap between two consecutive periods the teacher has.
  type TimelineItem =
    | { kind: 'slot'; slot: TimetableSlot; slotIndex: number }
    | { kind: 'break'; period: Period };
  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    visibleSlots.forEach((slot, i) => {
      items.push({ kind: 'slot', slot, slotIndex: i });
      const next = visibleSlots[i + 1];
      if (!next) return;
      const gapStart = timeToMinutes(slot.end_time);
      const gapEnd = timeToMinutes(next.start_time);
      breakPeriods.forEach((bp) => {
        const bs = timeToMinutes(bp.start_time);
        if (bs >= gapStart && bs < gapEnd) items.push({ kind: 'break', period: bp });
      });
    });
    return items;
  }, [visibleSlots, breakPeriods]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Published exam schedule for the classes this teacher teaches — lazy.
  const loadExamData = async () => {
    try {
      setExamLoading(true);
      const [schedule, dutyData] = await Promise.all([
        ExamTimetableService.getTeacherSchedule(),
        ExamAllocationService.getMyDuties().catch(() => [] as ExamDuty[]),
      ]);
      setExamSlots(schedule);
      setDuties(dutyData);
      setExamLoaded(true);
    } catch {
      // silent; switching back and forth retries
    } finally {
      setExamLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode !== 'exam' || examLoaded) return;
    void loadExamData();
  }, [viewMode, examLoaded]);

  const examGroups = useMemo(() => groupSlotsByExam(examSlots), [examSlots]);
  const todayIso = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, [currentTime]);

  const loadTimetable = useCallback(async () => {
    try {
      const localToday = new Date();
      const localTodayYmd = `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, '0')}-${String(localToday.getDate()).padStart(2, '0')}`;
      const [data, periodDefs, coverDuties] = await Promise.all([
        TimetableService.getTeacherTimetable(undefined, staffId),
        TimetableService.getPeriods().catch(() => [] as Period[]),
        // apiClient sends the active X-Staff-Portal-Id header while an admin is
        // viewing a teacher's portal, so /substitutions/mine is safely resolved
        // as that teacher too. Always load it; skipping the request here hid the
        // one-day cover from the very timetable used to verify the assignment.
        SubstitutionService.getMine(localTodayYmd).catch(() => [] as MySubstitution[]),
      ]);
      setSlots(data.sort((a, b) => a.period_number - b.period_number));
      setPeriods(periodDefs);
      setTodaySubstitutions(coverDuties);
    } catch (error) {

    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useFocusEffect(
    useCallback(() => {
      void loadTimetable();
    }, [loadTimetable])
  );

  const openSubstitutionAttendance = (slot: TimetableSlot) => {
    if (!slot.attendance_session || !slot.substitution_date) return;
    router.push({
      pathname: '/staff/manage-students',
      params: {
        session: slot.attendance_session,
        date: slot.substitution_date,
      },
    });
  };

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const greetingIcon = (): keyof typeof Ionicons.glyphMap => {
    const hour = currentTime.getHours();
    if (hour < 6) return 'moon-outline';
    if (hour < 12) return 'sunny-outline';
    if (hour < 17) return 'partly-sunny-outline';
    if (hour < 20) return 'cloudy-night-outline';
    return 'moon-outline';
  };

  const totalPeriods = todayScheduleSlots.length;
  const completedPeriods = todayScheduleSlots.filter(
    (slot) => getPeriodStatus(slot.start_time, slot.end_time, currentTime) === 'completed'
  ).length;
  const activePeriod = todayScheduleSlots.find(
    (slot) => getPeriodStatus(slot.start_time, slot.end_time, currentTime) === 'active'
  );
  const upNextId = useMemo(() => {
    if (selectedDay !== todayDay) return null;
    const next = visibleSlots.find(
      (slot) => getPeriodStatus(slot.start_time, slot.end_time, currentTime) === 'upcoming'
    );
    return next?.id ?? null;
  }, [selectedDay, todayDay, visibleSlots, currentTime]);
  const remainingToday = todayScheduleSlots.filter(
    (slot) => getPeriodStatus(slot.start_time, slot.end_time, currentTime) !== 'completed'
  ).length;

  return (
    <TourTarget id="screen.staff-timetable.overview" native><View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FloatingElement delay={0} top={height * 0.18} left={width * 0.78} size={36} color={theme.colors.primaryLight} opacity={0.28} />
      <FloatingElement delay={900} top={height * 0.62} left={width * 0.06} size={28} color={theme.colors.primary} opacity={0.12} />

      <TourTarget id="screen.staff-timetable.workspace" style={{ flex: 1 }}><Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}>

        {/* ── Header ── */}
        <View style={styles.headerContainer}>
          <View style={styles.headerContent}>
            <View style={styles.headerTextCol}>
              <View style={styles.greetingRow}>
                <Ionicons name={greetingIcon()} size={14} color={theme.colors.primary} />
                <Text style={[styles.greeting, { color: theme.colors.primary, fontFamily: FONT_FAMILY }]} numberOfLines={1}>
                  {getGreeting()}
                </Text>
              </View>
              <Text
                style={[styles.dateText, { color: theme.colors.textStrong, fontFamily: FONT_FAMILY }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {format(currentTime, 'EEEE')}
              </Text>
              <Text style={[styles.monthText, { color: theme.colors.textSecondary, fontFamily: FONT_FAMILY }]} numberOfLines={1}>
                {format(currentTime, 'd MMMM')}
              </Text>
            </View>

            <StatsCapsule
              completed={completedPeriods}
              total={totalPeriods} />

          </View>

          {/* Active Period Banner */}
          {activePeriod &&
          <Animated.View entering={FadeInDown.delay(260).duration(320)} style={[
          styles.activeBanner,
          {
            backgroundColor: theme.colors.alertBg,
            borderColor: theme.colors.alertBorder,
            borderWidth: 1
          }]
          }>
              <View style={[styles.activeBannerDot, { backgroundColor: theme.colors.primary }]} />
              <Text style={[styles.activeBannerText, { color: theme.colors.alertText, fontFamily: FONT_FAMILY }]}>
                Now: {activePeriod.subject_name} · {activePeriod.class_name} – {activePeriod.section_name}
              </Text>
            </Animated.View>
          }
        </View>

        {isViewingAsAdmin && <ViewAsBanner name={viewAsName} />}

        {todaySubstitutions.length > 0 && (
          <Animated.View
            entering={FadeInDown.delay(120).duration(360)}
            style={[styles.coverDutyPanel, { backgroundColor: theme.colors.card, borderColor: theme.colors.alertBorder }]}
          >
            <View style={styles.coverDutyHeader}>
              <View style={styles.coverDutyIcon}>
                <Ionicons name="swap-horizontal" size={17} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.coverDutyEyebrow, { color: theme.colors.primary }]}>
                  TODAY&apos;S COVER {todaySubstitutions.length === 1 ? 'DUTY' : 'DUTIES'}
                </Text>
                <Text style={[styles.coverDutyTitle, { color: theme.colors.textStrong }]}>
                  You&apos;re helping another class today
                </Text>
              </View>
              <View style={[styles.coverDutyCount, { backgroundColor: theme.colors.alertBg }]}>
                <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>
                  {todaySubstitutions.length}
                </Text>
              </View>
            </View>
            {todaySubstitutions.map((cover, index) => (
              <View
                key={cover.id}
                style={[
                  styles.coverDutyRow,
                  index > 0 && {
                    borderTopWidth: 1,
                    borderTopColor: theme.colors.border,
                  },
                ]}
              >
                <View style={[styles.coverDutyPeriod, { backgroundColor: theme.colors.alertBg }]}>
                  <Text style={[styles.coverDutyPeriodText, { color: theme.colors.primary }]}>
                    {shortPeriodLabel(cover.period_name, cover.period_number)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.coverDutyClass, { color: theme.colors.textStrong }]}>
                    {cover.class_name}-{cover.section_name} · {cover.subject_name}
                  </Text>
                  <Text style={[styles.coverDutyMeta, { color: theme.colors.textSecondary }]}>
                    {timeLabel(cover.start_time)}–{timeLabel(cover.end_time)} · for {cover.absent_teacher_name}
                  </Text>
                </View>
                {cover.attendance_session ? (
                  <Pressable
                    onPress={() => router.push({
                      pathname: '/staff/manage-students',
                      params: {
                        session: cover.attendance_session!,
                        date: cover.substitution_date,
                      },
                    })}
                    style={styles.coverAttendanceButton}
                  >
                    <Ionicons name="checkbox-outline" size={14} color="#FFFFFF" />
                    <Text style={styles.coverAttendanceText}>Attendance</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
            <Text style={[styles.coverDutyExpiry, { color: theme.colors.textSecondary }]}>
              These duties and class access expire automatically after today.
            </Text>
          </Animated.View>
        )}

        {/* ── Class / Exams toggle ── */}
        <View style={[styles.modeToggle, { backgroundColor: theme.colors.navPill, borderColor: theme.colors.border }]}>
          {(
            [
              ['class', 'My Classes', 'book-outline'],
              ['exam', 'Exams', 'document-text-outline'],
            ] as const
          ).map(([value, label, icon]) => {
            const active = viewMode === value;
            return (
              <Pressable
                key={value}
                onPress={() => setViewMode(value)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={[
                  styles.modeBtn,
                  active && { backgroundColor: theme.colors.primary },
                ]}
              >
                <Ionicons name={icon} size={15} color={active ? '#FFFFFF' : theme.colors.primary} />
                <Text
                  style={[
                    styles.modeBtnText,
                    {
                      color: active ? '#FFFFFF' : theme.colors.primary,
                      fontFamily: FONT_FAMILY,
                    },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {viewMode === 'exam' ? (
          examLoading && !examLoaded ? (
            <View style={styles.center}>
              <LogoLoader size={60} color={theme.colors.primary} />
            </View>
          ) : examGroups.length === 0 && duties.length === 0 ? (
            <Animated.View entering={FadeInDown.duration(380)} style={[styles.emptyCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
              <View style={[styles.emptyIconBadge, { backgroundColor: theme.colors.alertBg }]}>
                <Ionicons name="document-text-outline" size={26} color={theme.colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.colors.textStrong, fontFamily: FONT_FAMILY }]}>
                No exam timetable yet
              </Text>
              <Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary, fontFamily: FONT_FAMILY }]}>
                Published papers and invigilation duties for your classes will show up here.
              </Text>
            </Animated.View>
          ) : (
            <View style={styles.examWrapper}>
              <Text style={[styles.sectionHint, { color: theme.colors.textSecondary, fontFamily: FONT_FAMILY }]}>
                {examSlots.length} {examSlots.length === 1 ? 'paper' : 'papers'}
                {duties.length > 0 ? ` · ${duties.length} ${duties.length === 1 ? 'duty' : 'duties'}` : ''}
              </Text>
              {duties.length > 0 && (
                <Animated.View entering={FadeInDown.duration(400)} style={styles.examGroup}>
                  <View style={styles.examGroupHeader}>
                    <View style={[styles.examTypeChip, { backgroundColor: theme.colors.alertBg }]}>
                      <Ionicons name="shield-checkmark" size={14} color={theme.colors.primary} />
                    </View>
                    <Text style={[styles.examGroupTitle, { color: theme.colors.textStrong, fontFamily: FONT_FAMILY }]}>
                      Invigilation duties
                    </Text>
                    <View style={[styles.countPill, { backgroundColor: theme.colors.alertBg }]}>
                      <Text style={[styles.countPillText, { color: theme.colors.primary }]}>{duties.length}</Text>
                    </View>
                  </View>
                  <View style={styles.examStack}>
                    {duties.map((duty) => {
                      const dutyDate = ymd(duty.exam_date);
                      const isToday = dutyDate === todayIso;
                      const isPastDuty = !!dutyDate && dutyDate < todayIso;
                      const d = dutyDate ? new Date(`${dutyDate}T00:00:00`) : null;
                      const accent = theme.colors.primary;
                      const untimed = duty.session_start === '00:00:00';
                      const dutyTime = untimed
                        ? 'Time TBA'
                        : `${format(new Date(`2000-01-01T${duty.session_start}`), 'h:mm a')}${
                            duty.session_end
                              ? ` – ${format(new Date(`2000-01-01T${duty.session_end}`), 'h:mm a')}`
                              : ''
                          }`;
                      return (
                        <View
                          key={duty.id}
                          style={[
                            styles.examPaper,
                            {
                              backgroundColor: theme.colors.card,
                              borderColor: isToday ? accent : (theme.colors.border),
                            },
                            isPastDuty && { opacity: 0.72 },
                          ]}
                        >
                          <View style={[styles.examAccent, { backgroundColor: accent }]} />
                          <View
                            style={[
                              styles.examDateBox,
                              { backgroundColor: isToday ? accent : theme.colors.navPill },
                            ]}
                          >
                            <Text style={[styles.examDateDay, { color: isToday ? '#FFFFFF' : theme.colors.textSecondary }]}>
                              {d ? format(d, 'EEE').toUpperCase() : '—'}
                            </Text>
                            <Text style={[styles.examDateNum, { color: isToday ? '#FFFFFF' : theme.colors.textStrong }]}>
                              {d ? format(d, 'dd') : ''}
                            </Text>
                            <Text style={[styles.examDateDay, { color: isToday ? 'rgba(255,255,255,0.85)' : theme.colors.textSecondary }]}>
                              {d ? format(d, 'MMM') : ''}
                            </Text>
                          </View>
                          <View style={styles.examBody}>
                            <View style={styles.examTitleRow}>
                              <Text style={[styles.examSubject, { color: theme.colors.textStrong, fontFamily: FONT_FAMILY }]} numberOfLines={2}>
                                {duty.room_name}
                              </Text>
                              {isToday && (
                                <View style={[styles.mySubjectBadge, { backgroundColor: theme.colors.alertBg }]}>
                                  <Text style={[styles.mySubjectText, { color: accent }]}>Today</Text>
                                </View>
                              )}
                            </View>
                            <Text style={[styles.examExamName, { color: theme.colors.primary, fontFamily: FONT_FAMILY }]} numberOfLines={1}>
                              {t_field(duty.exam_name, duty.exam_name_te)}
                            </Text>
                            <View style={styles.examMetaRow}>
                              <Ionicons name="time-outline" size={13} color={theme.colors.textSecondary} />
                              <Text style={[styles.examMeta, { color: theme.colors.textSecondary, fontFamily: FONT_FAMILY }]}>{dutyTime}</Text>
                            </View>
                            <View style={styles.examMetaRow}>
                              <Ionicons name="people-outline" size={13} color={theme.colors.textSecondary} />
                              <Text style={[styles.examMeta, { color: theme.colors.textSecondary, fontFamily: FONT_FAMILY }]} numberOfLines={1}>
                                {duty.seats_count} students{duty.class_names ? ` · ${duty.class_names}` : ''}
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </Animated.View>
              )}
              {examGroups.map((group, gi) => {
                const category = examCategoryFor(group.examType);
                return (
                  <Animated.View
                    key={group.examId}
                    entering={FadeInDown.delay(Math.min(gi, 4) * 80).duration(400)}
                    style={styles.examGroup}
                  >
                    <View style={styles.examGroupHeader}>
                      <View style={[styles.examTypeChip, { backgroundColor: `${category.color}18` }]}>
                        <Ionicons name={category.icon} size={14} color={category.color} />
                      </View>
                      <Text style={[styles.examGroupTitle, { color: theme.colors.textStrong, fontFamily: FONT_FAMILY }]} numberOfLines={1}>
                        {t_field(group.examName, group.examNameTe)}
                      </Text>
                      <View style={[styles.countPill, { backgroundColor: `${category.color}16` }]}>
                        <Text style={[styles.countPillText, { color: category.color }]}>{group.slots.length}</Text>
                      </View>
                    </View>
                    <View style={styles.examStack}>
                      {group.slots.map((slot) => {
                        const slotDate = ymd(slot.exam_date);
                        const isToday = !!slotDate && slotDate === todayIso;
                        const isPastExam = !!slotDate && slotDate < todayIso;
                        const d = slotDate ? new Date(`${slotDate}T00:00:00`) : null;
                        const topics = slot.syllabus || [];
                        const syllabusOpen = openSyllabusId === slot.id;
                        const slotTime = slot.start_time
                          ? `${format(new Date(`2000-01-01T${slot.start_time}`), 'h:mm a')} – ${format(new Date(`2000-01-01T${slot.end_time || slot.start_time}`), 'h:mm a')}`
                          : 'Time TBA';
                        return (
                          <View
                            key={slot.id}
                            style={[
                              styles.examPaper,
                              {
                                backgroundColor: theme.colors.card,
                                borderColor: isToday ? category.color : (theme.colors.border),
                              },
                              isPastExam && { opacity: 0.72 },
                            ]}
                          >
                            <View style={[styles.examAccent, { backgroundColor: category.color }]} />
                            <View
                              style={[
                                styles.examDateBox,
                                { backgroundColor: isToday ? category.color : theme.colors.navPill },
                              ]}
                            >
                              <Text style={[styles.examDateDay, { color: isToday ? '#FFFFFF' : theme.colors.textSecondary }]}>
                                {d ? format(d, 'EEE').toUpperCase() : '—'}
                              </Text>
                              <Text style={[styles.examDateNum, { color: isToday ? '#FFFFFF' : theme.colors.textStrong }]}>
                                {d ? format(d, 'dd') : ''}
                              </Text>
                              <Text style={[styles.examDateDay, { color: isToday ? 'rgba(255,255,255,0.85)' : theme.colors.textSecondary }]}>
                                {d ? format(d, 'MMM') : ''}
                              </Text>
                            </View>
                            <View style={styles.examBody}>
                              <View style={styles.examTitleRow}>
                                <Text style={[styles.examSubject, { color: theme.colors.textStrong, fontFamily: FONT_FAMILY }]} numberOfLines={2}>
                                  {t_field(slot.subject_name, slot.subject_name_te)}
                                </Text>
                                {slot.is_my_subject && (
                                  <View style={[styles.mySubjectBadge, { backgroundColor: `${category.color}18` }]}>
                                    <Text style={[styles.mySubjectText, { color: category.color }]}>Yours</Text>
                                  </View>
                                )}
                              </View>
                              <View style={styles.examMetaRow}>
                                <Ionicons name="time-outline" size={13} color={theme.colors.textSecondary} />
                                <Text style={[styles.examMeta, { color: theme.colors.textSecondary, fontFamily: FONT_FAMILY }]}>{slotTime}</Text>
                              </View>
                              {!!slot.class_name && (
                                <View style={styles.examMetaRow}>
                                  <Ionicons name="school-outline" size={13} color={theme.colors.textSecondary} />
                                  <Text style={[styles.examMeta, { color: theme.colors.textSecondary, fontFamily: FONT_FAMILY }]} numberOfLines={1}>
                                    {slot.class_name}
                                  </Text>
                                </View>
                              )}
                              {(topics.length > 0 || slot.is_my_subject) && (
                                <View style={styles.examActions}>
                                  {topics.length > 0 && (
                                    <Pressable
                                      onPress={() => setOpenSyllabusId(syllabusOpen ? null : slot.id)}
                                      style={[styles.examAction, { backgroundColor: `${category.color}14` }]}
                                      accessibilityRole="button"
                                    >
                                      <Ionicons name={syllabusOpen ? 'chevron-up' : 'list-outline'} size={14} color={category.color} />
                                      <Text style={[styles.examActionText, { color: category.color, fontFamily: FONT_FAMILY }]}>
                                        {topics.length} {topics.length === 1 ? 'topic' : 'topics'}
                                      </Text>
                                    </Pressable>
                                  )}
                                  {slot.is_my_subject && (
                                    <Pressable
                                      onPress={() => setEditSlot(slot)}
                                      style={[styles.examAction, { backgroundColor: theme.colors.navPill, borderColor: theme.colors.border, borderWidth: 1 }]}
                                      accessibilityRole="button"
                                    >
                                      <Ionicons name={topics.length > 0 ? 'create-outline' : 'add'} size={14} color={category.color} />
                                      <Text style={[styles.examActionText, { color: category.color, fontFamily: FONT_FAMILY }]}>
                                        {topics.length > 0 ? 'Edit syllabus' : 'Add syllabus'}
                                      </Text>
                                    </Pressable>
                                  )}
                                </View>
                              )}
                              {syllabusOpen && (
                                <View style={[styles.syllabusPanel, { backgroundColor: theme.colors.navPill }]}>
                                  {topics.map((item, ti) => (
                                    <View key={ti} style={styles.syllabusItemRow}>
                                      <View style={[styles.syllabusBullet, { backgroundColor: category.color }]} />
                                      <Text style={[styles.syllabusTopic, { color: theme.colors.textSecondary, fontFamily: FONT_FAMILY }]}>
                                        {item.topic}
                                      </Text>
                                      {item.marks != null && (
                                        <View style={[styles.marksChip, { backgroundColor: `${category.color}16` }]}>
                                          <Text style={[styles.syllabusMarksBadge, { color: category.color }]}>{item.marks}m</Text>
                                        </View>
                                      )}
                                    </View>
                                  ))}
                                </View>
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </Animated.View>
                );
              })}
            </View>
          )
        ) : (
        <>
        {/* ── Day selector (per-day schools only) ── */}
        {isPerDay && !loading && (
          <View>
            <Animated.ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.dayTabs}
              contentContainerStyle={styles.dayTabsContent}
            >
              {TIMETABLE_DAYS.map((d) => {
                const activeDay = selectedDay === d;
                const isTodayChip = d === todayDay;
                return (
                  <Pressable
                    key={d}
                    onPress={() => setSelectedDay(d)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: activeDay }}
                    style={[
                      styles.dayTab,
                      {
                        backgroundColor: activeDay ? theme.colors.primary : theme.colors.card,
                        borderColor: activeDay ? 'transparent' : theme.colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayTabText,
                        { color: activeDay ? '#FFFFFF' : theme.colors.primary, fontFamily: FONT_FAMILY },
                      ]}
                    >
                      {TIMETABLE_DAY_LABELS[d]}
                    </Text>
                    {isTodayChip && (
                      <View style={[styles.todayDot, { backgroundColor: activeDay ? '#FFFFFF' : theme.colors.primary }]} />
                    )}
                  </Pressable>
                );
              })}
            </Animated.ScrollView>
            <Text style={[styles.sectionHint, { color: theme.colors.textSecondary, fontFamily: FONT_FAMILY, marginTop: -4 }]}>
              {visibleSlots.length} {visibleSlots.length === 1 ? 'class' : 'classes'}
              {selectedDay === todayDay ? ' today' : ` on ${TIMETABLE_DAY_LABELS[selectedDay]}`}
              {selectedDay === todayDay && totalPeriods > 0
                ? remainingToday === 0
                  ? ' · all finished'
                  : ` · ${remainingToday} still ahead`
                : ''}
            </Text>
          </View>
        )}

        {/* ── Content ── */}
        {loading ?
        <View style={styles.center}>
            <LogoLoader size={60} color={theme.colors.primary} />
          </View> :
        visibleSlots.length > 0 ?
        <View style={styles.timelineWrapper}>
            {timelineItems.map((row, index) =>
          row.kind === 'break' ?
          <BreakRow
            key={`break-${row.period.id || index}`}
            period={row.period}
            index={index}
            isDark={isDark} /> :

          <SlotItem
            key={row.slot.id || `slot-${index}`}
            item={row.slot}
            index={row.slotIndex}
            currentTime={currentTime}
            isDark={isDark}
            totalSlots={visibleSlots.length}
            isUpNext={row.slot.id === upNextId}
            onOpenAttendance={
              row.slot.is_substitution && row.slot.attendance_session
                ? () => openSubstitutionAttendance(row.slot)
                : undefined
            } />

          )}
          </View> :

        <Animated.View entering={FadeInDown.duration(380)} style={[styles.emptyCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <View style={[styles.emptyIconBadge, { backgroundColor: theme.colors.alertBg }]}>
              <Ionicons name="calendar-outline" size={26} color={theme.colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.colors.textStrong, fontFamily: FONT_FAMILY }]}>
              No classes this day
            </Text>
            <Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary, fontFamily: FONT_FAMILY }]}>
              Pick another day, or enjoy the free time.
            </Text>
          </Animated.View>
        }
        </>
        )}
      </Animated.ScrollView></TourTarget>

      {editSlot && (
        <SyllabusEditorModal
          slot={editSlot}
          isDark={isDark}
          onClose={() => setEditSlot(null)}
          onSaved={async () => {
            setEditSlot(null);
            await loadExamData();
          }}
        />
      )}
    </View></TourTarget>);

};

// ─── Teacher syllabus editor ───────────────────────────────────────
function SyllabusEditorModal({
  slot,
  isDark: _isDark,
  onClose,
  onSaved,
}: {
  slot: ExamScheduleSlot;
  isDark: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const category = examCategoryFor(slot.exam_type);
  const [rows, setRows] = useState<{ topic: string; marks: string }[]>(
    (slot.syllabus && slot.syllabus.length > 0
      ? slot.syllabus.map((s) => ({ topic: s.topic, marks: s.marks != null ? String(s.marks) : '' }))
      : [{ topic: '', marks: '' }])
  );
  const [busy, setBusy] = useState(false);

  const setField = (i: number, field: 'topic' | 'marks', value: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));

  const total = rows.reduce((n, r) => n + (Number(r.marks) || 0), 0);
  const hasWeightage = rows.some((r) => r.marks.trim() !== '');
  const matches = total === Number(slot.max_marks || 0);

  const { theme } = useTheme();
  const cardBg = theme.colors.card;
  const textStrong = theme.colors.textStrong;
  const textMuted = theme.colors.textSecondary;
  const border = theme.colors.border;

  const save = async () => {
    const bad = rows.find(
      (r) => r.topic.trim() !== '' && r.marks.trim() !== '' && (Number.isNaN(Number(r.marks)) || Number(r.marks) < 0)
    );
    if (bad) {
      alertCompat('Invalid weightage', `Check the marks for "${bad.topic.trim()}".`);
      return;
    }
    const payload: ExamSyllabusItem[] = rows
      .filter((r) => r.topic.trim() !== '')
      .map((r) => ({ topic: r.topic.trim(), marks: r.marks.trim() === '' ? null : Number(r.marks) }));
    try {
      setBusy(true);
      await ExamTimetableService.updateSyllabus(slot.id, payload);
      await onSaved();
    } catch (err: any) {
      alertCompat('Could not save', err?.message || 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const syllabusRows = (
    <>
      {rows.map((row, i) => (
        <View key={i} style={editorStyles.row}>
          <View style={{ flex: 1 }}>
            <AppTextInput
              value={row.topic}
              onChangeText={(v: string) => setField(i, 'topic', v)}
              placeholder={`Topic ${i + 1} — e.g. Chapter ${i + 1}`}
            />
          </View>
          <View style={{ width: 84 }}>
            <AppTextInput
              value={row.marks}
              onChangeText={(v: string) => setField(i, 'marks', v)}
              placeholder="Marks"
              keyboardType="numeric"
            />
          </View>
          <TouchableOpacity
            onPress={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="close-circle" size={18} color={textMuted} />
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity
        style={[editorStyles.addBtn, { borderColor: `${category.color}66` }]}
        activeOpacity={0.7}
        onPress={() => setRows((prev) => [...prev, { topic: '', marks: '' }])}
      >
        <Ionicons name="add" size={15} color={category.color} />
        <Text style={[editorStyles.addBtnText, { color: category.color, fontFamily: FONT_FAMILY }]}>Add topic</Text>
      </TouchableOpacity>
      <Text style={[editorStyles.helper, { color: textMuted, fontFamily: FONT_FAMILY }]}>
        Students and parents see these topics with the exam timetable. Weightage is optional per topic.
      </Text>
    </>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior="padding"
        style={editorStyles.backdrop}
      >
        <View style={[editorStyles.card, { backgroundColor: cardBg }]}>
          <View style={[editorStyles.accentBar, { backgroundColor: category.color }]} />
          <View style={editorStyles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[editorStyles.title, { color: textStrong, fontFamily: FONT_FAMILY }]}>
                {t_field(slot.subject_name, slot.subject_name_te)} · Syllabus
              </Text>
              <Text style={[editorStyles.sub, { color: textMuted, fontFamily: FONT_FAMILY }]}>
                {slot.class_name ? `${slot.class_name} · ` : ''}{t_field(slot.exam_name, slot.exam_name_te)}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={textMuted} />
            </TouchableOpacity>
          </View>

          <View style={editorStyles.tallyRow}>
            <Text style={[editorStyles.label, { color: textMuted, fontFamily: FONT_FAMILY }]}>TOPICS & WEIGHTAGE</Text>
            {hasWeightage && (
              <View
                style={[
                  editorStyles.pill,
                  { backgroundColor: matches ? 'rgba(16,185,129,0.14)' : 'rgba(245,158,11,0.16)' },
                ]}
              >
                <Text style={[editorStyles.pillText, { color: matches ? '#10B981' : '#F59E0B' }]}>
                  {total}/{Number(slot.max_marks || 0)} marks
                </Text>
              </View>
            )}
          </View>

          {Platform.OS === 'web' ? (
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 320 }}>
              {syllabusRows}
            </ScrollView>
          ) : (
            <KeyboardAwareScrollView
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 320 }}
              bottomOffset={88}
              extraKeyboardSpace={12}
            >
              {syllabusRows}
            </KeyboardAwareScrollView>
          )}

          <TouchableOpacity
            style={[editorStyles.saveBtn, { backgroundColor: category.color }, busy && { opacity: 0.5 }]}
            activeOpacity={0.85}
            disabled={busy}
            onPress={save}
          >
            <Text style={[editorStyles.saveBtnText, { fontFamily: FONT_FAMILY }]}>
              {busy ? 'Saving…' : 'Save syllabus'}
            </Text>
          </TouchableOpacity>
          <View style={{ height: Platform.OS === 'ios' ? 16 : 4 }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const editorStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  accentBar: {
    height: 4,
    borderRadius: 999,
    marginBottom: 14,
    width: 42,
  },
  card: {
    borderRadius: 28,
    padding: 22,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 24px 60px rgba(2,6,23,0.35)' } as any)
      : Platform.OS === 'ios'
        ? { shadowColor: '#020617', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.3, shadowRadius: 40 }
        : { elevation: 10 }),
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  sub: { fontSize: 12.5, marginTop: 2 },
  tallyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  label: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.6 },
  pill: { paddingHorizontal: 9, paddingVertical: 3.5, borderRadius: 20 },
  pillText: { fontSize: 11.5, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 11,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    paddingVertical: 9,
    marginTop: 2,
  },
  addBtnText: { fontSize: 14, fontWeight: '700' },
  helper: { fontSize: 12, lineHeight: 17, marginTop: 10 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 14,
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});

export default TimeTableScreen;

// ─── Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  /* Class / Exams toggle */
  modeToggle: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 14,
    borderRadius: 16,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    ...Platform.select({
      web: { boxShadow: '0 8px 20px rgba(15,23,42,0.04)' } as object,
      default: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.04,
        shadowRadius: 12,
        elevation: 1,
      },
    }),
  },
  modeBtn: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
  },
  modeBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  /* Exam schedule */
  examWrapper: {
    paddingHorizontal: 20
  },
  examGroup: {
    marginBottom: 18
  },
  sectionHint: {
    fontSize: 12.5,
    fontWeight: '600',
    marginBottom: 12,
    letterSpacing: -0.1,
  },
  examGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10
  },
  examTypeChip: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  examGroupTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3
  },
  countPill: {
    minWidth: 26,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  examStack: {
    gap: 10,
  },
  examPaper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    padding: 12,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 10px 24px rgba(15,23,42,0.05)' } as object,
      default: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.05,
        shadowRadius: 14,
        elevation: 2,
      },
    }),
  },
  examAccent: {
    position: 'absolute',
    left: 0,
    top: 14,
    bottom: 14,
    width: 3,
    borderRadius: 3,
  },
  examBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  examTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  examExamName: {
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  examMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  examActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  examAction: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  examActionText: {
    fontSize: 12,
    fontWeight: '800',
  },
  examCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden'
  },
  examRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  examDateBox: {
    width: 58,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  examDateDay: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  examDateNum: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginVertical: 1
  },
  examSubject: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 20,
  },
  examMeta: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
  },
  mySubjectBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  mySubjectText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  syllabusPanel: {
    marginTop: 8,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  syllabusWrap: {
    paddingLeft: 72,
    paddingRight: 14,
    paddingBottom: 10,
    marginTop: -2
  },
  syllabusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  syllabusToggle: {
    fontSize: 12,
    fontWeight: '700',
    paddingVertical: 2
  },
  syllabusEditLink: {
    fontSize: 12,
    fontWeight: '800',
    paddingVertical: 2
  },
  syllabusItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3
  },
  syllabusBullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    opacity: 0.6
  },
  syllabusTopic: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '500'
  },
  marksChip: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  syllabusMarksBadge: {
    fontSize: 11,
    fontWeight: '800'
  },
  noiseOverlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none'
  },
  center: {
    marginTop: 110,
    justifyContent: 'center',
    alignItems: 'center'
  },

  // ── Header ──────────────────────────────────────────────────────
  headerContainer: {
    paddingTop: 22,
    paddingBottom: 18,
    paddingHorizontal: 20
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  greeting: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  dateText: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 34,
  },
  monthText: {
    marginTop: 1,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
  },

  // ── Active Banner ────────────────────────────────────────────────
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    gap: 9
  },
  activeBannerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#6B2FA0'
  },
  activeBannerText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
    flex: 1
  },

  // ── Timeline Layout ──────────────────────────────────────────────
  dayTabs: {
    flexGrow: 0,
    marginBottom: 8,
  },
  dayTabsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  dayTab: {
    minHeight: 40,
    minWidth: 52,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  dayTabText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  todayDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  timelineWrapper: {
    paddingHorizontal: 18,
    paddingTop: 4
  },
  timelineRow: {
    flexDirection: 'row',
    minHeight: 124
  },

  // ── Time Column ──────────────────────────────────────────────────
  timeColumn: {
    width: 54,
    alignItems: 'flex-end',
    paddingRight: 12,
    paddingTop: 18
  },
  startTime: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3
  },
  activeStartTime: {
    fontSize: 16,
    fontWeight: '800'
  },
  endTime: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 3,
    letterSpacing: 0.1
  },

  // ── Center Timeline ──────────────────────────────────────────────
  timelineCenter: {
    width: 28,
    alignItems: 'center'
  },
  timelineLineSegment: {
    width: 2,
    height: 22,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 1
  },
  timelineLineBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 1
  },
  timelineLineFilled: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 1
  },
  dotContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative'
  },
  timelineDot: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2
  },
  dotInnerGlow: {
    width: 5,
    height: 5,
    borderRadius: 3
  },
  dotPulse: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    zIndex: 1
  },
  dotRing: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    zIndex: 1
  },

  // ── Live Indicator ───────────────────────────────────────────────
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 16,
    zIndex: 10
  },
  liveIndicatorDiamond: {
    width: 7,
    height: 7,
    borderRadius: 1.5,
    transform: [{ rotate: '45deg' }]
  },
  liveIndicatorLine: {
    width: 10,
    height: 1.5,
    marginLeft: -1,
    borderRadius: 1
  },

  // ── Break / Lunch Row ────────────────────────────────────────────
  breakRow: {
    flexDirection: 'row',
    minHeight: 52
  },
  breakStartTime: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.2,
    paddingTop: 20
  },
  breakLineSegment: {
    width: 2,
    height: 18,
    borderRadius: 1
  },
  breakDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 1,
    zIndex: 2
  },
  breakPillWrapper: {
    flex: 1,
    paddingLeft: 10,
    paddingBottom: 10,
    justifyContent: 'center'
  },
  breakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 14
  },
  breakPillLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },

  // ── Cards ────────────────────────────────────────────────────────
  cardWrapper: {
    flex: 1,
    paddingLeft: 10,
    paddingBottom: 14,
    position: 'relative'
  },
  cardGlowBloom: {
    position: 'absolute',
    top: 6,
    left: 16,
    right: 0,
    bottom: 14,
    borderRadius: 24,
    shadowOpacity: 0.30,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 0,
    zIndex: 0
  },
  cardBlur: {
    flex: 1,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    zIndex: 1
  },
  cardTopShimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    borderRadius: 1,
    zIndex: 2,
    pointerEvents: 'none'
  },
  cardContent: {
    flex: 1,
    padding: 16,
    paddingLeft: 20,
    borderRadius: 22
  },
  cardAccentBar: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 4,
    borderRadius: 4
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  periodBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10
  },
  periodText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  coverInlineTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9,
    gap: 4,
    marginLeft: 'auto',
    marginRight: 6
  },
  coverInlineTagText: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.45
  },
  activeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9,
    gap: 5
  },
  activeTagDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5
  },
  activeTagText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7
  },
  cardBodyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  cardTextContent: {
    flex: 1,
    paddingRight: 10
  },
  subjectName: {
    fontSize: 21,
    fontWeight: '800',
    marginBottom: 6,
    letterSpacing: -0.5
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  classChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  classChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  openClassButton: {
    marginTop: 12,
    minHeight: 36,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  openClassText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12.5,
    letterSpacing: -0.1,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  detailText: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0
  },
  coverCardAttendanceButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 34,
    marginTop: 12,
    paddingHorizontal: 11,
    borderRadius: 11
  },
  coverCardAttendanceText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'capitalize'
  },
  avatarWrapper: {
    borderRadius: 14,
    padding: 4
  },

  // ── Progress Bar ─────────────────────────────────────────────────
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 13,
    gap: 9
  },
  progressBarTrack: {
    flex: 1,
    height: 5,
    backgroundColor: 'rgba(0,0,0,0.07)',
    borderRadius: 3,
    overflow: 'hidden'
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
    overflow: 'hidden'
  },
  progressText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.2,
    minWidth: 34,
    textAlign: 'right'
  },

  // ── Empty State ──────────────────────────────────────────────────
  emptyCard: {
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 28,
    gap: 6,
  },
  emptyIconBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 90,
    gap: 8
  },
  emptyIconContainer: {
    marginBottom: 16,
    opacity: 0.6
  },
  emptyTitle: {
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.4
  },
  emptySubtitle: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.1
  },

  // ── One-day substitution duty ───────────────────────────────────
  coverDutyPanel: {
    marginHorizontal: 18,
    marginBottom: 16,
    padding: 16,
    borderRadius: 20,
    backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.92)' : '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.18)',
    shadowColor: '#6B2FA0',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3
  },
  coverDutyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 9
  },
  coverDutyIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6B2FA0',
  },
  coverDutyEyebrow: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1
  },
  coverDutyTitle: {
    fontSize: 14,
    fontWeight: '900',
    marginTop: 2
  },
  coverDutyCount: {
    minWidth: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center'
  },
  coverDutyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11
  },
  coverDutyPeriod: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  coverDutyPeriodText: {
    fontSize: 11,
    fontWeight: '900'
  },
  coverDutyClass: {
    fontSize: 12,
    fontWeight: '900'
  },
  coverDutyMeta: {
    fontSize: 9,
    marginTop: 3
  },
  coverAttendanceButton: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#6B2FA0'
  },
  coverAttendanceText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900'
  },
  coverDutyExpiry: {
    fontSize: 9,
    textAlign: 'center',
    marginTop: 3
  }
});
