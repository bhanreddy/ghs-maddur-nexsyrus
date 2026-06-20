import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar,
  BackHandler, Pressable, Dimensions, FlatList, Platform,
  useWindowDimensions, DimensionValue,
} from 'react-native';
import { useRouter, useFocusEffect, usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown, FadeIn, FadeInUp,
  useSharedValue, useAnimatedScrollHandler, useAnimatedStyle,
  withSpring, withRepeat, withTiming, withSequence,
  interpolate, Extrapolation,
} from 'react-native-reanimated';
import * as Haptics from '@/src/utils/haptics';
import { Ionicons } from '@expo/vector-icons';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import AdminHeader from '../../src/components/AdminHeader';
import { useAuth } from '../../src/hooks/useAuth';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PaymentDueBanner from '../../src/components/PaymentDueBanner';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/* ─────────────────────────────────────────────────────────────────────────── */
/*  COLOUR HIERARCHY SYSTEM                                                    */
/*                                                                             */
/*  TIER 1 – PRIMARY (most-accessed daily actions)                            */
/*    Deep indigo → cobalt. These own the most visual weight.                 */
/*                                                                             */
/*  TIER 2 – FINANCIAL (money flows)                                          */
/*    Forest emerald → teal. Distinct from academic, easy to scan.            */
/*                                                                             */
/*  TIER 3 – ACADEMIC (learning / records)                                    */
/*    Royal violet → purple. Knowledge domain.                                */
/*                                                                             */
/*  TIER 4 – OPS / SUPPORT (logistics, comms)                                 */
/*    Burnt amber → gold. Warm, operational feel.                             */
/*                                                                             */
/*  TIER 5 – ADMIN / SECURITY (destructive / gated actions)                  */
/*    Crimson → rose. High visual weight, signals authority.                  */
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
  // Tier 1 — Primary academic navigation
  PRIMARY:   { g: ['#172554', '#2563EB'] as [string, string], accent: '#93C5FD', badge: '#60A5FA', rim: 'rgba(147,197,253,0.48)', orb: 'rgba(59,130,246,0.30)', wash: 'rgba(219,234,254,0.18)', label: '#DBEAFE', shadow: '#2563EB' },
  // Tier 2 — Financial flows
  FINANCE:   { g: ['#064E3B', '#10B981'] as [string, string], accent: '#6EE7B7', badge: '#34D399', rim: 'rgba(110,231,183,0.45)', orb: 'rgba(16,185,129,0.28)', wash: 'rgba(209,250,229,0.18)', label: '#D1FAE5', shadow: '#059669' },
  // Tier 3 — Academic records / reports
  ACADEMIC:  { g: ['#3B0764', '#8B5CF6'] as [string, string], accent: '#C4B5FD', badge: '#A78BFA', rim: 'rgba(196,181,253,0.46)', orb: 'rgba(139,92,246,0.30)', wash: 'rgba(237,233,254,0.17)', label: '#EDE9FE', shadow: '#7C3AED' },
  // Tier 4 — Operations / comms / support
  OPS:       { g: ['#78350F', '#F59E0B'] as [string, string], accent: '#FDE68A', badge: '#FCD34D', rim: 'rgba(253,230,138,0.42)', orb: 'rgba(245,158,11,0.28)', wash: 'rgba(254,243,199,0.18)', label: '#FEF3C7', shadow: '#D97706' },
  // Tier 5 — Admin / security / danger zone
  ADMIN:     { g: ['#831843', '#F43F5E'] as [string, string], accent: '#FDA4AF', badge: '#FB7185', rim: 'rgba(253,164,175,0.46)', orb: 'rgba(244,63,94,0.30)', wash: 'rgba(255,228,230,0.17)', label: '#FFE4E6', shadow: '#E11D48' },
} as const;

type TierKey = keyof typeof TIER;

const ACTION_CARD_VISUALS: Record<string, ActionCardVisual> = {
  // Row 1: daily academic navigation, strongest blue family.
  '/admin/academics':                  { g: ['#172554', '#2563EB'], accent: '#93C5FD', badge: '#60A5FA', rim: 'rgba(147,197,253,0.50)', orb: 'rgba(59,130,246,0.32)', wash: 'rgba(219,234,254,0.20)', label: '#DBEAFE', shadow: '#2563EB' },
  '/admin/diary/viewer':               { g: ['#0F172A', '#0EA5E9'], accent: '#7DD3FC', badge: '#38BDF8', rim: 'rgba(125,211,252,0.48)', orb: 'rgba(14,165,233,0.30)', wash: 'rgba(224,242,254,0.18)', label: '#E0F2FE', shadow: '#0284C7' },
  '/admin/timetable':                  { g: ['#1E1B4B', '#6366F1'], accent: '#A5B4FC', badge: '#818CF8', rim: 'rgba(165,180,252,0.48)', orb: 'rgba(99,102,241,0.31)', wash: 'rgba(224,231,255,0.18)', label: '#E0E7FF', shadow: '#4F46E5' },

  // Row 2: academic admin, still important but a calmer support palette.
  '/admin/academic-year-upgrade':      { g: ['#164E63', '#06B6D4'], accent: '#67E8F9', badge: '#22D3EE', rim: 'rgba(103,232,249,0.44)', orb: 'rgba(6,182,212,0.28)', wash: 'rgba(207,250,254,0.17)', label: '#CFFAFE', shadow: '#0891B2' },
  '/admin/certificate-generator':      { g: ['#713F12', '#F59E0B'], accent: '#FDE68A', badge: '#FBBF24', rim: 'rgba(253,230,138,0.44)', orb: 'rgba(245,158,11,0.27)', wash: 'rgba(254,243,199,0.18)', label: '#FEF3C7', shadow: '#D97706' },
  '/admin/progress-report-generator':  { g: ['#312E81', '#7C3AED'], accent: '#C4B5FD', badge: '#A78BFA', rim: 'rgba(196,181,253,0.46)', orb: 'rgba(124,58,237,0.30)', wash: 'rgba(237,233,254,0.17)', label: '#EDE9FE', shadow: '#6D28D9' },

  // Finance: money flow cards get distinct green, teal, amber, and slate variants.
  '/admin/expenses':                   { g: ['#7C2D12', '#EA580C'], accent: '#FDBA74', badge: '#FB923C', rim: 'rgba(253,186,116,0.44)', orb: 'rgba(234,88,12,0.28)', wash: 'rgba(255,237,213,0.17)', label: '#FFEDD5', shadow: '#C2410C' },
  '/admin/fees/set-class-fee':         { g: ['#064E3B', '#10B981'], accent: '#6EE7B7', badge: '#34D399', rim: 'rgba(110,231,183,0.45)', orb: 'rgba(16,185,129,0.28)', wash: 'rgba(209,250,229,0.18)', label: '#D1FAE5', shadow: '#059669' },
  '/admin/fees/adjustments':           { g: ['#365314', '#84CC16'], accent: '#BEF264', badge: '#A3E635', rim: 'rgba(190,242,100,0.42)', orb: 'rgba(132,204,22,0.27)', wash: 'rgba(236,252,203,0.17)', label: '#ECFCCB', shadow: '#65A30D' },
  '/admin/upi-settings':               { g: ['#134E4A', '#14B8A6'], accent: '#5EEAD4', badge: '#2DD4BF', rim: 'rgba(94,234,212,0.44)', orb: 'rgba(20,184,166,0.28)', wash: 'rgba(204,251,241,0.17)', label: '#CCFBF1', shadow: '#0D9488' },
  '/admin/fees/visibility':            { g: ['#334155', '#64748B'], accent: '#CBD5E1', badge: '#94A3B8', rim: 'rgba(203,213,225,0.40)', orb: 'rgba(100,116,139,0.24)', wash: 'rgba(241,245,249,0.14)', label: '#F1F5F9', shadow: '#475569' },
  '/admin/payroll':                    { g: ['#312E81', '#6366F1'], accent: '#A5B4FC', badge: '#818CF8', rim: 'rgba(165,180,252,0.48)', orb: 'rgba(99,102,241,0.31)', wash: 'rgba(224,231,255,0.18)', label: '#E0E7FF', shadow: '#4F46E5' },

  // Insights/reporting: high-signal analytic cards.
  '/admin/reports':                    { g: ['#4C1D95', '#9333EA'], accent: '#D8B4FE', badge: '#C084FC', rim: 'rgba(216,180,254,0.46)', orb: 'rgba(147,51,234,0.30)', wash: 'rgba(243,232,255,0.18)', label: '#F3E8FF', shadow: '#7E22CE' },
  '/admin/smart-insights':             { g: ['#831843', '#EC4899'], accent: '#F9A8D4', badge: '#F472B6', rim: 'rgba(249,168,212,0.46)', orb: 'rgba(236,72,153,0.30)', wash: 'rgba(252,231,243,0.17)', label: '#FCE7F3', shadow: '#DB2777' },

  // Operations: each operational domain gets its own semantic color.
  '/admin/notices':                    { g: ['#713F12', '#EAB308'], accent: '#FEF08A', badge: '#FACC15', rim: 'rgba(254,240,138,0.42)', orb: 'rgba(234,179,8,0.27)', wash: 'rgba(254,249,195,0.17)', label: '#FEF9C3', shadow: '#CA8A04' },
  '/admin/complaints':                 { g: ['#881337', '#F43F5E'], accent: '#FDA4AF', badge: '#FB7185', rim: 'rgba(253,164,175,0.45)', orb: 'rgba(244,63,94,0.30)', wash: 'rgba(255,228,230,0.17)', label: '#FFE4E6', shadow: '#E11D48' },
  '/admin/transport':                  { g: ['#0C4A6E', '#38BDF8'], accent: '#BAE6FD', badge: '#7DD3FC', rim: 'rgba(186,230,253,0.44)', orb: 'rgba(56,189,248,0.28)', wash: 'rgba(224,242,254,0.17)', label: '#E0F2FE', shadow: '#0284C7' },
  '/admin/leaves':                     { g: ['#14532D', '#22C55E'], accent: '#86EFAC', badge: '#4ADE80', rim: 'rgba(134,239,172,0.43)', orb: 'rgba(34,197,94,0.28)', wash: 'rgba(220,252,231,0.17)', label: '#DCFCE7', shadow: '#16A34A' },
  '/admin/manage-staff':               { g: ['#581C87', '#A855F7'], accent: '#D8B4FE', badge: '#C084FC', rim: 'rgba(216,180,254,0.45)', orb: 'rgba(168,85,247,0.29)', wash: 'rgba(243,232,255,0.17)', label: '#F3E8FF', shadow: '#9333EA' },
  '/admin/add-accounts-staff':         { g: ['#9A3412', '#FB923C'], accent: '#FED7AA', badge: '#FDBA74', rim: 'rgba(254,215,170,0.43)', orb: 'rgba(251,146,60,0.28)', wash: 'rgba(255,237,213,0.17)', label: '#FFEDD5', shadow: '#EA580C' },

  // Security: strongest warning color, intentionally reserved.
  '/admin/access-requests':            { g: ['#7F1D1D', '#DC2626'], accent: '#FCA5A5', badge: '#F87171', rim: 'rgba(252,165,165,0.48)', orb: 'rgba(220,38,38,0.32)', wash: 'rgba(254,226,226,0.18)', label: '#FEE2E2', shadow: '#B91C1C' },
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
const CARD_MARGIN = 14;
const MAX_CONTENT_WIDTH = 1000;
const ACTUAL_WIDTH = Math.min(SCREEN_WIDTH, MAX_CONTENT_WIDTH);
const CARD_WIDTH = ACTUAL_WIDTH - CONTAINER_PADDING * 2;

const GRID_GAP = 10;
const GRID_COLS = 3;
const ACTION_CARD_WIDTH =
  Math.floor((ACTUAL_WIDTH - CONTAINER_PADDING * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS);

const ORB_SIZE = ACTION_CARD_WIDTH * 0.88;

/* ─────────────────────────────────────────────────────────────────────────── */
/*  PULSE INDICATOR                                                            */
/* ─────────────────────────────────────────────────────────────────────────── */
function PulseIndicator({ color = '#10B981' }: { color?: string }) {
  const op = useSharedValue(0.4);
  const sc = useSharedValue(0.8);
  React.useEffect(() => {
    op.value = withRepeat(withSequence(withTiming(1, { duration: 800 }), withTiming(0.4, { duration: 1200 })), -1, true);
    sc.value = withRepeat(withSequence(withTiming(1.3, { duration: 800 }), withTiming(0.8, { duration: 1200 })), -1, true);
  }, []);
  const animStyle = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ scale: sc.value }] }));
  return (
    <View style={{ width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color, borderRadius: 7 }, animStyle]} />
      <View style={{ width: 7, height: 7, backgroundColor: color, borderRadius: 3.5 }} />
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  HERO STAT CARD                                                             */
/* ─────────────────────────────────────────────────────────────────────────── */
const DashboardCard = React.memo(
  ({ item, index, onPress, cardWidth }: { item: StatItem; index: number; onPress: () => void; cardWidth?: DimensionValue }) => {
    const { isDark } = useTheme();
    const { width: windowWidth } = useWindowDimensions();
    const isWideScreen = isWeb && windowWidth >= 768;

    const scale = useSharedValue(1);
    const cardAnim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

    const [g0, g1] = item.accentGradient;

    return (
      <View style={[{ marginRight: isWideScreen ? 0 : CARD_MARGIN }, cardWidth !== undefined ? { width: cardWidth } : { width: CARD_WIDTH }]}>
        <Pressable
          onPressIn={() => { scale.value = withSpring(0.97, { damping: 16, stiffness: 320 }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          onPressOut={() => { scale.value = withSpring(1, { damping: 13, stiffness: 250 }); }}
          onPress={onPress}
        >
          <Animated.View style={[cardAnim, {
            borderRadius: isWideScreen ? 24 : 22,
            overflow: 'hidden',
            shadowColor: g0,
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.40,
            shadowRadius: 24,
            elevation: 14,
          }]}>
            <LinearGradient
              colors={[g0, g1]}
              start={{ x: 0.05, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ padding: isWideScreen ? 24 : 22, minHeight: isWideScreen ? 160 : 150 }}
            >
              <View style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 1,
                backgroundColor: 'rgba(255,255,255,0.25)',
              }} />

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <View style={{
                  width: isWideScreen ? 44 : 40, height: isWideScreen ? 44 : 40,
                  borderRadius: isWideScreen ? 14 : 13,
                  backgroundColor: 'rgba(255,255,255,0.18)',
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
                }}>
                  <Ionicons name={item.icon} size={isWideScreen ? 22 : 20} color="rgba(255,255,255,0.95)" />
                </View>

                {item.badge ? (
                  <View style={{
                    backgroundColor: 'rgba(255,255,255,0.22)',
                    paddingHorizontal: 10, paddingVertical: 4,
                    borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
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
                color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: '700',
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
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
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

              <View style={{
                position: 'absolute', width: 120, height: 120, borderRadius: 60,
                backgroundColor: 'rgba(255,255,255,0.06)',
                bottom: -30, right: -20,
              }} />
              <View style={{
                position: 'absolute', width: 70, height: 70, borderRadius: 35,
                backgroundColor: 'rgba(255,255,255,0.06)',
                bottom: 10, right: 30,
              }} />
            </LinearGradient>
          </Animated.View>
        </Pressable>
      </View>
    );
  },
);

/* ─────────────────────────────────────────────────────────────────────────── */
/*  QUICK ACTION CARD  — Enhanced with tier-based colour hierarchy            */
/* ─────────────────────────────────────────────────────────────────────────── */
const GridItem = React.memo(({ item, index, cardWidth }: { item: ActionItem; index: number; cardWidth: number }) => {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const isMobile = windowWidth < 768;
  const isWideScreen = isWeb && windowWidth >= 768;
  const styles = useMemo(() => getStyles(theme, isDark, isWideScreen), [theme, isDark, isWideScreen]);

  const scale = useSharedValue(1);
  const iconScale = useSharedValue(1);
  const iconRotate = useSharedValue(0);

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const iconAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: iconScale.value },
      { rotate: `${iconRotate.value}deg` },
    ],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.91, { damping: 12, stiffness: 400 });
    iconScale.value = withSequence(
      withSpring(1.22, { damping: 6, stiffness: 460 }),
      withSpring(1.0, { damping: 10, stiffness: 320 }),
    );
    iconRotate.value = withSequence(
      withTiming(-6, { duration: 80 }),
      withTiming(6, { duration: 80 }),
      withTiming(0, { duration: 100 }),
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 14, stiffness: 280 });
  };

  const t = ACTION_CARD_VISUALS[item.route] ?? TIER[item.tier];
  const [g0, g1] = item.gradient ?? t.g;
  const orbSize = cardWidth * 1.05;
  const radius = isWideScreen ? 26 : 22;

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 45).springify().mass(0.5).damping(13)}
      style={[styles.gridWrapper, { width: cardWidth }]}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() => router.push(item.route as any)}
      >
        <Animated.View style={[cardAnimStyle, {
          shadowColor: item.gradient?.[1] ?? t.shadow,
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: isDark ? 0.36 : 0.24,
          shadowRadius: 24,
          elevation: 12,
        }]}>
          <View style={[styles.gridItem, { borderRadius: radius }]}>

            <LinearGradient
              colors={[g0, g1]}
              start={{ x: 0.0, y: 0.0 }}
              end={{ x: 1.0, y: 1.0 }}
              style={StyleSheet.absoluteFill}
            />

            <LinearGradient
              colors={[t.wash, 'rgba(255,255,255,0.04)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0.7 }}
              style={{
                position: 'absolute',
                top: 0, left: 0, right: 0,
                height: '58%',
                borderTopLeftRadius: radius,
                borderTopRightRadius: radius,
              }}
            />

            <LinearGradient
              colors={['transparent', 'rgba(15,23,42,0.32)']}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />

            <View style={{
              ...StyleSheet.absoluteFillObject,
              borderRadius: radius,
              borderWidth: 1.5,
              borderColor: t.rim,
            }} />

            <LinearGradient
              colors={[t.accent, 'rgba(255,255,255,0.08)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={{
                position: 'absolute',
                top: 12,
                bottom: 12,
                left: 0,
                width: 4,
                borderTopRightRadius: 99,
                borderBottomRightRadius: 99,
                opacity: 0.95,
              }}
            />

            <View style={{
              position: 'absolute',
              width: orbSize, height: orbSize, borderRadius: orbSize / 2,
              backgroundColor: t.orb,
              bottom: -(orbSize * 0.46), right: -(orbSize * 0.42),
            }} />
            <View style={{
              position: 'absolute',
              width: orbSize * 0.48, height: orbSize * 0.48,
              borderRadius: (orbSize * 0.48) / 2,
              backgroundColor: 'rgba(255,255,255,0.08)',
              top: -(orbSize * 0.20), right: -(orbSize * 0.18),
            }} />

            {item.badge !== undefined && item.badge > 0 && (
              <View style={[styles.gridBadge, { backgroundColor: t.badge, shadowColor: t.badge }]}>
                <Text style={styles.gridBadgeText}>{item.badge > 99 ? '99+' : item.badge}</Text>
              </View>
            )}

            <View style={{
              position: 'absolute', top: 9, left: 9,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              backgroundColor: 'rgba(15,23,42,0.24)',
              paddingHorizontal: 8, paddingVertical: 4,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.18)',
            }}>
              <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: t.accent }} />
              <Text style={{
                fontSize: 7, fontWeight: '900', letterSpacing: 1.1,
                color: t.label,
                textTransform: 'uppercase',
              }}>
                {item.category}
              </Text>
            </View>

            <View style={[styles.gridContent, { paddingTop: isWideScreen ? 38 : 34 }]}>

              <Animated.View style={[iconAnimStyle, {
                width: isWideScreen ? 50 : 42,
                height: isWideScreen ? 50 : 42,
                borderRadius: isWideScreen ? 18 : 15,
                backgroundColor: 'rgba(255,255,255,0.18)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.28)',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                shadowColor: 'rgba(0,0,0,0.5)',
                shadowOffset: { width: 0, height: 5 },
                shadowOpacity: 0.55,
                shadowRadius: 10,
                elevation: 6,
              }]}>
                <LinearGradient
                  colors={['rgba(255,255,255,0.30)', 'rgba(255,255,255,0.10)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
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
                      color: 'rgba(255,255,255,0.68)',
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
                  backgroundColor: 'rgba(255,255,255,0.16)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.26)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Ionicons
                    name="chevron-forward"
                    size={isWideScreen ? 14 : 11}
                    color="rgba(255,255,255,0.90)"
                  />
                </View>
              </View>
            </View>
          </View>
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
});

/* ─────────────────────────────────────────────────────────────────────────── */
/*  KPI METRIC CARD                                                            */
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
}

const MetricCard = React.memo(({ iconName, iconColor, iconBg, value, label, width, isDark, isWideScreen }: MetricCardProps) => {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPressIn={() => { scale.value = withSpring(0.97, { damping: 16, stiffness: 340 }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 14, stiffness: 260 }); }}
    >
      <Animated.View style={[anim, {
        width,
        backgroundColor: isDark ? '#141C2E' : '#FFFFFF',
        borderRadius: isWideScreen ? 20 : 18,
        padding: isWideScreen ? 18 : 14,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.06)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: isDark ? 0.2 : 0.05,
        shadowRadius: 12,
        elevation: 4,
        overflow: 'hidden',
      }]}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: iconColor }} />

        <View style={{
          width: isWideScreen ? 40 : 36, height: isWideScreen ? 40 : 36,
          borderRadius: isWideScreen ? 20 : 18,
          backgroundColor: iconBg,
          alignItems: 'center', justifyContent: 'center',
          marginBottom: isWideScreen ? 14 : 10,
          marginTop: 4,
        }}>
          <Ionicons name={iconName} size={isWideScreen ? 20 : 17} color={iconColor} />
        </View>

        <View style={{
          width: 28, height: 2, borderRadius: 1,
          backgroundColor: iconColor, marginBottom: isWideScreen ? 10 : 8,
          opacity: 0.7,
        }} />

        <Text style={{
          fontSize: isWideScreen ? 9 : 8, fontWeight: '700', letterSpacing: 1,
          color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.4)',
          textTransform: 'uppercase', marginBottom: isWideScreen ? 6 : 4,
        }}>{label}</Text>

        <Text numberOfLines={1} style={{
          fontSize: isWideScreen ? 22 : 17,
          fontWeight: '900', letterSpacing: -0.5,
          color: iconColor,
        }}>{value}</Text>
      </Animated.View>
    </Pressable>
  );
});

/* ─────────────────────────────────────────────────────────────────────────── */
/*  SECTION HEADER                                                             */
/* ─────────────────────────────────────────────────────────────────────────── */
function SectionHeader({ label, delay, styles, isDark, accentColor }: {
  label: string; delay: number; styles: any; isDark: boolean; accentColor?: string;
}) {
  const color = accentColor ?? '#3B82F6';
  return (
    <Animated.View entering={FadeInDown.delay(delay).springify().damping(16)} style={styles.sectionHeaderPill}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <View style={{ width: 4, height: 20, borderRadius: 2, backgroundColor: color, marginRight: 12, flexShrink: 0 }} />
        <Text style={[styles.sectionLabel, { color: isDark ? 'rgba(255,255,255,0.88)' : '#0F172A', letterSpacing: 2 }]}>
          {label.toUpperCase()}
        </Text>
        <View style={{ flex: 1, height: 1, marginLeft: 14, overflow: 'hidden', borderRadius: 1 }}>
          <LinearGradient
            colors={[color + '60', isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.05)', 'transparent']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </Animated.View>
  );
}

function ActivityChip({ label, value, color, delay, styles, isDark, isLast }: {
  label: string; value: string | number; color: string;
  delay: number; styles: any; isDark?: boolean; isLast?: boolean;
}) {
  return (
    <Animated.View
      entering={FadeInUp.delay(delay).springify()}
      style={[
        styles.activityChip,
        { borderRightColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)' },
        isLast ? { borderRightWidth: 0 } : null,
      ]}
    >
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color, marginBottom: 6 }} />
      <Text style={[styles.activityChipValue, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>{value}</Text>
      <Text style={[styles.activityChipLabel, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(15,23,42,0.5)' }]}>{label}</Text>
    </Animated.View>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  TIER LEGEND  — shows which colour = which domain                          */
/* ─────────────────────────────────────────────────────────────────────────── */
function TierLegend({ isDark }: { isDark: boolean }) {
  const entries: { tier: TierKey; name: string }[] = [
    { tier: 'PRIMARY',  name: 'Navigation' },
    { tier: 'FINANCE',  name: 'Finance'    },
    { tier: 'ACADEMIC', name: 'Academic'   },
    { tier: 'OPS',      name: 'Operations' },
    { tier: 'ADMIN',    name: 'Admin'      },
  ];
  return (
    <Animated.View
      entering={FadeInDown.delay(300).springify()}
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
            <LinearGradient
              colors={t.g}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ width: 12, height: 12, borderRadius: 6 }}
            />
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
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  PREMIUM PROGRESS CARD                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */
function PremiumProgressCard({ title, pct, gradientColors, pctColor, isDark, isWideScreen, delay = 0 }: {
  title: string; pct: number; gradientColors: [string, string];
  pctColor: string; isDark: boolean; isWideScreen: boolean; delay?: number;
}) {
  const safeWidth = `${Math.min(Math.max(pct, 0), 100)}%` as any;
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).springify()}
      style={{
        backgroundColor: isDark ? '#141C2E' : '#FFFFFF',
        borderRadius: isWideScreen ? 24 : 20,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.06)',
        padding: isWideScreen ? 24 : 18,
        marginBottom: isWideScreen ? 24 : 16,
        shadowColor: gradientColors[0],
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: isDark ? 0.18 : 0.07,
        shadowRadius: 16,
        elevation: 5,
        overflow: 'hidden',
      }}
    >
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, overflow: 'hidden' }}>
        <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: isWideScreen ? 18 : 14, marginTop: 4 }}>
        <View>
          <Text style={{ fontSize: isWideScreen ? 10 : 9, fontWeight: '800', letterSpacing: 1.5, color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.4)', textTransform: 'uppercase', marginBottom: 4 }}>Progress</Text>
          <Text style={{ fontSize: isWideScreen ? 17 : 15, fontWeight: '800', letterSpacing: -0.3, color: isDark ? '#FFFFFF' : '#0F172A' }}>{title}</Text>
        </View>
        <Text style={{ fontSize: isWideScreen ? 28 : 24, fontWeight: '900', color: pctColor }}>{pct}%</Text>
      </View>

      <View style={{ height: isWideScreen ? 12 : 10, borderRadius: 99, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.07)', overflow: 'hidden' }}>
        <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: '100%', width: safeWidth, borderRadius: 99 }} />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
        <Text style={{ fontSize: 9, fontWeight: '700', color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(15,23,42,0.3)' }}>0%</Text>
        <Text style={{ fontSize: 9, fontWeight: '700', color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(15,23,42,0.3)' }}>100%</Text>
      </View>
    </Animated.View>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  PREMIUM CHART CARD                                                         */
/* ─────────────────────────────────────────────────────────────────────────── */
function PremiumChartCard({ title, subtitle, accentColor, isDark, isWideScreen, delay = 0, children }: {
  title: string; subtitle: string; accentColor: string;
  isDark: boolean; isWideScreen: boolean; delay?: number; children: React.ReactNode;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).springify()}
      style={{
        marginBottom: isWideScreen ? 28 : 20,
        backgroundColor: isDark ? '#141C2E' : '#FFFFFF',
        borderRadius: isWideScreen ? 24 : 20,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.06)',
        overflow: 'hidden',
        shadowColor: accentColor,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: isDark ? 0.15 : 0.07,
        shadowRadius: 20,
        elevation: 6,
      }}
    >
      <View style={{ height: 3, backgroundColor: accentColor }} />

      <View style={{
        paddingHorizontal: isWideScreen ? 24 : 18,
        paddingTop: isWideScreen ? 20 : 16,
        paddingBottom: isWideScreen ? 16 : 12,
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <PulseIndicator color={accentColor} />
          <Text style={{ fontSize: 8, fontWeight: '800', color: accentColor, letterSpacing: 0.8 }}>LIVE</Text>
        </View>
      </View>

      <View style={{ height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)', marginHorizontal: isWideScreen ? 24 : 18 }} />

      <View style={{ paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center' }}>
        {children}
      </View>
    </Animated.View>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  PAGE                                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */
export default function AdminDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const [dashboardData, setDashboardData] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
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

  const webGap = isWideScreen ? 48 : 32;
  const leftColWidth = isWideScreen ? Math.floor((contentWidth - webGap) * 0.4) : contentWidth;
  const rightColWidth = isWideScreen ? Math.floor((contentWidth - webGap) * 0.6) : contentWidth;
  const chartWidth = (isWideScreen ? rightColWidth : contentWidth) - 48;

  const metricGap = isWideScreen ? 12 : 10;
  const metricCardWidth = Math.floor(((isWideScreen ? rightColWidth : contentWidth) - metricGap * 2) / 3) - 1;
  const actionGridGap = isWideScreen ? 12 : GRID_GAP;
  const actionCardWidth = Math.floor((leftColWidth - actionGridGap * 2) / 3) - 1;

  const { financials, attendance, academics, staff, insights } = useAnalytics();

  useEffect(() => { const timer = setInterval(() => setCurrentTime(new Date()), 60000); return () => clearInterval(timer); }, []);

  useEffect(() => {
    if (!user) return;
    const fetchPendingCount = async () => { try { const requests = await AccessControlService.getPendingRequests(); setPendingRequestsCount(requests.length); } catch (e) { console.error(e); } };
    fetchPendingCount();
    const channel = supabase.channel('access_req_badge').on('postgres_changes', { event: '*', schema: 'public', table: 'access_requests' }, fetchPendingCount).subscribe();
    (async () => { try { const data = await AdminService.getDashboardStats({ silent: true }); setDashboardData(data); } catch (err: any) { if (!err?.message?.includes('Student profile not found')) { /* suppress */ } } finally { setLoading(false); } })();
  }, [user]);

  useFocusEffect(React.useCallback(() => {
    const onBackPress = () => { BackHandler.exitApp(); return true; };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, []));
  useEffect(() => { return () => { supabase.removeChannel(supabase.channel('access_req_badge')); }; }, []);

  const { theme, isDark } = useTheme();
  const styles = useMemo(() => getStyles(theme, isDark, isWideScreen), [theme, isDark, isWideScreen]);
  const getGreeting = () => { const h = currentTime.getHours(); if (h < 12) return 'Good Morning'; if (h < 17) return 'Good Afternoon'; return 'Good Evening'; };

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

  /* ─────────────────────────────────────────────────────────────────────── */
  /*  QUICK ACTIONS — card gradients reflect position + operational priority */
  /* ─────────────────────────────────────────────────────────────────────── */
  const quickActions: ActionItem[] = [
    // Row 1: highest-frequency academic workflows
    { title: t('admin_dashboard_v2.academic_structure', 'Academics'),     icon: 'school-outline',              route: '/admin/academics',                   tier: 'PRIMARY',  gradient: ['#172554', '#2563EB'], category: 'Academic',  badge: dashboardData?.diaryEntriesToday ?? 0 },
    { title: 'Class Diary',                                                icon: 'book-outline',                route: '/admin/diary/viewer',                tier: 'PRIMARY',  gradient: ['#0F3A5F', '#0284C7'], category: 'Academic' },
    { title: t('admin_dashboard_v2.timetable_manager', 'Timetable'),      icon: 'calendar-outline',            route: '/admin/timetable',                  tier: 'PRIMARY',  gradient: ['#312E81', '#4F46E5'], category: 'Academic' },

    // Row 2: lower-frequency academic administration
    { title: 'Year Upgrade',                                               icon: 'refresh-circle-outline',      route: '/admin/academic-year-upgrade',      tier: 'PRIMARY',  gradient: ['#1E3A8A', '#7C3AED'], category: 'Academic' },
    { title: t('admin_dashboard_v2.certificates', 'Certs'),               icon: 'ribbon-outline',              route: '/admin/certificate-generator',      tier: 'PRIMARY',  gradient: ['#1E40AF', '#06B6D4'], category: 'Academic' },
    { title: t('admin_dashboard_v2.progress_reports', 'Progress'),        icon: 'stats-chart-outline',         route: '/admin/progress-report-generator',  tier: 'PRIMARY',  gradient: ['#4338CA', '#A855F7'], category: 'Academic' },

    // Finance: money movement gets strong green/amber differentiation
    { title: t('admin_dashboard_v2.expense_tracker', 'Expenses'),         icon: 'receipt-outline',             route: '/admin/expenses',                   tier: 'FINANCE',  gradient: ['#14532D', '#22C55E'], category: 'Finance' },
    { title: t('admin_dashboard_v2.fee_structure', 'Fee Setup'),          icon: 'wallet-outline',              route: '/admin/fees/set-class-fee',         tier: 'FINANCE',  gradient: ['#064E3B', '#14B8A6'], category: 'Finance' },
    { title: 'Fee Adjustments',                                            icon: 'cut-outline',                 route: '/admin/fees/adjustments',           tier: 'FINANCE',  gradient: ['#365314', '#84CC16'], category: 'Finance' },
    { title: 'UPI Settings',                                               icon: 'qr-code-outline',             route: '/admin/upi-settings',               tier: 'FINANCE',  gradient: ['#0F766E', '#06B6D4'], category: 'Finance' },
    { title: 'Dashboard Visibility',                                       icon: 'eye-outline',                 route: '/admin/fees/visibility',            tier: 'FINANCE',  gradient: ['#166534', '#65A30D'], category: 'Finance' },
    { title: 'Payroll',                                                    icon: 'card-outline',                route: '/admin/payroll',                    tier: 'FINANCE',  gradient: ['#312E81', '#6366F1'], category: 'Finance' },

    // Analytics/AI: distinct violet-to-blue highlights
    { title: t('admin_dashboard_v2.view_reports', 'Reports'),             icon: 'bar-chart-outline',           route: '/admin/reports',                    tier: 'ACADEMIC', gradient: ['#581C87', '#7C3AED'], category: 'Analytics' },
    { title: t('admin_dashboard_v2.smart_insights', 'Insights'),          icon: 'bulb-outline',                route: '/admin/smart-insights',             tier: 'ACADEMIC', gradient: ['#4C1D95', '#2563EB'], category: 'AI' },

    // Operations/support: warmer colors, with HR separated from logistics
    { title: t('admin_dashboard_v2.notices', 'Notices'),                  icon: 'megaphone-outline',           route: '/admin/notices',                    tier: 'OPS',      gradient: ['#7C2D12', '#F97316'], category: 'Comms' },
    { title: t('admin_dashboard_v2.complaints', 'Complaints'),            icon: 'chatbubble-ellipses-outline', route: '/admin/complaints',                 tier: 'OPS',      gradient: ['#991B1B', '#F59E0B'], category: 'Support' },
    { title: t('admin_dashboard_v2.transport', 'Transport'),              icon: 'bus-outline',                 route: '/admin/transport',                  tier: 'OPS',      gradient: ['#92400E', '#EAB308'], category: 'Ops' },
    { title: t('admin_dashboard_v2.leaves', 'Leaves'),                    icon: 'document-text-outline',       route: '/admin/leaves',                     tier: 'OPS',      gradient: ['#9A3412', '#FB923C'], category: 'HR' },
    { title: t('admin_dashboard_v2.manage_staff', 'Staff'),               icon: 'people-outline',              route: '/admin/manage-staff',               tier: 'OPS',      gradient: ['#7C3AED', '#EC4899'], category: 'HR' },
    { title: t('admin_dashboard_v2.add_accounts_staff', 'Accounts Portal'), icon: 'wallet-outline',              route: '/admin/add-accounts-staff',         tier: 'OPS',      gradient: ['#BE123C', '#F97316'], category: 'HR' },

    // Admin/security: highest-risk action uses the strongest warning gradient
    { title: 'Access Requests',                                            icon: 'key-outline',                 route: '/admin/access-requests',            tier: 'ADMIN',    gradient: ['#881337', '#E11D48'], category: 'Security', badge: pendingRequestsCount },
  ];

  const sidebarItems = useMemo<WebSidebarActionItem[]>(
    () => quickActions.map((item) => ({
      title: item.title,
      icon: item.icon,
      route: item.route,
      gradient: item.gradient ?? TIER[item.tier].g,
      badge: item.badge,
      category: item.category,
    })),
    [quickActions],
  );

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({ onScroll: (event: any) => { scrollY.value = event.contentOffset.y; } });
  const greetingAnim = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 120], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [0, 120], [0, -22], Extrapolation.CLAMP) }],
  }));

  const carouselRef = React.useRef<FlatList>(null);
  const [activeStatIndex, setActiveStatIndex] = useState(0);

  const matchedNavAction = quickActions.find(
    (q) => pathname === q.route || (q.route.length > 1 && pathname.startsWith(`${q.route}/`)),
  );
  const currentHeaderTitle = matchedNavAction?.title ?? t('Dashboard');

  const onCarouselMomentumEnd = (e: any) => {
    const offset = e.nativeEvent.contentOffset.x;
    const index = Math.round(offset / (CARD_WIDTH + CARD_MARGIN));
    setActiveStatIndex(Math.max(0, Math.min(index, stats.length - 1)));
  };

  /* ─── DASHBOARD BODY ─────────────────────────────────────────────────── */
  const dashboardBody = (
    <View>
      <ResponsiveCard maxWidth={isWideScreen ? contentWidth : 1000}>
        <PaymentDueBanner />

        {/* ── GREETING ── */}
        <Animated.View style={[styles.greetingBlock, greetingAnim]}>
          <Animated.View entering={FadeIn.delay(60).duration(600)} style={styles.eyebrowRow}>
            <Text style={[styles.eyebrowText, { color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.55)' }]}>
              {getGreeting().toUpperCase()}
            </Text>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(100).springify().damping(13)}>
            <Text style={[styles.greetingName, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
              {user?.displayName || 'Admin'}
              <Text style={{ color: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.25)' }}>.</Text>
            </Text>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(160).springify().damping(14)} style={styles.dateRow}>
            <Text style={[styles.dateText, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(15,23,42,0.5)' }]}>
              {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </Text>
            <View style={[styles.dotSep, { backgroundColor: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.25)' }]} />
            <Text style={[styles.timeText, { color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(15,23,42,0.7)' }]}>
              {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </Animated.View>

          {!loading && (
            <Animated.View
              entering={FadeInUp.delay(260).springify()}
              style={[styles.activityRow, { backgroundColor: isDark ? '#141C2E' : '#FFFFFF', borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.06)' }]}
            >
              <ActivityChip label="STUDENTS" value={dashboardData?.totalStudents ?? 0} color="#3B82F6" delay={280} styles={styles} isDark={isDark} />
              <ActivityChip label="ATTENDANCE" value={attendance?.avg_attendance ? `${attendance.avg_attendance}%` : '—'} color="#10B981" delay={320} styles={styles} isDark={isDark} />
              <ActivityChip label="COLLECTED" value={financials?.total_collected ? `₹${(financials.total_collected / 1000).toFixed(0)}K` : '—'} color="#F59E0B" delay={360} styles={styles} isDark={isDark} />
              <ActivityChip label="ISSUES" value={dashboardData?.complaints ?? 0} color="#EF4444" delay={400} styles={styles} isDark={isDark} isLast />
            </Animated.View>
          )}
        </Animated.View>

        {/* ── MAIN LAYOUT ── */}
        <View style={isWideScreen ? styles.webRow : undefined}>

          {/* ── LEFT COLUMN ── */}
          <View style={isWideScreen ? { width: leftColWidth } : undefined}>

            {/* ── HERO STAT CARDS ── */}
            <Animated.View entering={FadeInDown.delay(240).springify()} style={{ marginBottom: isWideScreen ? 32 : 20 }}>
              <SectionHeader label={t('dashboard.overview', 'Overview')} delay={220} styles={styles} isDark={isDark} accentColor="#3B82F6" />
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
                    renderItem={({ item, index }) => (
                      <DashboardCard key={`card-${index}`} index={index} item={item} onPress={() => router.push(item.route as any)} />
                    )}
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

            {/* ── QUICK ACTIONS ── */}
            <SectionHeader label={t('dashboard.quick_actions', 'Quick Actions')} delay={310} styles={styles} isDark={isDark} accentColor="#7C3AED" />
            <TierLegend isDark={isDark} />
            <View style={styles.grid}>
              {quickActions.map((item, index) => (
                <GridItem key={index} item={item} index={index} cardWidth={actionCardWidth} />
              ))}
            </View>

          </View>{/* END LEFT COLUMN */}

          {/* ── RIGHT COLUMN ── */}
          <View style={isWideScreen ? { width: rightColWidth } : undefined}>

            {/* ══ SYSTEM STATUS BAR ══ */}
            <Animated.View
              entering={FadeInDown.delay(270).springify()}
              style={{
                backgroundColor: isDark ? '#141C2E' : '#FFFFFF',
                borderRadius: isWideScreen ? 24 : 20,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.06)',
                paddingHorizontal: isWideScreen ? 24 : 18,
                paddingVertical: isWideScreen ? 18 : 14,
                marginBottom: isWideScreen ? 32 : 24,
                shadowColor: '#10B981',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: isDark ? 0.12 : 0.05,
                shadowRadius: 18,
                elevation: 6,
                overflow: 'hidden',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: '#10B981' }} />

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                <PulseIndicator color="#10B981" />
                <View>
                  <Text style={{ fontSize: isWideScreen ? 8 : 7, fontWeight: '800', letterSpacing: 1.8, color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.4)', textTransform: 'uppercase', marginBottom: 2 }}>STATUS</Text>
                  <Text style={{ fontSize: isWideScreen ? 14 : 13, fontWeight: '800', color: isDark ? '#FFFFFF' : '#0F172A' }}>All Systems Operational</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: isWideScreen ? 24 : 16 }}>
                {[
                  { label: 'TOTAL STAFF', value: staff?.total_staff ?? '--', color: '#3B82F6' },
                  { label: 'ACTIVE', value: staff?.active_staff ?? '--', color: '#10B981' },
                  { label: 'ALERTS', value: insights.length, color: '#EF4444' },
                ].map((kpi, i, arr) => (
                  <React.Fragment key={kpi.label}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: isWideScreen ? 10 : 9, fontWeight: '800', letterSpacing: 1.5, color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.45)', marginBottom: isWideScreen ? 5 : 4, textTransform: 'uppercase' }}>{kpi.label}</Text>
                      <Text style={{ fontSize: isWideScreen ? 22 : 17, fontWeight: '900', color: kpi.color }}>{kpi.value}</Text>
                    </View>
                    {i < arr.length - 1 && (
                      <View style={{ width: 1, height: isWideScreen ? 28 : 20, backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.10)' }} />
                    )}
                  </React.Fragment>
                ))}
              </View>
            </Animated.View>

            {/* ══ FINANCIAL OVERVIEW ══ */}
            <SectionHeader label="Financial Overview" delay={280} styles={styles} isDark={isDark} accentColor="#10B981" />
            <Animated.View entering={FadeInDown.delay(290).springify()}>
              <View style={styles.metricGrid}>
                <MetricCard iconName="wallet" iconColor="#10B981" iconBg={isDark ? 'rgba(16,185,129,0.15)' : '#ECFDF5'} value={financials ? `₹${(financials.total_collected / 1000).toFixed(1)}K` : '--'} label="Collected" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
                <MetricCard iconName="alert-circle" iconColor="#EF4444" iconBg={isDark ? 'rgba(239,68,68,0.15)' : '#FEF2F2'} value={financials ? `₹${(financials.outstanding_dues / 1000).toFixed(1)}K` : '--'} label="Outstanding" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
                <MetricCard iconName="trending-up" iconColor="#3B82F6" iconBg={isDark ? 'rgba(59,130,246,0.15)' : '#EFF6FF'} value={financials ? `${financials.collection_efficiency}%` : '--'} label="Efficiency" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
                <MetricCard iconName="receipt" iconColor="#8B5CF6" iconBg={isDark ? 'rgba(139,92,246,0.15)' : '#F3E8FF'} value={financials ? `₹${(financials.total_invoiced / 1000).toFixed(1)}K` : '--'} label="Invoiced" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
                <MetricCard iconName="pricetag" iconColor="#F59E0B" iconBg={isDark ? 'rgba(245,158,11,0.15)' : '#FFFBEB'} value={financials ? `₹${(financials.discount_given / 1000).toFixed(1)}K` : '--'} label="Discounts" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
                <MetricCard iconName="return-up-back" iconColor="#06B6D4" iconBg={isDark ? 'rgba(6,182,212,0.15)' : '#ECFEFF'} value={financials ? `₹${(financials.refunds_issued / 1000).toFixed(1)}K` : '--'} label="Refunds" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
              </View>

              <PremiumProgressCard
                title="Collection Efficiency"
                pct={financials?.collection_efficiency ?? 0}
                gradientColors={['#10B981', '#34D399']}
                pctColor="#10B981"
                isDark={isDark} isWideScreen={isWideScreen} delay={295}
              />
            </Animated.View>

            {/* ── REVENUE TREND CHART ── */}
            <PremiumChartCard title="Revenue Trend" subtitle="Monthly fee collection" accentColor="#3B82F6" isDark={isDark} isWideScreen={isWideScreen} delay={310}>
              <LineChart
                data={(financials?.trend?.length ? financials.trend.map(t => ({ ...t, value: Number(t.value) })) : [{ value: 0 }])}
                height={isWideScreen ? 200 : 120} width={chartWidth}
                color="#3B82F6" thickness={2.5}
                startFillColor="rgba(59,130,246,0.22)" endFillColor="rgba(59,130,246,0.01)"
                startOpacity={1} endOpacity={0} initialSpacing={12} noOfSections={4}
                dataPointsColor="#3B82F6" dataPointsRadius={3}
                yAxisThickness={0} xAxisThickness={0}
                yAxisTextStyle={{ color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(15,23,42,0.3)', fontSize: 9 }}
                xAxisLabelTextStyle={{ color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.4)', fontSize: 9 }}
                rulesColor={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)'}
                curved animationDuration={800} isAnimated
              />
            </PremiumChartCard>

            {/* ══ ATTENDANCE ANALYTICS ══ */}
            <SectionHeader label="Attendance Analytics" delay={320} styles={styles} isDark={isDark} accentColor="#10B981" />
            <Animated.View entering={FadeInDown.delay(330).springify()}>
              <View style={styles.metricGrid}>
                <MetricCard iconName="people" iconColor="#3B82F6" iconBg={isDark ? 'rgba(59,130,246,0.15)' : '#EFF6FF'} value={attendance ? `${attendance.avg_attendance}%` : '--'} label="Avg Attendance" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
                <MetricCard iconName="warning" iconColor="#F59E0B" iconBg={isDark ? 'rgba(245,158,11,0.15)' : '#FFFBEB'} value={attendance ? String(attendance.chronic_absentees) : '--'} label="At Risk (<75%)" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
                <MetricCard iconName="calendar" iconColor="#10B981" iconBg={isDark ? 'rgba(16,185,129,0.15)' : '#ECFDF5'} value={attendance ? String(attendance.total_working_days) : '--'} label="Working Days" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
                <MetricCard iconName="id-card" iconColor="#8B5CF6" iconBg={isDark ? 'rgba(139,92,246,0.15)' : '#F3E8FF'} value={attendance ? `${attendance.staff_attendance}%` : '--'} label="Staff Att." width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
              </View>
            </Animated.View>

            {/* ── ATTENDANCE TREND CHART ── */}
            <PremiumChartCard title="Attendance Trend" subtitle="Daily attendance percentage" accentColor="#10B981" isDark={isDark} isWideScreen={isWideScreen} delay={340}>
              <LineChart
                data={(attendance?.trend?.length ? attendance.trend.map(t => ({ ...t, value: Number(t.value) })) : [{ value: 0 }])}
                height={isWideScreen ? 200 : 120} width={chartWidth}
                color="#10B981" thickness={2.5}
                startFillColor="rgba(16,185,129,0.22)" endFillColor="rgba(16,185,129,0.01)"
                startOpacity={1} endOpacity={0} initialSpacing={12} noOfSections={4}
                dataPointsColor="#10B981" dataPointsRadius={3}
                yAxisThickness={0} xAxisThickness={0}
                yAxisTextStyle={{ color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(15,23,42,0.3)', fontSize: 9 }}
                xAxisLabelTextStyle={{ color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.4)', fontSize: 9 }}
                rulesColor={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)'}
                curved animationDuration={800} isAnimated
              />
            </PremiumChartCard>

            {/* ══ ACADEMIC PERFORMANCE ══ */}
            <SectionHeader label="Academic Performance" delay={360} styles={styles} isDark={isDark} accentColor="#8B5CF6" />
            <Animated.View entering={FadeInDown.delay(370).springify()}>
              <View style={styles.metricGrid}>
                <MetricCard iconName="ribbon" iconColor="#8B5CF6" iconBg={isDark ? 'rgba(139,92,246,0.15)' : '#F3E8FF'} value={academics ? `${academics.avg_score}%` : '--'} label="Avg Score" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
                <MetricCard iconName="checkmark-circle" iconColor="#10B981" iconBg={isDark ? 'rgba(16,185,129,0.15)' : '#ECFDF5'} value={academics ? `${academics.pass_rate}%` : '--'} label="Pass Rate" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
                <MetricCard iconName="trophy" iconColor="#3B82F6" iconBg={isDark ? 'rgba(59,130,246,0.15)' : '#EFF6FF'} value={academics?.top_subject ?? '--'} label="Top Subject" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
                <MetricCard iconName="trending-down" iconColor="#EF4444" iconBg={isDark ? 'rgba(239,68,68,0.15)' : '#FEF2F2'} value={academics?.weakest_subject ?? '--'} label="Needs Focus" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
                <MetricCard iconName="document-text" iconColor="#06B6D4" iconBg={isDark ? 'rgba(6,182,212,0.15)' : '#ECFEFF'} value={academics ? String(academics.exams_conducted) : '--'} label="Exams" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
              </View>

              <PremiumProgressCard
                title="Pass Rate"
                pct={academics?.pass_rate ?? 0}
                gradientColors={['#8B5CF6', '#A78BFA']}
                pctColor="#8B5CF6"
                isDark={isDark} isWideScreen={isWideScreen} delay={375}
              />
            </Animated.View>

            {/* ── SCORE TREND CHART ── */}
            <PremiumChartCard title="Score Trend" subtitle="Exam average over time" accentColor="#8B5CF6" isDark={isDark} isWideScreen={isWideScreen} delay={380}>
              <BarChart
                data={(academics?.trend?.length ? academics.trend.map(t => ({ value: Number(t.value), label: t.label, frontColor: '#8B5CF6' })) : [{ value: 0, label: '', frontColor: '#8B5CF6' }])}
                height={isWideScreen ? 160 : 100} width={chartWidth}
                barWidth={20} barBorderRadius={4} noOfSections={4} maxValue={100}
                yAxisThickness={0} xAxisThickness={0}
                yAxisTextStyle={{ color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(15,23,42,0.3)', fontSize: 9 }}
                xAxisLabelTextStyle={{ color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.4)', fontSize: 9 }}
                rulesColor={isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)'}
                showGradient gradientColor="rgba(139,92,246,0.2)"
                animationDuration={800} isAnimated
              />
            </PremiumChartCard>

            {/* ══ STAFF OVERVIEW ══ */}
            <SectionHeader label="Staff Overview" delay={400} styles={styles} isDark={isDark} accentColor="#F59E0B" />
            <Animated.View entering={FadeInDown.delay(410).springify()}>
              <View style={styles.metricGrid}>
                <MetricCard iconName="people-circle" iconColor="#F59E0B" iconBg={isDark ? 'rgba(245,158,11,0.15)' : '#FFFBEB'} value={staff ? String(staff.total_staff) : '--'} label="Total Staff" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
                <MetricCard iconName="moon" iconColor="#EF4444" iconBg={isDark ? 'rgba(239,68,68,0.15)' : '#FEF2F2'} value={staff ? String(staff.on_leave_today) : '--'} label="On Leave" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
                <MetricCard iconName="person-add" iconColor="#06B6D4" iconBg={isDark ? 'rgba(6,182,212,0.15)' : '#ECFEFF'} value={staff ? String(staff.new_joinings) : '--'} label="New Joins" width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
                <MetricCard iconName="calendar" iconColor="#3B82F6" iconBg={isDark ? 'rgba(59,130,246,0.15)' : '#EFF6FF'} value={staff ? `${staff.avg_staff_attendance}%` : '--'} label="Staff Att." width={metricCardWidth} isDark={isDark} isWideScreen={isWideScreen} />
              </View>

              <PremiumProgressCard
                title="Staff Attendance Rate"
                pct={staff?.avg_staff_attendance ?? 0}
                gradientColors={['#3B82F6', '#60A5FA']}
                pctColor="#3B82F6"
                isDark={isDark} isWideScreen={isWideScreen} delay={415}
              />
            </Animated.View>

            {/* ══ ACTIVE ALERTS ══ */}
            {insights.length > 0 && (
              <>
                <SectionHeader label="Active Alerts" delay={430} styles={styles} isDark={isDark} accentColor="#EF4444" />
                {insights.slice(0, 3).map((ins, idx) => {
                  const sevColor = ins.severity === 'high' ? '#EF4444' : ins.severity === 'medium' ? '#F59E0B' : '#3B82F6';
                  const sevBg = ins.severity === 'high' ? 'rgba(239,68,68,0.10)' : ins.severity === 'medium' ? 'rgba(245,158,11,0.10)' : 'rgba(59,130,246,0.10)';
                  const sevIcon: IconName = ins.severity === 'high' ? 'alert-circle' : ins.severity === 'medium' ? 'warning' : 'information-circle';
                  return (
                    <Animated.View
                      key={ins.id}
                      entering={FadeInDown.delay(440 + idx * 60).springify()}
                      style={{
                        backgroundColor: isDark ? '#141C2E' : '#FFFFFF',
                        borderRadius: isWideScreen ? 20 : 18,
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.06)',
                        marginBottom: isWideScreen ? 14 : 10,
                        overflow: 'hidden',
                        shadowColor: sevColor,
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: isDark ? 0.15 : 0.07,
                        shadowRadius: 12,
                        elevation: 4,
                        flexDirection: 'row',
                      }}
                    >
                      <View style={{ width: 5, backgroundColor: sevColor, borderTopLeftRadius: isWideScreen ? 20 : 18, borderBottomLeftRadius: isWideScreen ? 20 : 18 }} />
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: isWideScreen ? 16 : 14, paddingHorizontal: isWideScreen ? 16 : 12 }}>
                        <View style={{
                          width: isWideScreen ? 42 : 36, height: isWideScreen ? 42 : 36,
                          borderRadius: isWideScreen ? 12 : 10, backgroundColor: sevBg,
                          alignItems: 'center', justifyContent: 'center', marginRight: isWideScreen ? 14 : 10, flexShrink: 0,
                        }}>
                          <Ionicons name={sevIcon} size={isWideScreen ? 19 : 16} color={sevColor} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                            <View style={{ backgroundColor: sevBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                              <Text style={{ fontSize: isWideScreen ? 9 : 8, fontWeight: '800', letterSpacing: 1, color: sevColor }}>{ins.severity.toUpperCase()}</Text>
                            </View>
                            <View style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.05)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                              <Text style={{ fontSize: isWideScreen ? 9 : 8, fontWeight: '700', color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(15,23,42,0.5)', textTransform: 'uppercase' }}>{ins.category}</Text>
                            </View>
                          </View>
                          <Text style={{ fontSize: isWideScreen ? 14 : 12, fontWeight: '600', color: isDark ? '#FFFFFF' : '#0F172A', lineHeight: isWideScreen ? 20 : 18 }}>
                            {ins.message}
                          </Text>
                        </View>
                      </View>
                    </Animated.View>
                  );
                })}
              </>
            )}

          </View>{/* END RIGHT COLUMN */}
        </View>{/* END WEB ROW */}

        <View style={{ height: 48 }} />
      </ResponsiveCard>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={{ flex: 1, backgroundColor: 'transparent' }} />
      </View>

      <AdminHeader
        title={currentHeaderTitle}
        showNotification
        scrollY={scrollY}
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
          >
            {dashboardBody}
          </Animated.ScrollView>
        </View>
      ) : (
        <>
          <Animated.ScrollView
            contentContainerStyle={[styles.content, { paddingTop: mobileHeaderOffset }]}
            showsVerticalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
          >
            {dashboardBody}
          </Animated.ScrollView>

          <DashboardMenuOverlay
            isOpen={isMenuOpen}
            onClose={() => setIsMenuOpen(false)}
            activeRoute={null}
            items={quickActions}
            onItemPress={(route) => {
              setIsMenuOpen(false);
              setTimeout(() => router.push(route as any), 300);
            }}
          />
        </>
      )}
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  STYLES                                                                     */
/* ─────────────────────────────────────────────────────────────────────────── */
const getStyles = (theme: Theme, isDark: boolean, isWide = false) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    content: { paddingHorizontal: isWide ? 24 : CONTAINER_PADDING, paddingBottom: 48 },
    webRow: { flexDirection: 'row', justifyContent: 'space-between', gap: isWide ? 48 : 32 } as any,

    greetingBlock: { marginBottom: 36, paddingTop: 12, paddingHorizontal: 2 },
    eyebrowRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    eyebrowText: { fontSize: 11, fontWeight: '700', letterSpacing: 2.5 },
    greetingName: { fontSize: SCREEN_WIDTH < 380 ? 36 : 42, fontWeight: '900', letterSpacing: -1.5, lineHeight: SCREEN_WIDTH < 380 ? 42 : 48, marginBottom: 12 },
    dateRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
    dateText: { fontSize: 13, fontWeight: '500', letterSpacing: 0.1 },
    dotSep: { width: 3, height: 3, borderRadius: 1.5, marginHorizontal: 10 },
    timeText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },

    activityRow: {
      flexDirection: 'row', alignItems: 'center',
      borderRadius: 20, paddingVertical: 14, paddingHorizontal: 6,
      borderWidth: 1,
      shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.25 : 0.04, shadowRadius: 10, elevation: 4,
    },
    activityChip: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, paddingVertical: 4 },
    activityChipValue: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
    activityChipLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },

    sectionHeaderPill: {
      flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch',
      marginBottom: isWide ? 24 : 16, paddingVertical: isWide ? 10 : 6,
      paddingHorizontal: isWide ? 10 : 2,
    },
    sectionLabel: { fontSize: isWide ? 11 : 10, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },

    statsContainer: { paddingRight: CONTAINER_PADDING, paddingBottom: 4 },
    statCardWrapper: { width: CARD_WIDTH, marginRight: CARD_MARGIN },

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
      overflow: 'hidden',
      backgroundColor: isDark ? '#111827' : '#1E293B',
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
      textShadowColor: 'rgba(0,0,0,0.25)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },

    gridBadge: {
      position: 'absolute', top: 9, right: 9,
      minWidth: 22, height: 22,
      borderRadius: 11, paddingHorizontal: 6,
      alignItems: 'center', justifyContent: 'center',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.65, shadowRadius: 6, elevation: 8, zIndex: 10,
      borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.72)',
    },
    gridBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: 0.2 },
  });