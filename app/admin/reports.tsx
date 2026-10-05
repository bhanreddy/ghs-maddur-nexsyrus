import { TourTarget, TourScrollView } from '@/src/features/app-tour';
/**
 * AdminReports.tsx
 * Analytics Cockpit — Mode A clay premium (soft desk + tactile controls).
 * Driven by useAnalytics → analyticsService → REST API.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  RefreshControl, Dimensions, StatusBar, Platform, Linking,
} from 'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import AdminHeader from '../../src/components/AdminHeader';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import { LinearGradient } from 'expo-linear-gradient';
import { useAnalytics, TimeRange, Section } from '../../src/hooks/useAnalytics';
import { useTheme } from '../../src/hooks/useTheme';
import { Insight } from '../../src/services/analyticsService';
import LogoLoader from '../../src/components/LogoLoader';
import { ADMIN_THEME } from '../../src/constants/adminTheme';
import { clay, clayCard, clayInset } from '../../src/theme/clayStyles';

const { width } = Dimensions.get('window');
const isAndroid = Platform.OS === 'android';
const enter = (delay = 0) =>
  isAndroid ? undefined : FadeInDown.delay(delay).duration(320);
const enterRight = (delay = 0) =>
  isAndroid ? undefined : FadeInRight.delay(delay).duration(300);

// ─── Design Tokens (extends ADMIN_THEME) ─────────────────────────────────────
const getC = (isDark: boolean) => ({
  bg: isDark ? '#0B1120' : '#E8ECF5',
  surface: isDark ? '#151C2C' : '#F4F7FD',
  surfaceHigh: isDark ? '#1A2332' : '#FFFFFF',
  inset: isDark ? '#121824' : '#DDE3EF',
  border: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(148,163,184,0.22)',
  borderSoft: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.85)',

  accent: ADMIN_THEME.colors.primary,
  green: '#0E8A5F', greenSoft: isDark ? 'rgba(34,197,94,0.14)' : '#DFF5EA',
  red: '#D64560', redSoft: isDark ? 'rgba(244,63,94,0.12)' : '#FDE8EC',
  amber: '#C56A1C', amberSoft: isDark ? 'rgba(251,191,36,0.12)' : '#FDEBDD',
  blue: '#2A50D8', blueSoft: isDark ? 'rgba(96,165,250,0.12)' : '#DDE7FF',
  violet: '#7A3FC4', violetSoft: isDark ? 'rgba(167,139,250,0.12)' : '#F0E4FB',
  cyan: '#0E7490', cyanSoft: isDark ? 'rgba(34,211,238,0.12)' : '#D9F5F7',

  text: isDark ? '#F1F5F9' : '#2A3142',
  textSub: isDark ? '#94A3B8' : '#5A6478',
  textMute: isDark ? '#64748B' : '#8B93A7',

  rCard: 22,
  rBtn: 16,
  rChip: 999,
});

type Palette = ReturnType<typeof getC>;

const getSections = (C: Palette): { key: Section; label: string; icon: string; color: string; soft: string }[] => [
  { key: 'overview', label: 'Overview', icon: 'grid-outline', color: C.accent, soft: C.violetSoft },
  { key: 'finance', label: 'Finance', icon: 'wallet-outline', color: C.green, soft: C.greenSoft },
  { key: 'attendance', label: 'Attendance', icon: 'people-outline', color: C.blue, soft: C.blueSoft },
  { key: 'academic', label: 'Academic', icon: 'school-outline', color: C.violet, soft: C.violetSoft },
  { key: 'staff', label: 'Staff', icon: 'id-card-outline', color: C.amber, soft: C.amberSoft },
];

const RANGES: { key: TimeRange; label: string }[] = [
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'YTD' },
];

// ─── Pressable with tactile scale ────────────────────────────────────────────
function PressScale({
  children, onPress, style, disabled, accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: any;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      style={({ pressed }) => [
        style,
        {
          opacity: disabled ? 0.45 : pressed ? 0.92 : 1,
          transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
        },
      ]}
    >
      {children}
    </Pressable>
  );
}

// ─── Clay surface with soft top highlight ────────────────────────────────────
function ClaySurface({
  children, color, radius = 22, raised = 'md', style, flat,
}: {
  children: React.ReactNode;
  color?: string;
  radius?: number;
  raised?: 'sm' | 'md' | 'lg';
  style?: any;
  flat?: boolean;
}) {
  const { isDark } = useTheme();
  const C = getC(isDark);
  return (
    <View
      style={[
        {
          backgroundColor: color ?? C.surface,
          borderRadius: radius,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: C.borderSoft,
          borderBottomColor: isDark ? 'rgba(0,0,0,0.35)' : 'rgba(76,90,120,0.10)',
          borderBottomWidth: 1.5,
        },
        !flat && clay(isDark, raised),
        style,
      ]}
    >
      <LinearGradient
        colors={
          isDark
            ? ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']
            : ['rgba(255,255,255,0.72)', 'rgba(255,255,255,0)']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 0.55, y: 0.9 }}
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

function CapLabel({ children, color }: { children: string; color?: string }) {
  const { isDark } = useTheme();
  const C = getC(isDark);
  return (
    <Text style={{
      fontSize: 11, fontWeight: '700', letterSpacing: 0.6,
      textTransform: 'uppercase', color: color || C.textSub,
    }}>
      {children}
    </Text>
  );
}

function Delta({ value, positive }: { value: string; positive: boolean }) {
  const { isDark } = useTheme();
  const C = getC(isDark);
  const col = positive ? C.green : C.red;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 3,
      backgroundColor: positive ? C.greenSoft : C.redSoft,
      paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
    }}>
      <Ionicons name={positive ? 'arrow-up' : 'arrow-down'} size={10} color={col} />
      <Text style={{ fontSize: 11, fontWeight: '700', color: col }}>{value}</Text>
    </View>
  );
}

function SHeader({ label, accent, icon, delay = 0 }:
  { label: string; accent: string; icon: string; delay?: number }) {
  const { isDark } = useTheme();
  const C = getC(isDark);
  return (
    <Animated.View entering={enter(delay)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, marginBottom: 12 }}>
      <View style={{
        width: 32, height: 32, borderRadius: 12,
        backgroundColor: accent + (isDark ? '22' : '18'),
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Ionicons name={icon as any} size={15} color={accent} />
      </View>
      <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, letterSpacing: -0.2 }}>
        {label}
      </Text>
    </Animated.View>
  );
}

function ProgressBar({ value, color, max = 100 }:
  { value: number; color: string; max?: number }) {
  const { isDark } = useTheme();
  const C = getC(isDark);
  const pct = Math.min((value / max) * 100, 100);
  return (
    <View style={{
      height: 6, backgroundColor: C.inset, borderRadius: 99, overflow: 'hidden',
    }}>
      <View style={{
        width: `${pct}%` as any, height: '100%', backgroundColor: color, borderRadius: 99,
      }} />
    </View>
  );
}

// ─── Hero KPI ────────────────────────────────────────────────────────────────
function HeroKPI({
  label, value, sub, color, soft, icon, delay,
}: {
  label: string; value: string; sub?: string; color: string; soft: string;
  icon: string; delay: number;
}) {
  const { isDark } = useTheme();
  const C = getC(isDark);
  return (
    <Animated.View entering={enter(delay)} style={{ flex: 1 }}>
      <ClaySurface color={soft} radius={20} raised="sm" style={hS.card}>
        <View style={[hS.iconWrap, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.7)' }]}>
          <Ionicons name={icon as any} size={14} color={color} />
        </View>
        <Text style={[hS.value, { color: C.text }]} numberOfLines={1}>{value}</Text>
        <Text style={[hS.label, { color: C.textSub }]} numberOfLines={1}>{label}</Text>
        {sub ? (
          <Text style={[hS.sub, { color }]} numberOfLines={1}>{sub}</Text>
        ) : null}
      </ClaySurface>
    </Animated.View>
  );
}
const hS = StyleSheet.create({
  card: { padding: 14, minHeight: 112 },
  iconWrap: {
    width: 28, height: 28, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  value: { fontSize: 22, fontWeight: '800', letterSpacing: -0.6 },
  label: { fontSize: 11, fontWeight: '600', marginTop: 4 },
  sub: { fontSize: 10, fontWeight: '700', marginTop: 6 },
});

// ─── Stat Card ───────────────────────────────────────────────────────────────
function StatCard({
  icon, color, soft, label, value, sub, delta, deltaPos, delay, onPress,
}: {
  icon: string; color: string; soft?: string; label: string; value: string;
  sub?: string; delta?: string; deltaPos?: boolean; delay: number; onPress?: () => void;
}) {
  const { isDark } = useTheme();
  const C = getC(isDark);
  return (
    <Animated.View entering={enterRight(delay)} style={{ flex: 1, minWidth: 0 }}>
      <PressScale onPress={onPress} style={{ flex: 1 }}>
        <ClaySurface
          color={isDark ? C.surface : (soft ?? C.surfaceHigh)}
          radius={18}
          raised="sm"
          style={scS.card}
        >
          <View style={[scS.iconBox, { backgroundColor: soft ?? (color + '18') }]}>
            <Ionicons name={icon as any} size={18} color={color} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <CapLabel color={C.textMute}>{label}</CapLabel>
            <Text style={[scS.value, { color: C.text }]} numberOfLines={1}>{value}</Text>
            {sub ? <Text style={[scS.sub, { color: C.textSub }]} numberOfLines={1}>{sub}</Text> : null}
          </View>
          {delta !== undefined ? <Delta value={delta} positive={!!deltaPos} /> : null}
        </ClaySurface>
      </PressScale>
    </Animated.View>
  );
}
const scS = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, marginBottom: 10, minHeight: 72,
  },
  iconBox: {
    width: 42, height: 42, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  value: { fontSize: 20, fontWeight: '800', marginTop: 2, letterSpacing: -0.4 },
  sub: { fontSize: 11, marginTop: 2, fontWeight: '500' },
});

// ─── Chart Card ──────────────────────────────────────────────────────────────
function ChartCard({ title, subtitle, accentColor, delay, loading: ld, children }:
  {
    title: string; subtitle?: string; accentColor: string; delay: number;
    loading?: boolean; children: React.ReactNode;
  }) {
  const { isDark } = useTheme();
  const C = getC(isDark);
  return (
    <Animated.View entering={enter(delay)}>
      <ClaySurface color={C.surfaceHigh} radius={22} raised="md" style={ccS.card}>
        <View style={ccS.header}>
          <View style={{ flex: 1 }}>
            <Text style={[ccS.title, { color: C.text }]}>{title}</Text>
            {subtitle ? <Text style={[ccS.subtitle, { color: C.textMute }]}>{subtitle}</Text> : null}
          </View>
          <View style={[ccS.dot, { backgroundColor: accentColor }]} />
        </View>
        <View style={[ccS.divider, { backgroundColor: C.border }]} />
        <View style={ccS.body}>
          {ld
            ? <View style={{ paddingVertical: 36 }}><LogoLoader size={28} color={accentColor} /></View>
            : children}
        </View>
      </ClaySurface>
    </Animated.View>
  );
}
const ccS = StyleSheet.create({
  card: { marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 12 },
  title: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  subtitle: { fontSize: 12, marginTop: 3, fontWeight: '500' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  body: { paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center' },
});

// ─── Table ───────────────────────────────────────────────────────────────────
function THead({ cols }: { cols: string[] }) {
  const { isDark } = useTheme();
  const C = getC(isDark);
  return (
    <View style={{
      flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 4,
      borderRadius: 12, backgroundColor: C.inset, marginBottom: 4,
    }}>
      {cols.map((c, i) => (
        <Text key={i} style={{
          flex: i === 0 ? 2 : 1,
          fontSize: 10, fontWeight: '700', color: C.textMute,
          textTransform: 'uppercase', letterSpacing: 0.6,
          textAlign: i > 0 ? 'right' : 'left', paddingHorizontal: 6,
        }}>
          {c}
        </Text>
      ))}
    </View>
  );
}
function TRow({ cols, last }: { cols: string[]; last?: boolean }) {
  const { isDark } = useTheme();
  const C = getC(isDark);
  return (
    <View style={{
      flexDirection: 'row', paddingVertical: 11,
      borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    }}>
      {cols.map((c, i) => (
        <Text key={i} style={{
          flex: i === 0 ? 2 : 1,
          fontSize: 13, color: i === 0 ? C.text : C.textSub,
          fontWeight: i === 0 ? '600' : '500',
          textAlign: i > 0 ? 'right' : 'left', paddingHorizontal: 6,
        }}>
          {c}
        </Text>
      ))}
    </View>
  );
}

function TableCard({ title, delay, children }:
  { title: string; delay: number; children: React.ReactNode }) {
  const { isDark } = useTheme();
  const C = getC(isDark);
  return (
    <Animated.View entering={enter(delay)}>
      <ClaySurface color={C.surfaceHigh} radius={20} raised="sm" style={tcS.card}>
        <Text style={[tcS.title, { color: C.text }]}>{title}</Text>
        <View style={{ height: 12 }} />
        {children}
      </ClaySurface>
    </Animated.View>
  );
}
const tcS = StyleSheet.create({
  card: { padding: 16, marginBottom: 14 },
  title: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
});

// ─── Insight Card ────────────────────────────────────────────────────────────
function InsightCard({ insight, index, onDismiss }:
  { insight: Insight; index: number; onDismiss: (id: string) => void }) {
  const { isDark } = useTheme();
  const C = getC(isDark);
  const isHigh = insight.severity === 'high';
  const isMed = insight.severity === 'medium';
  const catColors: Record<string, string> = {
    finance: C.green, attendance: C.blue, academic: C.violet, staff: C.amber,
  };
  const col = isHigh ? C.red : isMed ? C.amber : catColors[insight.category] ?? C.blue;
  const soft = isHigh ? C.redSoft : isMed ? C.amberSoft : C.blueSoft;

  return (
    <Animated.View entering={enter(240 + index * 60)}>
      <ClaySurface color={soft} radius={18} raised="sm" flat style={inS.card}>
        <View style={[inS.stripe, { backgroundColor: col }]} />
        <View style={[inS.icon, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.75)' }]}>
          <MaterialIcons
            name={isHigh ? 'error' : isMed ? 'warning' : 'info'}
            size={16} color={col} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
            <View style={[inS.sevBadge, { backgroundColor: isDark ? col + '33' : 'rgba(255,255,255,0.7)' }]}>
              <Text style={[inS.sevTxt, { color: col }]}>{insight.severity.toUpperCase()}</Text>
            </View>
            <View style={[inS.catBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.55)' }]}>
              <Text style={[inS.catTxt, { color: C.textSub }]}>{insight.category}</Text>
            </View>
          </View>
          <Text style={[inS.msg, { color: C.text }]}>{insight.message}</Text>
          {insight.action_label ? (
            <PressScale
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, alignSelf: 'flex-start' }}
              onPress={() => insight.action_route && Linking.openURL(insight.action_route)}
              accessibilityLabel={insight.action_label}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: col }}>{insight.action_label}</Text>
              <Ionicons name="arrow-forward" size={12} color={col} />
            </PressScale>
          ) : null}
        </View>
        <PressScale
          style={inS.dismissBtn}
          onPress={() => onDismiss(insight.id)}
          accessibilityLabel="Dismiss alert"
        >
          <Ionicons name="close" size={16} color={C.textMute} />
        </PressScale>
      </ClaySurface>
    </Animated.View>
  );
}
const inS = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 14, marginBottom: 10, overflow: 'hidden',
  },
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3.5 },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sevBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  sevTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  catBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  catTxt: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
  msg: { fontSize: 13, lineHeight: 19, fontWeight: '500' },
  dismissBtn: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
});

function ErrorBanner({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  const { isDark } = useTheme();
  const C = getC(isDark);
  return (
    <ClaySurface color={C.redSoft} radius={16} raised="sm" flat style={{
      flexDirection: 'row', alignItems: 'center', gap: 12,
      padding: 14, marginBottom: 16,
    }}>
      <Ionicons name="alert-circle-outline" size={20} color={C.red} />
      <Text style={{ flex: 1, fontSize: 13, color: C.red, fontWeight: '500', lineHeight: 18 }}>{msg}</Text>
      <PressScale onPress={onRetry} style={{
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.75)',
      }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.red }}>Retry</Text>
      </PressScale>
    </ClaySurface>
  );
}

function EmptyChart() {
  const { isDark } = useTheme();
  const C = getC(isDark);
  return (
    <View style={{ alignItems: 'center', paddingVertical: 28, gap: 8 }}>
      <View style={{
        width: 44, height: 44, borderRadius: 14,
        backgroundColor: C.inset, alignItems: 'center', justifyContent: 'center',
      }}>
        <Ionicons name="bar-chart-outline" size={20} color={C.textMute} />
      </View>
      <Text style={{ color: C.textSub, fontSize: 13, fontWeight: '600' }}>
        No data for this period
      </Text>
      <Text style={{ color: C.textMute, fontSize: 12, textAlign: 'center', paddingHorizontal: 24 }}>
        Try another range or check back after activity is recorded.
      </Text>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function AdminReports() {
  const { isDark, toggleTheme } = useTheme();
  const C = getC(isDark);
  const SECTIONS = getSections(C);

  const {
    financials, attendance, academics, staff, insights,
    generatedAt, loading, refreshing, error,
    range, setRange,
    activeSection, setActiveSection,
    refreshData, dismissInsight, exportReport,
  } = useAnalytics();

  const [exporting, setExporting] = useState(false);

  const lineData = financials?.trend?.map((t: any) => ({ value: t.value, label: t.label })) ?? [];
  const attendData = attendance?.trend?.map((t: any) => ({ value: t.value, label: t.label })) ?? [];
  const acadData = academics?.trend?.map((t: any) => ({ value: t.value, label: t.label })) ?? [];
  const highCount = insights.filter((i: any) => i.severity === 'high').length;

  const chartBase = {
    yAxisTextStyle: { color: C.textMute, fontSize: 10 },
    xAxisLabelTextStyle: { color: C.textMute, fontSize: 10 },
    yAxisColor: C.border,
    xAxisColor: C.border,
    rulesColor: C.border,
    width: width - 96,
    isAnimated: !isAndroid,
    height: 170,
  };

  const handleExport = useCallback(async () => {
    setExporting(true);
    const url = await exportReport();
    setExporting(false);
    if (url) {
      alertCompat('Report Ready', 'Your PDF is ready.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open', onPress: () => Linking.openURL(url) },
      ]);
    } else {
      alertCompat('Export Failed', 'Please try again.');
    }
  }, [exportReport]);

  const openAlerts = useCallback(() => {
    setActiveSection('finance');
  }, [setActiveSection]);

  return (
    <View style={[S.container, { backgroundColor: C.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={C.bg} />

      {/* Soft ambient wash — static, painted once */}
      {!isDark && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={[S.blob, { top: 80, right: -40, backgroundColor: 'rgba(102,89,144,0.10)' }]} />
          <View style={[S.blob, { top: 280, left: -60, backgroundColor: 'rgba(46,160,120,0.08)' }]} />
        </View>
      )}

      <TourTarget id="screen.admin-reports.overview"><AdminHeader
        title="Analytics Cockpit"
        showBackButton
        rightAction={{
          icon: isDark ? 'sunny-outline' : 'moon-outline',
          onPress: toggleTheme,
        }}
      /></TourTarget>

      {/* ── Hero strip ─────────────────────────────────────────── */}
      <View style={S.hero}>
        <View style={S.heroRow}>
          <HeroKPI
            label="Fee Collected"
            value={financials ? `₹${(financials.total_collected / 1000).toFixed(1)}k` : '—'}
            sub={financials ? `${financials.collection_efficiency}% efficiency` : undefined}
            color={C.green} soft={C.greenSoft} icon="wallet-outline" delay={40}
          />
          <HeroKPI
            label="Avg Attendance"
            value={attendance?.avg_attendance != null ? `${attendance.avg_attendance}%` : '—'}
            sub={attendance ? `${attendance.chronic_absentees} at-risk` : undefined}
            color={C.blue} soft={C.blueSoft} icon="people-outline" delay={80}
          />
          <HeroKPI
            label="Avg Score"
            value={academics ? `${academics.avg_score}%` : '—'}
            sub={academics ? `${academics.pass_rate}% pass` : undefined}
            color={C.violet} soft={C.violetSoft} icon="ribbon-outline" delay={120}
          />
        </View>

        <View style={S.controlRow}>
          {/* Recessed range track */}
          <View style={[S.rangeTrack, clayInset(isDark)]}>
            {RANGES.map(r => {
              const active = range === r.key;
              return (
                <PressScale
                  key={r.key}
                  onPress={() => setRange(r.key)}
                  accessibilityLabel={`Show ${r.label}`}
                  style={[
                    S.rangeBtn,
                    active && {
                      backgroundColor: isDark ? C.surfaceHigh : '#FFFFFF',
                      ...clay(isDark, 'sm'),
                    },
                  ]}
                >
                  <Text style={[
                    S.rangeTxt,
                    { color: active ? C.accent : C.textMute },
                    active && { fontWeight: '800' },
                  ]}>
                    {r.label}
                  </Text>
                </PressScale>
              );
            })}
          </View>

          <PressScale
            onPress={handleExport}
            disabled={exporting}
            accessibilityLabel="Export report"
            style={[
              S.exportBtn,
              {
                backgroundColor: C.accent,
                ...clay(isDark, 'sm'),
              },
            ]}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <Ionicons
              name={exporting ? 'hourglass-outline' : 'share-outline'}
              size={14}
              color="#FFFFFF"
            />
            <Text style={S.exportTxt}>{exporting ? '…' : 'Export'}</Text>
          </PressScale>
        </View>
      </View>

      {/* ── Section pills ──────────────────────────────────────── */}
      <TourTarget id="screen.admin-reports.workspace" native><TourScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={S.navBar}
        contentContainerStyle={S.navContent}
      >
        {SECTIONS.map((sec) => {
          const active = activeSection === sec.key;
          return (
            <PressScale
              key={sec.key}
              onPress={() => setActiveSection(sec.key)}
              accessibilityLabel={sec.label}
              style={[
                S.navPill,
                {
                  backgroundColor: active ? sec.soft : (isDark ? C.surface : 'rgba(255,255,255,0.55)'),
                  borderColor: active ? sec.color + '40' : C.border,
                },
                active && clay(isDark, 'sm'),
              ]}
            >
              <Ionicons name={sec.icon as any} size={14} color={active ? sec.color : C.textMute} />
              <Text style={[S.navTxt, { color: active ? sec.color : C.textSub }]}>
                {sec.label}
              </Text>
              {sec.key === 'finance' && highCount > 0 ? (
                <View style={[S.badge, { backgroundColor: C.red }]}>
                  <Text style={S.badgeTxt}>{highCount}</Text>
                </View>
              ) : null}
            </PressScale>
          );
        })}
      </TourScrollView></TourTarget>

      {/* ── Body ───────────────────────────────────────────────── */}
      <TourScrollView
        style={{ flex: 1 }}
        contentContainerStyle={S.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshData}
            tintColor={C.accent}
            colors={[C.accent]}
          />
        }
      >
        {loading && !refreshing ? (
          <View style={[S.loadRow, clayCard(isDark, 'sm')]}>
            <LogoLoader size={22} color={C.accent} />
            <Text style={[S.loadTxt, { color: C.textSub }]}>Loading analytics…</Text>
          </View>
        ) : null}

        {error ? <ErrorBanner msg={error} onRetry={refreshData} /> : null}

        {generatedAt ? (
          <View style={S.metaRow}>
            <View style={[S.liveDot, { backgroundColor: C.green }]} />
            <Text style={[S.updatedTxt, { color: C.textMute }]}>
              Updated {new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        ) : null}

        {/* ══════════════ OVERVIEW ══════════════ */}
        {activeSection === 'overview' && (
          <>
            {insights.length > 0 ? (
              <Animated.View entering={enter(0)}>
                <PressScale onPress={openAlerts} accessibilityLabel="View finance alerts">
                  <ClaySurface
                    color={highCount > 0 ? C.redSoft : C.amberSoft}
                    radius={18}
                    raised="sm"
                    style={S.alertBox}
                  >
                    <View style={[
                      S.alertIcon,
                      { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.75)' },
                    ]}>
                      <Ionicons
                        name="notifications"
                        size={18}
                        color={highCount > 0 ? C.red : C.amber}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: C.text, letterSpacing: -0.2 }}>
                        {highCount} high priority · {insights.length - highCount} other
                      </Text>
                      <Text style={{ fontSize: 12, color: C.textSub, marginTop: 3, fontWeight: '500' }}>
                        Tap to review in Finance
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={C.textMute} />
                  </ClaySurface>
                </PressScale>
              </Animated.View>
            ) : null}

            <SHeader label="Financial Health" accent={C.green} icon="wallet-outline" delay={40} />
            <View style={S.row2}>
              <StatCard
                icon="wallet-outline" color={C.green} soft={C.greenSoft} delay={60}
                label="Collected"
                value={financials ? `₹${(financials.total_collected / 1000).toFixed(1)}k` : '—'}
                delta="+8.2%" deltaPos
                onPress={() => setActiveSection('finance')}
              />
              <StatCard
                icon="alert-circle-outline" color={C.red} soft={C.redSoft} delay={90}
                label="Outstanding"
                value={financials ? `₹${(financials.outstanding_dues / 1000).toFixed(1)}k` : '—'}
                delta="-3.1%" deltaPos
                onPress={() => setActiveSection('finance')}
              />
            </View>

            <SHeader label="Attendance" accent={C.blue} icon="people-outline" delay={100} />
            <View style={S.row2}>
              <StatCard
                icon="people-outline" color={C.blue} soft={C.blueSoft} delay={120}
                label="Avg Attendance"
                value={attendance?.avg_attendance != null ? `${attendance.avg_attendance}%` : '—'}
                onPress={() => setActiveSection('attendance')}
              />
              <StatCard
                icon="warning-outline" color={C.amber} soft={C.amberSoft} delay={150}
                label="At Risk"
                value={attendance ? String(attendance.chronic_absentees) : '—'}
                onPress={() => setActiveSection('attendance')}
              />
            </View>

            <SHeader label="Academic" accent={C.violet} icon="school-outline" delay={160} />
            <View style={S.row2}>
              <StatCard
                icon="ribbon-outline" color={C.violet} soft={C.violetSoft} delay={180}
                label="Avg Score"
                value={academics ? `${academics.avg_score}%` : '—'}
                onPress={() => setActiveSection('academic')}
              />
              <StatCard
                icon="checkmark-circle-outline" color={C.green} soft={C.greenSoft} delay={210}
                label="Pass Rate"
                value={academics ? `${academics.pass_rate}%` : '—'}
                onPress={() => setActiveSection('academic')}
              />
            </View>

            {insights.length > 0 ? (
              <>
                <SHeader label="Recent Alerts" accent={C.red} icon="flash-outline" delay={220} />
                {insights.slice(0, 3).map((ins, i) => (
                  <InsightCard key={ins.id} insight={ins} index={i} onDismiss={dismissInsight} />
                ))}
              </>
            ) : null}
          </>
        )}

        {/* ══════════════ FINANCE ══════════════ */}
        {activeSection === 'finance' && (
          <>
            <SHeader label="Fee Collection" accent={C.green} icon="wallet-outline" delay={0} />
            <StatCard icon="wallet-outline" color={C.green} soft={C.greenSoft} delay={40}
              label="Total Collected"
              value={financials ? `₹${(financials.total_collected / 1000).toFixed(1)}k` : '—'}
              sub="Net received" delta="+8.2%" deltaPos />
            <StatCard icon="alert-circle-outline" color={C.red} soft={C.redSoft} delay={70}
              label="Outstanding Dues"
              value={financials ? `₹${(financials.outstanding_dues / 1000).toFixed(1)}k` : '—'}
              sub="Awaiting payment" delta="-3.1%" deltaPos />
            <StatCard icon="trending-up-outline" color={C.cyan} soft={C.cyanSoft} delay={100}
              label="Collection Efficiency"
              value={financials ? `${financials.collection_efficiency}%` : '—'} />
            <StatCard icon="receipt-outline" color={C.textSub} soft={isDark ? C.surface : '#EEF1F8'} delay={130}
              label="Total Invoiced"
              value={financials ? `₹${(financials.total_invoiced / 1000).toFixed(1)}k` : '—'} />
            <StatCard icon="pricetag-outline" color={C.amber} soft={C.amberSoft} delay={160}
              label="Discounts Given"
              value={financials ? `₹${(financials.discount_given / 1000).toFixed(1)}k` : '—'} />
            <StatCard icon="return-up-back-outline" color={C.violet} soft={C.violetSoft} delay={190}
              label="Refunds Issued"
              value={financials ? `₹${(financials.refunds_issued / 1000).toFixed(1)}k` : '—'} />

            <ChartCard title="Revenue Trend" subtitle={`Rolling ${range}`}
              accentColor={C.green} delay={220} loading={loading}>
              {lineData.length === 0 ? <EmptyChart /> : (
                <LineChart
                  data={lineData} color={C.green} thickness={2.5}
                  startFillColor="rgba(14,138,95,0.22)" endFillColor="rgba(14,138,95,0.01)"
                  startOpacity={1} endOpacity={0} initialSpacing={12} noOfSections={4}
                  dataPointsColor={C.green} dataPointsRadius={4}
                  curved animationDuration={700} {...chartBase}
                />
              )}
            </ChartCard>

            {financials?.by_class && financials.by_class.length > 0 ? (
              <TableCard title="Class-wise Breakdown" delay={280}>
                <THead cols={['Class', 'Collected', 'Pending', '%']} />
                {financials.by_class.map((r, i) => (
                  <TRow
                    key={i}
                    cols={[
                      `${r.class_name} ${r.section_name}`,
                      `₹${(r.collected / 1000).toFixed(1)}k`,
                      `₹${(r.outstanding / 1000).toFixed(1)}k`,
                      `${r.efficiency}%`,
                    ]}
                    last={i === financials.by_class.length - 1}
                  />
                ))}
              </TableCard>
            ) : null}

            {financials?.top_pending && financials.top_pending.length > 0 ? (
              <TableCard title="Top Defaulters" delay={320}>
                <THead cols={['Student', 'Due', 'Days']} />
                {financials.top_pending.map((s: any, i: number) => (
                  <View
                    key={i}
                    style={{
                      paddingVertical: 10,
                      borderBottomWidth: i === financials.top_pending!.length - 1 ? 0 : StyleSheet.hairlineWidth,
                      borderBottomColor: C.border,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, color: C.text, fontWeight: '600' }}>{s.student_name}</Text>
                      <Text style={{ color: C.red, fontWeight: '700', fontSize: 13 }}>
                        ₹{(s.amount_due / 1000).toFixed(1)}k
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 }}>
                      <Text style={{ fontSize: 11, color: C.textSub }}>{s.class_section}</Text>
                      <Text style={{ fontSize: 11, color: C.textMute }}>{s.overdue_days}d overdue</Text>
                    </View>
                  </View>
                ))}
              </TableCard>
            ) : null}

            {insights.filter((i: any) => i.category === 'finance').length > 0 ? (
              <>
                <SHeader label="Finance Alerts" accent={C.red} icon="notifications-outline" delay={360} />
                {insights.filter((i: any) => i.category === 'finance').map((ins: any, i: number) => (
                  <InsightCard key={ins.id} insight={ins} index={i} onDismiss={dismissInsight} />
                ))}
              </>
            ) : null}
          </>
        )}

        {/* ══════════════ ATTENDANCE ══════════════ */}
        {activeSection === 'attendance' && (
          <>
            <SHeader label="Attendance Summary" accent={C.blue} icon="people-outline" delay={0} />
            <StatCard icon="people-outline" color={C.blue} soft={C.blueSoft} delay={40}
              label="Avg Student Attendance"
              value={attendance?.avg_attendance != null ? `${attendance.avg_attendance}%` : '—'}
              delta="+1.4%" deltaPos />
            <StatCard icon="warning-outline" color={C.amber} soft={C.amberSoft} delay={70}
              label="Chronic Absentees"
              value={attendance ? String(attendance.chronic_absentees) : '—'}
              sub="Below 75%" />
            <StatCard icon="calendar-outline" color={C.cyan} soft={C.cyanSoft} delay={100}
              label="Working Days"
              value={attendance?.total_working_days != null ? String(attendance.total_working_days) : '—'}
              sub={attendance ? `${attendance.total_present_days} student-days present` : undefined} />
            <StatCard icon="id-card-outline" color={C.violet} soft={C.violetSoft} delay={130}
              label="Staff Attendance"
              value={attendance?.staff_attendance != null ? `${attendance.staff_attendance}%` : '—'} />

            <ChartCard title="Attendance Trend" subtitle="Day-by-day presence %"
              accentColor={C.blue} delay={160} loading={loading}>
              {attendData.length === 0 ? <EmptyChart /> : (
                <BarChart
                  data={attendData} barWidth={16} barBorderRadius={6}
                  frontColor={C.blue} gradientColor="rgba(42,80,216,0.18)" showGradient
                  noOfSections={4} maxValue={100} animationDuration={600} {...chartBase}
                />
              )}
            </ChartCard>

            {attendance?.by_class && attendance.by_class.length > 0 ? (
              <TableCard title="Class-wise Attendance" delay={240}>
                <THead cols={['Class', 'Avg%', 'Risk']} />
                {attendance.by_class.map((r: any, i: number) => (
                  <View
                    key={i}
                    style={{
                      paddingVertical: 10,
                      borderBottomWidth: i === attendance.by_class.length - 1 ? 0 : StyleSheet.hairlineWidth,
                      borderBottomColor: C.border,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: 13, color: C.text, fontWeight: '600', flex: 2 }}>
                        {r.class_name} {r.section_name}
                      </Text>
                      <Text style={{
                        fontSize: 13, fontWeight: '800',
                        color: r.avg_pct < 75 ? C.red : C.green,
                      }}>
                        {r.avg_pct}%
                      </Text>
                      <Text style={{ fontSize: 12, color: C.textMute, textAlign: 'right', flex: 1 }}>
                        {r.below_threshold}
                      </Text>
                    </View>
                    <ProgressBar value={r.avg_pct} color={r.avg_pct < 75 ? C.red : C.blue} />
                  </View>
                ))}
              </TableCard>
            ) : null}

            {attendance?.low_attendance_students && attendance.low_attendance_students.length > 0 ? (
              <TableCard title="Students Needing Attention" delay={290}>
                {attendance.low_attendance_students.map((s: any, i: number) => (
                  <View
                    key={i}
                    style={{
                      paddingVertical: 10,
                      borderBottomWidth: i === attendance.low_attendance_students!.length - 1 ? 0 : StyleSheet.hairlineWidth,
                      borderBottomColor: C.border,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                      <Text style={{ fontSize: 13, color: C.text, fontWeight: '600' }}>{s.student_name}</Text>
                      <Text style={{ fontSize: 13, color: C.red, fontWeight: '800' }}>{s.attendance_pct}%</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: 11, color: C.textSub }}>{s.class_section}</Text>
                      <Text style={{ fontSize: 11, color: C.textMute }}>{s.absent_days} absent days</Text>
                    </View>
                    <ProgressBar value={s.attendance_pct} color={C.red} />
                  </View>
                ))}
              </TableCard>
            ) : null}

            {insights.filter((i: any) => i.category === 'attendance').map((ins: any, i: number) => (
              <InsightCard key={ins.id} insight={ins} index={i} onDismiss={dismissInsight} />
            ))}
          </>
        )}

        {/* ══════════════ ACADEMIC ══════════════ */}
        {activeSection === 'academic' && (
          <>
            <SHeader label="Academic Performance" accent={C.violet} icon="school-outline" delay={0} />
            <StatCard icon="ribbon-outline" color={C.violet} soft={C.violetSoft} delay={40}
              label="Average Score" value={academics ? `${academics.avg_score}%` : '—'} />
            <StatCard icon="checkmark-circle-outline" color={C.green} soft={C.greenSoft} delay={70}
              label="Pass Rate" value={academics ? `${academics.pass_rate}%` : '—'} />
            <StatCard icon="document-text-outline" color={C.cyan} soft={C.cyanSoft} delay={100}
              label="Exams Conducted" value={academics ? String(academics.exams_conducted) : '—'} />
            <StatCard icon="trending-up-outline" color={C.green} soft={C.greenSoft} delay={130}
              label="Top Subject" value={academics?.top_subject ?? '—'} />
            <StatCard icon="trending-down-outline" color={C.red} soft={C.redSoft} delay={160}
              label="Needs Focus" value={academics?.weakest_subject ?? '—'} />

            <ChartCard title="Score Trend" subtitle="Exam averages over time"
              accentColor={C.violet} delay={190} loading={loading}>
              {acadData.length === 0 ? <EmptyChart /> : (
                <LineChart
                  data={acadData} color={C.violet} thickness={2.5}
                  startFillColor="rgba(122,63,196,0.22)" endFillColor="rgba(122,63,196,0.01)"
                  startOpacity={1} endOpacity={0} initialSpacing={12} noOfSections={4}
                  dataPointsColor={C.violet} dataPointsRadius={4}
                  curved animationDuration={700} {...chartBase}
                />
              )}
            </ChartCard>

            {academics?.by_subject && academics.by_subject.length > 0 ? (
              <TableCard title="Subject Performance" delay={260}>
                <THead cols={['Subject', 'Avg', 'Pass%', 'High']} />
                {academics.by_subject.map((r, i) => (
                  <TRow
                    key={i}
                    cols={[r.subject_name, `${r.avg_score}`, `${r.pass_rate}%`, `${r.highest}`]}
                    last={i === academics.by_subject.length - 1}
                  />
                ))}
              </TableCard>
            ) : null}

            {insights.filter((i: any) => i.category === 'academic').map((ins: any, i: number) => (
              <InsightCard key={ins.id} insight={ins} index={i} onDismiss={dismissInsight} />
            ))}
          </>
        )}

        {/* ══════════════ STAFF ══════════════ */}
        {activeSection === 'staff' && (
          <>
            <SHeader label="Staff Overview" accent={C.amber} icon="id-card-outline" delay={0} />
            <StatCard icon="people-circle-outline" color={C.amber} soft={C.amberSoft} delay={40}
              label="Total Staff" value={staff ? String(staff.total_staff) : '—'} />
            <StatCard icon="checkmark-done-outline" color={C.green} soft={C.greenSoft} delay={70}
              label="Active Staff" value={staff ? String(staff.active_staff) : '—'} />
            <StatCard icon="moon-outline" color={C.red} soft={C.redSoft} delay={100}
              label="On Leave Today" value={staff ? String(staff.on_leave_today) : '—'} />
            <StatCard icon="calendar-outline" color={C.blue} soft={C.blueSoft} delay={130}
              label="Staff Attendance" value={staff ? `${staff.avg_staff_attendance}%` : '—'} />
            <StatCard icon="person-add-outline" color={C.cyan} soft={C.cyanSoft} delay={160}
              label="New Joinings" value={staff ? String(staff.new_joinings) : '—'}
              sub={`This ${range}`} />
            <StatCard icon="person-remove-outline" color={C.violet} soft={C.violetSoft} delay={190}
              label="Resignations" value={staff ? String(staff.resignations) : '—'}
              sub={`This ${range}`} />

            {insights.filter(i => i.category === 'staff').map((ins, i) => (
              <InsightCard key={ins.id} insight={ins} index={i} onDismiss={dismissInsight} />
            ))}
          </>
        )}

        <View style={{ height: 80 }} />
      </TourScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1 },
  blob: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    opacity: 1,
  },

  hero: { paddingBottom: 4 },
  heroRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
  },
  controlRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, gap: 10, marginBottom: 8,
  },
  rangeTrack: {
    flex: 1, flexDirection: 'row', gap: 4,
    padding: 4, borderRadius: 16, minHeight: 44,
  },
  rangeBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 9, borderRadius: 12, minHeight: 36,
  },
  rangeTxt: { fontSize: 12, fontWeight: '600' },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingHorizontal: 16, minHeight: 44, borderRadius: 16, overflow: 'hidden',
  },
  exportTxt: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  navBar: { maxHeight: 56, marginBottom: 2 },
  navContent: { paddingHorizontal: 14, gap: 8, paddingVertical: 6, alignItems: 'center' },
  navPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999,
    borderWidth: 1, minHeight: 40,
  },
  navTxt: { fontSize: 13, fontWeight: '700' },
  badge: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeTxt: { fontSize: 10, fontWeight: '800', color: '#fff' },

  body: { paddingHorizontal: 16, paddingTop: 4 },
  loadRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 14, marginBottom: 14,
  },
  loadTxt: { fontSize: 13, fontWeight: '600' },
  metaRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    gap: 6, marginBottom: 6,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  updatedTxt: { fontSize: 11, fontWeight: '500' },
  row2: { flexDirection: 'row', gap: 10 },
  alertBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, marginBottom: 4, marginTop: 4,
  },
  alertIcon: {
    width: 40, height: 40, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
});
