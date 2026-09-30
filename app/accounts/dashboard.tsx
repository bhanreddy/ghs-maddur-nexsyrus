import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, StatusBar, RefreshControl,
  Pressable, Platform, useWindowDimensions,
  TextInput,
} from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, {
  FadeInDown,
  useAnimatedStyle, useSharedValue,
  withSpring, withTiming, withRepeat, withSequence,
  interpolate,
  cancelAnimation,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from '@/src/utils/haptics';
import AdminHeader from '../../src/components/AdminHeader';
import DashboardMenuOverlay from '../../src/components/DashboardMenuOverlay';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/hooks/useAuth';
import { usePermissions } from '../../src/hooks/usePermissions';
import { useApiQuery } from '../../src/hooks/useApiQuery';
import { usePersistedSWR } from '../../src/hooks/usePersistedSWR';
import { AnalyticsData } from '../../src/services/analyticsService';
import { FeeService } from '../../src/services/feeService';
import { useTheme } from '../../src/hooks/useTheme';
import { useAccountsWebChrome } from '../../src/contexts/AccountsWebChromeContext';
import { LineChart } from 'react-native-gifted-charts';
import PaymentDueBanner from '../../src/components/PaymentDueBanner';
import AccountsHero from '../../src/components/accounts-hero/AccountsHero';
import { ACCOUNTS_STAT_KEYS, normalizeAccountsDashboardConfig } from '../../src/utils/constants';
import { DASHBOARD_SIDEBAR_EXPANDED } from '../../src/components/DashboardWebSidebar';
import { schoolStoriesService, type SchoolStoryAuthor } from '../../src/services/schoolStoriesService';
import { schoolHeroSlidesService, type HeroSlideItem } from '../../src/services/schoolHeroSlidesService';
import { clayTokens, getDashboardTokens, type DashboardTokens } from '../../src/styles/clayTokens';
import { Springs } from '../../src/utils/motion';
import { SCHOOL_CONFIG, schoolColorWithAlpha } from '../../src/constants/schoolConfig';
import { usePopupUnreadCount } from '../../src/features/popups/popupUnreadStore';

const IS_WEB = Platform.OS === 'web';
const IS_ANDROID = Platform.OS === 'android';
const DASHBOARD_CACHE_TTL_MS = 60 * 1000;
const enter = (delay = 0) => (IS_ANDROID ? undefined : FadeInDown.delay(delay).duration(420));

type ActionGroupId = 'collections' | 'control' | 'people' | 'academic';

type IonIcon = keyof typeof Ionicons.glyphMap;

const GROUP_THEME: Record<
  ActionGroupId,
  { chipLabel: string; sectionLabel: string; icon: IonIcon; color: string; soft: string; border: string }
> = {
  collections: {
    chipLabel: 'Fees',
    sectionLabel: 'Fees & payments',
    icon: 'cash-outline',
    color: '#2563EB',
    soft: 'rgba(37, 99, 235, 0.16)',
    border: 'rgba(37, 99, 235, 0.32)',
  },
  control: {
    chipLabel: 'Checks',
    sectionLabel: 'Dues & adjustments',
    icon: 'shield-checkmark-outline',
    color: '#EA580C',
    soft: 'rgba(234, 88, 12, 0.16)',
    border: 'rgba(234, 88, 12, 0.32)',
  },
  people: {
    chipLabel: 'People',
    sectionLabel: 'Staff & students',
    icon: 'people-outline',
    color: '#7C3AED',
    soft: 'rgba(124, 58, 237, 0.16)',
    border: 'rgba(124, 58, 237, 0.32)',
  },
  academic: {
    chipLabel: 'School',
    sectionLabel: 'Exams & certificates',
    icon: 'school-outline',
    color: '#0891B2',
    soft: 'rgba(8, 145, 178, 0.16)',
    border: 'rgba(8, 145, 178, 0.32)',
  },
};

const ACTION_GROUPS: { id: ActionGroupId; label: string }[] = (
  Object.entries(GROUP_THEME) as [ActionGroupId, typeof GROUP_THEME[ActionGroupId]][]
).map(([id, theme]) => ({ id, label: theme.chipLabel }));

/** Per-tool jewel hues — each desk tile gets its own colour identity. */
const ACTION_TILE_PALETTE: Record<string, { color: string }> = {
  collect: { color: '#2563EB' },
  today_collection: { color: '#059669' },
  receipts: { color: '#7C3AED' },
  defaulters: { color: '#DC2626' },
  fee_due_slips: { color: '#EA580C' },
  transport_fees: { color: '#0284C7' },
  invoices: { color: '#4F46E5' },
  payroll: { color: '#DB2777' },
  leaves: { color: '#EA580C' },
  student: { color: '#0D9488' },
  exams: { color: '#4F46E5' },
  fines: { color: '#D97706' },
  expenses: { color: '#E11D48' },
  users_clients: { color: '#9333EA' },
  student_login_qr: { color: '#7C3AED' },
  staff: { color: '#C026D3' },
  hostel_students: { color: '#DB2777' },
  marks_export: { color: '#0891B2' },
  certificates: { color: '#0F766E' },
};

const SPOTLIGHT_IDS = ['collect', 'today_collection', 'receipts', 'defaulters'] as const;

const QUICK_JUMP_IDS = ['collect', 'today_collection', 'receipts', 'fee_due_slips'] as const;

type ClayTileName = keyof typeof clayTokens.colors.tiles;

/** Jewel clay fills + short category tags — same language as staff MenuCard. */
const ACTION_CLAY: Record<string, { tile: ClayTileName; category: string }> = {
  collect: { tile: 'sapphire', category: 'PAY' },
  today_collection: { tile: 'forest', category: 'TODAY' },
  fee_due_slips: { tile: 'copper', category: 'NOTICES' },
  receipts: { tile: 'plum', category: 'HISTORY' },
  fines: { tile: 'ochre', category: 'FINANCE' },
  users_clients: { tile: 'plum', category: 'DIRECTORY' },
  student_login_qr: { tile: 'navy', category: 'ACCESS' },
  expenses: { tile: 'burgundy', category: 'SPEND' },
  payroll: { tile: 'rosewood', category: 'PAY' },
  staff: { tile: 'rosewood', category: 'ENROL' },
  student: { tile: 'teal', category: 'ENROL' },
  defaulters: { tile: 'burgundy', category: 'DUES' },
  transport_fees: { tile: 'teal', category: 'BUS' },
  hostel_students: { tile: 'bronze', category: 'HOSTEL' },
  invoices: { tile: 'indigo', category: 'BILLS' },
  exams: { tile: 'sapphire', category: 'EXAMS' },
  marks_export: { tile: 'teal', category: 'EXPORT' },
  certificates: { tile: 'forest', category: 'DOCS' },
};

const GROUP_CLAY_DEFAULT: Record<ActionGroupId, { tile: ClayTileName; category: string }> = {
  collections: { tile: 'sapphire', category: 'FEES' },
  control: { tile: 'ochre', category: 'CHECKS' },
  people: { tile: 'plum', category: 'PEOPLE' },
  academic: { tile: 'navy', category: 'SCHOOL' },
};

const REST_GAP = 16;

function resolveActionClay(item: { id: string; group: ActionGroupId }, isDark: boolean) {
  const mapped = ACTION_CLAY[item.id] ?? GROUP_CLAY_DEFAULT[item.group];
  const tile = clayTokens.colors.tiles[mapped.tile];
  return {
    bg: isDark ? tile.dark : tile.bg,
    shadowColor: tile.shadow,
    category: mapped.category,
  };
}

// ─── Format Helpers ───────────────────────────────────────────────────────────
const formatCurrencyShort = (value: number) => {
  if (!value) return '₹0';
  if (value >= 10000000) return `₹${+(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${+(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${+(value / 1000).toFixed(1)}K`;
  return `₹${value.toLocaleString('en-IN')}`;
};

const formatTxWhen = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const startThat = new Date(d);
  startThat.setHours(0, 0, 0, 0);
  const diff = Math.round((startToday.getTime() - startThat.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return `${diff} days ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const webCursor = IS_WEB ? ({ cursor: 'pointer' } as const) : null;

function useDeskCardMotion() {
  const pressScale = useSharedValue(1);
  const hoverLift = useSharedValue(0);

  const cardStyle = useAnimatedStyle(() => {
    const hoverScale = IS_WEB ? interpolate(hoverLift.value, [0, 1], [1, 1.018]) : 1;
    const y = IS_WEB ? interpolate(hoverLift.value, [0, 1], [0, -6]) : 0;
    return { transform: [{ translateY: y }, { scale: pressScale.value * hoverScale }] };
  });

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(hoverLift.value, [0, 1], [0, 6]) }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(hoverLift.value, [0, 1], [1, 1.1]) }],
  }));

  const washStyle = useAnimatedStyle(() => ({
    opacity: interpolate(hoverLift.value, [0, 1], [0, 1]),
  }));

  const onPressIn = useCallback(() => {
    pressScale.value = withSpring(0.97, Springs.cardPress);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [pressScale]);

  const onPressOut = useCallback(() => {
    pressScale.value = withSpring(1, Springs.cardRelease);
  }, [pressScale]);

  const onHoverIn = useCallback(() => {
    if (!IS_WEB) return;
    hoverLift.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
  }, [hoverLift]);

  const onHoverOut = useCallback(() => {
    if (!IS_WEB) return;
    hoverLift.value = withTiming(0, { duration: 240, easing: Easing.out(Easing.cubic) });
  }, [hoverLift]);

  return { cardStyle, chevronStyle, iconStyle, washStyle, onPressIn, onPressOut, onHoverIn, onHoverOut };
}

const webCardShadow = (
  accent: string,
  hovered: boolean,
  pressed: boolean,
  tokens: DashboardTokens,
  clickable = true,
): any => {
  if (!IS_WEB) return null;
  const rest = {
    cursor: clickable ? 'pointer' : 'auto',
    transition: 'box-shadow 200ms ease, border-color 180ms ease, background-color 180ms ease, transform 200ms ease',
  };
  if (!clickable) return { ...rest, boxShadow: tokens.shadows.cardRestWeb };
  if (pressed) return { ...rest, boxShadow: tokens.shadows.cardPressedWeb };
  if (hovered) {
    return {
      ...rest,
      boxShadow: `0 22px 44px -12px ${schoolColorWithAlpha(accent, 0.42)}, 0 10px 20px -8px ${schoolColorWithAlpha(accent, 0.28)}, inset 0 1px 0 rgba(255,255,255,0.78)`,
    };
  }
  return { ...rest, boxShadow: tokens.shadows.cardRestWeb };
};

// ─── Layout hook ──────────────────────────────────────────────────────────────
function useLayout(shellActive: boolean) {
  const { width: winW } = useWindowDimensions();
  const isWeb = IS_WEB && shellActive;

  const contentW = isWeb ? Math.max(0, winW - DASHBOARD_SIDEBAR_EXPANDED - 56) : winW;
  const CARD_H_PAD = isWeb ? 0 : 20;

  return { isWeb, contentW, CARD_H_PAD, winW };
}

// ─── Shared Shimmer Skeleton (Single Root Clock) ──────────────────────────────
const ShimmerBox = ({
  width,
  height,
  borderRadius = 16,
  style,
  clock,
  tokens,
}: {
  width: number | string;
  height: number;
  borderRadius?: 16 | 24;
  style?: any;
  clock: SharedValue<number>;
  tokens: DashboardTokens;
}) => {
  const animStyle = useAnimatedStyle(() => ({
    opacity: interpolate(clock.value, [0, 1], [0.28, 0.68]),
  }));

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: tokens.isDark ? tokens.colors.innerPanel : tokens.colors.innerBorder,
        },
        animStyle,
        style,
      ]}
    />
  );
};

const SurfaceCard = ({
  tokens,
  children,
  style,
  padding = 18,
}: {
  tokens: DashboardTokens;
  children: React.ReactNode;
  style?: any;
  padding?: number;
}) => (
  <View
    style={[
      {
        borderRadius: tokens.radii.card,
        backgroundColor: tokens.colors.surface,
        borderWidth: 1,
        borderColor: tokens.colors.surfaceBorder,
        overflow: 'hidden',
        position: 'relative',
        padding,
      },
      tokens.shadows.card,
      style,
    ]}
  >
    <LinearGradient
      colors={tokens.colors.sheen}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.6, y: 0.9 }}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 16,
        right: 16,
        height: 1.5,
        backgroundColor: tokens.colors.surfaceBorderHighlight,
        borderRadius: 1,
      }}
    />
    {children}
  </View>
);

const SectionHeader = ({
  title,
  subtitle,
  accent,
  tokens,
  right,
  icon,
}: {
  title: string;
  subtitle?: string;
  accent: string;
  tokens: DashboardTokens;
  right?: React.ReactNode;
  icon?: IonIcon;
}) => (
  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, gap: 10 }}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, minWidth: 0, flex: 1 }}>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: tokens.radii.control,
          backgroundColor: `${accent}18`,
          borderWidth: 1,
          borderColor: `${accent}30`,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}
      >
        {icon ? (
          <Ionicons name={icon} size={17} color={accent} />
        ) : (
          <View style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: accent }} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={2}
          style={{
            fontSize: tokens.typography.sizes.md,
            fontWeight: tokens.typography.weights.display,
            color: tokens.colors.textPrimary,
            letterSpacing: -0.3,
          }}
        >
          {title}
        </Text>
        {!!subtitle && (
          <Text
            numberOfLines={2}
            style={{
              fontSize: tokens.typography.sizes.xs,
              fontWeight: tokens.typography.weights.body,
              color: tokens.colors.textSecondary,
              marginTop: 3,
              lineHeight: 17,
            }}
          >
            {subtitle}
          </Text>
        )}
      </View>
    </View>
    {right}
  </View>
);

const MiniSparkline = ({ values, color, height = 28 }: { values: number[]; color: string; height?: number }) => {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const barW = values.length > 8 ? 3 : 4;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height, marginTop: 10 }}>
      {values.slice(-10).map((v, i) => (
        <View
          key={i}
          style={{
            width: barW,
            height: Math.max(3, Math.round((v / max) * height)),
            borderRadius: 2,
            backgroundColor: color,
            opacity: 0.28 + (i / Math.max(values.length - 1, 1)) * 0.72,
          }}
        />
      ))}
    </View>
  );
};

const ProgressTrack = ({
  value,
  color,
  track,
}: {
  value: number;
  color: string;
  track: string;
}) => (
  <View style={{ height: 5, borderRadius: 99, backgroundColor: track, overflow: 'hidden', marginTop: 10 }}>
    <View
      style={{
        width: `${Math.max(0, Math.min(100, value))}%`,
        height: '100%',
        borderRadius: 99,
        backgroundColor: color,
      }}
    />
  </View>
);

// ─── Pulsing Live Dot (UI Thread Reanimated Worklet) ───────────────────────────
const PulsingLiveDot = ({ color }: { color: string }) => {
  const pulse = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1.8, { duration: 700 }), withTiming(1, { duration: 700 })),
      -1,
      false
    );
    opacity.value = withRepeat(
      withSequence(withTiming(0.25, { duration: 700 }), withTiming(1, { duration: 700 })),
      -1,
      false
    );
    return () => {
      cancelAnimation(pulse);
      cancelAnimation(opacity);
    };
  }, [pulse, opacity]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={{ width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: 12,
            height: 12,
            borderRadius: 6,
            borderWidth: 1.5,
            borderColor: color,
          },
          ringStyle,
        ]}
      />
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
};

// ─── Unified Stat Card ────────────────────────────────────────────────────────
interface StatCardItem {
  id: string;
  label: string;
  value: string;
  icon: string;
  tag: string;
  hint?: string;
  showLive?: boolean;
  progress?: number | null;
  sparkline?: number[];
  route?: string;
  accentColor: string;
  accentSoft: string;
  accentBorder: string;
}

const DashboardStatCard = memo(({
  card,
  loading,
  tokens,
  clock,
  style,
  router,
}: {
  card: StatCardItem;
  loading: boolean;
  tokens: DashboardTokens;
  clock: SharedValue<number>;
  style?: any;
  router: any;
}) => {
  const { cardStyle, iconStyle, washStyle, onPressIn, onPressOut, onHoverIn, onHoverOut } = useDeskCardMotion();

  const onPress = useCallback(() => {
    if (!card.route) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(card.route);
  }, [card.route, router]);

  return (
    <Animated.View style={[{ minWidth: 0 }, cardStyle, style]}>
      <Pressable
        onPress={card.route ? onPress : undefined}
        onPressIn={card.route ? onPressIn : undefined}
        onPressOut={card.route ? onPressOut : undefined}
        onHoverIn={card.route ? onHoverIn : undefined}
        onHoverOut={card.route ? onHoverOut : undefined}
        disabled={!card.route}
        style={({ pressed, hovered }: any) => [
          {
            borderRadius: tokens.radii.card,
            backgroundColor: tokens.colors.surface,
            borderWidth: 1.5,
            borderColor: hovered ? card.accentBorder : schoolColorWithAlpha(card.accentColor, tokens.isDark ? 0.28 : 0.18),
            position: 'relative',
            padding: 18,
            justifyContent: 'space-between',
            minHeight: 148,
          },
          tokens.shadows.card,
          webCardShadow(card.accentColor, !!hovered, !!pressed, tokens, !!card.route),
        ]}
      >
        <View
          pointerEvents="none"
          style={{
            ...StyleSheet.absoluteFillObject,
            borderRadius: tokens.radii.card,
            overflow: 'hidden',
          }}
        >
          <LinearGradient
            colors={[card.accentSoft, tokens.colors.sheen[0], tokens.colors.sheen[1]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Animated.View style={[StyleSheet.absoluteFill, washStyle]}>
            <LinearGradient
              colors={[schoolColorWithAlpha(card.accentColor, tokens.isDark ? 0.32 : 0.22), 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <View
            style={{
              position: 'absolute',
              right: -24,
              bottom: -24,
              width: 96,
              height: 96,
              borderRadius: 48,
              backgroundColor: card.accentColor,
              opacity: tokens.isDark ? 0.18 : 0.14,
            }}
          />
        </View>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            top: 16,
            bottom: 16,
            width: 5,
            borderRadius: 3,
            backgroundColor: card.accentColor,
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 16,
            right: 16,
            height: 1.5,
            backgroundColor: tokens.colors.surfaceBorderHighlight,
            borderRadius: 1,
          }}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 2, paddingLeft: 8 }}>
          <Animated.View
            style={[
              {
                width: 42,
                height: 42,
                borderRadius: tokens.radii.control,
                backgroundColor: card.accentColor,
                alignItems: 'center',
                justifyContent: 'center',
              },
              iconStyle,
            ]}
          >
            <FontAwesome5 name={card.icon} size={15} color="#FFFFFF" />
          </Animated.View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {card.showLive && !loading && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <PulsingLiveDot color={tokens.colors.semantic.success} />
                <Text
                  style={{
                    fontSize: tokens.typography.sizes.xs,
                    fontWeight: tokens.typography.weights.display,
                    color: tokens.colors.semantic.success,
                    letterSpacing: 1.1,
                  }}
                >
                  LIVE
                </Text>
              </View>
            )}
            <View
              style={{
                backgroundColor: card.accentColor,
                borderRadius: tokens.radii.control,
                paddingHorizontal: 9,
                paddingVertical: 4,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: tokens.typography.weights.display,
                  color: '#FFFFFF',
                  letterSpacing: 0.7,
                  textTransform: 'uppercase',
                }}
              >
                {card.tag}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ marginTop: 14, zIndex: 2, paddingLeft: 8 }}>
          <Text
            style={{
              fontSize: tokens.typography.sizes.sm,
              fontWeight: tokens.typography.weights.body,
              color: tokens.colors.textSecondary,
              letterSpacing: 0.15,
              marginBottom: 4,
            }}
          >
            {card.label}
          </Text>

          {loading ? (
            <ShimmerBox width={120} height={30} borderRadius={tokens.radii.control} clock={clock} tokens={tokens} style={{ marginTop: 2 }} />
          ) : (
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{
                fontSize: tokens.typography.sizes.display,
                fontWeight: tokens.typography.weights.display,
                color: tokens.colors.textPrimary,
                letterSpacing: -1.2,
                fontVariant: ['tabular-nums'],
              }}
            >
              {card.value}
            </Text>
          )}

          {!loading && !!card.hint && (
            <Text
              numberOfLines={2}
              style={{
                fontSize: tokens.typography.sizes.xs,
                fontWeight: tokens.typography.weights.body,
                color: tokens.colors.textSecondary,
                marginTop: 4,
                lineHeight: 16,
              }}
            >
              {card.hint}
            </Text>
          )}

          {!loading && !!card.route && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: tokens.typography.weights.display,
                  color: card.accentColor,
                }}
              >
                Tap to open
              </Text>
              <Ionicons name="arrow-forward" size={11} color={card.accentColor} />
            </View>
          )}

          {!loading && card.progress != null && (
            <ProgressTrack
              value={card.progress}
              color={card.accentColor}
              track={tokens.colors.innerBorder}
            />
          )}

          {!loading && card.sparkline && card.sparkline.length >= 2 && (
            <MiniSparkline values={card.sparkline} color={card.accentColor} />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
});

const CollectionPulse = memo(({
  invoiced,
  collected,
  pending,
  efficiency,
  loading,
  tokens,
  clock,
}: {
  invoiced: number;
  collected: number;
  pending: number;
  efficiency: number | null;
  loading: boolean;
  tokens: DashboardTokens;
  clock: SharedValue<number>;
}) => {
  if (loading) {
    return (
      <SurfaceCard tokens={tokens} padding={16} style={{ marginBottom: 22 }}>
        <ShimmerBox width="100%" height={46} borderRadius={tokens.radii.control} clock={clock} tokens={tokens} />
      </SurfaceCard>
    );
  }
  if (!invoiced && !collected && !pending) return null;

  const pct = invoiced > 0 ? Math.min(100, Math.round((collected / invoiced) * 100)) : (efficiency ?? 0);
  const collectedShare = invoiced > 0 ? (collected / invoiced) * 100 : pct;
  const pendingShare = invoiced > 0 ? Math.max(0, 100 - collectedShare) : 0;

  const pills = [
    { label: 'Collected', value: formatCurrencyShort(collected), color: tokens.colors.semantic.success, soft: tokens.colors.semantic.successSoft, border: tokens.colors.semantic.successBorder, icon: 'checkmark-circle' as IonIcon },
    { label: 'Expected', value: formatCurrencyShort(invoiced), color: tokens.colors.brand.primary, soft: tokens.colors.brand.primarySoft, border: tokens.colors.brand.primaryBorder, icon: 'calculator-outline' as IonIcon },
    { label: 'Still due', value: formatCurrencyShort(pending), color: tokens.colors.semantic.danger, soft: tokens.colors.semantic.dangerSoft, border: tokens.colors.semantic.dangerBorder, icon: 'alert-circle-outline' as IonIcon },
  ];

  return (
    <Animated.View entering={enter(80)} style={{ marginBottom: 22 }}>
      <SurfaceCard tokens={tokens} padding={16}>
        <View style={{ zIndex: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  fontSize: tokens.typography.sizes.sm,
                  fontWeight: tokens.typography.weights.display,
                  color: tokens.colors.textPrimary,
                }}
              >
                How much is collected?
              </Text>
              <Text style={{ fontSize: tokens.typography.sizes.xs, color: tokens.colors.textSecondary, marginTop: 2 }}>
                Green = in hand · Red = still to collect
              </Text>
            </View>
            <View
              style={{
                backgroundColor: tokens.colors.brand.primarySoft,
                borderRadius: tokens.radii.control,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderWidth: 1,
                borderColor: tokens.colors.brand.primaryBorder,
              }}
            >
              <Text
                style={{
                  fontSize: tokens.typography.sizes.sm,
                  fontWeight: tokens.typography.weights.display,
                  color: tokens.colors.brand.primary,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {pct}%
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', height: 10, borderRadius: 99, overflow: 'hidden', backgroundColor: tokens.colors.innerPanel }}>
            <View style={{ width: `${Math.max(2, collectedShare)}%`, backgroundColor: tokens.colors.semantic.success }} />
            <View style={{ width: `${pendingShare}%`, backgroundColor: tokens.colors.semantic.danger, opacity: 0.85 }} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {pills.map((pill) => (
              <View
                key={pill.label}
                style={{
                  flexGrow: 1,
                  flexBasis: '30%',
                  minWidth: 96,
                  backgroundColor: pill.soft,
                  borderRadius: tokens.radii.control,
                  padding: 10,
                  borderWidth: 1,
                  borderColor: pill.border,
                  gap: 4,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name={pill.icon} size={13} color={pill.color} />
                  <Text style={{ fontSize: 11, color: tokens.colors.textSecondary, fontWeight: tokens.typography.weights.body }}>
                    {pill.label}
                  </Text>
                </View>
                <Text style={{ fontSize: tokens.typography.sizes.sm, fontWeight: tokens.typography.weights.display, color: pill.color, fontVariant: ['tabular-nums'] }}>
                  {pill.value}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </SurfaceCard>
    </Animated.View>
  );
});

// ─── Quick Actions ────────────────────────────────────────────────────────────
interface QuickActionItem {
  id: string;
  title: string;
  description: string;
  icon: string;
  route: string;
  library: any;
  permission?: string;
  semantic?: 'danger' | 'warning' | 'success';
  group: ActionGroupId;
}

const resolveActionAccent = (item: QuickActionItem, tokens: DashboardTokens) => {
  let accentColor = GROUP_THEME[item.group].color;
  if (item.semantic === 'danger') accentColor = tokens.colors.semantic.danger;
  else if (item.semantic === 'warning') accentColor = tokens.colors.semantic.warning;
  else if (ACTION_TILE_PALETTE[item.id]) accentColor = ACTION_TILE_PALETTE[item.id].color;

  const dark = tokens.isDark;
  return {
    accentColor,
    accentSoft: schoolColorWithAlpha(accentColor, dark ? 0.22 : 0.14),
    accentBorder: schoolColorWithAlpha(accentColor, dark ? 0.42 : 0.30),
    accentWash: schoolColorWithAlpha(accentColor, dark ? 0.20 : 0.12),
    accentWashHot: schoolColorWithAlpha(accentColor, dark ? 0.38 : 0.24),
  };
};

const QuickJumpChip = memo(({
  item,
  tokens,
  router,
}: {
  item: QuickActionItem;
  tokens: DashboardTokens;
  router: any;
}) => {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const { accentColor, accentSoft, accentBorder } = resolveActionAccent(item, tokens);
  const IconLib = item.library;
  const hot = hovered || pressed;

  return (
    <Pressable
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(item.route);
      }}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 14,
          paddingVertical: 11,
          borderRadius: tokens.radii.control,
          backgroundColor: hot ? accentColor : accentSoft,
          borderWidth: 1.5,
          borderColor: accentBorder,
          transform: hovered ? [{ translateY: -2 }] : [{ translateY: 0 }],
          minWidth: 132,
        },
        webCardShadow(accentColor, hovered, pressed, tokens),
      ]}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 12,
          backgroundColor: hot ? 'rgba(255,255,255,0.22)' : accentColor,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <IconLib name={item.icon} size={16} color="#FFFFFF" />
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: tokens.typography.sizes.sm,
            fontWeight: tokens.typography.weights.display,
            color: hot ? '#FFFFFF' : tokens.colors.textPrimary,
          }}
        >
          {item.title}
        </Text>
      </View>
    </Pressable>
  );
});

const QuickJumpRow = memo(({
  actions,
  tokens,
  router,
}: {
  actions: QuickActionItem[];
  tokens: DashboardTokens;
  router: any;
}) => {
  const jumps = QUICK_JUMP_IDS.map((id) => actions.find((a) => a.id === id)).filter(Boolean) as QuickActionItem[];
  if (jumps.length === 0) return null;

  return (
    <View style={{ marginBottom: 18 }}>
      <Text
        style={{
          fontSize: tokens.typography.sizes.xs,
          fontWeight: tokens.typography.weights.display,
          color: tokens.colors.textSecondary,
          marginBottom: 10,
          letterSpacing: 0.2,
        }}
      >
        Popular shortcuts
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {jumps.map((item) => (
          <QuickJumpChip key={item.id} item={item} tokens={tokens} router={router} />
        ))}
      </ScrollView>
    </View>
  );
});

const ActionRow = memo(({
  item,
  tokens,
  router,
  width,
  featured = false,
}: {
  item: QuickActionItem;
  tokens: DashboardTokens;
  router: any;
  width: number;
  featured?: boolean;
}) => {
  const IconLib = item.library;
  const { bg, shadowColor, category } = useMemo(
    () => resolveActionClay(item, tokens.isDark),
    [item, tokens.isDark]
  );
  const { cardStyle, chevronStyle, iconStyle, washStyle, onPressIn, onPressOut, onHoverIn, onHoverOut } = useDeskCardMotion();
  const radius = tokens.radii.card;
  const cardH = IS_WEB ? 144 : 132;
  const disc = IS_WEB ? 42 : 36;
  const chevron = IS_WEB ? 26 : 22;

  const clayShadow = IS_WEB
    ? {
        boxShadow:
          `0px 8px 18px ${shadowColor}33, ` +
          `-5px -5px 12px ${tokens.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.85)'}, ` +
          `inset 2px 2px 4px rgba(255, 255, 255, 0.45), ` +
          `inset -2.5px -2.5px 5px rgba(0, 0, 0, 0.16)`,
      }
    : {
        shadowColor,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: tokens.isDark ? 0.45 : 0.28,
        shadowRadius: 12,
        elevation: 6,
      };

  return (
    <Animated.View
      style={[
        {
          width,
          height: cardH,
          borderRadius: radius,
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: tokens.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.45)',
          overflow: IS_WEB ? 'hidden' : 'visible',
          position: 'relative',
        },
        clayShadow as any,
        cardStyle,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.description}`}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onHoverIn={onHoverIn}
        onHoverOut={onHoverOut}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push(item.route);
        }}
        style={[StyleSheet.absoluteFill, webCursor]}
      >
        <LinearGradient
          colors={tokens.isDark ? ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.15)'] : ['rgba(255,255,255,0.26)', 'rgba(0,0,0,0.06)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
          pointerEvents="none"
        />
        <Animated.View style={[StyleSheet.absoluteFill, washStyle]} pointerEvents="none">
          <LinearGradient
            colors={['rgba(255,255,255,0.14)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: IS_WEB ? 90 : 80,
            height: IS_WEB ? 90 : 80,
            borderRadius: IS_WEB ? 45 : 40,
            borderWidth: 1.5,
            borderColor: 'rgba(255,255,255,0.08)',
            bottom: IS_WEB ? -20 : -15,
            right: IS_WEB ? -20 : -15,
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: IS_WEB ? 44 : 38,
            height: IS_WEB ? 44 : 38,
            borderRadius: IS_WEB ? 22 : 19,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.05)',
            bottom: IS_WEB ? 40 : 35,
            right: IS_WEB ? -10 : -8,
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: IS_WEB ? 24 : 18,
            height: IS_WEB ? 24 : 18,
            borderRadius: IS_WEB ? 12 : 9,
            backgroundColor: 'rgba(255,255,255,0.06)',
            bottom: IS_WEB ? 45 : 38,
            right: IS_WEB ? 25 : 20,
          }}
        />

        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 12,
              left: 12,
              width: disc,
              height: disc,
              borderRadius: IS_WEB ? 14 : 11,
              backgroundColor: 'rgba(255,255,255,0.22)',
              borderColor: 'rgba(255,255,255,0.32)',
              borderWidth: 1,
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
              ...(IS_WEB ? { boxShadow: '1px 2px 4px rgba(0,0,0,0.12), inset 1px 1px 2px rgba(255,255,255,0.35)' } : {}),
            },
            iconStyle,
          ]}
        >
          <IconLib name={item.icon} size={IS_WEB ? 18 : 16} color="#FFFFFF" />
        </Animated.View>

        <View
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 2,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: featured ? 8 : 9,
            paddingVertical: featured ? 5 : 4,
            borderRadius: 10,
            backgroundColor: featured ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.15)',
            borderWidth: 1,
            borderColor: featured ? 'rgba(255,255,255,0.36)' : 'rgba(255,255,255,0.15)',
            ...(IS_WEB ? { boxShadow: featured
              ? '1px 2px 4px rgba(0,0,0,0.12), inset 1px 1px 2px rgba(255,255,255,0.35)'
              : 'inset 1px 1px 2px rgba(0,0,0,0.2), inset -1px -1px 2px rgba(255,255,255,0.1)' } : {}),
          }}
        >
          {featured ? (
            <Ionicons name="sparkles" size={9} color="#FFFFFF" />
          ) : (
            <View style={{ width: 4.5, height: 4.5, borderRadius: 2.25, backgroundColor: '#FFFFFF' }} />
          )}
          <Text
            style={{
              fontSize: featured ? 9 : 8,
              fontWeight: tokens.typography.weights.display,
              letterSpacing: featured ? 0.6 : 1.6,
              color: '#FFFFFF',
            }}
          >
            {featured ? 'START HERE' : category}
          </Text>
        </View>

        <View style={{ position: 'absolute', bottom: 12, left: 12, right: 42, zIndex: 2 }}>
          <Text
            numberOfLines={1}
            style={{
              fontSize: IS_WEB ? 15 : 13.5,
              fontWeight: tokens.typography.weights.display,
              color: '#FFFFFF',
              letterSpacing: -0.2,
            }}
          >
            {item.title}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontSize: IS_WEB ? 10.5 : 9.5,
              fontWeight: tokens.typography.weights.body,
              color: 'rgba(255,255,255,0.78)',
              marginTop: 2,
            }}
          >
            {item.description}
          </Text>
        </View>

        <Animated.View
          style={[
            {
              position: 'absolute',
              bottom: 12,
              right: 12,
              width: chevron,
              height: chevron,
              borderRadius: chevron / 2,
              backgroundColor: 'rgba(255,255,255,0.22)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.32)',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
              ...(IS_WEB ? { boxShadow: '1px 2px 4px rgba(0,0,0,0.12), inset 1px 1px 2px rgba(255,255,255,0.35)' } : {}),
            },
            chevronStyle,
          ]}
        >
          <Ionicons name="chevron-forward" size={IS_WEB ? 13 : 10} color="#FFFFFF" />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
});

const OperationsDesk = memo(({
  actions,
  tokens,
  router,
  deskWidth,
}: {
  actions: QuickActionItem[];
  tokens: DashboardTokens;
  router: any;
  deskWidth: number;
}) => {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<'all' | ActionGroupId>('all');
  const [measuredDeskW, setMeasuredDeskW] = useState(deskWidth);
  const gridW = measuredDeskW > 0 ? measuredDeskW : deskWidth;

  const spotlightRow = useMemo(
    () => SPOTLIGHT_IDS.map((id) => actions.find((a) => a.id === id)).filter(Boolean) as QuickActionItem[],
    [actions]
  );
  const q = query.trim().toLowerCase();
  const searching = q.length > 0 || group !== 'all';

  const filtered = useMemo(() => {
    return actions.filter((a) => {
      if (group !== 'all' && a.group !== group) return false;
      if (!q) return true;
      return `${a.title} ${a.description}`.toLowerCase().includes(q);
    });
  }, [actions, group, q]);

  const groupedRest = useMemo(() => {
    const rest = searching
      ? filtered
      : actions.filter((a) => !SPOTLIGHT_IDS.includes(a.id as any));
    return ACTION_GROUPS.map((g) => ({
      ...g,
      items: rest.filter((a) => a.group === g.id),
    })).filter((g) => g.items.length > 0);
  }, [actions, filtered, searching]);

  const restCols = Math.max(2, Math.floor((gridW + REST_GAP) / (228 + REST_GAP)));
  const restCardW = Math.max(148, Math.floor((gridW - REST_GAP * (restCols - 1)) / restCols));
  const spotCols = Math.min(spotlightRow.length || 1, gridW >= 840 ? 4 : 2);
  const spotCardW = Math.max(148, Math.floor((gridW - REST_GAP * (spotCols - 1)) / spotCols));

  return (
    <View onLayout={(e) => {
      const next = Math.round(e.nativeEvent.layout.width);
      if (next > 0 && next !== measuredDeskW) setMeasuredDeskW(next);
    }}>
      <SectionHeader
        title="What would you like to do?"
        subtitle="Search any tool, or pick a category below."
        icon="grid-outline"
        accent={tokens.colors.brand.primary}
        tokens={tokens}
        right={
          <View
            style={{
              backgroundColor: tokens.colors.brand.primarySoft,
              borderRadius: tokens.radii.control,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderWidth: 1,
              borderColor: tokens.colors.brand.primaryBorder,
            }}
          >
            <Text
              style={{
                fontSize: tokens.typography.sizes.xs,
                fontWeight: tokens.typography.weights.display,
                color: tokens.colors.brand.primary,
              }}
            >
              {actions.length} options
            </Text>
          </View>
        }
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          marginBottom: 12,
          paddingHorizontal: 12,
          height: 44,
          borderRadius: tokens.radii.control,
          backgroundColor: tokens.colors.innerPanel,
          borderWidth: 1,
          borderColor: tokens.colors.innerBorder,
        }}
      >
        <Ionicons name="search" size={16} color={tokens.colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search: fees, receipts, payroll, exams…"
          accessibilityLabel="Search accounts tools"
          placeholderTextColor={tokens.colors.textMuted}
          style={{
            flex: 1,
            fontSize: tokens.typography.sizes.sm,
            fontWeight: tokens.typography.weights.body,
            color: tokens.colors.textPrimary,
            outlineStyle: 'none',
          } as any}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8} style={webCursor}>
            <Ionicons name="close-circle" size={16} color={tokens.colors.textMuted} />
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: 4, marginBottom: 14 }}
      >
        {([{ id: 'all' as const, label: 'All tools', icon: 'apps-outline' as IonIcon, color: tokens.colors.brand.primary, soft: tokens.colors.brand.primarySoft, border: tokens.colors.brand.primaryBorder },
          ...ACTION_GROUPS.map((g) => ({
            id: g.id,
            label: g.label,
            icon: GROUP_THEME[g.id].icon,
            color: GROUP_THEME[g.id].color,
            soft: GROUP_THEME[g.id].soft,
            border: GROUP_THEME[g.id].border,
          })),
        ]).map((chip) => {
          const active = group === chip.id;
          return (
            <Pressable
              key={chip.id}
              onPress={() => {
                Haptics.selectionAsync();
                setGroup(chip.id);
              }}
              style={({ hovered, pressed }: any) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: tokens.radii.control,
                  borderWidth: 1.5,
                  backgroundColor: active ? chip.color : hovered || pressed ? chip.soft : tokens.colors.surface,
                  borderColor: active || hovered ? chip.border : tokens.colors.innerBorder,
                  transform: hovered && !active ? [{ translateY: -1 }] : [{ translateY: 0 }],
                },
                webCursor,
              ]}
            >
              <Ionicons name={chip.icon} size={14} color={active ? '#FFFFFF' : chip.color} />
              <Text
                style={{
                  fontSize: tokens.typography.sizes.xs,
                  fontWeight: tokens.typography.weights.display,
                  color: active ? '#FFFFFF' : chip.color,
                  letterSpacing: 0.2,
                }}
              >
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {!searching && spotlightRow.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: REST_GAP, marginBottom: 20 }}>
          {spotlightRow.map((item) => (
            <ActionRow
              key={item.id}
              item={item}
              tokens={tokens}
              router={router}
              width={spotCardW}
              featured={item.id === 'collect'}
            />
          ))}
        </View>
      )}

      {groupedRest.length === 0 ? (
        <SurfaceCard tokens={tokens} padding={28} style={{ alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ color: tokens.colors.textPrimary, fontWeight: tokens.typography.weights.display, fontSize: tokens.typography.sizes.sm }}>
            No matching workspace
          </Text>
          <Text style={{ color: tokens.colors.textSecondary, fontSize: tokens.typography.sizes.xs, marginTop: 4 }}>
            Try another name or clear the filter
          </Text>
        </SurfaceCard>
      ) : (
        groupedRest.map((g) => {
          const theme = GROUP_THEME[g.id];
          return (
          <View key={g.id} style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginLeft: 2 }}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 10,
                  backgroundColor: theme.color,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={theme.icon} size={14} color="#FFFFFF" />
              </View>
              <Text
                style={{
                  fontSize: tokens.typography.sizes.sm,
                  fontWeight: tokens.typography.weights.display,
                  color: theme.color,
                }}
              >
                {theme.sectionLabel}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: REST_GAP }}>
              {g.items.map((item) => (
                <ActionRow
                  key={item.id}
                  item={item}
                  tokens={tokens}
                  router={router}
                  width={restCardW}
                />
              ))}
            </View>
          </View>
          );
        })
      )}
    </View>
  );
});

// ─── Analytics ────────────────────────────────────────────────────────────────
const AnalyticsSection = memo(({
  data,
  loading,
  tokens,
  clock,
  contentW,
  isWeb,
  config = {},
}: {
  data: any;
  loading: boolean;
  tokens: DashboardTokens;
  clock: SharedValue<number>;
  contentW: number;
  isWeb: boolean;
  config?: Record<string, boolean>;
}) => {
  if (loading) {
    return (
      <View style={{ marginBottom: 28, gap: 14 }}>
        <SurfaceCard tokens={tokens} padding={20}>
          <ShimmerBox width={140} height={16} borderRadius={tokens.radii.control} clock={clock} tokens={tokens} />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            {[1, 2, 3].map((i) => (
              <ShimmerBox key={i} width="31%" height={48} borderRadius={tokens.radii.control} clock={clock} tokens={tokens} />
            ))}
          </View>
          <ShimmerBox width="100%" height={120} borderRadius={tokens.radii.control} clock={clock} tokens={tokens} style={{ marginTop: 10 }} />
        </SurfaceCard>
      </View>
    );
  }

  if (!data) return null;

  const lineData = (data.financials?.trend || []).map((pt: any) => ({
    value: pt.value,
    label: pt.label,
    dataPointText: formatCurrencyShort(pt.value),
  }));
  const hasChartData = lineData.length >= 2;

  const getMetricState = (val: number | null | undefined, isPercent: boolean, sub: string) => {
    if (val == null || val === 0) return { value: 'No data', subLabel: 'Not enough data' };
    return { value: `${val}${isPercent ? '%' : ''}`, subLabel: sub };
  };

  const coll = getMetricState(
    data.financials.collection_efficiency,
    true,
    `${formatCurrencyShort(data.financials.total_collected)} of ${formatCurrencyShort(data.financials.total_invoiced)}`
  );
  const att = getMetricState(
    data.attendance.avg_attendance,
    true,
    `${data.attendance.total_present_days || 0}/${data.attendance.total_working_days || 0} days`
  );
  const acad = getMetricState(
    data.academics.avg_score,
    true,
    `${data.academics.exams_conducted || 0} exams conducted`
  );

  const metrics: { icon: string; color: string; bg: string; border: string; label: string; value: string; subLabel: string }[] = [];
  if (config.collection_efficiency !== false) {
    metrics.push({
      icon: 'trending-up',
      color: tokens.colors.brand.primary,
      bg: tokens.colors.brand.primarySoft,
      border: tokens.colors.brand.primaryBorder,
      label: 'Collection Efficiency',
      value: coll.value,
      subLabel: coll.subLabel,
    });
  }
  if (config.avg_attendance !== false) {
    metrics.push({
      icon: 'people',
      color: tokens.colors.semantic.success,
      bg: tokens.colors.semantic.successSoft,
      border: tokens.colors.semantic.successBorder,
      label: 'Avg Attendance',
      value: att.value,
      subLabel: att.subLabel,
    });
  }
  if (config.academic_score !== false) {
    metrics.push({
      icon: 'school',
      color: tokens.colors.semantic.warning,
      bg: tokens.colors.semantic.warningSoft,
      border: tokens.colors.semantic.warningBorder,
      label: 'Academic Score',
      value: acad.value,
      subLabel: acad.subLabel,
    });
  }

  const showChart = config.revenue_trend !== false;
  const showAnyMetric = metrics.length > 0;
  if (!showChart && !showAnyMetric) return null;

  const chartWidth = isWeb
    ? Math.max(300, contentW * (showAnyMetric ? 0.50 : 0.85))
    : Math.max(260, contentW - 72);

  return (
    <Animated.View entering={enter(100)} style={{ marginBottom: 28 }}>
      <SectionHeader
        title="School performance"
        subtitle="Fees trend plus attendance and exam scores at a glance."
        icon="stats-chart-outline"
        accent={tokens.colors.brand.primary}
        tokens={tokens}
      />

      <View style={{ flexDirection: isWeb && showAnyMetric ? 'row' : 'column', gap: 16 }}>
        {showChart && (
          <SurfaceCard tokens={tokens} padding={20} style={{ flex: isWeb ? 1.6 : undefined }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, zIndex: 2 }}>
              <View>
                <Text
                  style={{
                    fontSize: tokens.typography.sizes.sm,
                    fontWeight: tokens.typography.weights.display,
                    color: tokens.colors.textPrimary,
                  }}
                >
                  Revenue trend
                </Text>
                <Text
                  style={{
                    fontSize: tokens.typography.sizes.xs,
                    color: tokens.colors.textMuted,
                    marginTop: 2,
                    fontWeight: tokens.typography.weights.body,
                  }}
                >
                  Last six billing months
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: tokens.colors.brand.primarySoft,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: tokens.radii.control,
                  borderWidth: 1,
                  borderColor: tokens.colors.brand.primaryBorder,
                }}
              >
                <Text
                  style={{
                    fontSize: tokens.typography.sizes.xs,
                    fontWeight: tokens.typography.weights.display,
                    color: tokens.colors.brand.primary,
                    letterSpacing: 0.8,
                    textTransform: 'uppercase',
                  }}
                >
                  6 Months
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18, zIndex: 2 }}>
              {[
                { label: 'Expected', value: formatCurrencyShort(data.financials.total_invoiced), bg: tokens.colors.innerPanel, border: tokens.colors.innerBorder, color: tokens.colors.textPrimary },
                { label: 'Collected', value: formatCurrencyShort(data.financials.total_collected), bg: tokens.colors.semantic.successSoft, border: tokens.colors.semantic.successBorder, color: tokens.colors.semantic.success },
                { label: 'Pending', value: formatCurrencyShort(data.financials.outstanding_dues), bg: tokens.colors.semantic.dangerSoft, border: tokens.colors.semantic.dangerBorder, color: tokens.colors.semantic.danger },
              ].map((cell) => (
                <View
                  key={cell.label}
                  style={{
                    flex: 1,
                    backgroundColor: cell.bg,
                    borderRadius: tokens.radii.control,
                    padding: 10,
                    borderWidth: 1,
                    borderColor: cell.border,
                  }}
                >
                  <Text style={{ fontSize: tokens.typography.sizes.xs, fontWeight: tokens.typography.weights.body, color: tokens.colors.textSecondary, marginBottom: 2 }}>
                    {cell.label}
                  </Text>
                  <Text style={{ fontSize: tokens.typography.sizes.sm, fontWeight: tokens.typography.weights.display, color: cell.color, fontVariant: ['tabular-nums'] }}>
                    {cell.value}
                  </Text>
                </View>
              ))}
            </View>

            <View style={{ marginLeft: -12, minHeight: 160, justifyContent: 'center', zIndex: 2 }}>
              {hasChartData ? (
                <LineChart
                  data={lineData}
                  height={150}
                  width={chartWidth}
                  initialSpacing={24}
                  spacing={48}
                  color={tokens.colors.brand.primary}
                  thickness={2.5}
                  hideRules={false}
                  hideYAxisText={false}
                  yAxisColor="transparent"
                  xAxisColor="transparent"
                  rulesColor={tokens.colors.innerBorder}
                  yAxisTextStyle={{ color: tokens.colors.textSecondary, fontSize: tokens.typography.sizes.xs }}
                  xAxisLabelTextStyle={{ color: tokens.colors.textSecondary, fontSize: tokens.typography.sizes.xs }}
                  formatYLabel={(lbl: string) => formatCurrencyShort(Number(lbl))}
                  dataPointsColor={tokens.colors.brand.primary}
                  areaChart
                  startFillColor={tokens.colors.brand.primarySoft}
                  endFillColor={tokens.colors.sheen[1]}
                  curved
                  animateOnDataChange
                  animationDuration={700}
                />
              ) : (
                <View style={{ alignItems: 'center', justifyContent: 'center', minHeight: 150 }}>
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: tokens.radii.control,
                      backgroundColor: tokens.colors.innerPanel,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 10,
                    }}
                  >
                    <Ionicons name="bar-chart-outline" size={22} color={tokens.colors.textMuted} />
                  </View>
                  <Text style={{ fontSize: tokens.typography.sizes.sm, fontWeight: tokens.typography.weights.display, color: tokens.colors.textPrimary }}>
                    Trend appears after two months
                  </Text>
                  <Text style={{ fontSize: tokens.typography.sizes.xs, color: tokens.colors.textSecondary, marginTop: 4 }}>
                    Keep collecting — the curve builds itself
                  </Text>
                </View>
              )}
            </View>
          </SurfaceCard>
        )}

        {showAnyMetric && (
          <View style={{ flex: 1, flexDirection: isWeb && showChart ? 'column' : 'row', gap: 12 }}>
            {metrics.map((m) => (
              <SurfaceCard
                key={m.label}
                tokens={tokens}
                padding={16}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 16,
                }}
              >
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: tokens.radii.control,
                    backgroundColor: m.bg,
                    borderWidth: 1,
                    borderColor: m.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2,
                  }}
                >
                  <Ionicons name={m.icon as any} size={18} color={m.color} />
                </View>
                <View style={{ flex: 1, zIndex: 2, minWidth: 0 }}>
                  <Text
                    style={{
                      fontSize: tokens.typography.sizes.xs,
                      fontWeight: tokens.typography.weights.body,
                      color: tokens.colors.textSecondary,
                      textTransform: 'uppercase',
                      letterSpacing: 0.4,
                      marginBottom: 2,
                    }}
                  >
                    {m.label}
                  </Text>
                  <Text
                    style={{
                      fontSize: tokens.typography.sizes.lg,
                      fontWeight: tokens.typography.weights.display,
                      color: m.value === 'No data' ? tokens.colors.textSecondary : m.color,
                      fontVariant: ['tabular-nums'],
                      letterSpacing: -0.4,
                    }}
                  >
                    {m.value}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: tokens.typography.sizes.xs,
                      fontWeight: tokens.typography.weights.body,
                      color: tokens.colors.textMuted,
                      marginTop: 2,
                    }}
                  >
                    {m.subLabel}
                  </Text>
                </View>
              </SurfaceCard>
            ))}
          </View>
        )}
      </View>
    </Animated.View>
  );
});

// ─── Transactions ─────────────────────────────────────────────────────────────
interface TransactionItem {
  id: string;
  name: string;
  class: string;
  type: string;
  amount: string;
  time: string;
  when: string;
}

const TransactionRow = memo(({
  tx,
  tokens,
  isLast,
  router,
  compact,
}: {
  tx: TransactionItem;
  tokens: DashboardTokens;
  isLast: boolean;
  router: any;
  compact?: boolean;
}) => {
  const onPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/accounts/receipts');
  }, [router]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: compact ? 14 : 18,
          paddingVertical: 13,
          borderBottomWidth: isLast ? 0 : 1,
          borderBottomColor: tokens.colors.innerBorder,
          backgroundColor: pressed ? tokens.colors.innerPanel : 'transparent',
        },
        webCursor,
      ]}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: tokens.radii.control,
          backgroundColor: tokens.colors.brand.primarySoft,
          borderWidth: 1,
          borderColor: tokens.colors.brand.primaryBorder,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        <Text
          style={{
            fontSize: tokens.typography.sizes.md,
            fontWeight: tokens.typography.weights.display,
            color: tokens.colors.brand.primary,
          }}
        >
          {tx.name?.[0]?.toUpperCase() ?? '?'}
        </Text>
      </View>

      <View style={{ flex: 2, minWidth: 0, justifyContent: 'center' }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: tokens.typography.sizes.sm,
            fontWeight: tokens.typography.weights.display,
            color: tokens.colors.textPrimary,
          }}
        >
          {tx.name}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            fontSize: tokens.typography.sizes.xs,
            fontWeight: tokens.typography.weights.body,
            color: tokens.colors.textSecondary,
            marginTop: 2,
          }}
        >
          {tx.class} · {tx.type}
        </Text>
      </View>

      {!compact && (
        <Text
          style={{
            flex: 1,
            fontSize: tokens.typography.sizes.xs,
            fontWeight: tokens.typography.weights.body,
            color: tokens.colors.textMuted,
          }}
        >
          {tx.when}
        </Text>
      )}

      <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
        <Text
          style={{
            fontSize: tokens.typography.sizes.sm,
            fontWeight: tokens.typography.weights.display,
            color: tokens.colors.semantic.success,
            fontVariant: ['tabular-nums'],
          }}
        >
          {tx.amount}
        </Text>
        {compact && (
          <Text
            style={{
              fontSize: tokens.typography.sizes.xs,
              color: tokens.colors.textMuted,
              marginTop: 2,
            }}
          >
            {tx.when}
          </Text>
        )}
      </View>
    </Pressable>
  );
});

const TransactionsSection = memo(({
  transactions,
  loading,
  tokens,
  clock,
  router,
  compact = false,
}: {
  transactions: TransactionItem[];
  loading: boolean;
  tokens: DashboardTokens;
  clock: SharedValue<number>;
  router: any;
  compact?: boolean;
}) => {
  return (
    <View style={{ marginBottom: 28 }}>
      <SectionHeader
        title="Latest payments"
        subtitle="Tap any row to open the full receipt list."
        icon="receipt-outline"
        accent={tokens.colors.semantic.success}
        tokens={tokens}
        right={
          <Pressable
            onPress={() => router.push('/accounts/receipts')}
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor: tokens.colors.brand.primarySoft,
                borderRadius: tokens.radii.control,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderWidth: 1,
                borderColor: tokens.colors.brand.primaryBorder,
              },
              webCursor,
            ]}
          >
            <Text
              style={{
                fontSize: tokens.typography.sizes.xs,
                fontWeight: tokens.typography.weights.display,
                color: tokens.colors.brand.primary,
              }}
            >
              View ledger
            </Text>
            <Ionicons name="arrow-forward" size={12} color={tokens.colors.brand.primary} />
          </Pressable>
        }
      />

      <SurfaceCard tokens={tokens} padding={0}>
        {loading ? (
          <View style={{ padding: 16, gap: 12 }}>
            {[1, 2, 3, 4].map((i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 }}>
                <ShimmerBox width={38} height={38} borderRadius={tokens.radii.control} clock={clock} tokens={tokens} />
                <View style={{ flex: 2, gap: 6 }}>
                  <ShimmerBox width={120} height={12} borderRadius={tokens.radii.control} clock={clock} tokens={tokens} />
                  <ShimmerBox width={80} height={10} borderRadius={tokens.radii.control} clock={clock} tokens={tokens} />
                </View>
                <ShimmerBox width={60} height={14} borderRadius={tokens.radii.control} clock={clock} tokens={tokens} />
              </View>
            ))}
          </View>
        ) : transactions.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 20, gap: 8 }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: tokens.radii.control,
                backgroundColor: tokens.colors.innerPanel,
                borderWidth: 1,
                borderColor: tokens.colors.innerBorder,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <FontAwesome5 name="receipt" size={18} color={tokens.colors.textMuted} />
            </View>
            <Text style={{ color: tokens.colors.textPrimary, fontSize: tokens.typography.sizes.sm, fontWeight: tokens.typography.weights.display }}>
              No collections yet
            </Text>
            <Text style={{ color: tokens.colors.textSecondary, fontSize: tokens.typography.sizes.xs, textAlign: 'center' }}>
              The next receipt you take will land here
            </Text>
            <Pressable
              onPress={() => router.push('/accounts/fees')}
              style={[
                {
                  marginTop: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: tokens.colors.brand.primarySoft,
                  borderRadius: tokens.radii.control,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderWidth: 1,
                  borderColor: tokens.colors.brand.primaryBorder,
                },
                webCursor,
              ]}
            >
              <Text style={{ color: tokens.colors.brand.primary, fontSize: tokens.typography.sizes.xs, fontWeight: tokens.typography.weights.display }}>
                Collect fees
              </Text>
              <Ionicons name="arrow-forward" size={12} color={tokens.colors.brand.primary} />
            </Pressable>
          </View>
        ) : (
          transactions.map((tx, index) => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              tokens={tokens}
              isLast={index === transactions.length - 1}
              router={router}
              compact={compact}
            />
          ))
        )}
      </SurfaceCard>
    </View>
  );
});

function mapDashboardTransactions(rows: any[]) {
  return (Array.isArray(rows) ? rows : []).map((tx: any) => {
    const iso = tx.collected_at || tx.paid_at || tx.payment_date || tx.created_at || new Date().toISOString();
    return {
      id: String(tx.id),
      name: tx.student_name || '—',
      class: tx.class_name || '—',
      type: tx.fee_type || 'Fee',
      amount: `+₹${Number(tx.amount ?? 0).toLocaleString('en-IN')}`,
      time: iso,
      when: formatTxWhen(iso),
    };
  });
}

// ─── Main AccountsDashboard Component ─────────────────────────────────────────
export default function AccountsDashboard() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const { hasPermission } = usePermissions();
  const { theme, isDark } = useTheme();
  const { shellActive } = useAccountsWebChrome();
  const layout = useLayout(shellActive);
  const { isWeb, contentW, CARD_H_PAD, winW } = layout;

  const tokens = useMemo(() => getDashboardTokens(theme, isDark), [theme, isDark]);

  const shimmerClock = useSharedValue(0);
  useEffect(() => {
    shimmerClock.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
    return () => cancelAnimation(shimmerClock);
  }, [shimmerClock]);

  const headerScrollY = useSharedValue(60);

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<Record<string, boolean>>({});
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const carouselRef = useRef<ScrollView>(null);

  const authUserId = user?.userId || user?.id || null;
  const canSeeAllCollections = role === 'admin' || role === 'principal';
  const firstName = user?.displayName?.split(' ')[0] || 'Admin';
  const popupUnread = usePopupUnreadCount();

  const { data: statsData, loading: statsLoading, refetch: refetchStats } = useApiQuery<any>(
    '/fees/dashboard-stats',
    'accounts-dashboard-stats',
    DASHBOARD_CACHE_TTL_MS,
    authUserId,
    { query: { for_accounts: '1' }, persist: true }
  );

  const recentFromStats = statsData?.stats?.recent_transactions;
  const shouldFetchRecentTx = !!authUserId && !(Array.isArray(recentFromStats) && recentFromStats.length > 0);
  const recentTxQuery = canSeeAllCollections ? '' : `received_by=${authUserId}`;

  const { data: recentTxRows, refetch: refetchRecentTransactions } = usePersistedSWR<any[]>({
    cacheKey: 'accounts-recent-tx',
    userId: authUserId,
    ttlMs: 60_000,
    persist: true,
    enabled: shouldFetchRecentTx,
    query: recentTxQuery,
    fetcher: async () => {
      const rows = await FeeService.getTransactions({
        limit: 5,
        ...(canSeeAllCollections ? {} : { received_by: authUserId! }),
      });
      return Array.isArray(rows) ? rows : (rows as any)?.data ?? [];
    },
  });

  const { data: schoolStories, refetch: refetchStories } = usePersistedSWR<SchoolStoryAuthor[]>({
    cacheKey: 'accounts-school-stories',
    userId: authUserId,
    ttlMs: 60_000,
    persist: true,
    enabled: !!authUserId,
    revalidateOnMount: true,
    fetcher: () => schoolStoriesService.list(),
  });

  const { data: heroSlides, refetch: refetchSlides } = usePersistedSWR<HeroSlideItem[]>({
    cacheKey: 'accounts-hero-slides',
    userId: authUserId,
    ttlMs: 120_000,
    persist: true,
    enabled: !!authUserId,
    revalidateOnMount: true,
    fetcher: () => schoolHeroSlidesService.listActive(),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await Promise.all([refetchStats(), refetchRecentTransactions(), refetchStories(), refetchSlides()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchStats, refetchRecentTransactions, refetchStories, refetchSlides]);

  useEffect(() => {
    const showLoader = statsLoading && !statsData;
    setLoading(showLoader);
    setAnalyticsLoading(showLoader);
    if (!statsData) return;

    const rawStats = statsData.stats || {};
    const resolvedConfig = normalizeAccountsDashboardConfig(statsData.config);
    const effectiveConfig = { ...resolvedConfig };
    ACCOUNTS_STAT_KEYS.forEach((key) => {
      if (rawStats[key] === undefined) {
        effectiveConfig[key] = false;
      }
    });
    setConfig(effectiveConfig);

    setStats({
      totalCollection: rawStats.total_collection_month !== undefined ? `₹${rawStats.total_collection_month.toLocaleString()}` : null,
      totalCollectionRaw: Number(rawStats.total_collection_month ?? 0),
      todaysCollection: rawStats.todays_collection !== undefined ? `₹${rawStats.todays_collection.toLocaleString()}` : null,
      todaysCollectionRaw: Number(rawStats.todays_collection ?? 0),
      pendingDues: rawStats.pending_dues !== undefined ? `₹${rawStats.pending_dues.toLocaleString()}` : null,
      pendingDuesRaw: Number(rawStats.pending_dues ?? 0),
    });

    const reconstructedAnalytics: any = {
      generated_at: new Date().toISOString(),
      financials: {
        trend: rawStats.revenue_trend?.trend || [],
        total_invoiced: rawStats.revenue_trend?.total_invoiced || 0,
        total_collected: rawStats.revenue_trend?.total_collected || 0,
        outstanding_dues: rawStats.revenue_trend?.outstanding_dues || 0,
        collection_efficiency: rawStats.collection_efficiency !== undefined ? rawStats.collection_efficiency : null,
      },
      attendance: {
        avg_attendance: rawStats.avg_attendance?.avg_attendance !== undefined ? rawStats.avg_attendance.avg_attendance : null,
        total_present_days: rawStats.avg_attendance?.total_present_days || 0,
        total_working_days: rawStats.avg_attendance?.total_working_days || 0,
      },
      academics: {
        avg_score: rawStats.academic_score?.avg_score !== undefined ? rawStats.academic_score.avg_score : null,
        exams_conducted: rawStats.academic_score?.exams_conducted || 0,
      },
      insights: rawStats.system_insights || [],
    };
    setAnalytics(reconstructedAnalytics);

    const recentFromStatsLocal = rawStats.recent_transactions;
    if (Array.isArray(recentFromStatsLocal) && recentFromStatsLocal.length > 0) {
      setTransactions(mapDashboardTransactions(recentFromStatsLocal));
      return;
    }

    if (recentTxRows) {
      setTransactions(mapDashboardTransactions(recentTxRows));
      return;
    }

    if (!shouldFetchRecentTx) {
      setTransactions([]);
    }
  }, [statsData, statsLoading, authUserId, canSeeAllCollections, recentTxRows, shouldFetchRecentTx]);

  const invoiced = analytics?.financials?.total_invoiced || 0;
  const collected = analytics?.financials?.total_collected || 0;
  const outstanding = analytics?.financials?.outstanding_dues || 0;
  const efficiency = analytics?.financials?.collection_efficiency ?? null;
  const trendValues = (analytics?.financials?.trend || []).map((pt: any) => Number(pt.value) || 0);

  const carouselCards: StatCardItem[] = useMemo(() => {
    const cards: StatCardItem[] = [];
    if (config.total_collection_month !== false && stats?.totalCollection != null) {
      cards.push({
        id: 'monthly',
        label: t('accounts_dashboard.total_collection_month', 'Collected this month'),
        value: loading ? '—' : stats?.totalCollection || '₹0',
        icon: 'wallet',
        tag: 'Month',
        showLive: true,
        hint: efficiency != null ? `${efficiency}% of expected fees already collected` : 'Total for this month',
        progress: efficiency,
        sparkline: trendValues,
        route: '/accounts/receipts',
        accentColor: tokens.colors.brand.primary,
        accentSoft: tokens.colors.brand.primarySoft,
        accentBorder: tokens.colors.brand.primaryBorder,
      });
    }
    if (config.todays_collection !== false && stats?.todaysCollection != null) {
      cards.push({
        id: 'today',
        label: t('accounts_dashboard.todays_collection', "Today's collection"),
        value: loading ? '—' : stats?.todaysCollection || '₹0',
        icon: 'cash-register',
        tag: 'Today',
        hint: 'Money collected today at your desk',
        route: '/accounts/fees/today-collection',
        accentColor: tokens.colors.semantic.success,
        accentSoft: tokens.colors.semantic.successSoft,
        accentBorder: tokens.colors.semantic.successBorder,
      });
    }
    if (config.pending_dues !== false && stats?.pendingDues != null) {
      const pendingPct = invoiced > 0 ? Math.round((outstanding / invoiced) * 100) : null;
      cards.push({
        id: 'pending',
        label: t('accounts_dashboard.pending_dues', 'Open dues'),
        value: loading ? '—' : stats?.pendingDues || '₹0',
        icon: 'file-invoice-dollar',
        tag: 'Due',
        hint: pendingPct != null ? `${pendingPct}% still waiting to be collected` : 'Students who still owe fees',
        progress: pendingPct,
        route: '/accounts/fees/fee-due-slips',
        accentColor: tokens.colors.semantic.danger,
        accentSoft: tokens.colors.semantic.dangerSoft,
        accentBorder: tokens.colors.semantic.dangerBorder,
      });
    }
    return cards;
  }, [loading, stats, t, config, tokens, efficiency, trendValues, invoiced, outstanding]);

  const quickActions: QuickActionItem[] = useMemo(() => ([
    { id: 'collect', title: 'Collect fees', description: 'Take a payment in seconds', icon: 'cash', route: '/accounts/fees', library: Ionicons, permission: 'fees.collect', group: 'collections' },
    { id: 'today_collection', title: "Today's collection", description: 'Desk report for this day', icon: 'today', route: '/accounts/fees/today-collection', library: Ionicons, permission: 'fees.collect', group: 'collections' },
    { id: 'fee_due_slips', title: 'Fee due slips', description: 'Printable notices & tear-offs', icon: 'receipt-outline', route: '/accounts/fees/fee-due-slips', library: Ionicons, permission: 'fees.view', group: 'collections' },
    { id: 'receipts', title: 'Receipts', description: 'Payment history & reprints', icon: 'documents', route: '/accounts/receipts', library: Ionicons, group: 'collections' },
    { id: 'fines', title: 'Fines & adjustments', description: 'Waivers, penalties, policies', icon: 'shield-checkmark', route: '/accounts/fines', library: Ionicons, permission: 'fees.view', semantic: 'warning' as const, group: 'control' },
    { id: 'users_clients', title: 'Users / clients', description: 'Open the directory', icon: 'people-outline', route: '/accounts/manage-users', library: Ionicons, group: 'people' },
    { id: 'student_login_qr', title: 'Student login QR', description: 'Printable private login cards', icon: 'qr-code-outline', route: '/accounts/student-login-qr', library: Ionicons, group: 'people' },
    { id: 'expenses', title: 'Expenses', description: 'School spend & vouchers', icon: 'receipt', route: '/accounts/expenses', library: Ionicons, permission: 'expenses.view', semantic: 'danger' as const, group: 'control' },
    { id: 'payroll', title: 'Payroll', description: 'Salary & staff attendance', icon: 'people', route: '/accounts/payroll', library: Ionicons, permission: 'payroll.process', group: 'people' },
    { id: 'leaves', title: 'Apply leave', description: 'Request your own time off', icon: 'document-text-outline', route: '/accounts/leaves', library: Ionicons, group: 'people' },
    { id: 'staff', title: 'Add staff', description: 'Register a new employee', icon: 'person-add', route: '/accounts/addStaff', library: Ionicons, permission: 'staff.create', group: 'people' },
    { id: 'student', title: 'Add student', description: 'Enroll a new student', icon: 'school', route: '/accounts/addStudent', library: Ionicons, group: 'people' },
    { id: 'defaulters', title: 'Defaulters', description: 'Previous-year pending fees', icon: 'alert-circle', route: '/accounts/defaulters', library: Ionicons, semantic: 'danger' as const, group: 'control' },
    { id: 'transport_fees', title: 'Transport fees', description: 'Stop-based bus charges', icon: 'bus', route: '/accounts/transport-fees', library: Ionicons, group: 'collections' },
    { id: 'hostel_students', title: 'Hostel students', description: 'Assign, move or vacate', icon: 'bed', route: '/accounts/hostel', library: Ionicons, permission: 'hostel.allocate', group: 'people' },
    { id: 'invoices', title: 'Invoices', description: 'Generate and track bills', icon: 'document-text', route: '/accounts/invoices', library: Ionicons, group: 'collections' },
    { id: 'exams', title: 'Exams', description: 'Timetables, tickets, results', icon: 'clipboard-outline', route: '/accounts/exams', library: Ionicons, group: 'academic' },
    { id: 'omr_print', title: 'Print OMR sheets', description: 'Scanner-ready bubble sheets', icon: 'print-outline', route: '/accounts/omr-print', library: Ionicons, permission: 'omr.view', group: 'academic' },
    { id: 'marks_export', title: 'Marks export', description: 'Download every class', icon: 'download-outline', route: '/accounts/marks', library: Ionicons, group: 'academic' },
    { id: 'certificates', title: 'Certificates', description: 'Issue TC & Bonafide', icon: 'ribbon', route: '/accounts/certificate-generator', library: Ionicons, permission: 'certificates.issue', group: 'academic' },
  ] as QuickActionItem[]).filter((action) => !action.permission || hasPermission(action.permission)), [hasPermission]);

  const statPeek = 32;
  const mobileStatW = winW - CARD_H_PAD * 2 - statPeek;
  const bodyPadH = isWeb ? 28 : CARD_H_PAD;
  const roleLine = user?.role?.name || 'Accountant';

  const dashboardBody = (
    <>
      <View style={{ backgroundColor: '#15245C', paddingTop: isWeb ? 16 : 76 }}>
        <AccountsHero
          firstName={firstName}
          roleLine={roleLine}
          chipLabel={SCHOOL_CONFIG.name}
          photoUrl={user?.photoUrl}
          pendingDues={stats?.pendingDuesRaw || 0}
          todaysCollection={stats?.todaysCollectionRaw || 0}
          unreadUpdates={popupUnread || 0}
          slides={heroSlides ?? []}
          stories={schoolStories ?? []}
          canAddStories
          addPhotoUrl={user?.photoUrl}
          onReviewDues={() => router.push('/accounts/fees/fee-due-slips' as any)}
          onViewTodayCollection={() => router.push('/accounts/fees/today-collection' as any)}
          onCollectFees={() => router.push('/accounts/fees' as any)}
          onViewUpdates={() => router.push('/accounts/updates' as any)}
          onPublished={() => { void refetchStories(); }}
          onAccountSwitched={onRefresh}
        />
      </View>

      <View style={{ paddingHorizontal: bodyPadH, paddingTop: isWeb ? 24 : 20 }}>
      <PaymentDueBanner />

      <QuickJumpRow actions={quickActions} tokens={tokens} router={router} />

      {carouselCards.length > 0 && (
        isWeb ? (
          <Animated.View entering={enter(60)} style={{ flexDirection: 'row', gap: 16, marginBottom: 18 }}>
            {carouselCards.map((card) => (
              <DashboardStatCard
                key={card.id}
                card={card}
                loading={loading}
                tokens={tokens}
                clock={shimmerClock}
                router={router}
                style={{ flex: 1 }}
              />
            ))}
          </Animated.View>
        ) : (
          <View style={{ marginBottom: 10 }}>
            <ScrollView
              ref={carouselRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={mobileStatW + 12}
              decelerationRate="fast"
              bounces={false}
              overScrollMode="never"
              onMomentumScrollEnd={(e) => {
                const i = Math.round(e.nativeEvent.contentOffset.x / (mobileStatW + 12));
                setActiveIndex(i);
              }}
              contentContainerStyle={{ paddingHorizontal: 0, gap: 12, paddingRight: CARD_H_PAD }}
            >
              {carouselCards.map((card) => (
                <DashboardStatCard
                  key={card.id}
                  card={card}
                  loading={loading}
                  tokens={tokens}
                  clock={shimmerClock}
                  router={router}
                  style={{ width: mobileStatW }}
                />
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 8 }}>
              {carouselCards.map((card, i) => (
                <Pressable
                  key={card.id}
                  onPress={() => {
                    carouselRef.current?.scrollTo({ x: i * (mobileStatW + 12), animated: true });
                    setActiveIndex(i);
                  }}
                >
                  <View
                    style={{
                      width: i === activeIndex ? 22 : 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: i === activeIndex ? (carouselCards[i]?.accentColor ?? tokens.colors.brand.primary) : tokens.colors.innerBorder,
                    }}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        )
      )}

      <CollectionPulse
        invoiced={invoiced}
        collected={collected}
        pending={outstanding}
        efficiency={typeof efficiency === 'number' ? efficiency : null}
        loading={analyticsLoading}
        tokens={tokens}
        clock={shimmerClock}
      />

      {isWeb ? (
        <>
          <OperationsDesk
            actions={quickActions}
            tokens={tokens}
            router={router}
            deskWidth={contentW}
          />
          <View style={{ marginTop: 28 }}>
            <TransactionsSection
              transactions={transactions}
              loading={loading}
              tokens={tokens}
              clock={shimmerClock}
              router={router}
              compact={false}
            />
          </View>
        </>
      ) : (
        <>
          <View style={{ marginBottom: 8 }}>
            <OperationsDesk
              actions={quickActions}
              tokens={tokens}
              router={router}
              deskWidth={Math.max(0, winW - CARD_H_PAD * 2)}
            />
          </View>
          <TransactionsSection
            transactions={transactions}
            loading={loading}
            tokens={tokens}
            clock={shimmerClock}
            router={router}
            compact
          />
        </>
      )}

      <AnalyticsSection
        data={analytics}
        loading={analyticsLoading}
        tokens={tokens}
        clock={shimmerClock}
        contentW={contentW}
        isWeb={isWeb}
        config={config}
      />
      </View>
    </>
  );

  const canvasWash = isDark
    ? (['#0B1220', tokens.colors.canvas] as [string, string])
    : (['#EEF2FF', '#F5F3FF', tokens.colors.canvas] as [string, string, string]);

  if (isWeb) {
    return (
      <View style={{ flex: 1, backgroundColor: tokens.colors.canvas }}>
        <LinearGradient
          colors={canvasWash}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ position: 'absolute', top: 280, left: 0, right: 0, height: 280 }}
          pointerEvents="none"
        />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 56 }}
          overScrollMode="never"
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={tokens.colors.brand.primary}
              colors={[tokens.colors.brand.primary]}
            />
          }
        >
          {dashboardBody}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: tokens.colors.canvas }}>
      <LinearGradient
        colors={canvasWash}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', top: 280, left: 0, right: 0, height: 240 }}
        pointerEvents="none"
      />
      <StatusBar barStyle="light-content" backgroundColor="#15245C" />

      <AdminHeader
        title={t('accounts_dashboard.dashboard_title', 'Dashboard')}
        onMenuPress={() => setIsMenuOpen(true)}
        scrollY={headerScrollY}
      />

      <DashboardMenuOverlay
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        items={[
          {
            title: 'Dashboard',
            description: 'Financial Overview',
            icon: 'grid-outline',
            route: '/accounts/dashboard',
            gradient: tokens.colors.brand.gradient,
          },
          ...quickActions.map((a) => ({
            title: a.title,
            description: a.description,
            icon: a.icon,
            route: a.route,
            gradient: a.semantic === 'danger'
              ? tokens.colors.semantic.dangerGradient
              : a.semantic === 'warning'
              ? tokens.colors.semantic.warningGradient
              : tokens.colors.brand.gradient,
          })),
        ]}
        onItemPress={(route) => {
          setIsMenuOpen(false);
          router.push(route as any);
        }}
        activeRoute="/accounts/dashboard"
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 52 }}
        overScrollMode="never"
        scrollEventThrottle={16}
        bounces
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.colors.brand.primary}
            colors={[tokens.colors.brand.primary]}
            progressBackgroundColor={tokens.colors.surface}
          />
        }
      >
        {dashboardBody}
      </ScrollView>
    </View>
  );
}
