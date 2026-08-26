/**
 * HomeScreen.tsx — Premium v7.3
 * ─────────────────────────────────────────────────────────
 * v7.3 changes:
 * • FeatureCard: purpose-built claymorphic story images
 * • Image-first cards replace generic icon/emoji badges
 * • Localized meaning line makes every destination unambiguous
 * ─────────────────────────────────────────────────────────
 * Design philosophy (rural-UX aware):
 * ✦ COLOR = RECOGNITION — full-color tiles for low-literacy / quick-glance scanning
 * ✦ Premium comes from EXECUTION:
 *   • 3-stop jewel-tone gradients
 *   • Top-left radial light highlight
 *   • Narrative clay doodles with consistent materials and visual weight
 *   • Colored shadow tight + dark ambient layered
 * Illustrations: project-owned, generated specifically for each student action.
 */

import * as Haptics from '@/src/utils/haptics';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  Image,
  type ImageSourcePropType,
} from 'react-native';
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AdminHeaderCard from '../../src/components/AdminHeaderCard';
import DashboardHero from '../../src/components/DashboardHero';
import LogoLoader from '../../src/components/LogoLoader';
import ScreenLayout from '../../src/components/ScreenLayout';
import StudentHeader from '../../src/components/StudentHeader';
import { SCHOOL_CONFIG } from '../../src/constants/schoolConfig';
import { useAuth } from '../../src/hooks/useAuth';
import { useFeatures } from '../../src/hooks/useFeatures';
import type { FeatureKey } from '../../src/config/featureFlags';
import { useStudentQuery } from '../../src/hooks/useStudentQuery';
import { useTheme } from '../../src/hooks/useTheme';
import { patchAccountMetadata } from '../../src/services/accountVault';
import { StudentDashboardResponse } from '../../src/services/studentService';
import { isStudentRole } from '../../src/utils/roleHelpers';
import { AttendanceSummary } from '../../src/types/models';
import { currentSession, localAttendanceDate } from '../../src/services/attendanceService';
import { t_field } from '../../src/utils/lang';
import { getMediaUrl } from '../../src/utils/media';

const H_PAD = 20;
const GAP = 12;
// Premium apps present as a centered column on desktop — never a full-bleed 2000px stretch.
// The hero, body and quick-action grid all size against this cap on wide web.
const CONTENT_MAX_W = 720;
const IS_WEB = Platform.OS === 'web';

/* ═══════════════════════════════════════════
   DESIGN TOKENS
═══════════════════════════════════════════ */
const tokens = {
  radius: { sm: 8, md: 12, lg: 16, xl: 20, '2xl': 24, '3xl': 32 },
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32, 10: 40 },
} as const;

const palette = (theme: any) => ({
  bg: theme.colors.background,
  surface: theme.colors.surface,
  surfaceElevated: theme.colors.card,
  border: theme.colors.borderLight,
  borderStrong: theme.colors.border,
  textPrimary: theme.colors.textStrong,
  textSecondary: theme.colors.textSecondary,
  textTertiary: theme.colors.textMuted,
  accent: theme.colors.primary,
  success: theme.colors.success,
  warning: theme.colors.warning,
  danger: theme.colors.danger,
});

type ReactNativeSvgModule = typeof import('react-native-svg');
const HomeSvgContext = createContext<ReactNativeSvgModule | null>(null);

/* ═══════════════════════════════════════════
   TYPES + DATA — JEWEL-TONE 3-STOP PALETTE
═══════════════════════════════════════════ */
interface HomeTab {
  key: string;
  title: string;
  translationKey?: string;
  subtitleKey: string;
  /** Purpose-built claymorphic scene that explains the destination at a glance. */
  image?: ImageSourcePropType;
  /** Code-native fallback for modules that do not need a bitmap illustration. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** 3-stop gradient: [deep edge, mid base, light top-highlight] */
  grad: [string, string, string];
  /** Single shadow hue — keep tight, don't oversaturate */
  shadow: string;
  /** Feature-flag key gating this quick action (see useFeatures). */
  feature: FeatureKey;
}

const homeTabs: HomeTab[] = [
  {
    key: 'diary',
    translationKey: 'diary', title: 'Diary',
    subtitleKey: 'dashboard.featureSubtitles.daily_diary',
    image: require('../../assets/images/student-actions/diary-clay.png'),
    grad: ['#0C4A6E', '#0284C7', '#7DD3FC'],
    shadow: '#075985',
    feature: 'topbar.diary',
  },
  {
    key: 'messages',
    translationKey: 'announcements.title', title: 'Announcements',
    subtitleKey: 'dashboard.featureSubtitles.school_updates',
    image: require('../../assets/images/student-actions/announcements-clay.png'),
    grad: ['#312E81', '#4338CA', '#818CF8'], // Indigo 900, Indigo 700
    shadow: '#3730A3', // Indigo 800
    feature: 'quick.announcements',
  },
  {
    key: 'complaints',
    translationKey: 'complaints.title', title: 'Complaints',
    subtitleKey: 'dashboard.featureSubtitles.raise_concern',
    image: require('../../assets/images/student-actions/complaints-clay.png'),
    grad: ['#7F1D1D', '#B91C1C', '#F87171'], // Red 900, Red 700
    shadow: '#991B1B', // Red 800
    feature: 'quick.complaints',
  },
  {
    key: 'lifeValues',
    translationKey: 'lifeValues', title: 'Life Values',
    subtitleKey: 'dashboard.featureSubtitles.character_growth',
    image: require('../../assets/images/student-actions/life-values-clay.png'),
    grad: ['#022C22', '#047857', '#6EE7B7'], // Emerald 900, Emerald 700
    shadow: '#064E3B', // Emerald 800
    feature: 'quick.life_values',
  },
  {
    key: 'busmap',
    translationKey: 'admin_dashboard.transport', title: 'Transport',
    subtitleKey: 'dashboard.featureSubtitles.live_bus',
    image: require('../../assets/images/student-actions/transport-clay.png'),
    grad: ['#78350F', '#B45309', '#FCD34D'], // Amber 900, Amber 700
    shadow: '#92400E', // Amber 800
    feature: 'quick.transport',
  },
  {
    key: 'hostel',
    translationKey: 'hostel', title: 'Hostel',
    subtitleKey: 'hostelDetails',
    icon: 'bed-outline',
    grad: ['#312E81', '#4F46E5', '#A5B4FC'],
    shadow: '#4338CA',
    feature: 'quick.hostel',
  },
  {
    key: 'projects',
    translationKey: 'scienceProjects', title: 'Science Projects',
    subtitleKey: 'dashboard.featureSubtitles.lab_innovation',
    image: require('../../assets/images/student-actions/science-clay.png'),
    grad: ['#082F49', '#0369A1', '#7DD3FC'], // Sky 900, Sky 700
    shadow: '#075985', // Sky 800
    feature: 'quick.science_projects',
  },
  {
    key: 'profile',
    translationKey: 'menu.profile', title: 'Student Profile',
    subtitleKey: 'dashboard.featureSubtitles.personal_details',
    image: require('../../assets/images/student-actions/profile-clay.png'),
    grad: ['#881337', '#BE123C', '#FDA4AF'], // Rose 900, Rose 700
    shadow: '#9F1239', // Rose 800
    feature: 'quick.profile',
  },
  {
    key: 'messenger',
    translationKey: 'messages.title', title: 'Messages',
    subtitleKey: 'dashboard.featureSubtitles.in_app_chat',
    image: require('../../assets/images/student-actions/messages-clay.png'),
    grad: ['#312E81', '#4338CA', '#818CF8'], // Indigo 900, Indigo 700
    shadow: '#3730A3', // Indigo 800
    feature: 'comm.messenger', // Requires comm.messenger feature flag
  },
  {
    key: 'lms',
    translationKey: 'lMS', title: 'LMS',
    subtitleKey: 'dashboard.featureSubtitles.learning_resources',
    image: require('../../assets/images/student-actions/lms-clay.png'),
    grad: ['#064E3B', '#059669', '#6EE7B7'],
    shadow: '#047857',
    feature: 'topbar.lms',
  },
];

const routeMap: Record<string, string> = {
  diary: '/Screen/diary',
  profile: '/Screen/profile',
  complaints: '/Screen/complaints',
  busmap: '/Screen/busTracker',
  hostel: '/Screen/hostel',
  messages: '/Screen/announcements',
  lifeValues: '/Screen/lifeValues',
  projects: '/Screen/scienceProjects',
  test: '/Screen/weekendTest',
  messenger: '/Screen/messages',
  lms: '/Screen/lms',
};

interface ClayViewProps {
  children: React.ReactNode;
  color?: string;
  radius?: number;
  style?: any;
  flat?: boolean;
}

function ClayView({ children, color = '#FFFFFF', radius = 20, style, flat }: ClayViewProps) {
  const { isDark } = useTheme();

  if (Platform.OS === 'ios' && !flat) {
    return (
      <View style={[
        {
          borderRadius: radius,
          shadowColor: isDark ? '#000000' : '#94A3B8',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: isDark ? 0.35 : 0.12,
          shadowRadius: 10,
        },
        style
      ]}>
        <View style={{
          backgroundColor: color,
          borderRadius: radius,
          overflow: 'hidden',
          borderBottomWidth: 1.5,
          borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(76,90,120,0.08)',
          flex: 1,
        }}>
          <LinearGradient
            colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.6, y: 0.9 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {children}
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        {
          backgroundColor: color,
          borderRadius: radius,
          overflow: 'hidden',
          borderBottomWidth: 1.5,
          borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(76,90,120,0.08)',
        },
        !flat && Platform.select({ android: { elevation: 3 }, default: {} }),
        style,
      ]}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 0.9 }}
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

function PressScale({ children, onPress, style, disabled, activeScale = 0.98 }: any) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        scale.value = withSpring(activeScale, { damping: 15, stiffness: 200 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 15, stiffness: 200 });
      }}
      onPress={onPress}
      style={style}
    >
      <Animated.View style={anim}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

/* ═══════════════════════════════════════════
   RING
═══════════════════════════════════════════ */
const Ring = ({ pct, size = 104, sw = 8, color, isDark }: {
  pct: number; size?: number; sw?: number; color: string; isDark: boolean;
}) => {
  const svgMod = useContext(HomeSvgContext);
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const animatedPct = useSharedValue(0);
  useEffect(() => { animatedPct.value = withTiming(pct, { duration: 900 }); }, [pct]);

  if (!svgMod) {
    return <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: sw, borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)' }} />;
  }
  const Svg = svgMod.default;
  const { Circle, Defs, LinearGradient: SvgGrad, Stop } = svgMod;
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Defs>
        <SvgGrad id="rg" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={color} stopOpacity="1" />
          <Stop offset="100%" stopColor="#6366F1" stopOpacity="1" />
        </SvgGrad>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={r}
        stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)'}
        strokeWidth={sw} fill="none" />
      <Circle cx={size / 2} cy={size / 2} r={r}
        stroke="url(#rg)" strokeWidth={sw} fill="none"
        strokeDasharray={circ}
        strokeDashoffset={circ - (pct / 100) * circ}
        strokeLinecap="round" />
    </Svg>
  );
};

/* ═══════════════════════════════════════════
   NOISE TEXTURE — hero only
═══════════════════════════════════════════ */
const Noise = ({ opacity = 0.08 }: { opacity?: number }) => {
  const svgMod = useContext(HomeSvgContext);
  if (!svgMod) return null;
  const Svg = svgMod.default;
  const { Defs, Filter, FeTurbulence, Rect } = svgMod as any;
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Defs>
        <Filter id="n">
          <FeTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        </Filter>
      </Defs>
      <Rect width="100%" height="100%" filter="url(#n)" opacity={opacity} />
    </Svg>
  );
};

/* ═══════════════════════════════════════════
   STATUS PILL
═══════════════════════════════════════════ */
const S_CFG = {
  present: { bg: 'rgba(16,185,129,0.14)', dot: '#10B981', dk: '#34D399', lt: '#059669' },
  absent: { bg: 'rgba(239,68,68,0.14)', dot: '#EF4444', dk: '#F87171', lt: '#DC2626' },
  late: { bg: 'rgba(245,158,11,0.14)', dot: '#F59E0B', dk: '#FBBF24', lt: '#D97706' },
  half_day: { bg: 'rgba(249,115,22,0.14)', dot: '#F97316', dk: '#FB923C', lt: '#EA580C' },
} as const;

const STATUS_I18N: Record<string, keyof typeof S_CFG | 'not_marked'> = {
  present: 'present', absent: 'absent', late: 'late', half_day: 'half_day', not_marked: 'not_marked',
};

const StatusPill = ({ status, isDark }: { status: string; isDark: boolean }) => {
  const { t } = useTranslation();
  const sk = STATUS_I18N[status] ?? 'not_marked';
  const c = sk === 'not_marked'
    ? { bg: isDark ? 'rgba(148,163,184,0.10)' : 'rgba(148,163,184,0.14)', dot: '#94A3B8', dk: '#CBD5E1', lt: '#64748B' }
    : (S_CFG as any)[sk];
  const label = sk === 'not_marked'
    ? t('studentHome.attendanceStatus.not_marked')
    : t(`studentHome.attendanceStatus.${sk}`);
  return (
    <View style={[sp.pill, {
      backgroundColor: c.bg,
      borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.82)',
      shadowColor: isDark ? '#000000' : '#8C82A2',
      shadowOpacity: isDark ? 0.28 : 0.12,
      ...Platform.select({
        web: {
          boxShadow: isDark
            ? '3px 4px 8px rgba(0,0,0,0.24), inset 1px 1px 2px rgba(255,255,255,0.05)'
            : '3px 4px 8px rgba(109,94,139,0.12), -2px -2px 5px rgba(255,255,255,0.72), inset 1px 1px 2px rgba(255,255,255,0.60)',
        },
      }),
    }]}>
      <View style={[sp.dot, { backgroundColor: c.dot }]} />
      <Text style={[sp.lbl, { color: isDark ? c.dk : c.lt }]}>{label}</Text>
    </View>
  );
};
const sp = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 50, gap: 6, alignSelf: 'flex-start', borderWidth: 1,
    shadowOffset: { width: 2, height: 3 }, shadowRadius: 5, elevation: 2,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  lbl: { fontSize: 12, fontWeight: '700', letterSpacing: 0.15 },
});

/* ═══════════════════════════════════════════
   FEATURE CARD — v7.3: IMAGE-DRIVEN CLAY STORY
   • Each card has a purpose-built, meaningful scene
   • Localized title + meaning line reinforce recognition
   • Framed artwork stays legible on light and dark cards
═══════════════════════════════════════════ */
const FeatureCard = ({ tab, isDark, onPress, cardWidth }: {
  tab: HomeTab & { title: string; subtitle: string };
  isDark: boolean;
  onPress: () => void;
  cardWidth: number;
}) => {
  const scale = useSharedValue(1);
  const pressGlow = useSharedValue(0);

  const animCard = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const animGlow = useAnimatedStyle(() => ({ opacity: pressGlow.value }));

  return (
    <Animated.View style={[{ width: cardWidth }, animCard]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tab.title}
        onPressIn={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          scale.value = withTiming(0.97, { duration: 150 });
          pressGlow.value = withTiming(1, { duration: 160 });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: 150 });
          pressGlow.value = withTiming(0, { duration: 240 });
        }}
        onPress={onPress}
      >
        <View style={[fc.shell, {
          backgroundColor: isDark ? tab.grad[0] : tab.grad[1],
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.45)',
          ...Platform.select({
            ios: {
              shadowColor: tab.shadow,
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: isDark ? 0.45 : 0.28,
              shadowRadius: 12,
            },
            android: { elevation: 6 },
            web: {
              boxShadow: `0px 8px 18px ${tab.shadow}33, -5px -5px 12px ${isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.85)'}, inset 2px 2px 4px rgba(255, 255, 255, 0.45), inset -2.5px -2.5px 5px rgba(0, 0, 0, 0.16)`
            }
          }),
        }]}>
          {/* Tactile claymorphic highlight linear gradient matching staff dashboard */}
          <LinearGradient
            colors={isDark ? ['rgba(255, 255, 255, 0.05)', 'rgba(0, 0, 0, 0.15)'] : ['rgba(255, 255, 255, 0.26)', 'rgba(0, 0, 0, 0.06)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: tokens.radius['xl'] }]}
            pointerEvents="none"
          />

          {/* Press state glow */}
          <Animated.View
            pointerEvents="none"
            style={[fc.pressGlow, animGlow]}
          />

          <View style={fc.card}>
            <View style={[fc.artStage, { shadowColor: tab.shadow }]}>
              {tab.image ? (
                <Image
                  source={tab.image}
                  style={fc.artImage}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <View style={fc.artIconFallback}>
                  <Ionicons name={tab.icon || 'apps-outline'} size={42} color="#FFFFFF" />
                </View>
              )}
              <LinearGradient
                colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.55, y: 0.65 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
            </View>

            <View style={fc.copy}>
              <Text style={fc.title} numberOfLines={2}>{tab.title}</Text>
              <Text style={fc.subtitle} numberOfLines={1}>{tab.subtitle}</Text>
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
};

const fc = StyleSheet.create({
  shell: {
    borderRadius: tokens.radius['xl'],
    backgroundColor: 'transparent',
    position: 'relative',
    overflow: Platform.OS === 'web' ? 'hidden' : 'visible',
  },
  card: {
    borderRadius: tokens.radius['xl'],
    padding: 10,
    height: 188,
    overflow: 'hidden',
    gap: 0,
  },
  pressGlow: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: tokens.radius['xl'],
  },

  artStage: {
    width: '100%',
    height: 108,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.58)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 7,
    backgroundColor: '#F8F5EF',
  },
  artImage: {
    width: '100%',
    height: '100%',
  },
  artIconFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
  },
  copy: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 6,
    paddingHorizontal: 2,
    gap: 2,
  },
  title: {
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: -0.2,
    lineHeight: 19,
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 10.5,
    fontWeight: '600',
    lineHeight: 14,
    color: 'rgba(255,255,255,0.76)',
  },
});

/* ═══════════════════════════════════════════
   ANNOUNCEMENT CARD — warm for fresh, muted for stale
═══════════════════════════════════════════ */
const AnnouncementCard = ({
  notice, isFresh, onPress,
}: {
  notice: any; isFresh: boolean; onPress: () => void;
}) => {
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();
  const P = palette(theme);

  const accent = isFresh ? '#F97316' : (isDark ? '#64748B' : '#94A3B8');
  const timeAgo = notice.created_at ? getTimeAgo(new Date(notice.created_at), t) : '';
  const noticeFallback = t('studentHome.noticeFallback');

  const warmBg = isFresh
    ? (isDark ? ['#1F1408', '#0E0A06'] as const : ['#FFF7ED', '#FFEDD5'] as const)
    : (isDark ? ['#0D1117', '#0D1117'] as const : ['#FFFFFF', '#F8FAFC'] as const);

  return (
    <PressScale onPress={onPress}>
      <ClayView
        color={warmBg[0]}
        radius={20}
        style={[an.card, { borderColor: isFresh ? 'rgba(249,115,22,0.30)' : P.border }]}
      >
        {/* Left accent bar */}
        <LinearGradient
          colors={[accent, accent + '55']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={an.leftBar}
        />

        <View style={an.body}>
          {/* Meta row */}
          <View style={an.metaRow}>
            {isFresh ? (
              <View style={[an.livePill, { backgroundColor: 'rgba(249,115,22,0.16)' }]}>
                <View style={[an.liveDot, { backgroundColor: '#F97316' }]} />
                <Text style={an.liveTxt}>{t('studentHome.tagNewAnnouncement').toUpperCase()}</Text>
              </View>
            ) : (
              <View style={[an.stalePill, { backgroundColor: isDark ? 'rgba(148,163,184,0.10)' : 'rgba(148,163,184,0.16)' }]}>
                <Ionicons name="megaphone" size={10} color={P.textTertiary} />
                <Text style={[an.announceTag, { color: P.textTertiary }]}>
                  {t('studentHome.tagAnnouncement').toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={[an.timeAgo, { color: P.textTertiary }]}>{timeAgo}</Text>
          </View>

          {/* Title */}
          <Text style={[an.title, { color: P.textPrimary }]} numberOfLines={1}>
            {t_field(notice.title, notice.title_te) || noticeFallback}
          </Text>

          {/* Body */}
          <Text style={[an.excerpt, { color: P.textSecondary }]} numberOfLines={2}>
            {t_field(notice.content, notice.content_te)}
          </Text>

          {/* Read more */}
          <View style={an.readRow}>
            <Text style={[an.readMore, { color: accent }]}>
              {t('studentHome.readFullAnnouncement')}
            </Text>
            <View style={[an.readArrow, { backgroundColor: accent + (isDark ? '24' : '20') }]}>
              <Ionicons name="arrow-forward" size={12} color={accent} />
            </View>
          </View>
        </View>
      </ClayView>
    </PressScale>
  );
};

const an = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: tokens.radius['xl'],
    borderWidth: 1,
    overflow: 'hidden',
  },
  leftBar: { width: 4 },
  body: { flex: 1, padding: tokens.space[4], gap: tokens.space[2] },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6,
  },
  stalePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3 },
  liveTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: '#F97316' },
  announceTag: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  timeAgo: { fontSize: 11, fontWeight: '600' },
  title: { fontSize: 15.5, fontWeight: '800', letterSpacing: -0.1, lineHeight: 21, marginTop: 2 },
  excerpt: { fontSize: 13, fontWeight: '500', lineHeight: 19 },
  readRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  readMore: { fontSize: 12.5, fontWeight: '800', letterSpacing: 0.1 },
  readArrow: {
    width: 22, height: 22, borderRadius: 11,
    justifyContent: 'center', alignItems: 'center',
  },
});

function getTimeAgo(date: Date, t: any): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (mins < 1) return t('studentHome.justNow') || 'just now';
  if (mins < 60) return `${mins}m`;
  if (hrs < 24) return `${hrs}h`;
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/* ═══════════════════════════════════════════
   SECTION LABEL — with colored dot (scan anchor)
═══════════════════════════════════════════ */
const SectionLabel = ({ text, accent = '#6366F1', badge }: {
  text: string; accent?: string; badge?: string;
}) => {
  const { theme, isDark } = useTheme();
  const P = palette(theme);
  return (
    <View style={sl.row}>
      <View style={sl.leadBlock}>
        <View style={[sl.dot, { backgroundColor: accent }]} />
        <View style={[sl.dotGlow, { backgroundColor: accent, opacity: 0.25 }]} />
      </View>
      <Text style={[sl.text, { color: P.textTertiary }]}>{text}</Text>
      {badge && (
        <View style={[sl.badge, { backgroundColor: accent + (isDark ? '24' : '1A') }]}>
          <Text style={[sl.badgeTxt, { color: accent }]}>{badge}</Text>
        </View>
      )}
    </View>
  );
};
const sl = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: tokens.space[3], paddingHorizontal: 2 },
  leadBlock: { width: 6, height: 6, justifyContent: 'center', alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotGlow: { position: 'absolute', width: 14, height: 14, borderRadius: 7 },
  text: { flex: 1, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
});

/* ═══════════════════════════════════════════
   TEACHER CARD
═══════════════════════════════════════════ */
const TeacherCard = ({ name, role, photoUrl, onContact }: { name: string; role: string; photoUrl?: string; onContact: () => void }) => {
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();
  const P = palette(theme);
  return (
    <ClayView color={P.surfaceElevated} radius={20} style={[tc.card, { borderColor: P.border }]}>
      <LinearGradient
        colors={isDark ? ['#312E81', '#4F46E5', '#6366F1'] : ['#E0E7FF', '#C7D2FE', '#818CF8']}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }}
        style={tc.avatar}
      >
        <View style={tc.avatarHighlight} />
        {photoUrl ? (
          <Image source={{ uri: getMediaUrl(photoUrl) }} style={{ width: '100%', height: '100%' }} />
        ) : (
          <Ionicons name="person" size={22} color={isDark ? '#FFF' : '#4F46E5'} />
        )}
      </LinearGradient>
      <View style={{ flex: 1 }}>
        <Text style={[tc.name, { color: P.textPrimary }]} numberOfLines={1}>{name}</Text>
        <Text style={[tc.role, { color: P.textSecondary }]} numberOfLines={1}>{role}</Text>
      </View>
      <PressScale onPress={onContact}>
        <View style={[tc.contactBtn, { backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.12)' }]}>
          <Ionicons name="mail-outline" size={13} color={isDark ? '#A5B4FC' : '#4F46E5'} />
          <Text style={[tc.contactTxt, { color: isDark ? '#A5B4FC' : '#4F46E5' }]}>{t('studentHome.teacherContact')}</Text>
        </View>
      </PressScale>
    </ClayView>
  );
};
const tc = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: tokens.space[3],
    padding: tokens.space[4], borderRadius: tokens.radius['xl'], borderWidth: 1,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarHighlight: {
    position: 'absolute', top: -14, left: -14,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  name: { fontSize: 15, fontWeight: '800', letterSpacing: -0.1, marginBottom: 2 },
  role: { fontSize: 12, fontWeight: '500' },
  contactBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: tokens.radius.md,
  },
  contactTxt: { fontSize: 12, fontWeight: '700' },
});

/* ═══════════════════════════════════════════
   SNAPSHOT CARD — HERO
═══════════════════════════════════════════ */
const SnapshotCard = ({
  pct, attColor, todayStatus, presentDays, absentDays, totalDays, onPress,
}: {
  pct: number; attColor: string; todayStatus: string;
  presentDays: number; absentDays: number; totalDays: number; onPress: () => void;
}) => {
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();
  const P = palette(theme);
  const svgMod = useContext(HomeSvgContext);
  const cardColors = isDark
    ? ['#25203D', '#171B32', '#111827'] as const
    : ['#FFF7ED', '#F3F0FF', '#E8F2FF'] as const;
  const raisedTile: any = {
    shadowColor: isDark ? '#000000' : '#86789F',
    shadowOffset: { width: 2, height: 4 },
    shadowOpacity: isDark ? 0.28 : 0.13,
    shadowRadius: 6,
    elevation: 3,
    ...Platform.select({
      web: {
        boxShadow: isDark
          ? '3px 5px 10px rgba(0,0,0,0.26), -2px -2px 6px rgba(255,255,255,0.025), inset 1px 1px 2px rgba(255,255,255,0.05)'
          : '3px 5px 10px rgba(109,94,139,0.14), -3px -3px 7px rgba(255,255,255,0.76), inset 1px 1px 2px rgba(255,255,255,0.72)',
      },
    }),
  };

  return (
    <PressScale onPress={onPress}>
      <View style={[sn.cardShell, {
        shadowColor: isDark ? '#000000' : '#7C6AA6',
        borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.94)',
        ...Platform.select({
          web: {
            boxShadow: isDark
              ? '8px 10px 22px rgba(0,0,0,0.38), -5px -5px 14px rgba(255,255,255,0.025), inset 2px 2px 3px rgba(255,255,255,0.08), inset -3px -3px 6px rgba(0,0,0,0.18)'
              : '8px 10px 22px rgba(99,78,145,0.20), -7px -7px 16px rgba(255,255,255,0.98), inset 2px 2px 4px rgba(255,255,255,0.84), inset -3px -3px 6px rgba(121,100,160,0.12)',
          },
        }),
      }]}>
        <LinearGradient
          colors={cardColors}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={sn.card}
        >
          {/* Pastel clay blobs + a hand-drawn flourish make this feel illustrated. */}
          <View style={[sn.blobTop, { backgroundColor: isDark ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.52)' }]} />
          <View style={[sn.blobBottom, { backgroundColor: isDark ? 'rgba(244,114,182,0.10)' : 'rgba(251,113,133,0.10)' }]} />
          {svgMod && (() => {
            const Svg = svgMod.default;
            const { Path } = svgMod;
            return (
              <Svg width="100%" height="100%" style={StyleSheet.absoluteFillObject} pointerEvents="none">
                <Path
                  d="M268 18c17 2 28 11 33 25"
                  fill="none"
                  stroke={isDark ? 'rgba(196,181,253,0.25)' : 'rgba(124,58,237,0.22)'}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray="5 7"
                />
                <Path
                  d="M18 180c12 10 25 13 40 10"
                  fill="none"
                  stroke={isDark ? 'rgba(251,146,60,0.22)' : 'rgba(249,115,22,0.25)'}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </Svg>
            );
          })()}

          {/* Header */}
          <View style={sn.header}>
            <View style={sn.headerLeft}>
              <LinearGradient
                colors={isDark ? ['#A78BFA', '#6D28D9'] : ['#A78BFA', '#7C3AED']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={[sn.calendarClay, {
                  shadowColor: isDark ? '#000000' : '#6D28D9',
                  borderColor: 'rgba(255,255,255,0.68)',
                  ...Platform.select({
                    web: {
                      boxShadow: isDark
                        ? '3px 5px 9px rgba(0,0,0,0.30), inset 1px 1px 2px rgba(255,255,255,0.22)'
                        : '3px 5px 10px rgba(109,40,217,0.24), -2px -2px 6px rgba(255,255,255,0.74), inset 1px 1px 2px rgba(255,255,255,0.38)',
                    },
                  }),
                }]}
              >
                <Ionicons name="calendar" size={16} color="#FFFFFF" />
              </LinearGradient>
              <View>
                <Text style={[sn.headerEyebrow, { color: isDark ? '#C4B5FD' : '#7C3AED' }]}>
                  {t('studentHome.attendanceLink').toUpperCase()}
                </Text>
                <Text style={[sn.headerLbl, { color: P.textPrimary }]}>
                  {t('studentHome.todaysSnapshot')}
                </Text>
              </View>
            </View>
            <View style={[sn.headerRight, {
              backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.58)',
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.92)',
              shadowColor: isDark ? '#000000' : '#897DA1',
              shadowOpacity: isDark ? 0.24 : 0.11,
              ...Platform.select({
                web: {
                  boxShadow: isDark
                    ? '3px 4px 9px rgba(0,0,0,0.24), inset 1px 1px 2px rgba(255,255,255,0.05)'
                    : '3px 4px 9px rgba(109,94,139,0.12), -2px -2px 5px rgba(255,255,255,0.70), inset 1px 1px 2px rgba(255,255,255,0.72)',
                },
              }),
            }]}>
              <Text style={[sn.viewTxt, { color: isDark ? '#C4B5FD' : '#6D28D9' }]}>
                {t('studentHome.attendanceLink')}
              </Text>
              <Ionicons name="arrow-forward" size={12} color={isDark ? '#C4B5FD' : '#6D28D9'} />
            </View>
          </View>

          {/* Main content */}
          <View style={sn.content}>
            <View style={[sn.ringClay, {
              backgroundColor: isDark ? 'rgba(15,23,42,0.72)' : 'rgba(255,255,255,0.72)',
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.96)',
              shadowColor: isDark ? '#000000' : '#8B7AAE',
              ...Platform.select({
                web: {
                  boxShadow: isDark
                    ? '7px 9px 18px rgba(0,0,0,0.32), -4px -4px 11px rgba(255,255,255,0.025), inset 2px 2px 4px rgba(255,255,255,0.05)'
                    : '7px 9px 18px rgba(109,94,139,0.18), -6px -6px 13px rgba(255,255,255,0.88), inset 2px 2px 4px rgba(255,255,255,0.78), inset -2px -2px 4px rgba(124,105,158,0.08)',
                },
              }),
            }]}>
              <Ring pct={pct} size={100} sw={9} color={attColor} isDark={isDark} />
              <View style={[StyleSheet.absoluteFill, sn.ringCopy]}>
                <Text style={[sn.ringPct, { color: attColor }]}>{pct}</Text>
                <Text style={[sn.ringUnit, { color: P.textTertiary }]}>PERCENT</Text>
              </View>
            </View>

            <View style={sn.statsCol}>
              <Text style={[sn.statLbl, { color: P.textTertiary }]}>
                {t('studentHome.todaysStatus')}
              </Text>
              <StatusPill status={todayStatus} isDark={isDark} />

              <View style={sn.statsRow}>
                <View style={[sn.statItem, raisedTile, {
                  backgroundColor: isDark ? 'rgba(16,185,129,0.12)' : '#E7F9F2',
                  borderColor: isDark ? 'rgba(52,211,153,0.13)' : 'rgba(255,255,255,0.88)',
                }]}>
                  <Text style={[sn.statNum, { color: P.success }]}>{presentDays}</Text>
                  <Text style={[sn.statKey, { color: isDark ? '#6EE7B7' : '#378774' }]}>{t('studentHome.chipPresent')}</Text>
                </View>
                <View style={[sn.statItem, raisedTile, {
                  backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#FFF0F1',
                  borderColor: isDark ? 'rgba(248,113,113,0.13)' : 'rgba(255,255,255,0.88)',
                }]}>
                  <Text style={[sn.statNum, { color: P.danger }]}>{absentDays}</Text>
                  <Text style={[sn.statKey, { color: isDark ? '#FCA5A5' : '#B85A67' }]}>{t('studentHome.chipAbsent')}</Text>
                </View>
                <View style={[sn.statItem, raisedTile, {
                  backgroundColor: isDark ? 'rgba(139,92,246,0.14)' : '#EEEAFE',
                  borderColor: isDark ? 'rgba(167,139,250,0.14)' : 'rgba(255,255,255,0.88)',
                }]}>
                  <Text style={[sn.statNum, { color: isDark ? '#C4B5FD' : '#5B45A8' }]}>{totalDays}</Text>
                  <Text style={[sn.statKey, { color: isDark ? '#C4B5FD' : '#7163A1' }]}>{t('studentHome.chipTotal')}</Text>
                </View>
              </View>
            </View>
          </View>
        </LinearGradient>
      </View>
    </PressScale>
  );
};

const sn = StyleSheet.create({
  cardShell: {
    borderRadius: 30,
    borderWidth: 1.5,
    shadowOffset: { width: 7, height: 9 },
    shadowOpacity: 0.20,
    shadowRadius: 16,
    elevation: 7,
    backgroundColor: '#EEEAFE',
  },
  card: {
    borderRadius: 29,
    paddingHorizontal: 18,
    paddingTop: 17,
    paddingBottom: 18,
    overflow: 'hidden',
  },
  blobTop: { position: 'absolute', width: 150, height: 150, borderRadius: 75, top: -105, right: 36 },
  blobBottom: { position: 'absolute', width: 112, height: 112, borderRadius: 56, bottom: -78, left: -28 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  calendarClay: {
    width: 34, height: 34, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5,
    shadowOffset: { width: 2, height: 4 },
    shadowOpacity: 0.26,
    shadowRadius: 5,
    elevation: 4,
  },
  headerEyebrow: { fontSize: 8, fontWeight: '900', letterSpacing: 1.4, lineHeight: 11 },
  headerLbl: { fontSize: 13.5, fontWeight: '800', letterSpacing: -0.1, lineHeight: 18 },
  headerRight: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14,
    borderWidth: 1,
    shadowOffset: { width: 2, height: 3 }, shadowRadius: 5, elevation: 2,
  },
  viewTxt: { fontSize: 10.5, fontWeight: '800' },

  content: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ringClay: {
    width: 116, height: 116, borderRadius: 58,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2,
    shadowOffset: { width: 4, height: 7 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 5,
  },
  ringCopy: { justifyContent: 'center', alignItems: 'center' },
  ringPct: { fontSize: 31, fontWeight: '900', letterSpacing: -1.3, lineHeight: 33 },
  ringUnit: { fontSize: 8, fontWeight: '900', letterSpacing: 1.35, marginTop: 1 },
  statsCol: { flex: 1, gap: 8, minWidth: 0 },
  statLbl: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.15 },
  statsRow: { flexDirection: 'row', alignItems: 'stretch', gap: 5, marginTop: 2 },
  statItem: {
    flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 2,
    paddingVertical: 7, paddingHorizontal: 2, borderRadius: 13, borderWidth: 1,
  },
  statNum: { fontSize: 17.5, fontWeight: '900', letterSpacing: -0.55, lineHeight: 21 },
  statKey: { fontSize: 7.2, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.42 },
});

/* ═══════════════════════════════════════════
   HOME SCREEN
═══════════════════════════════════════════ */
const HomeScreen = () => {
  const { theme, isDark } = useTheme();
  const P = palette(theme);
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { user, role } = useAuth();
  const { isEnabled, refresh: refreshFeatures } = useFeatures();
  const visibleQuickActions = homeTabs.filter((tab) => {
    return isEnabled(tab.feature);
  });

  // Pick up admin toggles as soon as the home tab is focused.
  useFocusEffect(
    useCallback(() => {
      refreshFeatures().catch(() => { });
    }, [refreshFeatures]),
  );
  const isStudentPortal = isStudentRole(user?.role?.code);
  const isWideWeb = IS_WEB && windowWidth >= 768;

  // Content is capped to a centered column on wide web; on mobile it fills the screen.
  // Card width is derived from the *effective* column width (reactive to resize/rotation),
  // not a module-level Dimensions snapshot — so 2-up tiles never stretch on desktop.
  const contentW = isWideWeb ? CONTENT_MAX_W : windowWidth;
  const cardW = (contentW - H_PAD * 2 - GAP) / 2;
  const todayLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const [svgMod, setSvgMod] = useState<ReactNativeSvgModule | null>(null);
  useEffect(() => { void import('react-native-svg').then(setSvgMod); }, []);

  const [refreshing, setRefreshing] = useState(false);
  const { data: dash, refetch } = useStudentQuery<StudentDashboardResponse>(
    '/student/dashboard',
    'dashboard',
    2 * 60 * 1000,
    user?.userId,
    { enabled: !!user?.userId && isStudentPortal, persist: true }
  );

  const student = useMemo(() => dash?.profile ?? null, [dash]);
  const attendanceStats = useMemo(() => (dash?.attendance?.summary as AttendanceSummary | null) ?? null, [dash]);
  const notices = useMemo(() => (dash?.notices as any[]) ?? [], [dash]);
  const todaysStatus = useMemo(() => {
    const today = localAttendanceDate();
    const rec = dash?.attendance?.latest_record;
    if (!rec?.attendance_date?.startsWith(today)) return 'not_marked';
    const sessionStatus = currentSession() === 'afternoon'
      ? rec.afternoon_status
      : rec.morning_status;
    if (sessionStatus) return sessionStatus;
    return 'not_marked';
  }, [dash]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try { await Promise.all([refetch(), refreshFeatures()]); } finally { setRefreshing(false); }
  }, [refetch, refreshFeatures]);

  const nav = (key: string) => {
    const r = routeMap[key];
    if (r) router.push(r as any);
  };

  const total = Number(attendanceStats?.total || 0);
  const present = Number(
    attendanceStats?.effective_present
      ?? (Number(attendanceStats?.present || 0)
        + Number(attendanceStats?.late || 0)
        + Number(attendanceStats?.half_day || 0) * 0.5)
  );
  const absent = Number(
    attendanceStats?.effective_absent
      ?? (Number(attendanceStats?.absent || 0) + Number(attendanceStats?.half_day || 0) * 0.5)
  );
  const pct = total > 0
    ? Math.round(Number(attendanceStats?.attendance_percentage ?? ((present / total) * 100)))
    : 0;
  const attClr = pct >= 85 ? '#10B981' : pct >= 70 ? '#F59E0B' : '#EF4444';

  // ponytail: pinned solid header — light hero bg needs dark chrome, not scrollY=0 transparent+white text
  const headerScrollY = useSharedValue(60);

  // StudentHeader is position:absolute, so the hero must reserve its full height or it overlaps the card.
  // ponytail: mirror StudentHeader's own layout (paddingTop max(insets.top,36) + 40 icon + 16 bottom pad); keep in sync if that header changes.
  const HEADER_HEIGHT = Math.max(insets.top, 36) + 56;

  const FRESH = 36 * 60 * 60 * 1000;
  const isFresh = (n: any) => !!n?.created_at && Date.now() - new Date(n.created_at).getTime() < FRESH;
  const freshNotices = notices.filter(isFresh);
  const staleNotices = notices.filter(n => !isFresh(n));
  const topNotice = freshNotices[0] ?? null;
  const belowNotice = topNotice ? (staleNotices[0] ?? null) : (staleNotices[0] ?? null);

  const hr = new Date().getHours();
  const gStr = hr < 12 ? t('dashboard.good_morning') : hr < 17 ? t('dashboard.good_afternoon') : t('dashboard.good_evening');
  const gIco = hr < 12 ? '☀️' : hr < 17 ? '🌤️' : '🌙';

  const classSec = useMemo(() => {
    const ce = student?.current_enrollment;
    if (!ce) return t('studentHome.classNA');
    const cn = ce.class_name || ce.class_code || t('studentHome.classWord');
    const sec = ce.section_name?.replace(/Section\s*/i, '') ?? '';
    return `${cn} · ${t('studentHome.sectionPrefix')} ${sec}`.trim();
  }, [student, t]);

  const studentFullName = useMemo(() => {
    const profileName = [
      student?.first_name,
      student?.middle_name,
      student?.last_name,
    ]
      .map(part => part?.trim())
      .filter((part): part is string => Boolean(part))
      .join(' ');

    return (
      profileName ||
      student?.display_name?.trim() ||
      user?.displayName?.trim() ||
      t('studentHome.studentFallback')
    );
  }, [student, user?.displayName, t]);

  useEffect(() => {
    if (!user?.userId || !student) return;
    void patchAccountMetadata(user.userId, {
      classLabel: classSec,
      schoolName: SCHOOL_CONFIG.name,
    });
  }, [user?.userId, student, classSec]);

  return (
    <HomeSvgContext.Provider value={svgMod}>
      <ScreenLayout>
        <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor="transparent" translucent />
        <StudentHeader scrollY={headerScrollY} />

        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[S.scroll, { backgroundColor: P.bg }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing} onRefresh={onRefresh}
              tintColor="transparent" colors={['transparent']} progressBackgroundColor="transparent"
            />
          }
        >
          {refreshing && <View style={S.loaderRow}><LogoLoader size={28} /></View>}

          {/* ── HERO ── */}
          <View style={[S.hero, { paddingTop: HEADER_HEIGHT + 14, backgroundColor: P.bg }]}>
            <View
              style={[
                S.heroOuter,
                {
                  maxWidth: isWideWeb ? CONTENT_MAX_W : undefined,
                  alignSelf: isWideWeb ? 'center' : 'stretch',
                  paddingHorizontal: isWideWeb ? 0 : H_PAD,
                },
              ]}
            >
              <DashboardHero
                eyebrow={`${gIco}  ${todayLabel}`.toUpperCase()}
                greeting={gStr}
                name={studentFullName}
                subtitle={classSec}
                stacks
                showFullName
                card={
                  <AdminHeaderCard
                    compact
                    embedded
                    displayName={studentFullName}
                    roleLabel={classSec}
                    staffCode={student?.current_enrollment?.roll_number ? `Roll ${student.current_enrollment.roll_number}` : undefined}
                    photoUrl={student?.photo_url || user?.photoUrl}
                    portalBadge="STUDENT"
                    onAccountSwitched={onRefresh}
                  />
                }
              />
            </View>
          </View>

          {/* ── BODY ── */}
          <View style={[S.body, {
            backgroundColor: P.bg,
            borderColor: P.border,
          }, isWideWeb && {
            maxWidth: CONTENT_MAX_W,
            width: '100%',
            alignSelf: 'center',
          }]}>
            {/* 1. Snapshot — HERO */}
            {isEnabled('home.todays_snapshot') && (
              <Animated.View entering={FadeInUp.delay(160).duration(700).springify()}>
                <SnapshotCard
                  pct={pct} attColor={attClr}
                  todayStatus={todaysStatus}
                  presentDays={present} absentDays={absent} totalDays={total}
                  onPress={() => {
                    router.push('/Screen/attendance');
                  }}
                />
              </Animated.View>
            )}

            {/* 2. Fresh notice */}
            {topNotice && (
              <Animated.View entering={FadeInUp.delay(240).duration(700).springify()}>
                <SectionLabel
                  text={t('studentHome.latestAnnouncement')}
                  accent="#F97316"
                  badge={t('studentHome.badgeNew')}
                />
                <AnnouncementCard notice={topNotice} isFresh onPress={() => nav('messages')} />
              </Animated.View>
            )}

            {/* 3. Quick Actions grid — hidden when every action is disabled */}
            {visibleQuickActions.length > 0 && (
              <Animated.View entering={FadeInUp.delay(310).duration(700).springify()}>
                <SectionLabel
                  text={t('dashboard.quick_actions')}
                  accent="#6366F1"
                />
                <View style={S.grid}>
                  {visibleQuickActions.map((item, i) => (
                    <Animated.View key={item.key} entering={FadeInUp.delay(340 + i * 34).duration(540).springify()}>
                      <FeatureCard
                        tab={{
                          ...item,
                          title: item.translationKey ? (t(item.translationKey) as string) : item.title,
                          subtitle: t(item.subtitleKey) as string,
                        }}
                        isDark={isDark}
                        cardWidth={cardW}
                        onPress={() => nav(item.key)}
                      />
                    </Animated.View>
                  ))}
                </View>
              </Animated.View>
            )}

            {/* 4. Class Teacher / Academic Advisor */}
            {isEnabled('home.academic_advisor') && (
              <Animated.View entering={FadeInUp.delay(460).duration(700).springify()}>
                <SectionLabel text={t('studentHome.academicAdvisor')} accent="#818CF8" />
                <TeacherCard
                  name={student?.current_enrollment?.class_teacher || t('studentHome.notAssigned')}
                  role={t('common.class_teacher')}
                  photoUrl={student?.current_enrollment?.class_teacher_photo_url}
                  onContact={() => {
                    const userId = student?.current_enrollment?.class_teacher_user_id;
                    if (userId) {
                      router.push({
                        pathname: routeMap['messenger'] as any,
                        params: { preselectUserId: userId },
                      });
                    } else {
                      nav('messenger');
                    }
                  }}
                />
              </Animated.View>
            )}

            {/* 5. Older notice */}
            {belowNotice && (
              <Animated.View entering={FadeInUp.delay(520).duration(700).springify()}>
                <SectionLabel
                  text={topNotice ? t('studentHome.previousUpdate') : t('studentHome.recentUpdate')}
                  accent="#94A3B8"
                />
                <AnnouncementCard notice={belowNotice} isFresh={false} onPress={() => nav('messages')} />
              </Animated.View>
            )}
          </View>
        </Animated.ScrollView>
      </ScreenLayout>
    </HomeSvgContext.Provider>
  );
};

export default HomeScreen;

const S = StyleSheet.create({
  scroll: { paddingBottom: 80 },
  loaderRow: { alignItems: 'center', paddingVertical: 18 },

  hero: { paddingBottom: 18, overflow: 'hidden' },
  heroOuter: { width: '100%' },

  body: {
    marginTop: 0,
    paddingHorizontal: H_PAD,
    paddingTop: tokens.space[3],
    paddingBottom: tokens.space[2],
    gap: tokens.space[7],
    borderTopLeftRadius: tokens.radius['3xl'],
    borderTopRightRadius: tokens.radius['3xl'],
    borderTopWidth: 1,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
});
