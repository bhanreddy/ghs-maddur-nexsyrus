import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  BackHandler, Pressable, Dimensions, FlatList, Platform,
  useWindowDimensions, DimensionValue, RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown, FadeIn,
  useSharedValue, useAnimatedScrollHandler, useAnimatedStyle,
  withSpring, withRepeat, withTiming, withSequence,
  interpolate, Extrapolation,
} from 'react-native-reanimated';
import * as Haptics from '@/src/utils/haptics';
import { Ionicons } from '@expo/vector-icons';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import AdminHeader from '../../src/components/AdminHeader';
import { useAuth } from '../../src/hooks/useAuth';
import { usePermissions } from '../../src/hooks/usePermissions';
import { AdminDashboardStats } from '../../src/types/models';
import { AdminService } from '../../src/services/adminService';
import { AccessControlService } from '../../src/services/accessControlService';
import { supabase } from '../../src/services/supabaseConfig';
import { useTheme } from '../../src/hooks/useTheme';
import { Theme } from '../../src/theme/themes';
import ResponsiveCard from '../../src/components/ResponsiveCard';
import DashboardMenuOverlay from '../../src/components/DashboardMenuOverlay';
import DashboardWebSidebar, {
  DASHBOARD_SIDEBAR_COLLAPSED,
  DASHBOARD_SIDEBAR_EXPANDED,
  type WebSidebarActionItem,
} from '../../src/components/DashboardWebSidebar';
import { useAnalytics } from '../../src/hooks/useAnalytics';
import { usePersistedSWR } from '../../src/hooks/usePersistedSWR';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PaymentDueBanner from '../../src/components/PaymentDueBanner';
import AdminHeaderCard from '../../src/components/AdminHeaderCard';
import DashboardHero from '../../src/components/DashboardHero';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/* ─────────────────────────────────────────────────────────────────────────── */
/* COLOUR HIERARCHY SYSTEM                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */
type ActionCardVisual = {
  g: [string, string];
  accent: string;
  badge: string;
  rim: string;
  orb: string;
  wash: string;
  label: string;
  shadow: string;
};

const TIER = {
  PRIMARY: { g: ['#172554', '#2563EB'] as [string, string], accent: '#93C5FD', badge: '#60A5FA', rim: 'rgba(147,197,253,0.48)', orb: 'rgba(59,130,246,0.30)', wash: 'rgba(219,234,254,0.18)', label: '#DBEAFE', shadow: '#2563EB' },
  FINANCE: { g: ['#064E3B', '#10B981'] as [string, string], accent: '#6EE7B7', badge: '#34D399', rim: 'rgba(110,231,183,0.45)', orb: 'rgba(16,185,129,0.28)', wash: 'rgba(209,250,229,0.18)', label: '#D1FAE5', shadow: '#059669' },
  ACADEMIC: { g: ['#3B0764', '#8B5CF6'] as [string, string], accent: '#C4B5FD', badge: '#A78BFA', rim: 'rgba(196,181,253,0.46)', orb: 'rgba(139,92,246,0.30)', wash: 'rgba(237,233,254,0.17)', label: '#EDE9FE', shadow: '#7C3AED' },
  OPS: { g: ['#78350F', '#F59E0B'] as [string, string], accent: '#FDE68A', badge: '#FCD34D', rim: 'rgba(253,230,138,0.42)', orb: 'rgba(245,158,11,0.28)', wash: 'rgba(254,243,199,0.18)', label: '#FEF3C7', shadow: '#D97706' },
  ADMIN: { g: ['#831843', '#F43F5E'] as [string, string], accent: '#FDA4AF', badge: '#FB7185', rim: 'rgba(253,164,175,0.46)', orb: 'rgba(244,63,94,0.30)', wash: 'rgba(255,228,230,0.17)', label: '#FFE4E6', shadow: '#E11D48' },
} as const;

type TierKey = keyof typeof TIER;

const ACTION_CARD_VISUALS: Record<string, ActionCardVisual> = {
  '/admin/academics': { g: ['#172554', '#2563EB'], accent: '#93C5FD', badge: '#60A5FA', rim: 'rgba(147,197,253,0.50)', orb: 'rgba(59,130,246,0.32)', wash: 'rgba(219,234,254,0.20)', label: '#DBEAFE', shadow: '#2563EB' },
  '/admin/diary/viewer': { g: ['#0F172A', '#0EA5E9'], accent: '#7DD3FC', badge: '#38BDF8', rim: 'rgba(125,211,252,0.48)', orb: 'rgba(14,165,233,0.30)', wash: 'rgba(224,242,254,0.18)', label: '#E0F2FE', shadow: '#0284C7' },
  '/admin/timetable': { g: ['#1E1B4B', '#6366F1'], accent: '#A5B4FC', badge: '#818CF8', rim: 'rgba(165,180,252,0.48)', orb: 'rgba(99,102,241,0.31)', wash: 'rgba(224,231,255,0.18)', label: '#E0E7FF', shadow: '#4F46E5' },
  '/admin/academic-year-upgrade': { g: ['#164E63', '#06B6D4'], accent: '#67E8F9', badge: '#22D3EE', rim: 'rgba(103,232,249,0.44)', orb: 'rgba(6,182,212,0.28)', wash: 'rgba(207,250,254,0.17)', label: '#CFFAFE', shadow: '#0891B2' },
  '/admin/certificate-generator': { g: ['#713F12', '#F59E0B'], accent: '#FDE68A', badge: '#FBBF24', rim: 'rgba(253,230,138,0.44)', orb: 'rgba(245,158,11,0.27)', wash: 'rgba(254,243,199,0.18)', label: '#FEF3C7', shadow: '#D97706' },
  '/admin/progress-report-generator': { g: ['#312E81', '#7C3AED'], accent: '#C4B5FD', badge: '#A78BFA', rim: 'rgba(196,181,253,0.46)', orb: 'rgba(124,58,237,0.30)', wash: 'rgba(237,233,254,0.17)', label: '#EDE9FE', shadow: '#6D28D9' },
  '/admin/expenses': { g: ['#7C2D12', '#EA580C'], accent: '#FDBA74', badge: '#FB923C', rim: 'rgba(253,186,116,0.44)', orb: 'rgba(234,88,12,0.28)', wash: 'rgba(255,237,213,0.17)', label: '#FFEDD5', shadow: '#C2410C' },
  '/admin/fees/set-class-fee': { g: ['#064E3B', '#10B981'], accent: '#6EE7B7', badge: '#34D399', rim: 'rgba(110,231,183,0.45)', orb: 'rgba(16,185,129,0.28)', wash: 'rgba(209,250,229,0.18)', label: '#D1FAE5', shadow: '#059669' },
  '/admin/fees/adjustments': { g: ['#365314', '#84CC16'], accent: '#BEF264', badge: '#A3E635', rim: 'rgba(190,242,100,0.42)', orb: 'rgba(132,204,22,0.27)', wash: 'rgba(236,252,203,0.17)', label: '#ECFCCB', shadow: '#65A30D' },
  '/admin/upi-settings': { g: ['#134E4A', '#14B8A6'], accent: '#5EEAD4', badge: '#2DD4BF', rim: 'rgba(94,234,212,0.44)', orb: 'rgba(20,184,166,0.28)', wash: 'rgba(204,251,241,0.17)', label: '#CCFBF1', shadow: '#0D9488' },
  '/admin/fees/visibility': { g: ['#334155', '#64748B'], accent: '#CBD5E1', badge: '#94A3B8', rim: 'rgba(203,213,225,0.40)', orb: 'rgba(100,116,139,0.24)', wash: 'rgba(241,245,249,0.14)', label: '#F1F5F9', shadow: '#475569' },
  '/admin/payroll': { g: ['#312E81', '#6366F1'], accent: '#A5B4FC', badge: '#818CF8', rim: 'rgba(165,180,252,0.48)', orb: 'rgba(99,102,241,0.31)', wash: 'rgba(224,231,255,0.18)', label: '#E0E7FF', shadow: '#4F46E5' },
  '/admin/reports': { g: ['#4C1D95', '#9333EA'], accent: '#D8B4FE', badge: '#C084FC', rim: 'rgba(216,180,254,0.46)', orb: 'rgba(147,51,234,0.30)', wash: 'rgba(243,232,255,0.18)', label: '#F3E8FF', shadow: '#7E22CE' },
  '/admin/smart-insights': { g: ['#831843', '#EC4899'], accent: '#F9A8D4', badge: '#F472B6', rim: 'rgba(249,168,212,0.46)', orb: 'rgba(236,72,153,0.30)', wash: 'rgba(252,231,243,0.17)', label: '#FCE7F3', shadow: '#DB2777' },
  '/admin/notices': { g: ['#713F12', '#EAB308'], accent: '#FEF08A', badge: '#FACC15', rim: 'rgba(254,240,138,0.42)', orb: 'rgba(234,179,8,0.27)', wash: 'rgba(254,249,195,0.17)', label: '#FEF9C3', shadow: '#CA8A04' },
  '/admin/complaints': { g: ['#881337', '#F43F5E'], accent: '#FDA4AF', badge: '#FB7185', rim: 'rgba(253,164,175,0.45)', orb: 'rgba(244,63,94,0.30)', wash: 'rgba(255,228,230,0.17)', label: '#FFE4E6', shadow: '#E11D48' },
  '/admin/transport': { g: ['#0C4A6E', '#38BDF8'], accent: '#BAE6FD', badge: '#7DD3FC', rim: 'rgba(186,230,253,0.44)', orb: 'rgba(56,189,248,0.28)', wash: 'rgba(224,242,254,0.17)', label: '#E0F2FE', shadow: '#0284C7' },
  '/admin/leaves': { g: ['#14532D', '#22C55E'], accent: '#86EFAC', badge: '#4ADE80', rim: 'rgba(134,239,172,0.43)', orb: 'rgba(34,197,94,0.28)', wash: 'rgba(220,252,231,0.17)', label: '#DCFCE7', shadow: '#16A34A' },
  '/admin/manage-staff': { g: ['#581C87', '#A855F7'], accent: '#D8B4FE', badge: '#C084FC', rim: 'rgba(216,180,254,0.45)', orb: 'rgba(168,85,247,0.29)', wash: 'rgba(243,232,255,0.17)', label: '#F3E8FF', shadow: '#9333EA' },
  '/admin/addStaff': { g: ['#6D28D9', '#8B5CF6'], accent: '#C4B5FD', badge: '#A78BFA', rim: 'rgba(196,181,253,0.46)', orb: 'rgba(139,92,246,0.30)', wash: 'rgba(237,233,254,0.17)', label: '#EDE9FE', shadow: '#7C3AED' },
  '/admin/add-accounts-staff': { g: ['#9A3412', '#FB923C'], accent: '#FED7AA', badge: '#FDBA74', rim: 'rgba(254,215,170,0.43)', orb: 'rgba(251,146,60,0.28)', wash: 'rgba(255,237,213,0.17)', label: '#FFEDD5', shadow: '#EA580C' },
  '/admin/access-requests': { g: ['#7F1D1D', '#DC2626'], accent: '#FCA5A5', badge: '#F87171', rim: 'rgba(252,165,165,0.48)', orb: 'rgba(220,38,38,0.32)', wash: 'rgba(254,226,226,0.18)', label: '#FEE2E2', shadow: '#B91C1C' },
};

interface ActionItem {
  title: string;
  icon: IconName;
  route: string;
  tier: TierKey;
  gradient?: [string, string];
  badge?: number;
  category: string;
  description?: string;
  permission?: string;
}

interface StatItem {
  label: string;
  value: string | number;
  icon: IconName;
  color: string;
  bg: string;
  route: string;
  trend: string;
  trendUp: boolean;
  accentGradient: [string, string];
  badge?: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CONTAINER_PADDING = 20;
const isWeb = Platform.OS === 'web';
const isAndroid = Platform.OS === 'android';
const AnimatedFlatList = Animated.FlatList as any; // ⚡PERF: reanimated-scrollable FlatList

/** Skip layout/enter animations on Android — they tank scroll FPS on heavy screens. */
const enterAnim = (delay = 0) =>
  isAndroid ? undefined : FadeInDown.delay(delay).springify().damping(15);

/**
 * Hardware-texture promotion for cards.
 *
 * ⚡PERF: previously set to `isAndroid` on every card. Promoting every cell of a
 * virtualized list to its own GPU texture layer thrashes texture memory and causes
 * frame drops on scroll (React Native warns it is "very expensive in terms of
 * memory"). The cards are static during scroll, so the texture buys nothing here.
 * Kept off on Android; a single flag makes it trivial to flip back if ever needed.
 */
const HW_TEXTURE_ANDROID = false;

const ANDROID_SCROLL_PROPS = isAndroid
  ? ({ removeClippedSubviews: true, overScrollMode: 'never' as const, nestedScrollEnabled: true })
  : {};

const CARD_MARGIN = 14;
const MAX_CONTENT_WIDTH = 1000;
const ACTUAL_WIDTH = Math.min(SCREEN_WIDTH, MAX_CONTENT_WIDTH);
const CARD_WIDTH = ACTUAL_WIDTH - CONTAINER_PADDING * 2;

const GRID_GAP = 10;
const GRID_COLS = 3;

// ponytail: clay helpers local to dashboard — extract to shared util if a 3rd screen needs them
function clay(isDark: boolean, raised: 'sm' | 'md' | 'lg' = 'md') {
  const spread = raised === 'lg' ? 22 : raised === 'sm' ? 10 : 16;
  const dy = raised === 'lg' ? 12 : raised === 'sm' ? 5 : 8;
  if (Platform.OS === 'web') {
    const drop = isDark ? 'rgba(0,0,0,0.50)' : 'rgba(148,163,184,0.38)';
    const light = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.92)';
    const innerHi = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.75)';
    const innerLo = isDark ? 'rgba(0,0,0,0.32)' : 'rgba(148,163,184,0.22)';
    return {
      boxShadow:
        `${dy}px ${dy}px ${spread}px ${drop}, ` +
        `-${dy}px -${dy}px ${spread}px ${light}, ` +
        `inset 2px 2px 4px ${innerHi}, ` +
        `inset -2px -2px 4px ${innerLo}`,
    } as any;
  }
  // ⚡PERF(Android): elevation shadows are re-rasterized every scroll frame and are the
  // dominant UI-thread/draw cost on this dense dashboard. Use a cheap border instead of a
  // shadow — keeps card definition without the per-frame shadow rendering. iOS keeps shadows.
  if (isAndroid) {
    return {
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(148,163,184,0.22)',
    } as any;
  }
  return {
    shadowColor: isDark ? '#000000' : '#94A3B8',
    shadowOffset: { width: 0, height: dy },
    shadowOpacity: isDark ? 0.45 : 0.26,
    shadowRadius: spread,
    elevation: raised === 'lg' ? 10 : raised === 'sm' ? 4 : 7,
  } as any;
}

function clayGlow(color: string, raised: 'sm' | 'md' = 'md') {
  const dy = raised === 'sm' ? 4 : 7;
  const spread = raised === 'sm' ? 10 : 16;
  if (Platform.OS === 'web') {
    return {
      boxShadow:
        `${dy}px ${dy}px ${spread}px ${color}44, ` +
        `inset 1.5px 1.5px 3px rgba(255,255,255,0.40), ` +
        `inset -1.5px -1.5px 3px rgba(0,0,0,0.12)`,
    } as any;
  }
  // ⚡PERF(Android): drop the coloured glow shadow entirely — pure per-frame cost, minimal visual.
  if (isAndroid) {
    return {} as any;
  }
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: dy },
    shadowOpacity: 0.38,
    shadowRadius: spread,
    elevation: raised === 'sm' ? 5 : 8,
  } as any;
}

function clayInset(isDark: boolean) {
  if (Platform.OS === 'web') {
    const innerLo = isDark ? 'rgba(0,0,0,0.38)' : 'rgba(148,163,184,0.28)';
    const innerHi = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.85)';
    return {
      boxShadow: `inset 2px 2px 6px ${innerLo}, inset -1px -1px 4px ${innerHi}`,
    } as any;
  }
  return {
    borderWidth: 1,
    borderColor: isDark ? 'rgba(0,0,0,0.22)' : 'rgba(148,163,184,0.20)',
  } as any;
}

function ClayCardOverlays({ isDark, cardRadius, accentColor, gradientColors, hideTopAccent = false }: {
  isDark: boolean; cardRadius: number; accentColor: string; gradientColors?: [string, string]; hideTopAccent?: boolean;
}) {
  return (
    <>
      {/* ⚡PERF: the two full-card translucent "sheen" layers below are the dominant
          overdraw source — ~50 cards × 2 layers composited every frame tanks scroll FPS
          on Android. They are a subtle highlight only, so skip them on Android and keep
          just the thin accent bar. Unchanged on web/iOS. */}
      {!isAndroid && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '50%',
          borderTopLeftRadius: cardRadius, borderTopRightRadius: cardRadius,
          backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.55)',
        }} />
      )}
      {!hideTopAccent && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, overflow: 'hidden' }}>
          {gradientColors ? (
            <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
          ) : (
            <View style={{ flex: 1, backgroundColor: accentColor, opacity: isDark ? 0.85 : 0.72 }} />
          )}
        </View>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* PULSE INDICATOR                                                           */
/* ─────────────────────────────────────────────────────────────────────────── */
function PulseIndicator({ color = '#10B981' }: { color?: string }) {
  // Static dot for maximum performance.
  return (
    <View style={{ width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 7, height: 7, backgroundColor: color, borderRadius: 3.5 }} />
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* PREMIUM GREETING SUMMARY CARD                                             */
/* ─────────────────────────────────────────────────────────────────────────── */
interface SummaryMiniCardProps {
  label: string;
  value: string | number;
  icon: IconName;
  color: string;
  isDark: boolean;
  delay: number;
}

const SummaryMiniCard = React.memo(({ label, value, icon, color, isDark, delay }: SummaryMiniCardProps) => {
  const { width } = useWindowDimensions();
  const isCompact = width < 520;
  const cardRadius = isCompact ? 20 : 22;

  return (
    <Animated.View
      entering={enterAnim(delay)}
      renderToHardwareTextureAndroid={HW_TEXTURE_ANDROID}
      style={{
        flex: isCompact ? 0 : 1,
        flexBasis: isCompact ? '47%' : undefined,
        minWidth: isCompact ? '47%' : '22%',
        backgroundColor: isDark ? '#1A2332' : '#FFFFFF',
        borderRadius: cardRadius,
        padding: isCompact ? 14 : 16,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)',
        ...clay(isDark, 'sm'),
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'center',
        gap: isCompact ? 10 : 12,
      }}
    >
      <ClayCardOverlays isDark={isDark} cardRadius={cardRadius} accentColor={color} hideTopAccent />
      <View style={{
        width: 40, height: 40, borderRadius: 14,
        backgroundColor: `${color}14`,
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        borderWidth: 1, borderColor: `${color}20`,
        ...clayGlow(color, 'sm'),
      }}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 18, fontWeight: '800', color: isDark ? '#FFFFFF' : '#0F172A', letterSpacing: -0.5 }}>
          {value}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 9, fontWeight: '700', color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.4)', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 2 }}>
          {label}
        </Text>
      </View>
    </Animated.View>
  );
});

/* ─────────────────────────────────────────────────────────────────────────── */
/* HERO STAT CARD                                                             */
/* ─────────────────────────────────────────────────────────────────────────── */
const DashboardCard = React.memo(
  ({ item, index, onPress, cardWidth }: { item: StatItem; index: number; onPress: () => void; cardWidth?: DimensionValue }) => {
    const { isDark } = useTheme();
    const { width: windowWidth } = useWindowDimensions();
    const isWideScreen = isWeb && windowWidth >= 768;

    const scale = useSharedValue(1);
    const translateY = useSharedValue(0);
    const cardAnim = useAnimatedStyle(() => ({
      transform: [
        { scale: scale.value },
        { translateY: translateY.value }
      ]
    }));

    const clayStyle = useMemo(() => {
      const baseColor = item.color;
      let bg = '#4A72E6';
      let shadowColor = '#253FA3';

      if (baseColor === '#3B82F6') { // Blue (Vibrant Periwinkle/Royal)
        bg = isDark ? '#3053C4' : '#4A72E6';
        shadowColor = isDark ? '#1C318F' : '#253FA3';
      } else if (baseColor === '#10B981') { // Green (Vibrant Mint/Emerald)
        bg = isDark ? '#1B7F5F' : '#2CB288';
        shadowColor = isDark ? '#0D4E3A' : '#136146';
      } else if (baseColor === '#F59E0B') { // Orange (Vibrant Amber/Apricot)
        bg = isDark ? '#9B531C' : '#E58539';
        shadowColor = isDark ? '#5C2D0B' : '#75390E';
      } else if (baseColor === '#EF4444') { // Red (Vibrant Coral/Crimson)
        bg = isDark ? '#9E2E3B' : '#E65565';
        shadowColor = isDark ? '#5E131C' : '#7A1621';
      }

      const borderRadius = isWideScreen ? 34 : 28;

      if (Platform.OS === 'web') {
        return {
          backgroundColor: bg,
          borderRadius,
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.45)',
          boxShadow:
            `0px 10px 24px ${shadowColor}33, ` +
            `-6px -6px 16px ${isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.85)'}, ` +
            `inset 2.5px 2.5px 5px rgba(255, 255, 255, 0.45), ` +
            `inset -3.5px -3.5px 7px rgba(0, 0, 0, 0.16)`
        };
      }

      return {
        backgroundColor: bg,
        borderRadius,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.45)',
        shadowColor,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: isDark ? 0.45 : 0.28,
        shadowRadius: 18,
        elevation: isAndroid ? 0 : 8,
      };
    }, [item.color, isDark, isWideScreen]);

    return (
      <View style={[{ marginRight: isWideScreen ? 0 : CARD_MARGIN }, cardWidth !== undefined ? { width: cardWidth } : { width: CARD_WIDTH }]}>
        <Pressable
          onHoverIn={() => {
            scale.value = withTiming(1.02, { duration: 180 });
            translateY.value = withTiming(-4, { duration: 180 });
          }}
          onHoverOut={() => {
            scale.value = withTiming(1, { duration: 180 });
            translateY.value = withTiming(0, { duration: 180 });
          }}
          onPressIn={() => {
            scale.value = withTiming(0.98, { duration: 150 });
            translateY.value = withTiming(2, { duration: 150 });
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          onPressOut={() => {
            scale.value = withTiming(1, { duration: 150 });
            translateY.value = withTiming(0, { duration: 150 });
          }}
          onPress={onPress}
        >
          <Animated.View renderToHardwareTextureAndroid={HW_TEXTURE_ANDROID} style={[cardAnim, clayStyle]}>
            <View style={{ padding: isWideScreen ? 24 : 22, minHeight: isWideScreen ? 160 : 150 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <View style={{
                  width: isWideScreen ? 44 : 40,
                  height: isWideScreen ? 44 : 40,
                  borderRadius: isWideScreen ? 14 : 13,
                  backgroundColor: 'rgba(255,255,255,0.22)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.32)',
                  ...(Platform.OS === 'web' ? {
                    boxShadow: '2px 3px 6px rgba(0,0,0,0.12), -1px -1px 2px rgba(255,255,255,0.15), inset 1px 1px 2px rgba(255,255,255,0.4)'
                  } : {
                    shadowColor: '#000000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.12,
                    shadowRadius: 3,
                    elevation: isAndroid ? 0 : 2
                  })
                }}>
                  <Ionicons name={item.icon} size={isWideScreen ? 22 : 20} color="rgba(255,255,255,0.95)" />
                </View>

                {item.badge ? (
                  <View style={{
                    backgroundColor: 'rgba(255,255,255,0.22)',
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.32)',
                    ...(Platform.OS === 'web' ? {
                      boxShadow: '2px 2px 4px rgba(0,0,0,0.08), -1px -1px 2px rgba(255,255,255,0.15), inset 1px 1px 2px rgba(255,255,255,0.4)'
                    } : {
                      shadowColor: '#000000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.1,
                      shadowRadius: 2.5,
                      elevation: isAndroid ? 0 : 1.5
                    })
                  }}>
                    <Text style={{ color: 'white', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 }}>
                      {item.badge}
                    </Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <PulseIndicator color="rgba(255,255,255,0.7)" />
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: '800', letterSpacing: 1 }}>LIVE</Text>
                  </View>
                )}
              </View>

              <Text style={{
                color: 'rgba(255,255,255,0.76)', fontSize: 11, fontWeight: '700',
                letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6,
              }}>
                {item.label}
              </Text>

              <Text style={{
                color: '#FFFFFF', fontSize: isWideScreen ? 38 : 34,
                fontWeight: '900', letterSpacing: -1.2, lineHeight: isWideScreen ? 44 : 40,
              }}>
                {item.value}
              </Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 }}>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: 'rgba(255,255,255,0.18)',
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.28)',
                  ...(Platform.OS === 'web' ? {
                    boxShadow: '2px 2px 4px rgba(0,0,0,0.08), -1px -1px 2px rgba(255,255,255,0.15), inset 1px 1px 2px rgba(255,255,255,0.4)'
                  } : {
                    shadowColor: '#000000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.1,
                    shadowRadius: 2.5,
                    elevation: isAndroid ? 0 : 1.5
                  })
                }}>
                  <Ionicons
                    name={item.trendUp ? 'trending-up' : 'trending-down'}
                    size={12} color="rgba(255,255,255,0.9)"
                  />
                  <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '700' }}>
                    {item.trend}
                  </Text>
                </View>
              </View>
            </View>
          </Animated.View>
        </Pressable>
      </View>
    );
  },
);

/* ─────────────────────────────────────────────────────────────────────────── */
/* QUICK ACTION CARD - [UNCHANGED AS REQUESTED]                               */
/* ─────────────────────────────────────────────────────────────────────────── */
const GridItem = React.memo(({ item, index, cardWidth }: { item: ActionItem; index: number; cardWidth: number }) => {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const isMobile = windowWidth < 768;
  const isWideScreen = isWeb && windowWidth >= 768;
  const styles = useMemo(() => getStyles(theme, isDark, isWideScreen), [theme, isDark, isWideScreen]);

  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);
  const iconScale = useSharedValue(1);
  const iconRotate = useSharedValue(0);

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateY: translateY.value }
    ],
  }));
  const iconAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: iconScale.value },
      { rotate: `${iconRotate.value}deg` },
    ],
  }));

  const handlePressIn = () => {
    scale.value = withTiming(0.97, { duration: 150 });
    translateY.value = withTiming(2, { duration: 150 });
    if (!isAndroid) {
      iconScale.value = withSequence(
        withSpring(1.22, { damping: 6, stiffness: 460 }),
        withSpring(1.0, { damping: 10, stiffness: 320 }),
      );
      iconRotate.value = withSequence(
        withTiming(-6, { duration: 80 }),
        withTiming(6, { duration: 80 }),
        withTiming(0, { duration: 100 }),
      );
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };
  const handlePressOut = () => {
    scale.value = withTiming(1, { duration: 150 });
    translateY.value = withTiming(0, { duration: 150 });
  };

  const category = item.category;
  const clayStyle = useMemo(() => {
    let bg = '#4A72E6';
    let shadowColor = '#253FA3';

    if (category === 'Academic' || category === 'AI') {
      bg = isDark ? '#3053C4' : '#4A72E6';
      shadowColor = isDark ? '#1C318F' : '#253FA3';
    } else if (category === 'Finance') {
      bg = isDark ? '#1B7F5F' : '#2CB288';
      shadowColor = isDark ? '#0D4E3A' : '#136146';
    } else if (category === 'Analytics') {
      bg = isDark ? '#5033B3' : '#825AE6';
      shadowColor = isDark ? '#2F187A' : '#4925A3';
    } else if (category === 'Comms') {
      bg = isDark ? '#9B531C' : '#E58539';
      shadowColor = isDark ? '#5C2D0B' : '#75390E';
    } else if (category === 'Support') {
      bg = isDark ? '#9E4437' : '#E06D5E';
      shadowColor = isDark ? '#5B1E16' : '#7D2F23';
    } else if (category === 'Ops') {
      bg = isDark ? '#9E731D' : '#E6AE3C';
      shadowColor = isDark ? '#5A3E08' : '#7D550A';
    } else if (category === 'HR') {
      bg = isDark ? '#9E333C' : '#E65A65';
      shadowColor = isDark ? '#5E1015' : '#7D1B22';
    } else if (category === 'Security') {
      bg = isDark ? '#9E2833' : '#E64A57';
      shadowColor = isDark ? '#5E0B11' : '#7D161F';
    }

    const borderRadius = isWideScreen ? 34 : 30;

    if (Platform.OS === 'web') {
      return {
        backgroundColor: bg,
        borderRadius,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.45)',
        boxShadow:
          `0px 8px 20px ${shadowColor}33, ` +
          `-6px -6px 16px ${isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.85)'}, ` +
          `inset 2.5px 2.5px 5px rgba(255, 255, 255, 0.45), ` +
          `inset -3.5px -3.5px 7px rgba(0, 0, 0, 0.16)`
      };
    }

    return {
      backgroundColor: bg,
      borderRadius,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.45)',
      shadowColor,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.45 : 0.28,
      shadowRadius: 16,
      elevation: isAndroid ? 0 : 7,
    };
  }, [category, isDark, isWideScreen]);

  return (
    <Animated.View
      entering={enterAnim(index * 45)}
      style={[styles.gridWrapper, { width: cardWidth }]}
    >
      <Pressable
        onHoverIn={() => {
          scale.value = withTiming(1.02, { duration: 180 });
          translateY.value = withTiming(-4, { duration: 180 });
        }}
        onHoverOut={() => {
          scale.value = withTiming(1, { duration: 180 });
          translateY.value = withTiming(0, { duration: 180 });
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() => router.push(item.route as any)}
      >
        <Animated.View style={[cardAnimStyle, styles.gridItem, clayStyle]}>
          {/* Abstract Claymorphic Background Graphics */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: isWideScreen ? 110 : 90,
              height: isWideScreen ? 110 : 90,
              borderRadius: isWideScreen ? 55 : 45,
              borderWidth: 1.5,
              borderColor: 'rgba(255, 255, 255, 0.08)',
              bottom: isWideScreen ? -25 : -20,
              right: isWideScreen ? -25 : -20,
              zIndex: 1,
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: isWideScreen ? 60 : 50,
              height: isWideScreen ? 60 : 50,
              borderRadius: isWideScreen ? 30 : 25,
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.05)',
              bottom: isWideScreen ? 50 : 40,
              right: isWideScreen ? -12 : -10,
              zIndex: 1,
            }}
          />


          {item.badge !== undefined && item.badge > 0 && (
            <View style={[styles.gridBadge, {
              backgroundColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.9)',
              borderColor: isDark ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.85)',
              zIndex: 2,
              ...(Platform.OS === 'web' ? {
                boxShadow: '2px 2px 4px rgba(0,0,0,0.1), -1px -1px 2px rgba(255,255,255,0.2), inset 1px 1px 2px rgba(255,255,255,0.4)'
              } : {
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.1,
                shadowRadius: 2.5,
                elevation: isAndroid ? 0 : 1.5
              })
            }]}>
              <Text style={[styles.gridBadgeText, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                {item.badge > 99 ? '99+' : item.badge}
              </Text>
            </View>
          )}

          <View style={{
            position: 'absolute', top: 9, left: 9,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            backgroundColor: 'rgba(0,0,0,0.15)',
            paddingHorizontal: 8, paddingVertical: 4,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.15)',
            zIndex: 2,
            ...(Platform.OS === 'web' ? {
              boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.2), inset -1px -1px 2px rgba(255,255,255,0.1)'
            } : {})
          }}>
            <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.72)' }} />
            <Text style={{
              fontSize: 7, fontWeight: '900', letterSpacing: 1.1,
              color: 'rgba(255,255,255,0.92)',
              textTransform: 'uppercase',
            }}>
              {item.category}
            </Text>
          </View>

          <View style={[styles.gridContent, { paddingTop: isWideScreen ? 38 : 34, zIndex: 2 }]}>
            <Animated.View style={[iconAnimStyle, {
              width: isWideScreen ? 50 : 42,
              height: isWideScreen ? 50 : 42,
              borderRadius: isWideScreen ? 18 : 15,
              backgroundColor: 'rgba(255,255,255,0.22)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.32)',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              ...(Platform.OS === 'web' ? {
                boxShadow: '2px 3px 6px rgba(0,0,0,0.12), -1px -1px 2px rgba(255,255,255,0.15), inset 1px 1px 2px rgba(255,255,255,0.4)'
              } : {
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.12,
                shadowRadius: 3,
                elevation: isAndroid ? 0 : 2
              }),
            }]}>
              <Ionicons
                name={item.icon}
                size={isWideScreen ? 24 : 20}
                color="rgba(255,255,255,0.97)"
              />
            </Animated.View>

            <View style={styles.bottomRow}>
              <View style={{ flex: 1, marginRight: 6 }}>
                <Text
                  style={[
                    styles.gridTitle,
                    isMobile
                      ? {
                        flex: undefined,
                        fontSize: windowWidth < 380 ? 12.5 : 13.5,
                        lineHeight: windowWidth < 380 ? 16 : 17,
                      }
                      : { fontSize: isWideScreen ? 14 : 12.5 },
                  ]}
                  {...(!isMobile ? { numberOfLines: 2 } : {})}
                >
                  {item.title}
                </Text>
                {!isMobile && (
                  <Text style={{
                    color: 'rgba(255,255,255,0.78)',
                    fontSize: isWideScreen ? 9 : 8,
                    fontWeight: '700',
                    letterSpacing: 0.7,
                    textTransform: 'uppercase',
                    marginTop: 4,
                  }} numberOfLines={1}>
                    {item.tier === 'PRIMARY' ? 'Daily tools' : item.category}
                  </Text>
                )}
              </View>

              <View style={{
                width: isWideScreen ? 28 : 24,
                height: isWideScreen ? 28 : 24,
                borderRadius: isWideScreen ? 14 : 12,
                backgroundColor: 'rgba(255,255,255,0.22)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.32)',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                ...(Platform.OS === 'web' ? {
                  boxShadow: '2px 3px 6px rgba(0,0,0,0.12), -1px -1px 2px rgba(255,255,255,0.15), inset 1px 1px 2px rgba(255,255,255,0.4)'
                } : {
                  shadowColor: '#000000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.12,
                  shadowRadius: 3,
                  elevation: isAndroid ? 0 : 2
                }),
              }}>
                <Ionicons
                  name="chevron-forward"
                  size={isWideScreen ? 14 : 11}
                  color="rgba(255,255,255,0.90)"
                />
              </View>
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
});

/* ─────────────────────────────────────────────────────────────────────────── */
/* KPI METRIC CARD                                                           */
/* ─────────────────────────────────────────────────────────────────────────── */
interface MetricCardProps {
  iconName: IconName;
  iconColor: string;
  iconBg: string;
  value: string | number;
  label: string;
  width: number;
  isDark: boolean;
  isWideScreen: boolean;
  /** Small muted line under the value — e.g. "No data yet" / "Not tracked". */
  subLabel?: string;
  /** Render a pulsing skeleton instead of a value (first load). */
  loading?: boolean;
  /** Render a retry affordance instead of a value (fetch failed). */
  error?: boolean;
  /** Called when the retry affordance is pressed. */
  onRetry?: () => void;
}

const MetricCard = React.memo(({
  iconName, iconColor, iconBg, value, label, width, isDark, isWideScreen,
  subLabel, loading = false, error = false, onRetry,
}: MetricCardProps) => {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const skeletonAnim = useAnimatedStyle(() => ({ opacity: interpolate(scale.value, [0, 1], [0.4, 0.8]) }));

  const skeletonColor = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.09)';
  const cardRadius = isWideScreen ? 28 : 24;

  return (
    <Pressable
      onPressIn={() => { scale.value = withSpring(0.97, { damping: 16, stiffness: 340 }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 14, stiffness: 260 }); }}
    >
      <Animated.View renderToHardwareTextureAndroid={HW_TEXTURE_ANDROID} style={[anim, {
        width,
        backgroundColor: isDark ? '#1A2332' : '#FFFFFF',
        borderRadius: cardRadius,
        padding: isWideScreen ? 20 : 16,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)',
        ...clay(isDark, 'md'),
        overflow: 'hidden',
      }]}>
        {!isAndroid && (
          <View style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '52%',
            borderTopLeftRadius: cardRadius, borderTopRightRadius: cardRadius,
            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.55)',
          }} />
        )}
        {!isAndroid && (
          <View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '38%',
            borderBottomLeftRadius: cardRadius, borderBottomRightRadius: cardRadius,
            backgroundColor: isDark ? 'rgba(0,0,0,0.10)' : `${iconColor}0A`,
          }} />
        )}
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 4,
          backgroundColor: iconColor, opacity: isDark ? 0.85 : 0.72,
        }} />

        <View style={{
          width: isWideScreen ? 44 : 40, height: isWideScreen ? 44 : 40,
          borderRadius: isWideScreen ? 22 : 20,
          backgroundColor: iconBg,
          alignItems: 'center', justifyContent: 'center',
          marginBottom: isWideScreen ? 14 : 10,
          marginTop: 6,
          borderWidth: 1,
          borderColor: isDark ? `${iconColor}28` : `${iconColor}18`,
          ...clayGlow(iconColor, 'sm'),
        }}>
          <Ionicons name={iconName} size={isWideScreen ? 20 : 17} color={iconColor} />
        </View>

        <View style={{
          width: 32, height: 3, borderRadius: 2,
          backgroundColor: iconColor, marginBottom: isWideScreen ? 10 : 8,
          opacity: 0.55,
        }} />

        <Text style={{
          fontSize: isWideScreen ? 9 : 8, fontWeight: '700', letterSpacing: 1,
          color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.4)',
          textTransform: 'uppercase', marginBottom: isWideScreen ? 6 : 4,
        }}>{label}</Text>

        {loading ? (
          <Animated.View style={[skeletonAnim, {
            width: '62%', height: isWideScreen ? 22 : 17,
            borderRadius: 6, backgroundColor: skeletonColor,
          }]} />
        ) : error ? (
          <Pressable
            onPress={onRetry}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center' }}
            accessibilityRole="button"
            accessibilityLabel={`Retry loading ${label}`}
          >
            <Ionicons name="refresh" size={isWideScreen ? 18 : 15} color={iconColor} />
            <Text style={{
              marginLeft: 5,
              fontSize: isWideScreen ? 13 : 11, fontWeight: '800',
              color: iconColor,
            }}>Retry</Text>
          </Pressable>
        ) : (
          <>
            <Text numberOfLines={1} style={{
              fontSize: isWideScreen ? 22 : 17,
              fontWeight: '900', letterSpacing: -0.5,
              color: iconColor,
            }}>{value}</Text>
            {subLabel ? (
              <Text numberOfLines={1} style={{
                marginTop: 2,
                fontSize: isWideScreen ? 10 : 9, fontWeight: '600',
                color: isDark ? 'rgba(255,255,255,0.38)' : 'rgba(15,23,42,0.38)',
              }}>{subLabel}</Text>
            ) : null}
          </>
        )}
      </Animated.View>
    </Pressable>
  );
});

/* ─────────────────────────────────────────────────────────────────────────── */
/* SECTION HEADER                                                            */
/* ─────────────────────────────────────────────────────────────────────────── */
const SectionHeader = React.memo(function SectionHeader({ label, delay, styles, isDark, accentColor }: {
  label: string; delay: number; styles: any; isDark: boolean; accentColor?: string;
}) {
  const color = accentColor ?? '#3B82F6';
  return (
    <Animated.View entering={enterAnim(delay)} style={styles.sectionHeaderPill}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <View style={{ width: 4, height: 20, borderRadius: 2, backgroundColor: color, marginRight: 12, flexShrink: 0 }} />
        <Text style={[styles.sectionLabel, { color: isDark ? 'rgba(255,255,255,0.88)' : '#0F172A', letterSpacing: 2 }]}>
          {label.toUpperCase()}
        </Text>
        <View style={{ flex: 1, height: 1, marginLeft: 14, overflow: 'hidden', borderRadius: 1 }}>
          <View style={{ flex: 1, backgroundColor: color, opacity: isDark ? 0.2 : 0.1 }} />
        </View>
      </View>
    </Animated.View>
  );
});

/* ─────────────────────────────────────────────────────────────────────────── */
/* TIER LEGEND                                                               */
/* ─────────────────────────────────────────────────────────────────────────── */
const TierLegend = React.memo(function TierLegend({ isDark }: { isDark: boolean }) {
  const entries: { tier: TierKey; name: string }[] = [
    { tier: 'PRIMARY', name: 'Navigation' },
    { tier: 'FINANCE', name: 'Finance' },
    { tier: 'ACADEMIC', name: 'Academic' },
    { tier: 'OPS', name: 'Operations' },
    { tier: 'ADMIN', name: 'Admin' },
  ];
  return (
    <Animated.View
      entering={enterAnim(300)}
      style={{
        flexDirection: 'row', flexWrap: 'wrap', gap: 8,
        marginTop: -4,
        marginBottom: 22,
      }}
    >
      {entries.map(({ tier, name }) => {
        const t = TIER[tier];
        return (
          <View
            key={tier}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: isDark ? 'rgba(255,255,255,0.055)' : 'rgba(15,23,42,0.035)',
              borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.055)',
            }}
          >
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: t.g[1] }} />
            <Text style={{
              fontSize: 9, fontWeight: '800', letterSpacing: 0.9,
              color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(15,23,42,0.6)',
              textTransform: 'uppercase',
            }}>
              {name}
            </Text>
          </View>
        );
      })}
    </Animated.View>
  );
});

/* ─────────────────────────────────────────────────────────────────────────── */
/* PREMIUM PROGRESS CARD                                                     */
/* ─────────────────────────────────────────────────────────────────────────── */
function PremiumProgressCard({ title, pct, gradientColors, pctColor, isDark, isWideScreen, delay = 0 }: {
  title: string; pct: number; gradientColors: [string, string];
  pctColor: string; isDark: boolean; isWideScreen: boolean; delay?: number;
}) {
    const safeWidth = `${Math.min(Math.max(pct, 0), 100)}%` as any;
    const cardRadius = isWideScreen ? 28 : 24;
    return (
      <Animated.View
        entering={enterAnim(delay)}
        renderToHardwareTextureAndroid={HW_TEXTURE_ANDROID}
        style={{
          backgroundColor: isDark ? '#1A2332' : '#FFFFFF',
          borderRadius: cardRadius,
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)',
          padding: isWideScreen ? 26 : 20,
          marginBottom: isWideScreen ? 24 : 16,
          ...clay(isDark, 'lg'),
          overflow: 'hidden',
        }}
      >
        <ClayCardOverlays isDark={isDark} cardRadius={cardRadius} accentColor={pctColor} gradientColors={gradientColors} />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: isWideScreen ? 20 : 16, marginTop: 6 }}>
          <View>
            <Text style={{ fontSize: isWideScreen ? 10 : 9, fontWeight: '800', letterSpacing: 1.5, color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.4)', textTransform: 'uppercase', marginBottom: 4 }}>Progress</Text>
            <Text style={{ fontSize: isWideScreen ? 17 : 15, fontWeight: '800', letterSpacing: -0.3, color: isDark ? '#FFFFFF' : '#0F172A' }}>{title}</Text>
          </View>
          <Text style={{ fontSize: isWideScreen ? 30 : 26, fontWeight: '900', color: pctColor, letterSpacing: -0.5 }}>{pct}%</Text>
        </View>

        <View style={{
          height: isWideScreen ? 14 : 12, borderRadius: 99,
          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.05)',
          overflow: 'hidden',
          ...clayInset(isDark),
        }}>
          <LinearGradient
            colors={gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ height: '100%', width: safeWidth, borderRadius: 99, ...clayGlow(gradientColors[0], 'sm') }}
          />
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(15,23,42,0.3)' }}>0%</Text>
          <Text style={{ fontSize: 9, fontWeight: '700', color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(15,23,42,0.3)' }}>100%</Text>
        </View>
      </Animated.View>
    );
  }

/* ─────────────────────────────────────────────────────────────────────────── */
/* PREMIUM CHART CARD                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */
function PremiumChartCard({ title, subtitle, accentColor, isDark, isWideScreen, delay = 0, children }: {
    title: string; subtitle: string; accentColor: string;
    isDark: boolean; isWideScreen: boolean; delay?: number; children: React.ReactNode;
  }) {
    const cardRadius = isWideScreen ? 28 : 24;
    return (
      <Animated.View
        entering={enterAnim(delay)}
        renderToHardwareTextureAndroid={HW_TEXTURE_ANDROID}
        style={{
          marginBottom: isWideScreen ? 28 : 20,
          backgroundColor: isDark ? '#1A2332' : '#FFFFFF',
          borderRadius: cardRadius,
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)',
          overflow: 'hidden',
          ...clay(isDark, 'lg'),
        }}
      >
        <ClayCardOverlays isDark={isDark} cardRadius={cardRadius} accentColor={accentColor} />

        <View style={{
          paddingHorizontal: isWideScreen ? 26 : 20,
          paddingTop: isWideScreen ? 22 : 18,
          paddingBottom: isWideScreen ? 18 : 14,
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ fontSize: isWideScreen ? 18 : 15, fontWeight: '800', letterSpacing: -0.3, color: isDark ? '#FFFFFF' : '#0F172A', marginBottom: 4 }}>
              {title}
            </Text>
            <Text style={{ fontSize: isWideScreen ? 11 : 10, fontWeight: '600', color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.45)' }}>
              {subtitle}
            </Text>
          </View>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
            backgroundColor: isDark ? `${accentColor}18` : `${accentColor}10`,
            borderWidth: 1, borderColor: isDark ? `${accentColor}30` : `${accentColor}20`,
            ...clayGlow(accentColor, 'sm'),
          }}>
            <PulseIndicator color={accentColor} />
            <Text style={{ fontSize: 8, fontWeight: '800', color: accentColor, letterSpacing: 0.8 }}>LIVE</Text>
          </View>
        </View>

        <View style={{
          height: 1,
          backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
          marginHorizontal: isWideScreen ? 26 : 20,
        }} />

        <View style={{
          paddingVertical: 16, paddingHorizontal: 10, alignItems: 'center',
          backgroundColor: isDark ? 'rgba(0,0,0,0.08)' : 'rgba(248,250,252,0.6)',
          marginHorizontal: isWideScreen ? 14 : 10,
          marginBottom: isWideScreen ? 14 : 10,
          borderRadius: isWideScreen ? 20 : 16,
          ...clayInset(isDark),
        }}>
          {children}
        </View>
      </Animated.View>
    );
  }

/* ─────────────────────────────────────────────────────────────────────────── */
/* MAIN APP COMPONENT                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */
export default function AdminDashboard() {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const router = useRouter();
  const { t } = useTranslation();
  const { data: dashboardData, loading: dashboardLoading, refetch: refetchDashboard } = usePersistedSWR<AdminDashboardStats>({
    cacheKey: 'admin-dashboard-stats',
    userId: user?.userId,
    ttlMs: 60_000,
    persist: true,
    enabled: !!user,
    fetcher: () => AdminService.getDashboardStats({ silent: true }),
  });
  const loading = dashboardLoading && !dashboardData;
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [webSidebarCollapsed, setWebSidebarCollapsed] = useState(false);
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isWideScreen = isWeb && windowWidth >= 768;
  const sidebarW = isWideScreen
    ? (webSidebarCollapsed ? DASHBOARD_SIDEBAR_COLLAPSED : DASHBOARD_SIDEBAR_EXPANDED)
    : 0;
  const webPad = isWideScreen ? 24 : 20;
  const contentWidth = isWideScreen
    ? windowWidth - sidebarW - webPad * 2
    : windowWidth - CONTAINER_PADDING * 2;
  const headerOffset = insets.top + (isWideScreen ? 64 : 58);
  const mobileHeaderOffset = 74;
  /** Header overlays scroll content on iOS only (scrollY passed); Android header is in-flow — no top inset. */
  const mobileListPaddingTop = isAndroid ? 0 : mobileHeaderOffset;

  const webGap = isWideScreen ? 48 : 32;
  const leftColWidth = isWideScreen ? Math.floor((contentWidth - webGap) * 0.4) : contentWidth;
  const rightColWidth = isWideScreen ? Math.floor((contentWidth - webGap) * 0.6) : contentWidth;
  const chartWidth = (isWideScreen ? rightColWidth : contentWidth) - 48;

  const metricGap = isWideScreen ? 12 : 10;
  const metricCardWidth = Math.floor(((isWideScreen ? rightColWidth : contentWidth) - metricGap * 2) / 3) - 1;
  const actionGridGap = isWideScreen ? 12 : GRID_GAP;
  const actionCardWidth = Math.floor((leftColWidth - actionGridGap * 2) / 3) - 1;
  const webHeaderCardWidth = Math.min(610, contentWidth * 0.68);

  const {
    financials, attendance, academics, staff, insights, refreshData,
    loading: analyticsLoading, error: analyticsError,
  } = useAnalytics();

  // Pull-to-refresh / manual refresh: force both data sources to fetch the
  // latest values (dashboard stats via SWR + analytics via useAnalytics).
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setManualRefreshing(true);
    try {
      await Promise.all([refetchDashboard(), refreshData()]);
    } catch {
      // errors are surfaced by each hook's own error state
    } finally {
      setManualRefreshing(false);
    }
  }, [refetchDashboard, refreshData]);

  useEffect(() => { const timer = setInterval(() => setCurrentTime(new Date()), 60000); return () => clearInterval(timer); }, []);

  useEffect(() => {
    if (!user) return;
    const fetchPendingCount = async () => { try { const requests = await AccessControlService.getPendingRequests(); setPendingRequestsCount(requests.length); } catch (e) { console.error(e); } };
    fetchPendingCount();
    const channel = supabase.channel('access_req_badge').on('postgres_changes', { event: '*', schema: 'public', table: 'access_requests' }, fetchPendingCount).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  useFocusEffect(React.useCallback(() => {
    const onBackPress = () => { BackHandler.exitApp(); return true; };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, []));
  useEffect(() => { return () => { supabase.removeChannel(supabase.channel('access_req_badge')); }; }, []);

  const { theme, isDark } = useTheme();
  const styles = useMemo(() => getStyles(theme, isDark, isWideScreen), [theme, isDark, isWideScreen]);
  const getGreeting = useMemo(() => { const h = currentTime.getHours(); if (h < 12) return 'Good Morning'; if (h < 17) return 'Good Afternoon'; return 'Good Evening'; }, [currentTime.getHours()]);

  const stats: StatItem[] = React.useMemo(() => [
    {
      label: t('admin_dashboard_v2.total_students', 'Total Students'),
      value: loading ? '—' : dashboardData?.totalStudents ?? 0,
      icon: 'people-outline', color: '#3B82F6', bg: '#EFF6FF',
      route: '/admin/students',
      trend: financials?.new_enrollments ? `+${financials.new_enrollments} new` : 'Stable',
      trendUp: true,
      accentGradient: ['#3B82F6', '#1D4ED8'],
      badge: 'STUDENTS',
    },
    {
      label: t('admin_dashboard_v2.staff_present', 'Staff Present'),
      value: loading ? '—' : `${staff?.avg_staff_attendance ?? 0}%`,
      icon: 'checkmark-circle-outline', color: '#10B981', bg: '#ECFDF5',
      route: '/admin/attendance',
      trend: `${staff?.avg_staff_attendance ?? 0}% rate`,
      trendUp: (staff?.avg_staff_attendance ?? 0) >= 85,
      accentGradient: ['#10B981', '#047857'],
      badge: 'TODAY',
    },
    {
      label: t('admin_dashboard_v2.collection', 'Fee Collection'),
      value: loading ? '—' : financials ? `₹${(financials.total_collected / 1000).toFixed(1)}K` : '₹0',
      icon: 'wallet-outline', color: '#F59E0B', bg: '#FFFBEB',
      route: '/admin/finance',
      trend: `${financials?.collection_efficiency ?? 0}% efficiency`,
      trendUp: (financials?.collection_efficiency ?? 0) >= 80,
      accentGradient: ['#F59E0B', '#B45309'],
      badge: 'THIS MONTH',
    },
    {
      label: t('admin_dashboard_v2.avg_score', 'Pending Dues'),
      value: loading ? '—' : financials ? `₹${(financials.outstanding_dues / 1000).toFixed(1)}K` : '₹0',
      icon: 'alert-circle-outline', color: '#EF4444', bg: '#FEF2F2',
      route: '/admin/finance',
      trend: `${financials?.collection_efficiency ?? 0}% collected`,
      trendUp: false,
      accentGradient: ['#EF4444', '#991B1B'],
      badge: 'OVERDUE',
    },
  ], [t, loading, dashboardData, financials, staff]);

  const quickActions: ActionItem[] = useMemo(() => [
    { title: t('admin_dashboard_v2.academic_structure', 'Academics'), icon: 'school-outline', route: '/admin/academics', tier: 'PRIMARY', gradient: ['#172554', '#2563EB'], category: 'Academic', badge: dashboardData?.diaryEntriesToday ?? 0 },
    { title: 'Class Diary', icon: 'book-outline', route: '/admin/diary/viewer', tier: 'PRIMARY', gradient: ['#0F3A5F', '#0284C7'], category: 'Academic' },
    { title: t('admin_dashboard_v2.timetable_manager', 'Timetable'), icon: 'calendar-outline', route: '/admin/timetable', tier: 'PRIMARY', gradient: ['#312E81', '#4F46E5'], category: 'Academic' },
    { title: 'Year Upgrade', icon: 'refresh-circle-outline', route: '/admin/academic-year-upgrade', tier: 'PRIMARY', gradient: ['#1E3A8A', '#7C3AED'], category: 'Academic' },
    { title: t('admin_dashboard_v2.certificates', 'Certs'), icon: 'ribbon-outline', route: '/admin/certificate-generator', tier: 'PRIMARY', gradient: ['#1E40AF', '#06B6D4'], category: 'Academic' },
    { title: t('admin_dashboard_v2.progress_reports', 'Progress'), icon: 'stats-chart-outline', route: '/admin/progress-report-generator', tier: 'PRIMARY', gradient: ['#4338CA', '#A855F7'], category: 'Academic' },
    { title: t('admin_dashboard_v2.expense_tracker', 'Expenses'), icon: 'receipt-outline', route: '/admin/expenses', tier: 'FINANCE', gradient: ['#14532D', '#22C55E'], category: 'Finance' },
    { title: t('admin_dashboard_v2.fee_structure', 'Fee Setup'), icon: 'wallet-outline', route: '/admin/fees/set-class-fee', tier: 'FINANCE', gradient: ['#064E3B', '#14B8A6'], category: 'Finance' },
    { title: 'Fee Adjustments', icon: 'cut-outline', route: '/admin/fees/adjustments', tier: 'FINANCE', gradient: ['#365314', '#84CC16'], category: 'Finance' },
    { title: 'Partial Fee Collection', icon: 'pie-chart-outline', route: '/admin/fee-approvals', tier: 'FINANCE', gradient: ['#92400E', '#F59E0B'], category: 'Finance' },
    { title: 'UPI Settings', icon: 'qr-code-outline', route: '/admin/upi-settings', tier: 'FINANCE', gradient: ['#0F766E', '#06B6D4'], category: 'Finance' },
    { title: 'Dashboard Visibility', icon: 'eye-outline', route: '/admin/fees/visibility', tier: 'FINANCE', gradient: ['#166534', '#65A30D'], category: 'Finance' },
    { title: 'Payroll', icon: 'card-outline', route: '/admin/payroll', tier: 'FINANCE', gradient: ['#312E81', '#6366F1'], category: 'Finance' },
    { title: t('admin_dashboard_v2.view_reports', 'Reports'), icon: 'bar-chart-outline', route: '/admin/reports', tier: 'ACADEMIC', gradient: ['#581C87', '#7C3AED'], category: 'Analytics' },
    { title: t('admin_dashboard_v2.smart_insights', 'Insights'), icon: 'bulb-outline', route: '/admin/smart-insights', tier: 'ACADEMIC', gradient: ['#4C1D95', '#2563EB'], category: 'AI' },
    { title: t('admin_dashboard_v2.notices', 'Notices'), icon: 'megaphone-outline', route: '/admin/notices', tier: 'OPS', gradient: ['#7C2D12', '#F97316'], category: 'Comms' },
    { title: t('messages.title', 'Messages'), icon: 'chatbubbles-outline', route: '/admin/messages', tier: 'OPS', gradient: ['#4F46E5', '#6366F1'], category: 'Comms' },
    { title: t('admin_dashboard_v2.complaints', 'Complaints'), icon: 'chatbubble-ellipses-outline', route: '/admin/complaints', tier: 'OPS', gradient: ['#991B1B', '#F59E0B'], category: 'Support' },
    { title: t('admin_dashboard_v2.transport', 'Transport'), icon: 'bus-outline', route: '/admin/transport', tier: 'OPS', gradient: ['#92400E', '#EAB308'], category: 'Ops' },
    { title: t('admin_dashboard_v2.leaves', 'Leaves'), icon: 'document-text-outline', route: '/admin/leaves', tier: 'OPS', gradient: ['#9A3412', '#FB923C'], category: 'HR' },
    { title: t('admin_dashboard_v2.manage_staff', 'Staff'), icon: 'people-outline', route: '/admin/manage-staff', tier: 'OPS', gradient: ['#7C3AED', '#EC4899'], category: 'HR' },
    { title: t('admin_dashboard_v2.add_staff', 'Add Staff'), icon: 'person-add-outline', route: '/admin/addStaff', tier: 'OPS', gradient: ['#6D28D9', '#8B5CF6'], category: 'HR', permission: 'staff.create' },
    { title: t('admin_dashboard_v2.add_accounts_staff', 'Accounts Portal'), icon: 'wallet-outline', route: '/admin/add-accounts-staff', tier: 'OPS', gradient: ['#BE123C', '#F97316'], category: 'HR' },
    { title: 'Access Requests', icon: 'key-outline', route: '/admin/access-requests', tier: 'ADMIN', gradient: ['#881337', '#E11D48'], category: 'Security', badge: pendingRequestsCount },
  ], [t, dashboardData?.diaryEntriesToday, pendingRequestsCount]);

  const visibleQuickActions = useMemo(
    () => quickActions.filter((item) => !item.permission || hasPermission(item.permission)),
    [quickActions, hasPermission],
  );

  const sidebarItems = useMemo<WebSidebarActionItem[]>(
    () => visibleQuickActions.map((item) => ({
      title: item.title,
      icon: item.icon,
      route: item.route,
      gradient: item.gradient ?? TIER[item.tier].g,
      badge: item.badge,
      category: item.category,
    })),
    [visibleQuickActions],
  );

  /** ⚡PERF: chunk quick actions into rows so Android only mounts ~2 rows at a time */
  const actionRows = useMemo(() => {
    const rows: ActionItem[][] = [];
    for (let i = 0; i < visibleQuickActions.length; i += GRID_COLS) {
      rows.push(visibleQuickActions.slice(i, i + GRID_COLS));
    }
    return rows;
  }, [visibleQuickActions]);

  const financialTrendData = useMemo(
    () => (financials?.trend?.length ? financials.trend.map(t => ({ ...t, value: Number(t.value) })) : [{ value: 0 }]),
    [financials?.trend],
  );
  const attendanceTrendData = useMemo(
    () => (attendance?.trend?.length ? attendance.trend.map(t => ({ ...t, value: Number(t.value) })) : [{ value: 0 }]),
    [attendance?.trend],
  );
  const academicsTrendData = useMemo(
    () => (academics?.trend?.length
      ? academics.trend.map(t => ({ value: Number(t.value), label: t.label, frontColor: '#8B5CF6' }))
      : [{ value: 0, label: '', frontColor: '#8B5CF6' }]),
    [academics?.trend],
  );

  const renderActionRow = useCallback(
    (row: ActionItem[], rowIndex: number) => (
      <View
        style={{
          flexDirection: 'row',
          gap: GRID_GAP,
          marginBottom: rowIndex < actionRows.length - 1 ? GRID_GAP : 26,
        }}
      >
        {row.map((item, colIndex) => (
          <GridItem
            key={item.route}
            item={item}
            index={rowIndex * GRID_COLS + colIndex}
            cardWidth={actionCardWidth}
          />
        ))}
        {row.length < GRID_COLS &&
          Array.from({ length: GRID_COLS - row.length }, (_, i) => (
            <View key={`pad-${i}`} style={{ width: actionCardWidth }} />
          ))}
      </View>
    ),
    [actionCardWidth, actionRows.length],
  );

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({ onScroll: (event: any) => { scrollY.value = event.contentOffset.y; } });
  const greetingAnim = useAnimatedStyle(() => {
    if (isAndroid) return {};
    return {
      opacity: interpolate(scrollY.value, [0, 120], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateY: interpolate(scrollY.value, [0, 120], [0, -22], Extrapolation.CLAMP) }],
    };
  });

  const carouselRef = React.useRef<FlatList>(null);
  const [activeStatIndex, setActiveStatIndex] = useState(0);

  const matchedNavAction = visibleQuickActions.find(
    (q) => pathname === q.route || (q.route.length > 1 && pathname.startsWith(`${q.route}/`)),
  );
  const currentHeaderTitle = matchedNavAction?.title ?? t('Dashboard');

  const onCarouselMomentumEnd = useCallback((e: any) => {
    const offset = e.nativeEvent.contentOffset.x;
    const index = Math.round(offset / (CARD_WIDTH + CARD_MARGIN));
    setActiveStatIndex(Math.max(0, Math.min(index, stats.length - 1)));
  }, [stats.length]);

  const renderStatItem = useCallback(({ item, index }: any) => (
    <DashboardCard key={`card-${index}`} index={index} item={item} onPress={() => router.push(item.route as any)} />
  ), [router]);

  /* ─── RENDER BLOCKS (defined once, reused by web + mobile) ────────────── */
  const summaryMiniCards = !loading && (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, width: isWideScreen ? '100%' : '100%' }}>
      <SummaryMiniCard label="Students" value={dashboardData?.totalStudents ?? 1} icon="people-sharp" color="#2563EB" isDark={isDark} delay={200} />
      <SummaryMiniCard label="Attendance" value={attendance?.avg_attendance != null ? `${attendance.avg_attendance}%` : '—'} icon="checkmark-circle-sharp" color="#10B981" isDark={isDark} delay={240} />
      <SummaryMiniCard label="Collected" value={financials?.total_collected ? `₹${(financials.total_collected / 1000).toFixed(1)}K` : '₹0.0K'} icon="wallet-sharp" color="#F59E0B" isDark={isDark} delay={280} />
      <SummaryMiniCard label="Issues" value={dashboardData?.complaints ?? 0} icon="alert-circle-sharp" color="#EF4444" isDark={isDark} delay={320} />
    </View>
  );

  const headerProfileCard = (
    <AdminHeaderCard
      compact
      compactRole
      displayName={user?.displayName || 'Admin User'}
      photoUrl={user?.photoUrl}
      roleLabel={user?.role?.name || 'Admin'}
      staffCode={user?.staff_code}
    />
  );

  const greetingBlock = (
    <Animated.View style={[styles.greetingBlock, greetingAnim]}>
      {isWideScreen ? (
        <>
          <DashboardHero
            eyebrow={currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}
            greeting={getGreeting}
            name={user?.displayName || 'Vijay Kumar Katakam'}
            subtitle={currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            cardWidth={webHeaderCardWidth}
            card={headerProfileCard}
          />
          {summaryMiniCards && <View style={{ marginTop: 18 }}>{summaryMiniCards}</View>}
        </>
      ) : (
        <>
          <DashboardHero
            eyebrow={currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}
            greeting={getGreeting}
            name={user?.displayName || 'Vijay Kumar Katakam'}
            subtitle={currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            stacks
            card={headerProfileCard}
          />
          {summaryMiniCards && <View style={{ marginTop: 24 }}>{summaryMiniCards}</View>}
        </>
      )}
    </Animated.View>
  );

  const overviewBlock = (
    <Animated.View entering={enterAnim(240)} style={{ marginBottom: isWideScreen ? 32 : 20 }}>
      <SectionHeader label={t('dashboard.overview', 'Overview')} delay={220} styles={styles} isDark={isDark} accentColor="#2563EB" />
      {isWideScreen ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 8 }}>
          {stats.map((item, index) => (
            <View key={`stat-web-${index}`} style={{ flex: 1, minWidth: 180 }}>
              <DashboardCard index={index} item={item} onPress={() => router.push(item.route as any)} cardWidth="100%" />
            </View>
          ))}
        </View>
      ) : (
        <>
          <FlatList
            ref={carouselRef}
            data={stats}
            horizontal pagingEnabled={false}
            snapToInterval={CARD_WIDTH + CARD_MARGIN}
            snapToAlignment="start"
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_, i) => `stat-${i}`}
            contentContainerStyle={styles.statsContainer}
            onMomentumScrollEnd={onCarouselMomentumEnd}
            removeClippedSubviews={isAndroid}
            initialNumToRender={isAndroid ? 2 : 4}
            windowSize={isAndroid ? 3 : 5}
            maxToRenderPerBatch={2}
            renderItem={renderStatItem}
            getItemLayout={(_, index) => ({ length: CARD_WIDTH + CARD_MARGIN, offset: (CARD_WIDTH + CARD_MARGIN) * index, index })}
          />
          <View style={styles.dotTrack}>
            {stats.map((_, i) => (
              <TouchableOpacity key={i} onPress={() => { carouselRef.current?.scrollToOffset({ offset: i * (CARD_WIDTH + CARD_MARGIN), animated: true }); setActiveStatIndex(i); Haptics.selectionAsync(); }}>
                <Animated.View style={[styles.dot, i === activeStatIndex
                  ? [styles.dotOn, { backgroundColor: isDark ? '#FFFFFF' : '#0F172A', width: 24 }]
                  : [styles.dotOff, { backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(15,23,42,0.15)' }]
                ]} />
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </Animated.View>
  );

  const actionsHeaderBlock = (
    <>
      <SectionHeader label={t('dashboard.quick_actions', 'Quick Actions')} delay={310} styles={styles} isDark={isDark} accentColor="#7C3AED" />
      <TierLegend isDark={isDark} />
    </>
  );

  const quickActionsBlock = (
    <>
      {actionsHeaderBlock}
      <View style={styles.grid}>
        {visibleQuickActions.map((item, index) => (
          <GridItem key={index} item={item} index={index} cardWidth={actionCardWidth} />
        ))}
      </View>
    </>
  );

  const statusBlock = (
    <Animated.View
      entering={enterAnim(270)}
      renderToHardwareTextureAndroid={HW_TEXTURE_ANDROID}
      style={{
        backgroundColor: isDark ? '#1A2332' : '#FFFFFF',
        borderRadius: 28,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)',
        paddingHorizontal: 26,
        paddingVertical: 22,
        marginBottom: isWideScreen ? 32 : 24,
        ...clay(isDark, 'lg'),
        overflow: 'hidden',
      }}
    >
      <ClayCardOverlays isDark={isDark} cardRadius={28} accentColor="#10B981" />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: '#10B98118',
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: '#10B98128',
            ...clayGlow('#10B981', 'sm'),
          }}>
            <PulseIndicator color="#10B981" />
          </View>
          <View>
            <Text style={{ fontSize: 8, fontWeight: '800', letterSpacing: 1.5, color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.4)', textTransform: 'uppercase', marginBottom: 2 }}>STATUS</Text>
            <Text style={{ fontSize: 14, fontWeight: '800', color: isDark ? '#FFFFFF' : '#0F172A', letterSpacing: -0.2 }}>All Systems Operational</Text>
          </View>
        </View>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: isWideScreen ? 28 : 16,
          paddingHorizontal: isWideScreen ? 18 : 14, paddingVertical: 10, borderRadius: 18,
          backgroundColor: isDark ? 'rgba(0,0,0,0.12)' : 'rgba(248,250,252,0.7)',
          ...clayInset(isDark),
        }}>
          {[
            { label: 'TOTAL STAFF', value: staff?.total_staff ?? '28', color: '#2563EB' },
            { label: 'ACTIVE', value: staff?.active_staff ?? '28', color: '#10B981' },
            { label: 'ALERTS', value: insights.length || '4', color: '#EF4444' },
          ].map((kpi, i, arr) => (
            <React.Fragment key={kpi.label}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 9, fontWeight: '800', letterSpacing: 1, color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.4)', marginBottom: 4 }}>{kpi.label}</Text>
                <Text style={{ fontSize: 20, fontWeight: '900', color: kpi.color, letterSpacing: -0.5 }}>{kpi.value}</Text>
              </View>
              {i < arr.length - 1 && (<View style={{ width: 1, height: 24, backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)' }} />)}
            </React.Fragment>
          ))}
        </View>
      </View>
    </Animated.View>
  );

  const finMetricsBlock = (
    <>
      <SectionHeader label="Financial Overview" delay={280} styles={styles} isDark={isDark} accentColor="#10B981" />
      <Animated.View entering={enterAnim(290)}>
        <View style={styles.metricGrid}>
          <MetricCard iconName="wallet" iconColor="#10B981" iconBg={isDark ? 'rgba(16,185,129,0.15)' : '#ECFDF5'} value={financials ? `₹${((financials.lifetime_collected ?? financials.total_collected ?? 0) / 1000).toFixed(1)}K` : '₹0.0K'} label="Total Collected" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
          <MetricCard iconName="today" iconColor="#8B5CF6" iconBg={isDark ? 'rgba(139,92,246,0.15)' : '#F3E8FF'} value={financials ? `₹${((financials.today_collection ?? 0) / 1000).toFixed(1)}K` : '₹0.0K'} label="Today's Collection" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
          <MetricCard iconName="alert-circle" iconColor="#EF4444" iconBg={isDark ? 'rgba(239,68,68,0.15)' : '#FEF2F2'} value={financials ? `₹${(financials.outstanding_dues / 1000).toFixed(1)}K` : '₹6273.0K'} label="Outstanding" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
          <MetricCard iconName="trending-up" iconColor="#3B82F6" iconBg={isDark ? 'rgba(59,130,246,0.15)' : '#EFF6FF'} value={financials ? `${financials.collection_efficiency}%` : '0%'} label="Efficiency" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
          <MetricCard iconName="pricetag" iconColor="#F59E0B" iconBg={isDark ? 'rgba(245,158,11,0.15)' : '#FFFBEB'} value={financials ? `₹${(financials.discount_given / 1000).toFixed(1)}K` : '₹0.0K'} label="Discounts" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
          <MetricCard iconName="return-up-back" iconColor="#06B6D4" iconBg={isDark ? 'rgba(6,182,212,0.15)' : '#ECFEFF'} value={financials ? `₹${(financials.refunds_issued / 1000).toFixed(1)}K` : '₹0.0K'} label="Refunds" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
        </View>
        <PremiumProgressCard title="Collection Efficiency" pct={financials?.collection_efficiency ?? 0} gradientColors={['#10B981', '#34D399']} pctColor="#10B981" isDark={isDark} isWideScreen={isWideScreen} delay={295} />
      </Animated.View>
    </>
  );

  const revenueChartBlock = (
    <PremiumChartCard title="Revenue Trend" subtitle="Monthly fee collection" accentColor="#3B82F6" isDark={isDark} isWideScreen={isWideScreen} delay={310}>
      <LineChart
        data={financialTrendData}
        height={isWideScreen ? 200 : 120} width={chartWidth} color="#3B82F6" thickness={2.5}
        startFillColor="rgba(59,130,246,0.22)" endFillColor="rgba(59,130,246,0.01)"
        startOpacity={isAndroid ? 0 : 1} endOpacity={0} initialSpacing={12} noOfSections={isAndroid ? 3 : 4}
        dataPointsColor="#3B82F6" dataPointsRadius={isAndroid ? 0 : 3} hideDataPoints={isAndroid}
        yAxisThickness={0} xAxisThickness={0}
        yAxisTextStyle={{ color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(15,23,42,0.3)', fontSize: 9 }}
        xAxisLabelTextStyle={{ color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.4)', fontSize: 9 }}
        rulesColor={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)'}
        curved={!isAndroid} animationDuration={isAndroid ? 0 : 800} isAnimated={!isAndroid}
      />
    </PremiumChartCard>
  );

  // First-load skeletons vs. failed-fetch retry. Once we have any attendance
  // snapshot (even a cached one), show it and let pull-to-refresh update it.
  const attLoading = analyticsLoading && !attendance;
  const attError = !!analyticsError && !attendance;
  const attState = { loading: attLoading, error: attError, onRetry: refreshData };

  // Null (no data) → "—" + a muted label, NEVER "0%". A true 0 renders as "0".
  const pctDisplay = (v: number | null | undefined, emptyLabel: string) =>
    v == null ? { value: '—', subLabel: emptyLabel } : { value: `${v}%`, subLabel: undefined };
  const countDisplay = (v: number | null | undefined, emptyLabel: string) =>
    v == null ? { value: '—', subLabel: emptyLabel } : { value: String(v), subLabel: undefined };

  const avgAtt = pctDisplay(attendance?.avg_attendance, 'No data yet');
  const workingDays = countDisplay(attendance?.total_working_days, 'No data yet');
  const staffAtt = pctDisplay(attendance?.staff_attendance, 'Not tracked');

  const attMetricsBlock = (
    <>
      <SectionHeader label="Attendance Analytics" delay={320} styles={styles} isDark={isDark} accentColor="#10B981" />
      <Animated.View entering={enterAnim(330)}>
        <View style={styles.metricGrid}>
          <MetricCard iconName="people" iconColor="#3B82F6" iconBg={isDark ? 'rgba(59,130,246,0.15)' : '#EFF6FF'} value={avgAtt.value} subLabel={avgAtt.subLabel} label="Avg Attendance" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} {...attState} />
          {/* At Risk is a count — 0 is a genuine, good-news value, always shown. */}
          <MetricCard iconName="warning" iconColor="#F59E0B" iconBg={isDark ? 'rgba(245,158,11,0.15)' : '#FFFBEB'} value={String(attendance?.chronic_absentees ?? 0)} label="At Risk (<75%)" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} {...attState} />
          <MetricCard iconName="calendar" iconColor="#10B981" iconBg={isDark ? 'rgba(16,185,129,0.15)' : '#ECFDF5'} value={workingDays.value} subLabel={workingDays.subLabel} label="Working Days" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} {...attState} />
          <MetricCard iconName="id-card" iconColor="#8B5CF6" iconBg={isDark ? 'rgba(139,92,246,0.15)' : '#F3E8FF'} value={staffAtt.value} subLabel={staffAtt.subLabel} label="Staff Att." width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} {...attState} />
        </View>
      </Animated.View>
    </>
  );

  const attChartBlock = (
    <PremiumChartCard title="Attendance Trend" subtitle="Daily attendance percentage" accentColor="#10B981" isDark={isDark} isWideScreen={isWideScreen} delay={340}>
      <LineChart
        data={attendanceTrendData}
        height={isWideScreen ? 200 : 120} width={chartWidth} color="#10B981" thickness={2.5}
        startFillColor="rgba(16,185,129,0.22)" endFillColor="rgba(16,185,129,0.01)"
        startOpacity={isAndroid ? 0 : 1} endOpacity={0} initialSpacing={12} noOfSections={isAndroid ? 3 : 4}
        dataPointsColor="#10B981" dataPointsRadius={isAndroid ? 0 : 3} hideDataPoints={isAndroid}
        yAxisThickness={0} xAxisThickness={0}
        yAxisTextStyle={{ color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(15,23,42,0.3)', fontSize: 9 }}
        xAxisLabelTextStyle={{ color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.4)', fontSize: 9 }}
        rulesColor={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)'}
        curved={!isAndroid} animationDuration={isAndroid ? 0 : 800} isAnimated={!isAndroid}
      />
    </PremiumChartCard>
  );

  const acadMetricsBlock = (
    <>
      <SectionHeader label="Academic Performance" delay={360} styles={styles} isDark={isDark} accentColor="#8B5CF6" />
      <Animated.View entering={enterAnim(370)}>
        <View style={styles.metricGrid}>
          <MetricCard iconName="ribbon" iconColor="#8B5CF6" iconBg={isDark ? 'rgba(139,92,246,0.15)' : '#F3E8FF'} value={academics ? `${academics.avg_score}%` : '--'} label="Avg Score" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
          <MetricCard iconName="checkmark-circle" iconColor="#10B981" iconBg={isDark ? 'rgba(16,185,129,0.15)' : '#ECFDF5'} value={academics ? `${academics.pass_rate}%` : '--'} label="Pass Rate" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
          <MetricCard iconName="trophy" iconColor="#3B82F6" iconBg={isDark ? 'rgba(59,130,246,0.15)' : '#EFF6FF'} value={academics?.top_subject ?? '--'} label="Top Subject" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
          <MetricCard iconName="trending-down" iconColor="#EF4444" iconBg={isDark ? 'rgba(239,68,68,0.15)' : '#FEF2F2'} value={academics?.weakest_subject ?? '--'} label="Needs Focus" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
          <MetricCard iconName="document-text" iconColor="#06B6D4" iconBg={isDark ? 'rgba(6,182,212,0.15)' : '#ECFEFF'} value={academics ? String(academics.exams_conducted) : '--'} label="Exams" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
        </View>
        <PremiumProgressCard title="Pass Rate" pct={academics?.pass_rate ?? 0} gradientColors={['#8B5CF6', '#A78BFA']} pctColor="#8B5CF6" isDark={isDark} isWideScreen={isWideScreen} delay={375} />
      </Animated.View>
    </>
  );

  const acadChartBlock = (
    <PremiumChartCard title="Score Trend" subtitle="Exam average over time" accentColor="#8B5CF6" isDark={isDark} isWideScreen={isWideScreen} delay={380}>
      <BarChart
        data={academicsTrendData}
        height={isWideScreen ? 160 : 100} width={chartWidth} barWidth={20} barBorderRadius={4} noOfSections={4} maxValue={100}
        yAxisThickness={0} xAxisThickness={0}
        yAxisTextStyle={{ color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(15,23,42,0.3)', fontSize: 9 }}
        xAxisLabelTextStyle={{ color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.4)', fontSize: 9 }}
        rulesColor={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)'}
        showGradient={!isAndroid} gradientColor="rgba(139,92,246,0.2)"
        animationDuration={isAndroid ? 0 : 800} isAnimated={!isAndroid}
      />
    </PremiumChartCard>
  );

  const staffMetricsBlock = (
    <>
      <SectionHeader label="Staff Overview" delay={400} styles={styles} isDark={isDark} accentColor="#F59E0B" />
      <Animated.View entering={enterAnim(410)}>
        <View style={styles.metricGrid}>
          <MetricCard iconName="people-circle" iconColor="#F59E0B" iconBg={isDark ? 'rgba(245,158,11,0.15)' : '#FFFBEB'} value={staff ? String(staff.total_staff) : '--'} label="Total Staff" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
          <MetricCard iconName="moon" iconColor="#EF4444" iconBg={isDark ? 'rgba(239,68,68,0.15)' : '#FEF2F2'} value={staff ? String(staff.on_leave_today) : '--'} label="On Leave" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
          <MetricCard iconName="person-add" iconColor="#06B6D4" iconBg={isDark ? 'rgba(6,182,212,0.15)' : '#ECFEFF'} value={staff ? String(staff.new_joinings) : '--'} label="New Joins" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
          <MetricCard iconName="calendar" iconColor="#3B82F6" iconBg={isDark ? 'rgba(59,130,246,0.15)' : '#EFF6FF'} value={staff ? `${staff.avg_staff_attendance}%` : '--'} label="Staff Att." width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
        </View>
        <PremiumProgressCard title="Staff Attendance Rate" pct={staff?.avg_staff_attendance ?? 0} gradientColors={['#3B82F6', '#60A5FA']} pctColor="#3B82F6" isDark={isDark} isWideScreen={isWideScreen} delay={415} />
      </Animated.View>
    </>
  );

  const alertsBlock = insights.length > 0 ? (
    <>
      <SectionHeader label="Active Alerts" delay={430} styles={styles} isDark={isDark} accentColor="#EF4444" />
      {insights.slice(0, 3).map((ins, idx) => {
        const sevColor = ins.severity === 'high' ? '#EF4444' : ins.severity === 'medium' ? '#F59E0B' : '#3B82F6';
        const sevBg = ins.severity === 'high' ? 'rgba(239,68,68,0.10)' : ins.severity === 'medium' ? 'rgba(245,158,11,0.10)' : 'rgba(59,130,246,0.10)';
        const sevIcon: IconName = ins.severity === 'high' ? 'alert-circle' : ins.severity === 'medium' ? 'warning' : 'information-circle';
        const alertRadius = isWideScreen ? 24 : 22;
        return (
          <Animated.View key={ins.id} entering={enterAnim(440 + idx * 60)}
            style={{
              backgroundColor: isDark ? '#1A2332' : '#FFFFFF',
              borderRadius: alertRadius,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)',
              marginBottom: isWideScreen ? 14 : 10,
              ...clay(isDark, 'md'),
              overflow: 'hidden',
              flexDirection: 'row',
            }}>
            <ClayCardOverlays isDark={isDark} cardRadius={alertRadius} accentColor={sevColor} hideTopAccent />
            <View style={{
              width: 6, backgroundColor: sevColor,
              borderTopLeftRadius: alertRadius, borderBottomLeftRadius: alertRadius,
              ...clayGlow(sevColor, 'sm'),
            }} />
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: isWideScreen ? 18 : 15, paddingHorizontal: isWideScreen ? 18 : 14 }}>
              <View style={{
                width: isWideScreen ? 44 : 40, height: isWideScreen ? 44 : 40,
                borderRadius: isWideScreen ? 16 : 14,
                backgroundColor: sevBg,
                alignItems: 'center', justifyContent: 'center',
                marginRight: isWideScreen ? 14 : 10, flexShrink: 0,
                borderWidth: 1, borderColor: `${sevColor}22`,
                ...clayGlow(sevColor, 'sm'),
              }}>
                <Ionicons name={sevIcon} size={isWideScreen ? 19 : 16} color={sevColor} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <View style={{
                    backgroundColor: sevBg, borderRadius: 8,
                    paddingHorizontal: 9, paddingVertical: 4,
                    borderWidth: 1, borderColor: `${sevColor}25`,
                    ...clayGlow(sevColor, 'sm'),
                  }}>
                    <Text style={{ fontSize: isWideScreen ? 9 : 8, fontWeight: '800', letterSpacing: 1, color: sevColor }}>{ins.severity.toUpperCase()}</Text>
                  </View>
                  <View style={{
                    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)',
                    borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4,
                    ...clayInset(isDark),
                  }}>
                    <Text style={{ fontSize: isWideScreen ? 9 : 8, fontWeight: '700', color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(15,23,42,0.5)', textTransform: 'uppercase' }}>{ins.category}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: isWideScreen ? 14 : 12, fontWeight: '600', color: isDark ? '#FFFFFF' : '#0F172A', lineHeight: isWideScreen ? 20 : 18 }}>{ins.message}</Text>
              </View>
            </View>
          </Animated.View>
        );
      })}
    </>
  ) : null;

  /* ─── WEB BODY (single ScrollView, unchanged layout) ──────────────────── */
  const dashboardBody = (
    <View>
      <ResponsiveCard maxWidth={isWideScreen ? contentWidth : 1000}>
        <PaymentDueBanner />
        {greetingBlock}
        <View style={isWideScreen ? styles.webRow : undefined}>
          <View style={isWideScreen ? { width: leftColWidth } : undefined}>
            {overviewBlock}
            {quickActionsBlock}
          </View>
          <View style={isWideScreen ? { width: rightColWidth } : undefined}>
            {statusBlock}
            {finMetricsBlock}
            {revenueChartBlock}
            {attMetricsBlock}
            {attChartBlock}
            {acadMetricsBlock}
            {acadChartBlock}
            {staffMetricsBlock}
            {alertsBlock}
          </View>
        </View>
        <View style={{ height: 48 }} />
      </ResponsiveCard>
    </View>
  );

  /* ─── MOBILE SECTIONS (each becomes a virtualized FlatList cell) ──────── */
  const mobileSections = useMemo(() => [
    { key: 'greeting', node: greetingBlock },
    { key: 'overview', node: overviewBlock },
    { key: 'actions-header', node: actionsHeaderBlock },
    ...(isAndroid
      ? actionRows.map((row, i) => ({
        key: `actions-row-${i}`,
        node: renderActionRow(row, i),
      }))
      : [{
        key: 'actions', node: (
          <View style={styles.grid}>
            {visibleQuickActions.map((item, index) => (
              <GridItem key={index} item={item} index={index} cardWidth={actionCardWidth} />
            ))}
          </View>
        )
      }]),
    { key: 'status', node: statusBlock },
    { key: 'fin', node: finMetricsBlock },
    { key: 'revenue', node: revenueChartBlock },
    { key: 'attn', node: attMetricsBlock },
    { key: 'attnChart', node: attChartBlock },
    { key: 'acad', node: acadMetricsBlock },
    { key: 'acadChart', node: acadChartBlock },
    { key: 'staff', node: staffMetricsBlock },
    ...(alertsBlock ? [{ key: 'alerts', node: alertsBlock }] : []),
  ], [greetingBlock, overviewBlock, actionsHeaderBlock, isAndroid, actionRows, renderActionRow, styles.grid, visibleQuickActions, actionCardWidth, statusBlock, finMetricsBlock, revenueChartBlock, attMetricsBlock, attChartBlock, acadMetricsBlock, acadChartBlock, staffMetricsBlock, alertsBlock]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      <AdminHeader
        title={currentHeaderTitle}
        showNotification
        scrollY={isAndroid ? undefined : scrollY}
        onMenuPress={() => (isWideScreen ? setWebSidebarCollapsed((c) => !c) : setIsMenuOpen(true))}
      />

      {isWideScreen ? (
        <View style={{ flex: 1, flexDirection: 'row', paddingTop: headerOffset }}>
          <DashboardWebSidebar collapsed={webSidebarCollapsed} items={sidebarItems} />
          <Animated.ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[styles.content, { paddingTop: 20 }]}
            showsVerticalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
            {...ANDROID_SCROLL_PROPS}
            refreshControl={
              <RefreshControl refreshing={manualRefreshing} onRefresh={onRefresh} tintColor="#3B82F6" colors={['#3B82F6']} />
            }
          >
            {dashboardBody}
          </Animated.ScrollView>
        </View>
      ) : (
        <>
          {/* ⚡PERF: this list holds a fixed, small set of heavy "section" cells (charts,
              stat carousel, metric grids). Aggressive virtualization (tiny windowSize +
              removeClippedSubviews) mounted/unmounted whole sections mid-scroll, which
              spiked frames on every scroll. Since the section count is bounded, we mount
              them once and let scrolling run fully native — no clip/unclip churn. */}
          <AnimatedFlatList
            data={mobileSections}
            keyExtractor={(it: any) => it.key}
            renderItem={useCallback(({ item }: any) => item.node, [])}
            ListHeaderComponent={<PaymentDueBanner />}
            contentContainerStyle={[styles.content, { paddingTop: mobileListPaddingTop }]}
            showsVerticalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
            removeClippedSubviews={isAndroid}
            windowSize={isAndroid ? 7 : 21}
            initialNumToRender={isAndroid ? 4 : 12}
            maxToRenderPerBatch={isAndroid ? 4 : 12}
            updateCellsBatchingPeriod={50}
            overScrollMode={isAndroid ? 'never' : 'auto'}
            ListFooterComponent={<View style={{ height: 48 }} />}
            refreshControl={
              <RefreshControl refreshing={manualRefreshing} onRefresh={onRefresh} tintColor="#3B82F6" colors={['#3B82F6']} progressViewOffset={mobileHeaderOffset} />
            }
          />

          <DashboardMenuOverlay
            isOpen={isMenuOpen}
            onClose={() => setIsMenuOpen(false)}
            activeRoute={null}
            items={visibleQuickActions}
            onItemPress={(route) => { setIsMenuOpen(false); setTimeout(() => router.push(route as any), 300); }}
          />
        </>
      )}
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* STYLES SYSTEM                                                             */
/* ─────────────────────────────────────────────────────────────────────────── */
const getStyles = (theme: Theme, isDark: boolean, isWide = false) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#0B0F19' : '#F8FAFC' },
    content: { paddingHorizontal: isWide ? 24 : CONTAINER_PADDING, paddingBottom: 48 },
    webRow: { flexDirection: 'row', justifyContent: 'space-between', gap: isWide ? 48 : 32 } as any,

    greetingBlock: { marginBottom: 32, paddingTop: isWide ? 16 : 0, paddingHorizontal: 2 },
    eyebrowRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
    eyebrowText: { fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
    greetingName: { fontSize: isWide ? 32 : 26, fontWeight: '900', letterSpacing: -0.8, marginBottom: 6 },
    dateRow: { flexDirection: 'row', alignItems: 'center' },
    dateText: { fontSize: 12, fontWeight: '500' },
    dotSep: { width: 4, height: 4, borderRadius: 2, marginHorizontal: 8 },
    timeText: { fontSize: 12, fontWeight: '700' },

    sectionHeaderPill: {
      flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch',
      marginBottom: isWide ? 20 : 14, paddingVertical: 4,
    },
    sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },

    statsContainer: { paddingRight: CONTAINER_PADDING, paddingBottom: 4 },
    dotTrack: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 32 },
    dot: { height: 5, borderRadius: 99 },
    dotOn: { opacity: 1 },
    dotOff: { width: 12, opacity: 1 },

    metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: isWide ? 12 : 10, marginBottom: isWide ? 20 : 14 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: isWide ? 12 : GRID_GAP, marginBottom: isWide ? 34 : 26 },
    gridWrapper: {},

    gridItem: {
      width: '100%',
      aspectRatio: isWide ? 1 / 1.04 : 1 / 1.12,
      overflow: Platform.OS === 'web' ? 'hidden' : 'visible',
    },
    gridContent: {
      flex: 1,
      padding: isWide ? 15 : 13,
      justifyContent: 'space-between',
    },
    bottomRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
    },
    gridTitle: {
      flex: 1,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: -0.15,
      lineHeight: isWide ? 18 : 16,
    },
    gridBadge: {
      position: 'absolute', top: 9, right: 9,
      minWidth: 22, height: 22,
      borderRadius: 11, paddingHorizontal: 6,
      alignItems: 'center', justifyContent: 'center',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.65, shadowRadius: 6, elevation: isAndroid ? 0 : 8, zIndex: 10,
      borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.72)',
    },
    gridBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: 0.2 },
  });