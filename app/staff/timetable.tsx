import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform, Pressable } from 'react-native';
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
  FadeInDown, FadeIn, useAnimatedScrollHandler, useSharedValue,
  useAnimatedStyle, interpolate, Extrapolation, withRepeat, withSequence,
  withTiming, withDelay, withSpring, Easing } from
'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../src/hooks/useTheme';
import { format } from 'date-fns';
import { Svg, Path, Circle, Rect, Line, Ellipse } from 'react-native-svg';
import LogoLoader from '../../src/components/LogoLoader';
import ViewAsBanner from '../../src/components/ViewAsBanner';
import { useEffectiveStaffId } from '../../src/hooks/useEffectiveStaffId';

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

// ─── Dynamic Gradient By Time of Day ───────────────────────────────
const getTimeGradient = (hour: number, isDark: boolean): string[] => {
  if (isDark) return ['#070512', '#110D2A', '#0A0818'];
  if (hour < 6) return ['#0A0F1E', '#141B3A', '#1E1050'];
  if (hour < 10) return ['#FEF9F0', '#FEF0DC', '#FAF5FF'];
  if (hour < 14) return ['#EEF9FF', '#E6F4F9', '#F0F7FF'];
  if (hour < 17) return ['#FFFBEE', '#FFF5D6', '#F7EEFF'];
  if (hour < 20) return ['#F2EFFF', '#EBE5FF', '#FCF0FF'];
  return ['#0C0920', '#150E35', '#0A0818'];
};

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
  return { bg: 'rgba(79,70,229,0.10)', bgStrong: 'rgba(79,70,229,0.18)', text: '#3730A3', accent: '#4F46E5', glow: 'rgba(79,70,229,0.25)', label: 'Hindi' };
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
const LiveTimeIndicator = ({ isDark }: {isDark: boolean;}) => {
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
      <View style={[styles.liveIndicatorDiamond, { backgroundColor: isDark ? '#818CF8' : '#4F46E5' }]} />
      <View style={[styles.liveIndicatorLine, { backgroundColor: isDark ? '#818CF8' : '#4F46E5' }]} />
    </Animated.View>);

};

// ─── Slot Item Component ───────────────────────────────────────────
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SlotItem = ({ item, index, currentTime, isDark, totalSlots

}: {item: TimetableSlot;index: number;currentTime: Date;isDark: boolean;totalSlots: number;}) => {
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
        { color: isActive ? subjectTheme.accent : isDark ? '#8892A4' : '#64748B' },
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
        style={[styles.cardWrapper, animatedPressableStyle, isCompleted && { opacity: 0.5 }]}>

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
          clayCard(isDark, isActive ? 'lg' : 'md'),
          {
            borderColor: isActive ?
            subjectTheme.accent + '28' :
            isDark ?
            'rgba(255,255,255,0.06)' :
            'rgba(255,255,255,0.65)'
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
                  Period {item.period_number}
                </Text>
              </View>
              {isActive &&
              <Animated.View
                entering={FadeIn.duration(280)}
                style={[styles.activeTag, { backgroundColor: subjectTheme.accent + '18', borderColor: subjectTheme.accent + '30', borderWidth: 1 }]}>

                  <View style={[styles.activeTagDot, { backgroundColor: subjectTheme.accent }]} />
                  <Text style={[styles.activeTagText, { color: subjectTheme.accent, fontFamily: FONT_FAMILY }]}>Live</Text>
                </Animated.View>
              }
            </View>

            {/* Card body */}
            <View style={styles.cardBodyRow}>
              <View style={styles.cardTextContent}>
                <Text style={[styles.subjectName, { color: isDark ? '#EEF2FF' : '#08101E', fontFamily: FONT_FAMILY }]}>
                  {item.subject_name}
                </Text>
                <View style={styles.detailItem}>
                  <Ionicons name="people-outline" size={12} color={isDark ? '#556070' : '#9DAFC4'} />
                  <Text style={[styles.detailText, { color: isDark ? '#556070' : '#9DAFC4', fontFamily: FONT_FAMILY }]}>
                    {item.class_name} · {item.section_name}
                  </Text>
                </View>
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
const StatsCapsule = ({ completed, total, isDark }: {completed: number;total: number;isDark: boolean;}) => {
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

  const accent = isDark ? '#818CF8' : '#4F46E5';
  const accentLight = isDark ? '#A5B4FC' : '#6366F1';
  const trackColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(99,102,241,0.12)';
  const borderColor = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(200,210,245,0.60)';

  return (
    <Animated.View style={[capsuleStyles.outerWrap, containerStyle, { shadowColor: accent }]}>
      {/* Soft ambient glow */}
      <View style={[capsuleStyles.ambientGlow, { backgroundColor: accent + (isDark ? '28' : '18') }]} />

      <View style={[capsuleStyles.blurWrap, clayCard(isDark, 'sm'), { borderColor }]}>

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
            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(99,102,241,0.12)'
          }]} />

          {/* ── RIGHT: total ── */}
          <View style={capsuleStyles.side}>
            <Animated.Text style={[capsuleStyles.totalNumber, numStyle, {
              color: isDark ? '#CBD5E1' : '#1E293B', fontFamily: FONT_FAMILY
            }]}>
              {total}
            </Animated.Text>
            <View style={[capsuleStyles.labelPill, {
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
            }]}>
              <Text style={[capsuleStyles.labelText, {
                color: isDark ? '#475569' : '#94A3B8', fontFamily: FONT_FAMILY
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
    borderRadius: 26
  },
  side: {
    alignItems: 'center',
    gap: 7,
    width: 60
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
  const { isDark } = useTheme();
  const { staffId, isViewingAsAdmin, viewAsName } = useEffectiveStaffId();
  const [loading, setLoading] = useState(true);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(() => {
    const idx = new Date().getDay(); // 0=Sun..6=Sat
    return idx >= 1 && idx <= 6 ? TIMETABLE_DAYS[idx - 1] : 'monday';
  });

  // Per-day school if the teacher's slots span more than one weekday.
  const isPerDay = useMemo(() => {
    const days = new Set(slots.map((s) => s.day_of_week).filter(Boolean));
    return days.size > 1;
  }, [slots]);

  const visibleSlots = useMemo(() => {
    const base = !isPerDay ? slots : slots.filter((s) => (s.day_of_week || 'monday') === selectedDay);
    return [...base].sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));
  }, [slots, isPerDay, selectedDay]);

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

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {scrollY.value = event.contentOffset.y;}
  });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {loadTimetable();}, [staffId]);

  const loadTimetable = async () => {
    try {
      const [data, periodDefs] = await Promise.all([
        TimetableService.getTeacherTimetable(undefined, staffId),
        TimetableService.getPeriods().catch(() => [] as Period[]),
      ]);
      setSlots(data.sort((a, b) => a.period_number - b.period_number));
      setPeriods(periodDefs);
    } catch (error) {

    } finally {
      setLoading(false);
    }
  };

  const headerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(scrollY.value, [0, 100], [0, -30], Extrapolation.CLAMP) }],
    opacity: interpolate(scrollY.value, [0, 100], [1, 0.82], Extrapolation.CLAMP)
  }));

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const getGreetingEmoji = () => {
    const hour = currentTime.getHours();
    if (hour < 6) return '🌙';
    if (hour < 12) return '☀️';
    if (hour < 17) return '🌤️';
    if (hour < 20) return '🌅';
    return '🌙';
  };

  const gradientColors = useMemo(
    () => getTimeGradient(currentTime.getHours(), isDark),
    [currentTime.getHours(), isDark]
  );

  const totalPeriods = slots.length;
  const completedPeriods = slots.filter((s) => getPeriodStatus(s.start_time, s.end_time, currentTime) === 'completed').length;
  const activePeriod = slots.find((s) => getPeriodStatus(s.start_time, s.end_time, currentTime) === 'active');

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#0B1020' : '#EFF2F9' }]}>
      {/* Background Sparkles */}
      <FloatingElement delay={0} top={height * 0.11} left={width * 0.76} size={42} color={isDark ? '#6366F1' : '#BFCFFE'} opacity={0.30} />
      <FloatingElement delay={900} top={height * 0.54} left={width * 0.07} size={52} color={isDark ? '#A855F7' : '#DDD6FE'} opacity={0.20} />

      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}>

        {/* ── Header ── */}
        <Animated.View style={[styles.headerContainer, headerAnimatedStyle]}>
          <View style={styles.headerContent}>
            <View>
              <Text style={[styles.greeting, { color: isDark ? '#8892A4' : '#7080A0', fontFamily: FONT_FAMILY }]}>
                {getGreeting()} {getGreetingEmoji()}
              </Text>
              <Text style={[styles.dateText, { color: isDark ? '#EEF2FF' : '#06101E', fontFamily: FONT_FAMILY }]}>
                {format(currentTime, 'EEEE, dd MMM')}
              </Text>
            </View>

            {/* Stats Capsule */}
            <StatsCapsule
              completed={completedPeriods}
              total={totalPeriods}
              isDark={isDark} />

          </View>

          {/* Active Period Banner */}
          {activePeriod &&
          <Animated.View entering={FadeInDown.delay(260).duration(320)} style={[
          styles.activeBanner,
          {
            backgroundColor: isDark ? 'rgba(67,56,202,0.14)' : 'rgba(67,56,202,0.07)',
            borderColor: isDark ? 'rgba(99,102,241,0.20)' : 'rgba(99,102,241,0.16)',
            borderWidth: 1
          }]
          }>
              <View style={styles.activeBannerDot} />
              <Text style={[styles.activeBannerText, { color: isDark ? '#A5B4FC' : '#4338CA', fontFamily: FONT_FAMILY }]}>
                Now: {activePeriod.subject_name} · {activePeriod.class_name} – {activePeriod.section_name}
              </Text>
            </Animated.View>
          }
        </Animated.View>

        {isViewingAsAdmin && <ViewAsBanner name={viewAsName} />}

        {/* ── Day selector (per-day schools only) ── */}
        {isPerDay && !loading && (
          <Animated.ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.dayTabs}
            contentContainerStyle={{ paddingHorizontal: 12 }}
          >
            {TIMETABLE_DAYS.map((d) => {
              const activeDay = selectedDay === d;
              return (
                <Text
                  key={d}
                  onPress={() => setSelectedDay(d)}
                  style={[
                    styles.dayTab,
                    {
                      backgroundColor: activeDay ? (isDark ? '#818CF8' : '#4338CA') : (isDark ? '#1F2937' : '#EEF2FF'),
                      color: activeDay ? '#FFFFFF' : (isDark ? '#818CF8' : '#4338CA'),
                    },
                  ]}
                >
                  {TIMETABLE_DAY_LABELS[d]}
                </Text>
              );
            })}
          </Animated.ScrollView>
        )}

        {/* ── Content ── */}
        {loading ?
        <View style={styles.center}>
            <LogoLoader size={60} color={isDark ? '#818CF8' : '#4338CA'} />
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
            totalSlots={visibleSlots.length} />

          )}
          </View> :

        <Animated.View entering={FadeInDown.duration(380)} style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="calendar-outline" size={60} color={isDark ? '#2C3A50' : '#CDD7E6'} />
            </View>
            <Text style={[styles.emptyTitle, { color: isDark ? '#E0E8F8' : '#0D1726', fontFamily: FONT_FAMILY }]}>
              No classes today
            </Text>
            <Text style={[styles.emptySubtitle, { color: isDark ? '#4E5A6E' : '#9DAFC4', fontFamily: FONT_FAMILY }]}>
              Enjoy your free time ✨
            </Text>
          </Animated.View>
        }
      </Animated.ScrollView>
    </View>);

};

export default TimeTableScreen;

// ─── Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1
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
    paddingTop: Platform.OS === 'ios' ? 68 : 50,
    paddingBottom: 28,
    paddingHorizontal: 22
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  greeting: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginBottom: 5
  },
  dateText: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.8
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
    backgroundColor: '#4F46E5'
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
    marginBottom: 14,
  },
  dayTab: {
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9,
    marginHorizontal: 4,
    overflow: 'hidden',
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
  }
});