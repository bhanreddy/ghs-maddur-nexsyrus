import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, StatusBar,
  Pressable, Dimensions, NativeScrollEvent, NativeSyntheticEvent,
  Platform, useWindowDimensions,
} from 'react-native';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, {
  FadeInDown, FadeIn,
  useAnimatedStyle, useSharedValue,
  withSpring, withTiming, withRepeat, withSequence,
  interpolate, Extrapolation,
  cancelAnimation,
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
import LogoLoader from '../../src/components/LogoLoader';
import { LineChart } from "react-native-gifted-charts";
import PaymentDueBanner from '../../src/components/PaymentDueBanner';
import AdminHeaderCard from '../../src/components/AdminHeaderCard';
import DashboardHero from '../../src/components/DashboardHero';
import { ACCOUNTS_STAT_KEYS, normalizeAccountsDashboardConfig } from '../../src/utils/constants';

const IS_WEB = Platform.OS === 'web';
const DASHBOARD_CACHE_TTL_MS = 60 * 1000;
const AVATAR_PALETTE = ['#818CF8', '#22D3A0', '#F5C842', '#63B3ED', '#F2546A', '#A78BFA', '#34D399'];

// ─── Format Helpers ───────────────────────────────────────────────────────────
const formatCurrencyShort = (value: number) => {
  if (!value) return '₹0';
  if (value >= 10000000) return `₹${+(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${+(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${+(value / 1000).toFixed(1)}K`;
  return `₹${value}`;
};

// ─── Layout helpers ───────────────────────────────────────────────────────────
function useLayout(shellActive: boolean) {
  const { width: winW } = useWindowDimensions();
  const isWeb = IS_WEB && shellActive;

  // Sidebar is ~170px; cap content at 960 for readability
  const contentW = isWeb ? Math.min(winW - 172, 960) : winW;

  const CARD_H_PAD = isWeb ? 0 : 20;
  const GRID_COLS = isWeb ? 5 : 3;
  const GRID_GAP = isWeb ? 12 : 14;
  const GRID_ITEM_W = isWeb
    ? Math.floor((contentW - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS)
    : Math.floor((winW - CARD_H_PAD * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS) - 0.5;

  return { isWeb, contentW, CARD_H_PAD, GRID_COLS, GRID_GAP, GRID_ITEM_W, winW };
}

// ─── Shimmer Skeleton ─────────────────────────────────────────────────────────
const ShimmerBar = ({ width, height = 12, borderRadius = 6, style }: any) => {
  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withRepeat(
      withSequence(withTiming(1, { duration: 900 }), withTiming(0, { duration: 900 })),
      -1, false
    );
    return () => cancelAnimation(shimmer);
  }, []);
  const animStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [0.22, 0.50]),
  }));
  return (
    <Animated.View style={[{ width, height, borderRadius, backgroundColor: 'rgba(120,120,140,0.25)' }, style, animStyle]} />
  );
};

// ─── Dot Grid Texture ─────────────────────────────────────────────────────────
const DotGrid = () => {
  const dots: React.ReactNode[] = [];
  const cols = 5; const rows = 4;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    dots.push(
      <View key={`${r}-${c}`} style={{
        position: 'absolute', width: 2.5, height: 2.5, borderRadius: 1.5,
        backgroundColor: 'rgba(255,255,255,0.18)', top: r * 14 + 8, left: c * 13 + 6,
      }} />
    );
  }
  return <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>{dots}</View>;
};

// ─── Pulsing Live Dot ─────────────────────────────────────────────────────────
const PulsingLiveDot = () => {
  const pulse = useSharedValue(1);
  const opacity = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(1.8, { duration: 700 }), withTiming(1, { duration: 700 })), -1, false);
    opacity.value = withRepeat(withSequence(withTiming(0.3, { duration: 700 }), withTiming(1, { duration: 700 })), -1, false);
    return () => { cancelAnimation(pulse); cancelAnimation(opacity); };
  }, []);
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }], opacity: opacity.value }));
  return (
    <View style={{ width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: '#86efac' }, ringStyle]} />
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#86efac' }} />
    </View>
  );
};

// ─── WEB Stat Card ────────────────────────────────────────────────────────────
const WebStatCard = ({ card, loading, isDark, theme }: any) => (
  <View style={{
    flex: 1, borderRadius: 20, overflow: 'hidden',
    shadowColor: card.shadowColor, shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35, shadowRadius: 20, elevation: 10
  }}>
    <LinearGradient colors={card.grad} style={{
      borderRadius: 20, padding: 20, height: 116,
      justifyContent: 'space-between',
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    }} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <DotGrid />
      <View style={{ position: 'absolute', top: 0, left: 16, right: 16, height: 1.5, backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 1 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.20)', borderRadius: 12, padding: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' }}>
          <FontAwesome5 name={card.icon} size={16} color="#fff" />
        </View>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}>
          <Text style={{ fontSize: 8, fontWeight: '800', color: 'rgba(255,255,255,0.9)', letterSpacing: 1.2 }}>{card.tag}</Text>
        </View>
      </View>
      <View>
        <Text style={{ fontSize: 9.5, fontWeight: '700', color: 'rgba(255,255,255,0.72)', letterSpacing: 0.4, marginBottom: 2 }}>{card.label}</Text>
        {loading
          ? <ShimmerBar width={80} height={22} borderRadius={5} />
          : <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.8 }}>{card.value}</Text>
        }
        {card.showLive && !loading && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <PulsingLiveDot />
            <Text style={{ fontSize: 9, fontWeight: '800', color: '#86efac', letterSpacing: 1.5 }}>LIVE</Text>
          </View>
        )}
      </View>
    </LinearGradient>
  </View>
);

// ─── WEB Grid Item ─────────────────────────────────────────────────────────────
const WebGridItem = ({ item, router, itemW, isDark }: any) => {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const IconLib = item.library;

  return (
    <Animated.View style={[{ width: itemW }, animStyle]}>
      <Pressable
        onPressIn={() => { scale.value = withSpring(0.95, { damping: 14, stiffness: 320 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 10, stiffness: 200 }); }}
        onPress={() => router.push(item.route)}
        style={{
          borderRadius: 24, overflow: 'hidden',
          backgroundColor: item.color[0],
          borderWidth: 0,
          borderTopWidth: 1.5,
          borderTopColor: 'rgba(255,255,255,0.45)',
          borderBottomWidth: 3.5,
          borderBottomColor: 'rgba(0,0,0,0.3)',
          shadowColor: item.color[0],
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: isDark ? 0.4 : 0.25,
          shadowRadius: 12,
          elevation: 6,
          position: 'relative',
        }}>
        {/* Dual Depth Clay Glare */}
        <View style={[StyleSheet.absoluteFill, { borderRadius: 24, overflow: 'hidden' }]}>
          <LinearGradient
            colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </View>

        <View style={{ padding: 18, height: 120, justifyContent: 'space-between', zIndex: 2 }}>
          <View style={{ 
            width: 44, height: 44, borderRadius: 14, 
            backgroundColor: 'rgba(255,255,255,0.2)', 
            alignItems: 'center', justifyContent: 'center', 
            borderTopWidth: 1.2, borderTopColor: 'rgba(255,255,255,0.45)', 
            borderBottomWidth: 1.2, borderBottomColor: 'rgba(0,0,0,0.15)' 
          }}>
            <IconLib name={item.icon} size={22} color="#FFFFFF" />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <Text style={{
              flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.2, lineHeight: 18,
              textShadowColor: 'rgba(0,0,0,0.15)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2
            }} numberOfLines={2}>
              {item.title}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
};

// ─── Mobile GridItem ──────────────────────────────────────────────────────────
const MobileGridItem = ({ item, index, router, styles, isDark, GRID_ITEM_W }: any) => {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const IconLib = item.library;

  return (
    <Animated.View entering={FadeInDown.delay(300 + index * 55).duration(500).springify()}
      style={[{ width: GRID_ITEM_W, height: GRID_ITEM_W + 16 }]}>
      <Animated.View style={[{ flex: 1 }, animStyle]}>
        <Pressable
          onPressIn={() => { scale.value = withSpring(0.95, { damping: 14, stiffness: 320 }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          onPressOut={() => { scale.value = withSpring(1, { damping: 10, stiffness: 180 }); }}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push(item.route); }}
          style={{
            flex: 1,
            borderRadius: 24, overflow: 'hidden',
            borderWidth: 1.5,
            borderColor: 'rgba(255,255,255,0.25)',
            borderBottomWidth: 4,
            borderBottomColor: 'rgba(0,0,0,0.2)',
            shadowColor: item.color[0],
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
          }}>
          
          {/* Vibrant Background Gradient */}
          <LinearGradient
            colors={item.color}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* Clay Inner Highlight */}
          <LinearGradient
            colors={['rgba(255,255,255,0.4)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
            style={[StyleSheet.absoluteFill, { borderRadius: 24 }]}
            pointerEvents="none"
          />

          <View style={{ padding: 14, flex: 1, justifyContent: 'space-between' }}>
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' }}>
              <IconLib name={item.icon} size={18} color={item.color[isDark ? 1 : 0]} />
            </View>
            <View>
              <Text style={{
                color: isDark ? '#fff' : '#2A3142', fontSize: 11, fontWeight: '700', letterSpacing: -0.1, lineHeight: 14
              }} numberOfLines={2}>
                {item.title}
              </Text>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
};

// ─── Web Analytics ────────────────────────────────────────────────────────────
// ─── Web Analytics ────────────────────────────────────────────────────────────
const WebAnalyticsSection = ({ data, loading, isDark, theme, contentW, config = {} }: any) => {
  if (loading) {
    return (
      <View style={{ flexDirection: 'row', gap: 16, marginBottom: 28 }}>
        <View style={{ flex: 1.6, backgroundColor: isDark ? 'rgba(255,255,255,0.045)' : '#fff', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.06)', gap: 12 }}>
          <ShimmerBar width={140} height={14} />{[1, 2, 3].map(i => <ShimmerBar key={i} width={'100%' as any} height={8} />)}
        </View>
        <View style={{ flex: 1, gap: 12 }}>
          {[1, 2, 3].map(i => (
            <View key={i} style={{ flex: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.045)' : '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.06)', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <ShimmerBar width={32} height={32} borderRadius={10} />
              <View style={{ gap: 6 }}><ShimmerBar width={60} height={8} /><ShimmerBar width={40} height={13} /></View>
            </View>
          ))}
        </View>
      </View>
    );
  }
  if (!data) return null;

  const lineData = data.financials.trend.map((pt: any) => ({ 
    value: pt.value, 
    label: pt.label,
    dataPointText: formatCurrencyShort(pt.value)
  }));
  const hasChartData = lineData.length >= 2;

  const getMetricState = (val: number | null | undefined, isPercent: boolean, sub: string) => {
    if (val == null || val === 0) return { value: 'No data', subLabel: 'Not enough data recorded yet' };
    return { value: `${val}${isPercent ? '%' : ''}`, subLabel: sub };
  };

  const coll = getMetricState(data.financials.collection_efficiency, true, `${formatCurrencyShort(data.financials.total_collected)} of ${formatCurrencyShort(data.financials.total_invoiced)} collected`);
  const att = getMetricState(data.attendance.avg_attendance, true, `${data.attendance.total_present_days || 0} of ${data.attendance.total_working_days || 0} student-days present`);
  const acad = getMetricState(data.academics.avg_score, true, `${data.academics.exams_conducted || 0} exams conducted`);

  const metrics = [];
  if (config.collection_efficiency !== false) {
    metrics.push({ icon: 'trending-up', color: '#6366F1', bg: 'rgba(99,102,241,0.12)', label: 'Collection Efficiency', value: coll.value, subLabel: coll.subLabel });
  }
  if (config.avg_attendance !== false) {
    metrics.push({ icon: 'people', color: '#10B981', bg: 'rgba(16,185,129,0.12)', label: 'Avg Attendance', value: att.value, subLabel: att.subLabel });
  }
  if (config.academic_score !== false) {
    metrics.push({ icon: 'school', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', label: 'Academic Score', value: acad.value, subLabel: acad.subLabel });
  }

  const showChart = config.revenue_trend !== false;
  const showAnyMetric = metrics.length > 0;
  const showInsights = config.system_insights !== false && data.insights?.length > 0;

  if (!showChart && !showAnyMetric && !showInsights) return null;

  return (
    <Animated.View entering={FadeInDown.delay(100).duration(500)} style={{ marginBottom: 28 }}>
      {(showChart || showAnyMetric) && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <View style={{ width: 4, height: 20, borderRadius: 2, backgroundColor: '#8B5CF6', shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 5 }} />
            <Text style={{ fontSize: 16, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.3 }}>Financial Performance</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            {/* Chart */}
            {showChart && (
              <View style={{ flex: 1.6, backgroundColor: isDark ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.95)', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.06)', overflow: 'hidden', shadowColor: isDark ? '#6366F1' : '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: isDark ? 0.15 : 0.05, shadowRadius: 16, elevation: 6 }}>
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: '#6366F1', borderTopLeftRadius: 20, borderTopRightRadius: 20, opacity: 0.75 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.text, opacity: 0.85 }}>Revenue Trend</Text>
                  <View style={{ backgroundColor: 'rgba(99,102,241,0.18)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(99,102,241,0.30)' }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: isDark ? '#818CF8' : '#4F46E5', letterSpacing: 0.8, textTransform: 'uppercase' }}>6 Months</Text>
                  </View>
                </View>
                
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20, paddingHorizontal: 4 }}>
                  <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.04)', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)' }}>
                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.2 }}>Total Expected</Text>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: theme.colors.text }}>{formatCurrencyShort(data.financials.total_invoiced)}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.04)', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: isDark ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.08)' }}>
                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.2 }}>Total Collected</Text>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#10B981' }}>{formatCurrencyShort(data.financials.total_collected)}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.04)', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)' }}>
                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.2 }}>Pending</Text>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#EF4444' }}>{formatCurrencyShort(data.financials.outstanding_dues)}</Text>
                  </View>
                </View>

                <View style={{ marginLeft: -10, minHeight: 180, justifyContent: 'center' }}>
                  {hasChartData ? (
                    <LineChart data={lineData} height={160} width={contentW * (showAnyMetric ? 0.51 : 0.82)} initialSpacing={30} spacing={55}
                      color="#6366F1" thickness={2.5} hideRules={false} hideYAxisText={false} yAxisColor="transparent" xAxisColor="transparent"
                      rulesColor={isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}
                      yAxisTextStyle={{ color: theme.colors.textSecondary, fontSize: 10, opacity: 0.7 }}
                      xAxisLabelTextStyle={{ color: theme.colors.textSecondary, fontSize: 10, opacity: 0.7 }}
                      formatYLabel={(label: string) => formatCurrencyShort(Number(label))}
                      dataPointsColor="#6366F1" areaChart startFillColor="rgba(99,102,241,0.22)" endFillColor="rgba(99,102,241,0.01)"
                      curved animateOnDataChange animationDuration={800}
                      pointerConfig={{
                        pointerStripHeight: 160,
                        pointerStripColor: 'rgba(99,102,241,0.4)',
                        pointerStripWidth: 2,
                        pointerColor: '#6366F1',
                        radius: 5,
                        pointerLabelWidth: 80,
                        pointerLabelHeight: 40,
                        activatePointersOnLongPress: true,
                        autoAdjustPointerLabelPosition: true,
                        pointerLabelComponent: (items: any) => {
                          return (
                            <View style={{ backgroundColor: isDark ? '#374151' : '#fff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 }}>
                              <Text style={{ color: isDark ? '#fff' : '#000', fontSize: 11, fontWeight: '800', textAlign: 'center' }}>{items[0].dataPointText}</Text>
                              <Text style={{ color: theme.colors.textSecondary, fontSize: 9, textAlign: 'center', marginTop: 2 }}>{items[0].label}</Text>
                            </View>
                          );
                        },
                      }}
                    />
                  ) : (
                    <View style={{ alignItems: 'center', justifyContent: 'center', minHeight: 160, opacity: 0.5 }}>
                      <Ionicons name="bar-chart-outline" size={40} color={theme.colors.textSecondary} style={{ marginBottom: 12 }} />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.text }}>Not enough data yet</Text>
                      <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 }}>Revenue trend appears after 2+ months of data</Text>
                    </View>
                  )}
                </View>
              </View>
            )}
            
            {showChart && showAnyMetric && <View style={{ width: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', marginVertical: 10 }} />}

            {/* Metrics */}
            {showAnyMetric && (
              <View style={{ flex: 1, flexDirection: showChart ? 'column' : 'row', gap: 10 }}>
                {metrics.map(m => (
                  <View key={m.label} style={{ flex: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.95)', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.06)', flexDirection: 'row', alignItems: 'center', gap: 10, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: isDark ? 0.18 : 0.04, shadowRadius: 8, elevation: 3 }}>
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, backgroundColor: m.color, borderTopLeftRadius: 16, borderTopRightRadius: 16, opacity: 0.8 }} />
                    <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: m.bg, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={m.icon as any} size={17} color={m.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 9.5, fontWeight: '700', letterSpacing: 0.3, color: theme.colors.textSecondary, textTransform: 'uppercase', marginBottom: 3 }}>{m.label}</Text>
                      <Text style={{ fontSize: 18, fontWeight: '800', color: m.value === 'No data' ? theme.colors.textSecondary : m.color }}>{m.value}</Text>
                      <Text style={{ fontSize: 9, fontWeight: '600', color: theme.colors.textSecondary, marginTop: 2, opacity: 0.8 }} numberOfLines={1}>{m.subLabel}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </>
      )}

      {showInsights && (
        <View style={{ marginTop: 14, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <View style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: '#F59E0B' }} />
            <Text style={{ fontSize: 15, fontWeight: '800', color: theme.colors.text }}>System Insights</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {data.insights.slice(0, 3).map((insight: any) => (
              <View key={insight.id} style={{ flex: 1, backgroundColor: insight.severity === 'high' ? (isDark ? 'rgba(239,68,68,0.09)' : 'rgba(239,68,68,0.04)') : (isDark ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.9)'), borderRadius: 14, padding: 14, borderWidth: 1, borderColor: insight.severity === 'high' ? 'rgba(239,68,68,0.20)' : (isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.06)'), flexDirection: 'row', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3.5, backgroundColor: insight.severity === 'high' ? '#EF4444' : '#6366F1', borderRadius: 2 }} />
                <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: insight.severity === 'high' ? 'rgba(239,68,68,0.12)' : 'rgba(99,102,241,0.12)', alignItems: 'center', justifyContent: 'center', marginLeft: 6 }}>
                  <Ionicons name={insight.severity === 'high' ? 'flash' : 'bulb-outline'} size={14} color={insight.severity === 'high' ? '#EF4444' : '#6366F1'} />
                </View>
                <Text style={{ flex: 1, fontSize: 11.5, fontWeight: '600', color: theme.colors.text, lineHeight: 17 }} numberOfLines={2}>{insight.message}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </Animated.View>
  );
};

// ─── Web Transactions Table ───────────────────────────────────────────────────
const WebTransactionsSection = ({ transactions, loading, isDark, theme, router }: any) => (
  <View style={{ marginBottom: 24 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 4, height: 20, borderRadius: 2, backgroundColor: '#10B981', shadowColor: '#10B981', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 5 }} />
        <Text style={{ fontSize: 16, fontWeight: '800', color: theme.colors.text }}>Recent Transactions</Text>
      </View>
      <Pressable onPress={() => router.push('/accounts/receipts')}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#3B82F6' }}>View all →</Text>
      </Pressable>
    </View>

    <View style={{ 
      backgroundColor: isDark ? '#1C1F2A' : '#FFFFFF', 
      borderRadius: 24, 
      borderWidth: 0,
      borderTopWidth: 1.5, borderTopColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.85)',
      borderBottomWidth: 3.5, borderBottomColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(76,90,120,0.06)',
      shadowColor: isDark ? '#000' : '#6B7A99', 
      shadowOffset: { width: 0, height: 6 }, 
      shadowOpacity: isDark ? 0.22 : 0.08, 
      shadowRadius: 10, 
      elevation: 3, 
      position: 'relative'
    }}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: 24, overflow: 'hidden' }]}>
        <LinearGradient
          colors={isDark ? ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </View>

      <View style={{ position: 'relative', zIndex: 2 }}>
        {/* Table header */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 22, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', backgroundColor: isDark ? 'rgba(0,0,0,0.15)' : 'rgba(249,250,251,0.6)', borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
          {['Student', 'Class · Type', 'Date', 'Amount'].map((h, i) => (
            <Text key={h} style={{ flex: i === 0 ? 2 : 1, fontSize: 10, fontWeight: '800', color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280', letterSpacing: 0.8, textTransform: 'uppercase', textAlign: i === 3 ? 'right' : 'left' }}>{h}</Text>
          ))}
        </View>

        {loading
          ? [1, 2, 3, 4].map(i => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', gap: 12 }}>
              <ShimmerBar width={36} height={36} borderRadius={10} />
              <View style={{ flex: 2, gap: 6 }}><ShimmerBar width={100} height={11} /><ShimmerBar width={70} height={9} /></View>
              <ShimmerBar width={60} height={10} style={{ flex: 1 } as any} />
              <ShimmerBar width={50} height={10} style={{ flex: 1 } as any} />
              <ShimmerBar width={70} height={14} style={{ flex: 1 } as any} />
            </View>
          ))
          : transactions.map((tx: any, index: number) => {
            const accent = AVATAR_PALETTE[index % AVATAR_PALETTE.length];
            return (
              <Animated.View key={tx.id} entering={FadeInDown.delay(index * 50).duration(350)}>
                <Pressable
                  onPress={() => router.push('/accounts/receipts')}
                  style={({ pressed }: any) => ({ 
                    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 12, 
                    borderBottomWidth: index < transactions.length - 1 ? 1 : 0, 
                    borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', 
                    backgroundColor: pressed ? (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)') : 'transparent' 
                  })}>
                  <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <View style={{ 
                      width: 40, height: 40, borderRadius: 12, 
                      backgroundColor: accent, 
                      borderTopWidth: 1.2, borderTopColor: 'rgba(255,255,255,0.4)',
                      borderBottomWidth: 1.2, borderBottomColor: 'rgba(0,0,0,0.2)',
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0 
                    }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.2)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>{tx.name?.[0]?.toUpperCase() ?? '?'}</Text>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.text }}>{tx.name}</Text>
                  </View>
                  <View style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <View style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 9.5, fontWeight: '800', color: isDark ? 'rgba(255,255,255,0.7)' : '#4B5563', letterSpacing: 0.3 }}>{tx.class}</Text>
                    </View>
                    <Text style={{ fontSize: 11.5, color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280', fontWeight: '600' }}>{tx.type}</Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 12, color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280', fontWeight: '500' }}>{tx.time}</Text>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '800', color: theme.colors.success, textAlign: 'right' }}>{tx.amount}</Text>
                </Pressable>
              </Animated.View>
            );
          })
        }

        {!loading && transactions.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 36, gap: 8 }}>
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)' }}>
              <FontAwesome5 name="receipt" size={20} color={isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF'} />
            </View>
            <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>No recent transactions</Text>
          </View>
        )}
      </View>
    </View>
  </View>
);

// ─── Mobile Analytics ─────────────────────────────────────────────────────────
const MobileAnalyticsSection = ({ data, loading, styles, isDark, contentW, config = {} }: any) => {
  const { theme } = useTheme();
  if (loading) {
    return (
      <View style={[styles.analyticsContainer, { gap: 12 }]}>
        <View style={styles.chartCard}><ShimmerBar width={120} height={14} style={{ marginBottom: 16 }} />{[1, 2, 3].map(i => <ShimmerBar key={i} width={'100%' as any} height={8} style={{ marginBottom: 10 }} />)}</View>
        <View style={{ flexDirection: 'row', gap: 10 }}>{[1, 2, 3].map(i => (<View key={i} style={[styles.miniStatCard, { flex: 1 }]}><ShimmerBar width={32} height={32} borderRadius={10} style={{ marginRight: 10 }} /><View style={{ gap: 6 }}><ShimmerBar width={48} height={8} /><ShimmerBar width={36} height={13} /></View></View>))}</View>
      </View>
    );
  }
  if (!data) return null;
  const lineData = data.financials.trend.map((pt: any) => ({ 
    value: pt.value, 
    label: pt.label,
    dataPointText: formatCurrencyShort(pt.value)
  }));
  const hasChartData = lineData.length >= 2;

  const getMetricState = (val: number | null | undefined, isPercent: boolean, sub: string) => {
    if (val == null || val === 0) return { value: 'No data', subLabel: 'Not enough data' };
    return { value: `${val}${isPercent ? '%' : ''}`, subLabel: sub };
  };

  const coll = getMetricState(data.financials.collection_efficiency, true, `${formatCurrencyShort(data.financials.total_collected)} of ${formatCurrencyShort(data.financials.total_invoiced)}`);
  const att = getMetricState(data.attendance.avg_attendance, true, `${data.attendance.total_present_days || 0} / ${data.attendance.total_working_days || 0} days`);
  const acad = getMetricState(data.academics.avg_score, true, `${data.academics.exams_conducted || 0} exams`);

  const metrics = [];
  if (config.collection_efficiency !== false) {
    metrics.push({ icon: 'trending-up', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)', label: 'Efficiency', value: coll.value, subLabel: coll.subLabel });
  }
  if (config.avg_attendance !== false) {
    metrics.push({ icon: 'people', color: '#10B981', bg: 'rgba(16,185,129,0.12)', label: 'Attendance', value: att.value, subLabel: att.subLabel });
  }
  if (config.academic_score !== false) {
    metrics.push({ icon: 'school', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', label: 'Academic', value: acad.value, subLabel: acad.subLabel });
  }

  const showChart = config.revenue_trend !== false;
  const showAnyMetric = metrics.length > 0;

  if (!showChart && !showAnyMetric) return null;

  return (
    <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.analyticsContainer}>
      {showChart && (
        <>
          <View style={[styles.sectionHeader, { marginBottom: 12, paddingHorizontal: 0 }]}>
            <View style={styles.sectionTitleRow}>
              <View style={[styles.sectionAccentBar, { backgroundColor: '#8B5CF6' }]} />
              <Text style={styles.sectionTitle}>Financial Performance</Text>
            </View>
          </View>
          <View style={styles.chartCard}>
            <View style={styles.chartTopGlow} />
            <View style={styles.chartHeader}>
              <Text style={styles.chartTitle}>Revenue Trend</Text>
              <View style={[styles.chartBadge, { backgroundColor: 'rgba(99,102,241,0.18)', borderColor: 'rgba(99,102,241,0.30)' }]}><Text style={[styles.chartBadgeText, { color: isDark ? '#818CF8' : '#4F46E5' }]}>6 Months</Text></View>
            </View>
            
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16, marginTop: 12 }}>
                <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.04)', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.08)' }}>
                  <Text style={{ fontSize: 8, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 2, textTransform: 'uppercase' }}>Total Expected</Text>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: theme.colors.textPrimary }}>{formatCurrencyShort(data.financials.total_invoiced)}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.04)', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: isDark ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.08)' }}>
                  <Text style={{ fontSize: 8, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 2, textTransform: 'uppercase' }}>Collected</Text>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#10B981' }}>{formatCurrencyShort(data.financials.total_collected)}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.04)', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.08)' }}>
                  <Text style={{ fontSize: 8, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 2, textTransform: 'uppercase' }}>Pending</Text>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#EF4444' }}>{formatCurrencyShort(data.financials.outstanding_dues)}</Text>
                </View>
            </View>

            <View style={{ marginLeft: -14, minHeight: 180, justifyContent: 'center' }}>
              {hasChartData ? (
                <LineChart data={lineData} height={150} width={contentW - 65} initialSpacing={35} spacing={55}
                  color="#6366F1" thickness={3} hideRules={false} hideYAxisText={false} yAxisColor="transparent" xAxisColor="transparent"
                  rulesColor={isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}
                  yAxisTextStyle={{ color: theme.colors.textSecondary, fontSize: 10, opacity: 0.7 }}
                  xAxisLabelTextStyle={{ color: theme.colors.textSecondary, fontSize: 10, opacity: 0.7 }}
                  formatYLabel={(label: string) => formatCurrencyShort(Number(label))}
                  dataPointsColor="#6366F1" focusedDataPointColor="#4F46E5" areaChart
                  startFillColor="rgba(99,102,241,0.28)" endFillColor="rgba(99,102,241,0.01)"
                  curved animateOnDataChange animationDuration={1000}
                  pointerConfig={{
                    pointerStripHeight: 150,
                    pointerStripColor: 'rgba(99,102,241,0.4)',
                    pointerStripWidth: 2,
                    pointerColor: '#6366F1',
                    radius: 5,
                    pointerLabelWidth: 80,
                    pointerLabelHeight: 40,
                    activatePointersOnLongPress: true,
                    autoAdjustPointerLabelPosition: true,
                    pointerLabelComponent: (items: any) => {
                      return (
                        <View style={{ backgroundColor: isDark ? '#374151' : '#fff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 }}>
                          <Text style={{ color: isDark ? '#fff' : '#000', fontSize: 11, fontWeight: '800', textAlign: 'center' }}>{items[0].dataPointText}</Text>
                          <Text style={{ color: theme.colors.textSecondary, fontSize: 9, textAlign: 'center', marginTop: 2 }}>{items[0].label}</Text>
                        </View>
                      );
                    },
                  }}
                />
              ) : (
                <View style={{ alignItems: 'center', justifyContent: 'center', height: 160, opacity: 0.5 }}>
                  <Ionicons name="bar-chart-outline" size={40} color={theme.colors.textSecondary} style={{ marginBottom: 12 }} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.textPrimary }}>Not enough data yet</Text>
                  <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 }}>Revenue trend appears after 2+ months</Text>
                </View>
              )}
            </View>
          </View>
        </>
      )}
      {showAnyMetric && (
        <View style={styles.analyticsStatsRow}>
          {metrics.map(({ icon, color, bg, label, value, subLabel }) => (
            <View key={label} style={styles.miniStatCard}>
              <View style={[styles.miniStatTopLine, { backgroundColor: color }]} />
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, width: '100%' }}>
                <View style={[styles.miniStatIcon, { backgroundColor: bg }]}><Ionicons name={icon as any} size={16} color={color} /></View>
                <Text style={styles.miniStatLabel}>{label}</Text>
              </View>
              <View style={{ width: '100%' }}>
                <Text style={[styles.miniStatValue, { color: value === 'No data' ? theme.colors.textSecondary : color, fontSize: value === 'No data' ? 12 : 16 }]}>{value}</Text>
                <Text style={{ fontSize: 8.5, color: theme.colors.textSecondary, marginTop: 3, opacity: 0.8 }} numberOfLines={2}>{subLabel}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </Animated.View>
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
function mapDashboardTransactions(rows: any[]) {
  return (Array.isArray(rows) ? rows : []).map((tx: any) => ({
    id: tx.id,
    name: tx.student_name || '—',
    class: tx.class_name || '—',
    type: tx.fee_type || 'Fee',
    amount: `+₹${Number(tx.amount ?? 0).toLocaleString('en-IN')}`,
    time: new Date(tx.collected_at || tx.paid_at || tx.payment_date || tx.created_at || Date.now()).toLocaleDateString('en-IN'),
  }));
}

export default function AccountsDashboard() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, role } = useAuth();
  const { hasPermission } = usePermissions();
  const { theme, isDark } = useTheme();
  const { shellActive } = useAccountsWebChrome();
  const layout = useLayout(shellActive);
  const { isWeb, contentW, CARD_H_PAD, GRID_COLS, GRID_GAP, GRID_ITEM_W, winW } = layout;
  const styles = useMemo(() => createStyles(theme, isDark, GRID_ITEM_W), [theme, isDark, GRID_ITEM_W]);
  const webHeroStacks = isWeb && contentW < 760;

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<Record<string, boolean>>({});
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const carouselRef = useRef<ScrollView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const authUserId = user?.userId || user?.id || null;
  const canSeeAllCollections = role === 'admin' || role === 'principal';

  const { data: statsData, loading: statsLoading } = useApiQuery<any>(
    '/fees/dashboard-stats',
    'accounts-dashboard-stats',
    DASHBOARD_CACHE_TTL_MS,
    authUserId,
    { query: { for_accounts: '1' }, persist: true }
  );

  const recentFromStats = statsData?.stats?.recent_transactions;
  const shouldFetchRecentTx = !!authUserId && !(Array.isArray(recentFromStats) && recentFromStats.length > 0);
  const recentTxQuery = canSeeAllCollections ? '' : `received_by=${authUserId}`;

  const { data: recentTxRows } = usePersistedSWR<any[]>({
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
      todaysCollection: rawStats.todays_collection !== undefined ? `₹${rawStats.todays_collection.toLocaleString()}` : null,
      pendingDues: rawStats.pending_dues !== undefined ? `₹${rawStats.pending_dues.toLocaleString()}` : null
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

  const carouselCards = useMemo(() => {
    const cards = [];
    if (config.total_collection_month !== false && stats?.totalCollection != null) {
      cards.push({ id: 'monthly', label: t('accounts_dashboard.total_collection_month'), value: loading ? '—' : stats?.totalCollection || '₹0', icon: 'wallet', grad: ['#1D4ED8', '#6366F1'] as [string, string], shadowColor: '#4338CA', showLive: true, watermark: 'chart-bar', tag: 'THIS MONTH' });
    }
    if (config.todays_collection !== false && stats?.todaysCollection != null) {
      cards.push({ id: 'today', label: t('accounts_dashboard.todays_collection'), value: loading ? '—' : stats?.todaysCollection || '₹0', icon: 'wallet', grad: ['#047857', '#10B981'] as [string, string], shadowColor: '#059669', showLive: false, watermark: 'arrow-circle-up', tag: 'TODAY' });
    }
    if (config.pending_dues !== false && stats?.pendingDues != null) {
      cards.push({ id: 'pending', label: t('accounts_dashboard.pending_dues'), value: loading ? '—' : stats?.pendingDues || '₹0', icon: 'file-invoice-dollar', grad: ['#991B1B', '#EF4444'] as [string, string], shadowColor: '#DC2626', showLive: false, watermark: 'exclamation-circle', tag: 'OVERDUE' });
    }
    return cards;
  }, [loading, stats, t, config]);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (carouselCards.length === 0) return;
    timerRef.current = setInterval(() => {
      setActiveIndex(prev => { const next = (prev + 1) % carouselCards.length; carouselRef.current?.scrollTo({ x: next * winW, animated: true }); return next; });
    }, 5000);
  }, [carouselCards.length, winW]);
  const stopTimer = useCallback(() => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } }, []);
  useEffect(() => { if (!isWeb) { startTimer(); return () => stopTimer(); } }, [carouselCards.length, isWeb]);

  const quickActions = useMemo(() => [
    { id: 'collect', title: 'Collect Fees', description: 'Process student payments', icon: 'cash', color: ['#059669', '#10B981'] as [string, string], route: '/accounts/fees', library: Ionicons, permission: 'fees.collect' },
    { id: 'today_collection', title: "Today's Collection", description: 'Your daily collection report', icon: 'today', color: ['#0E7490', '#06B6D4'] as [string, string], route: '/accounts/fees/today-collection', library: Ionicons, permission: 'fees.collect' },
    { id: 'upi_qr', title: 'Collect via UPI', description: 'Dynamic UPI QR for payments', icon: 'qr-code-outline', color: ['#B45309', '#F59E0B'] as [string, string], route: '/accounts/collect-fee-qr', library: Ionicons, permission: 'fees.collect' },
    { id: 'expenses', title: 'Expenses', description: 'Manage school expenditures', icon: 'receipt', color: ['#B91C1C', '#EF4444'] as [string, string], route: '/accounts/expenses', library: Ionicons, permission: 'expenses.view' },
    { id: 'payroll', title: 'Payroll', description: 'Staff salary & attendance', icon: 'people', color: ['#4338CA', '#6366F1'] as [string, string], route: '/accounts/payroll', library: Ionicons, permission: 'payroll.process' },
    { id: 'invoices', title: 'Invoices', description: 'Generate & track invoices', icon: 'document-text', color: ['#1D4ED8', '#3B82F6'] as [string, string], route: '/accounts/invoices', library: Ionicons },
    { id: 'receipts', title: 'Receipts', description: 'View payment history', icon: 'documents', color: ['#0369A1', '#0EA5E9'] as [string, string], route: '/accounts/receipts', library: Ionicons },
    { id: 'staff', title: 'Add Staff', description: 'Register new employees', icon: 'person-add', color: ['#6D28D9', '#8B5CF6'] as [string, string], route: '/accounts/addStaff', library: Ionicons, permission: 'staff.create' },
    { id: 'student', title: 'Add Student', description: 'Enroll new students', icon: 'school', color: ['#BE185D', '#F43F5E'] as [string, string], route: '/accounts/addStudent', library: Ionicons },
    { id: 'pending_enrollments', title: 'Pending Enrolments', description: 'Review new applications', icon: 'person-add-outline', color: ['#7C3AED', '#A78BFA'] as [string, string], route: '/accounts/pending-enrollments', library: Ionicons },
    { id: 'defaulters', title: 'Defaulters', description: 'Previous-year pending fees', icon: 'alert-circle', color: ['#B91C1C', '#EF4444'] as [string, string], route: '/accounts/defaulters', library: Ionicons },
    { id: 'transport_fees', title: 'Transport Fees', description: 'Stop-based bus fee management', icon: 'bus', color: ['#0E7490', '#06B6D4'] as [string, string], route: '/accounts/transport-fees', library: Ionicons },
  ].filter((action) => !action.permission || hasPermission(action.permission)), [hasPermission]);

  // ── WEB LAYOUT ──────────────────────────────────────────────────────────────
  if (isWeb) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 28, paddingTop: 34, paddingBottom: 48 }} overScrollMode="never">
          <PaymentDueBanner />

          {/* Page hero */}
          <View style={{ marginBottom: 28 }}>
            <DashboardHero
              eyebrow={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()}
              greeting="Hello"
              name={user?.displayName?.split(' ')[0] || 'Admin'}
              subtitle="Financial Overview"
              cardWidth={Math.min(610, contentW * 0.68)}
              stacks={webHeroStacks}
              card={
                <AdminHeaderCard
                  compact
                  compactRole
                  displayName={user?.displayName || 'User'}
                  photoUrl={user?.photoUrl}
                  roleLabel={user?.role?.name || 'Accountant'}
                  staffCode={user?.staff_code}
                  portalBadge="ACCOUNTS"
                />
              }
            />
          </View>

          {/* Stats row */}
          <Animated.View entering={FadeInDown.delay(60).duration(400)} style={{ flexDirection: 'row', gap: 16, marginBottom: 28 }}>
            {carouselCards.map(card => <WebStatCard key={card.id} card={card} loading={loading} isDark={isDark} theme={theme} />)}
          </Animated.View>

          {/* Analytics */}
          <WebAnalyticsSection data={analytics} loading={analyticsLoading} isDark={isDark} theme={theme} contentW={contentW} config={config} />

          {/* Quick Actions */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 4, height: 20, borderRadius: 2, backgroundColor: '#3B82F6', shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 5 }} />
              <Text style={{ fontSize: 16, fontWeight: '800', color: theme.colors.textPrimary }}>Quick Actions</Text>
            </View>
            <View style={{ backgroundColor: isDark ? 'rgba(59,130,246,0.18)' : 'rgba(59,130,246,0.10)', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: isDark ? 'rgba(59,130,246,0.30)' : 'rgba(59,130,246,0.20)' }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#3B82F6' }}>{quickActions.length}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, marginBottom: 32 }}>
            {quickActions.map((action, index) => (
              <Animated.View key={action.id} entering={FadeInDown.delay(80 + index * 35).duration(350).springify()}>
                <WebGridItem item={action} router={router} itemW={GRID_ITEM_W} isDark={isDark} />
              </Animated.View>
            ))}
          </View>

          {/* Transactions table */}
          <WebTransactionsSection transactions={transactions} loading={loading} isDark={isDark} theme={theme} router={router} />

        </ScrollView>
      </View>
    );
  }

  // ── MOBILE LAYOUT ───────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />
      {isDark && (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <View style={{ position: 'absolute', top: -80, left: -80, width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(99,102,241,0.09)' }} />
          <View style={{ position: 'absolute', top: 40, right: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(139,92,246,0.07)' }} />
        </View>
      )}
      <AdminHeader title={t('accounts_dashboard.dashboard_title', 'Dashboard')} onMenuPress={() => setIsMenuOpen(true)} />
      <DashboardMenuOverlay isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)}
        items={[{ title: 'Dashboard', description: 'Financial Overview', icon: 'grid-outline', route: '/accounts/dashboard', gradient: ['#3B82F6', '#1D4ED8'] }, ...quickActions.map(a => ({ title: a.title, description: a.description, icon: a.icon, route: a.route, gradient: a.color }))]}
        onItemPress={(route) => { setIsMenuOpen(false); router.push(route as any); }}
        activeRoute="/accounts/dashboard" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} overScrollMode="never" bounces>
        <View style={styles.bannerPad}>
          <PaymentDueBanner />
        </View>

        {/* Greeting + profile card — one unified panel */}
        <View style={styles.bannerPad}>
          <DashboardHero
            eyebrow={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}
            greeting="Hello"
            name={user?.displayName?.split(' ')[0] || 'Admin'}
            subtitle={t('accounts_dashboard.welcome_back', 'Here is your financial overview')}
            stacks
            card={
              <AdminHeaderCard
                compact
                compactRole
                displayName={user?.displayName || 'User'}
                photoUrl={user?.photoUrl}
                roleLabel={user?.role?.name || 'Accountant'}
                staffCode={user?.staff_code}
                portalBadge="ACCOUNTS"
              />
            }
          />
        </View>

        {/* Carousel */}
        {carouselCards.length > 0 && (
          <Animated.View entering={FadeInDown.delay(80).springify()}>
            <ScrollView ref={carouselRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => { const i = Math.round(e.nativeEvent.contentOffset.x / winW); setActiveIndex(i); startTimer(); }}
              onScrollBeginDrag={stopTimer} onScrollEndDrag={startTimer}
              decelerationRate="fast" bounces={false} overScrollMode="never" style={styles.carouselScroll}>
              {carouselCards.map((card) => (
                <View key={card.id} style={[styles.carouselSlide, { width: winW }]}>
                  <View style={[styles.cardShadowBloom, { backgroundColor: card.shadowColor }]} />
                  <LinearGradient colors={card.grad} style={styles.carouselCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <DotGrid />
                    <View style={styles.cardBlob1} /><View style={styles.cardBlob2} /><View style={styles.cardBlob3} />
                    <View style={styles.cardWatermark}><FontAwesome5 name={card.watermark as any} size={80} color="rgba(255,255,255,0.06)" /></View>
                    <View style={styles.cardTopHighlight} />
                    <View style={styles.cardContent}>
                      <View style={styles.cardIconWrap}><FontAwesome5 name={card.icon as any} size={20} color="#fff" /></View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.cardTagBadge}><Text style={styles.cardTagText}>{card.tag}</Text></View>
                        <Text style={styles.cardLabel}>{card.label}</Text>
                        {loading ? <ShimmerBar width={120} height={26} borderRadius={5} style={{ marginTop: 2 }} /> : <Text style={styles.cardValue}>{card.value}</Text>}
                        {card.showLive && !loading && (
                          <View style={styles.liveBadge}><PulsingLiveDot /><Text style={styles.liveText}>LIVE</Text></View>
                        )}
                      </View>
                    </View>
                  </LinearGradient>
                </View>
              ))}
            </ScrollView>
            <View style={styles.dotsRow}>
              {carouselCards.map((card, i) => (
                <Pressable key={i} onPress={() => { carouselRef.current?.scrollTo({ x: i * winW, animated: true }); setActiveIndex(i); startTimer(); }}>
                  <View style={[styles.dot, i === activeIndex && [styles.dotActive, { shadowColor: card.shadowColor }]]} />
                </Pressable>
              ))}
            </View>
          </Animated.View>
        )}

        {/* Analytics */}
        <MobileAnalyticsSection data={analytics} loading={analyticsLoading} styles={styles} isDark={isDark} contentW={winW} config={config} />

        {/* Quick Actions */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <View style={styles.sectionAccentBar} />
            <Text style={styles.sectionTitle}>{t('dashboard.quick_actions', 'Quick Actions')}</Text>
          </View>
          <View style={styles.actionCountPill}><Text style={styles.actionCountText}>{quickActions.length}</Text></View>
        </View>
        <View style={[styles.gridContainer, { paddingHorizontal: CARD_H_PAD, gap: GRID_GAP }]}>
          {quickActions.map((action, index) => (
            <MobileGridItem key={action.id} item={action} index={index} router={router} styles={styles} isDark={isDark} GRID_ITEM_W={GRID_ITEM_W} />
          ))}
        </View>

        {/* Transactions */}
        <View style={[styles.sectionHeader, { marginTop: 4 }]}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionAccentBar, { backgroundColor: '#10B981' }]} />
            <Text style={styles.sectionTitle}>{t('dashboard.recent_transactions', 'Recent Transactions')}</Text>
          </View>
          <Pressable onPress={() => router.push('/accounts/receipts')}><Text style={styles.sectionLink}>View all →</Text></Pressable>
        </View>

        {loading
          ? <View style={{ paddingHorizontal: 20, gap: 10 }}>{[1, 2, 3].map(i => (<View key={i} style={[styles.txCard, { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 }]}><ShimmerBar width={44} height={44} borderRadius={14} style={{ marginRight: 13 }} /><View style={{ flex: 1, gap: 8 }}><ShimmerBar width={120} height={12} /><ShimmerBar width={80} height={9} /></View><View style={{ alignItems: 'flex-end', gap: 6 }}><ShimmerBar width={60} height={14} /><ShimmerBar width={50} height={9} /></View></View>))}</View>
          : transactions.map((tx, index) => {
            const accent = AVATAR_PALETTE[index % AVATAR_PALETTE.length];
            return (
              <Animated.View key={tx.id} entering={FadeInDown.delay(380 + index * 70).springify()} style={[styles.txCard, { paddingVertical: 0, paddingHorizontal: 0 }]}>
                <View style={[styles.txAccentBar, { backgroundColor: accent }]} />
                <Pressable style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 }} onPress={() => router.push('/accounts/receipts')}>
                  <View style={styles.txLeft}>
                    <View style={[styles.avatar, { backgroundColor: accent + '18', borderColor: accent + '35' }]}>
                      <Text style={[styles.avatarText, { color: accent }]}>{tx.name?.[0]?.toUpperCase() ?? '?'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txName}>{tx.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <View style={[styles.txClassPill, { backgroundColor: accent + '18' }]}><Text style={[styles.txClassText, { color: accent }]}>{tx.class}</Text></View>
                        <Text style={styles.txSub}>{tx.type}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.txRight}>
                    <Text style={styles.txAmount}>{tx.amount}</Text>
                    <Text style={styles.txTime}>{tx.time}</Text>
                  </View>
                </Pressable>
              </Animated.View>
            );
          })
        }
        {!loading && transactions.length === 0 && (
          <Animated.View entering={FadeInDown.duration(400)} style={styles.emptyState}>
            <View style={styles.emptyIconWrap}><FontAwesome5 name="receipt" size={24} color={theme.colors.textSecondary} /></View>
            <Text style={styles.emptyText}>No recent transactions</Text>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles (mobile) ──────────────────────────────────────────────────────────
const createStyles = (theme: any, isDark: boolean, GRID_ITEM_W: number) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { paddingTop: 8, paddingBottom: 52 },
  bannerPad: { paddingHorizontal: 20, marginTop: 14 },
  analyticsContainer: { paddingHorizontal: 20, marginBottom: 24 },
  chartCard: { backgroundColor: isDark ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.92)', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.055)', marginBottom: 16, overflow: 'hidden', shadowColor: isDark ? '#6366F1' : '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: isDark ? 0.18 : 0.06, shadowRadius: 20, elevation: 8 },
  chartTopGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: '#6366F1', borderTopLeftRadius: 24, borderTopRightRadius: 24, opacity: 0.7 },
  chartHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  chartTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text, opacity: 0.85 },
  chartBadge: { backgroundColor: 'rgba(99,102,241,0.12)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(99,102,241,0.18)' },
  chartBadgeText: { fontSize: 10, fontWeight: '800', color: '#6366F1', textTransform: 'uppercase', letterSpacing: 0.8 },
  analyticsStatsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  miniStatCard: { flex: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.9)', borderRadius: 18, padding: 12, paddingBottom: 14, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.055)', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0.2 : 0.05, shadowRadius: 10, elevation: 4 },
  miniStatTopLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, borderTopLeftRadius: 18, borderTopRightRadius: 18, opacity: 0.85 },
  miniStatIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  miniStatLabel: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.1, color: theme.colors.textSecondary, textTransform: 'uppercase', flexShrink: 1 },
  miniStatValue: { fontSize: 16, fontWeight: '800' },
  greetingContainer: { paddingHorizontal: 20, marginBottom: 20, marginTop: 14 },
  datePill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.08)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: isDark ? 'rgba(99,102,241,0.22)' : 'rgba(99,102,241,0.15)', marginBottom: 10 },
  datePillDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#6366F1' },
  greetingEyebrow: { fontSize: 9.5, fontWeight: '700', letterSpacing: 1.8, color: '#6366F1' },
  greetingText: { fontSize: 28, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.8, lineHeight: 34 },
  greetingName: { color: isDark ? '#818CF8' : '#4F46E5' },
  greetingSubText: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 5, fontWeight: '500' },
  carouselScroll: { marginBottom: 6 },
  carouselSlide: { paddingHorizontal: 20 },
  cardShadowBloom: { position: 'absolute', bottom: 4, left: 36, right: 36, height: 24, borderRadius: 12, opacity: isDark ? 0.45 : 0.25 },
  carouselCard: { borderRadius: 28, height: 150, overflow: 'hidden', justifyContent: 'flex-end', padding: 22, shadowColor: '#000', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.50, shadowRadius: 28, elevation: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  cardTopHighlight: { position: 'absolute', top: 0, left: 20, right: 20, height: 1.5, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.60)' },
  cardBlob1: { position: 'absolute', top: -44, right: -44, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.10)' },
  cardBlob2: { position: 'absolute', bottom: -28, left: -28, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.07)' },
  cardBlob3: { position: 'absolute', top: 24, right: 80, width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.06)' },
  cardWatermark: { position: 'absolute', right: 16, bottom: 8 },
  cardContent: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  cardIconWrap: { width: 50, height: 50, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.20)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  cardTagBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  cardTagText: { fontSize: 8, fontWeight: '800', color: 'rgba(255,255,255,0.90)', letterSpacing: 1.2 },
  cardLabel: { fontSize: 10.5, fontWeight: '700', color: 'rgba(255,255,255,0.72)', letterSpacing: 0.5, marginBottom: 4 },
  cardValue: { fontSize: 32, fontWeight: '800', color: '#ffffff', letterSpacing: -1.2 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7 },
  liveText: { fontSize: 9, fontWeight: '800', color: '#86efac', letterSpacing: 1.5 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, marginBottom: 30, marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)' },
  dotActive: { width: 24, height: 6, borderRadius: 3, backgroundColor: '#3B82F6', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 6, elevation: 4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionAccentBar: { width: 4, height: 20, borderRadius: 2, backgroundColor: '#3B82F6', shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 5 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.3 },
  sectionLink: { fontSize: 13, fontWeight: '700', color: '#3B82F6' },
  actionCountPill: { backgroundColor: isDark ? 'rgba(59,130,246,0.18)' : 'rgba(59,130,246,0.10)', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: isDark ? 'rgba(59,130,246,0.30)' : 'rgba(59,130,246,0.20)' },
  actionCountText: { fontSize: 11, fontWeight: '800', color: '#3B82F6', letterSpacing: 0.2 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 32 },
  gridItemWrapper: { overflow: 'hidden' },
  gridItem: { flex: 1, borderRadius: 24, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: isDark ? 0.55 : 0.22, shadowRadius: 18, elevation: 12 },
  gridGradient: { flex: 1, padding: 13, justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.22)', borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.12)' },
  topHighlight: { position: 'absolute', top: 0, left: 10, right: 10, height: 1.5, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.58)' },
  bgArc: { position: 'absolute', right: -28, bottom: -28, backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)' },
  cornerOrb: { position: 'absolute', left: -14, top: -14, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.07)' },
  pressGlow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.13)', borderRadius: 24 },
  iconRingOuter: { width: 46, height: 46, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.20, shadowRadius: 6, elevation: 4 },
  iconRingInner: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5 },
  labelRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2 },
  gridLabel: { flex: 1, color: '#fff', fontSize: 11.5, fontWeight: '800', letterSpacing: -0.15, lineHeight: 15, textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 },
  chevronWrap: { width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.20)', justifyContent: 'center', alignItems: 'center', marginBottom: 1, flexShrink: 0 },
  txCard: { marginHorizontal: 20, backgroundColor: isDark ? theme.colors.card : 'rgba(255,255,255,0.92)', borderRadius: 18, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0.28 : 0.06, shadowRadius: 12, elevation: 5, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' },
  txAccentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3.5, borderTopLeftRadius: 18, borderBottomLeftRadius: 18, opacity: 0.75 },
  txLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 13, borderWidth: 1.5, flexShrink: 0 },
  avatarText: { fontSize: 16, fontWeight: '800' },
  txName: { fontSize: 15, fontWeight: '700', color: theme.colors.text, letterSpacing: -0.2 },
  txSub: { fontSize: 11.5, color: theme.colors.textSecondary, fontWeight: '500' },
  txClassPill: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  txClassText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3 },
  txRight: { alignItems: 'flex-end', flexShrink: 0 },
  txAmount: { fontSize: 15, fontWeight: '800', color: theme.colors.success, letterSpacing: -0.3 },
  txTime: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 3, fontWeight: '500' },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyIconWrap: { width: 60, height: 60, borderRadius: 20, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)' },
  emptyText: { textAlign: 'center', color: theme.colors.text, fontSize: 15, fontWeight: '700' },
});