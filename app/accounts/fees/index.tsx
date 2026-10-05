import { TourTarget } from '@/src/features/app-tour';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import AppTextInput from '@/src/components/AppTextInput';
import { styles as ds } from '@/src/theme/styles';

import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Pressable, Platform, ActivityIndicator, RefreshControl, ScrollView, Image, Linking, useWindowDimensions, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import AdminHeader from '../../../src/components/AdminHeader';
import { useAccountsWebChrome } from '../../../src/contexts/AccountsWebChromeContext';
import Animated, {
  FadeInDown, FadeIn, useAnimatedStyle,
  useSharedValue, withSpring, interpolate
} from 'react-native-reanimated';
import { useAuth } from '../../../src/hooks/useAuth';
import { useApiQuery } from '../../../src/hooks/useApiQuery';
import { FeeService, FeeSummaryStatus } from '../../../src/services/feeService';
import { ClassService, ClassInfo } from '../../../src/services/classService';
import { useTheme } from '../../../src/hooks/useTheme';
import LogoLoader from '../../../src/components/LogoLoader';
import { useFeatures } from '../../../src/hooks/useFeatures';
import FeeRecoveryView from '../../../src/components/FeeRecoveryView';

// ─── Constants ────────────────────────────────────────────────────────────────
const FILTERS = ['All', 'Paid', 'Partial', 'Pending'] as const;
type FilterType = typeof FILTERS[number];
const VIEW_MODES = ['Students', 'Fee Recovery', 'Class Structures'] as const;
type ViewMode = typeof VIEW_MODES[number];
const PAGE_LIMIT = 50;
const CACHE_TTL_MS = 60 * 1000;

const EMPTY_COUNTS: Record<FilterType, number> = {
  All: 0,
  Paid: 0,
  Partial: 0,
  Pending: 0,
};

type FeeListStudent = {
  id: string;
  name: string;
  admissionNo: string;
  class: string;
  fatherName?: string;
  fatherMobile?: string;
  studentGender?: string;
  parentLine?: string;
  photoUrl?: string;
  status: FeeSummaryStatus;
  total: number | string;
  paid: number | string;
  due: number | string;
  rawId: string;
};

type SummaryStats = {
  collectedTotal: number;
  pendingDues: number;
  pendingStudents: number;
};

type FeeSummaryMeta = {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  counts: Record<FilterType, number>;
};

type ClassFeeStructure = {
  id: string;
  class_name: string;
  section_name?: string;
  fee_type: string;
  academic_year: string;
  amount: number;
  due_date?: string;
  frequency?: string;
};

const STATUS_CONFIG = {
  Paid: { light: { bg: '#D1FAE5', text: '#065F46', dot: '#10B981' }, dark: { bg: 'rgba(16,185,129,0.15)', text: '#34D399', dot: '#10B981' } },
  Partial: { light: { bg: '#FEF3C7', text: '#92400E', dot: '#F59E0B' }, dark: { bg: 'rgba(245,158,11,0.15)', text: '#FCD34D', dot: '#F59E0B' } },
  Pending: { light: { bg: '#FEE2E2', text: '#991B1B', dot: '#EF4444' }, dark: { bg: 'rgba(239,68,68,0.15)', text: '#FCA5A5', dot: '#EF4444' } },
} as const;

const IS_WEB = Platform.OS === 'web';
const webCursor = IS_WEB ? ({ cursor: 'pointer' } as const) : null;

const BRAND = '#6B2FA0';
const BRAND_DARK = '#4A1A75';
const BRAND_SOFT = 'rgba(107, 47, 160, 0.12)';

const FILTER_ACCENT: Record<FilterType, string> = {
  All: BRAND,
  Paid: '#10B981',
  Partial: '#F59E0B',
  Pending: '#EF4444',
};

const FEE_UX = {
  pageBgLight: '#EEF0F7',
  pageBgDark: '#0B0D14',
  clayLight: '#F7F8FC',
  clayDark: '#242A38',
  surfaceLight: '#FFFFFF',
  accent: BRAND,
  accentDark: BRAND_DARK,
};

const formatPhoneDisplay = (raw?: string): string | null => {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `${digits.slice(1, 6)} ${digits.slice(6)}`;
  }
  return raw.trim();
};

const phoneDialUri = (raw?: string): string | null => {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return `tel:${digits}`;
};

// ─── Mini Progress Bar ────────────────────────────────────────────────────────
function MiniProgress({ paid, total, isDark }: { paid: number; total: number; isDark: boolean }) {
  const ratio = total > 0 ? Math.min(paid / total, 1) : 0;
  const pct = Math.round(ratio * 100);
  const color = ratio >= 1 ? '#10B981' : ratio >= 0.5 ? '#F59E0B' : '#EF4444';
  const track = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.07)';
  const labelColor = isDark ? 'rgba(255,255,255,0.45)' : '#64748B';

  return (
    <View style={cardStyles.progressBlock}>
      <View style={cardStyles.progressMeta}>
        <Text style={[cardStyles.progressLabel, { color: labelColor }]}>Collection</Text>
        <Text style={[cardStyles.progressPct, { color }]}>{pct}% paid</Text>
      </View>
      <View style={[cardStyles.progressTrack, { backgroundColor: track }]}>
        <View style={[cardStyles.progressFill, { width: `${Math.max(ratio * 100, ratio > 0 ? 4 : 0)}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ─── Student Card ─────────────────────────────────────────────────────────────
const StudentCard = React.memo(function StudentCard({
  item, index, isDark, onPress,
}: {
  item: FeeListStudent; index: number; isDark: boolean; onPress: () => void;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const pressed = useSharedValue(0);
  const hover = useSharedValue(0);
  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(hover.value, [0, 1], [0, -3]) },
      { scale: interpolate(pressed.value, [0, 1], [1, 0.985]) },
    ],
  }));

  const s = (STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.Pending)[isDark ? 'dark' : 'light'];
  const textPri = isDark ? '#F9FAFB' : '#0F172A';
  const textSec = isDark ? 'rgba(255,255,255,0.5)' : '#64748B';
  const chipBg = isDark ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.78)';
  const chipBorder = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(76,90,120,0.08)';
  const phoneDisplay = formatPhoneDisplay(item.fatherMobile);
  const dialUri = phoneDialUri(item.fatherMobile);

  const due = parseFloat(String(item.due)) || 0;
  const paid = parseFloat(String(item.paid)) || 0;
  const total = parseFloat(String(item.total)) || 0;
  const collectLabel = due > 0 ? 'Collect' : 'View';

  const handleCall = useCallback(() => {
    if (!dialUri) return;
    Linking.openURL(dialUri).catch(() => {});
  }, [dialUri]);

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(320).springify()}
      style={animStyle}
    >
      <Pressable
        style={[
          cardStyles.card,
          webCursor,
          {
            backgroundColor: isDark ? FEE_UX.clayDark : FEE_UX.surfaceLight,
            borderTopWidth: 1.5,
            borderTopColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.98)',
            borderBottomWidth: 2.5,
            borderBottomColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(76,90,120,0.14)',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(76,90,120,0.05)',
            shadowColor: isDark ? '#000' : '#6B7A99',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: isDark ? 0.28 : 0.14,
            shadowRadius: 16,
            elevation: 3,
          },
        ]}
        onPress={onPress}
        onHoverIn={() => { hover.value = withSpring(1, { damping: 18, stiffness: 220 }); }}
        onHoverOut={() => { hover.value = withSpring(0, { damping: 18, stiffness: 220 }); }}
        onPressIn={() => { pressed.value = withSpring(1, { damping: 18, stiffness: 220 }); }}
        onPressOut={() => { pressed.value = withSpring(0, { damping: 18, stiffness: 220 }); }}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${item.status}, ${collectLabel}`}
      >
        <View style={[StyleSheet.absoluteFill, { borderRadius: 22, overflow: 'hidden' }]} pointerEvents="none">
          <LinearGradient
            colors={isDark
              ? ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']
              : ['rgba(255,255,255,0.72)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.55, y: 0.95 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={[cardStyles.statusWash, { backgroundColor: `${s.dot}${isDark ? '14' : '0D'}` }]} />
        </View>

        <View style={[cardStyles.accent, { backgroundColor: s.dot }]} />

        <View style={[cardStyles.inner, wide && cardStyles.innerWide]}>
          <View style={[cardStyles.identityCol, wide && cardStyles.identityColWide]}>
            <View style={cardStyles.headerRow}>
              <View
                style={[
                  cardStyles.avatarRing,
                  {
                    borderColor: s.dot,
                    backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : `${s.dot}18`,
                  },
                ]}
              >
                <View
                  style={[
                    cardStyles.avatarWrap,
                    {
                      backgroundColor: isDark ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.95)',
                      overflow: 'hidden',
                    },
                  ]}
                >
                  {item.photoUrl ? (
                    <Image
                      source={{ uri: item.photoUrl }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={[cardStyles.avatarText, { color: s.dot }]}>
                      {(item.name || 'S').charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
              </View>

              <View style={cardStyles.nameBlock}>
                <View style={cardStyles.nameTopRow}>
                  <Text style={[cardStyles.name, { color: textPri }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {!wide ? (
                    <View style={[cardStyles.statusBadge, { backgroundColor: s.bg }]}>
                      <View style={[cardStyles.statusDot, { backgroundColor: s.dot }]} />
                      <Text style={[cardStyles.statusText, { color: s.text }]}>{item.status}</Text>
                    </View>
                  ) : null}
                </View>

                {item.parentLine ? (
                  <Text style={[cardStyles.parentLine, { color: textSec }]} numberOfLines={1}>
                    {item.parentLine}
                  </Text>
                ) : item.fatherName ? (
                  <Text style={[cardStyles.parentLine, { color: textSec }]} numberOfLines={1}>
                    Parent: {item.fatherName}
                  </Text>
                ) : null}

                <View style={cardStyles.metaRow}>
                  {item.admissionNo ? (
                    <View style={[cardStyles.metaTag, { backgroundColor: chipBg, borderColor: chipBorder }]}>
                      <Ionicons name="id-card-outline" size={11} color={textSec} />
                      <Text style={[cardStyles.metaTagText, { color: textSec }]}>#{item.admissionNo}</Text>
                    </View>
                  ) : null}
                  {item.class ? (
                    <View style={[cardStyles.metaTag, { backgroundColor: chipBg, borderColor: chipBorder }]}>
                      <Ionicons name="school-outline" size={11} color={textSec} />
                      <Text style={[cardStyles.metaTagText, { color: textSec }]}>Class {item.class}</Text>
                    </View>
                  ) : null}
                </View>

                {phoneDisplay ? (
                  <Pressable
                    onPress={handleCall}
                    hitSlop={8}
                    style={[
                      cardStyles.phoneChip,
                      {
                        backgroundColor: isDark ? 'rgba(59,130,246,0.16)' : 'rgba(59,130,246,0.10)',
                        borderColor: isDark ? 'rgba(96,165,250,0.28)' : 'rgba(59,130,246,0.22)',
                      },
                    ]}
                  >
                    <View style={[cardStyles.phoneIconWrap, { backgroundColor: isDark ? 'rgba(59,130,246,0.28)' : '#DBEAFE' }]}>
                      <Ionicons name="call" size={11} color="#2563EB" />
                    </View>
                    <Text style={[cardStyles.phoneText, { color: isDark ? '#93C5FD' : '#1D4ED8' }]} numberOfLines={1}>
                      {phoneDisplay}
                    </Text>
                  </Pressable>
                ) : (
                  <View style={[cardStyles.phoneChip, cardStyles.phoneChipMuted, { backgroundColor: chipBg, borderColor: chipBorder }]}>
                    <Ionicons name="call-outline" size={12} color={textSec} />
                    <Text style={[cardStyles.phoneMutedText, { color: textSec }]}>No phone on file</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          <View style={[cardStyles.financeCol, wide && cardStyles.financeColWide]}>
            {wide ? (
              <View style={cardStyles.financeTop}>
                <View style={[cardStyles.statusBadge, { backgroundColor: s.bg }]}>
                  <View style={[cardStyles.statusDot, { backgroundColor: s.dot }]} />
                  <Text style={[cardStyles.statusText, { color: s.text }]}>{item.status}</Text>
                </View>
                <View style={[
                  cardStyles.openHint,
                  {
                    backgroundColor: due > 0
                      ? (isDark ? 'rgba(107,47,160,0.22)' : BRAND_SOFT)
                      : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.05)'),
                  },
                ]}>
                  <Text style={[cardStyles.openHintText, { color: due > 0 ? (isDark ? '#E9D5FF' : BRAND) : (isDark ? '#E2E8F0' : '#475569') }]}>
                    {collectLabel}
                  </Text>
                  <Ionicons name={due > 0 ? 'cash-outline' : 'arrow-forward'} size={12} color={due > 0 ? BRAND : '#64748B'} />
                </View>
              </View>
            ) : null}

            <View style={[cardStyles.figRow, { backgroundColor: isDark ? 'rgba(0,0,0,0.20)' : 'rgba(255,255,255,0.62)' }]}>
              <FigCell
                icon="wallet-outline"
                label="Total"
                value={`₹${total.toLocaleString('en-IN')}`}
                color={textPri}
                sec={textSec}
                iconTint={isDark ? '#94A3B8' : '#64748B'}
              />
              <View style={[cardStyles.figSep, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)' }]} />
              <FigCell
                icon="checkmark-circle-outline"
                label="Collected"
                value={`₹${paid.toLocaleString('en-IN')}`}
                color="#059669"
                sec={textSec}
                iconTint="#10B981"
              />
              <View style={[cardStyles.figSep, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)' }]} />
              <FigCell
                icon="alert-circle-outline"
                label="Due"
                value={`₹${due.toLocaleString('en-IN')}`}
                color={due > 0 ? '#DC2626' : '#059669'}
                sec={textSec}
                iconTint={due > 0 ? '#EF4444' : '#10B981'}
                emphasize={due > 0}
              />
            </View>

            <MiniProgress paid={paid} total={total} isDark={isDark} />
          </View>
        </View>

        <View style={cardStyles.chevronWrap}>
          <View style={[cardStyles.chevronBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)' }]}>
            <Ionicons name="chevron-forward" size={16} color={isDark ? 'rgba(255,255,255,0.45)' : '#94A3B8'} />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
});

function FigCell({
  label, value, color, sec, icon, iconTint, emphasize,
}: {
  label: string; value: string; color: string; sec: string;
  icon: keyof typeof Ionicons.glyphMap; iconTint: string; emphasize?: boolean;
}) {
  return (
    <View style={[cardStyles.figCell, emphasize && cardStyles.figCellEmphasize]}>
      <View style={cardStyles.figLabelRow}>
        <Ionicons name={icon} size={12} color={iconTint} />
        <Text style={[cardStyles.figLabel, { color: sec }]}>{label}</Text>
      </View>
      <Text style={[cardStyles.figValue, { color }, emphasize && cardStyles.figValueEmphasize]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 22,
    marginBottom: 14,
    position: 'relative',
    overflow: 'hidden',
  },
  statusWash: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 140,
    height: 140,
    borderBottomLeftRadius: 140,
  },
  accent: { width: 5, alignSelf: 'stretch', zIndex: 2 },
  inner: { flex: 1, paddingVertical: 15, paddingHorizontal: 13, zIndex: 2, gap: 12 },
  innerWide: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  identityCol: { flex: 1 },
  identityColWide: { flex: 1.15, minWidth: 0 },
  financeCol: { gap: 8 },
  financeColWide: { flex: 1, minWidth: 300 },
  financeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  openHint: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
  },
  openHintText: { fontSize: 11, fontWeight: '800' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatarRing: {
    width: 54, height: 54, borderRadius: 17,
    borderWidth: 2.5, padding: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarWrap: {
    width: '100%', height: '100%', borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  nameBlock: { flex: 1, minWidth: 0, gap: 4 },
  nameTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 16, fontWeight: '800', letterSpacing: -0.25 },
  parentLine: { fontSize: 12, fontWeight: '600' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  metaTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    borderWidth: 1,
  },
  metaTagText: { fontSize: 11, fontWeight: '700' },
  phoneChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 7,
    marginTop: 4, paddingLeft: 4, paddingRight: 12, paddingVertical: 4,
    borderRadius: 999, borderWidth: 1, maxWidth: '100%',
  },
  phoneChipMuted: { paddingLeft: 8 },
  phoneIconWrap: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  phoneText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  phoneMutedText: { fontSize: 11, fontWeight: '600' },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
  figRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, paddingVertical: 11, paddingHorizontal: 6,
  },
  figCell: { flex: 1, alignItems: 'center', paddingHorizontal: 4, gap: 3 },
  figCellEmphasize: {
    backgroundColor: 'rgba(239,68,68,0.06)',
    borderRadius: 10,
    paddingVertical: 4,
  },
  figLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  figLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  figValue: { fontSize: 14, fontWeight: '800', letterSpacing: -0.3 },
  figValueEmphasize: { fontSize: 15 },
  figSep: { width: 1, height: 34 },
  progressBlock: { gap: 5 },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
  progressPct: { fontSize: 11, fontWeight: '800' },
  progressTrack: { height: 6, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  chevronWrap: { justifyContent: 'center', paddingRight: 10, zIndex: 2 },
  chevronBtn: {
    width: 30, height: 30, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
});

// ─── Workspace header ─────────────────────────────────────────────────────────
function CompactKpis({ stats, isDark }: { stats: SummaryStats; isDark: boolean }) {
  const cells = [
    { label: 'Collected', value: `₹${stats.collectedTotal.toLocaleString('en-IN')}`, color: '#059669', icon: 'trending-up' as const },
    { label: 'Outstanding', value: `₹${stats.pendingDues.toLocaleString('en-IN')}`, color: '#DC2626', icon: 'alert-circle' as const },
    { label: 'Pending', value: String(stats.pendingStudents), color: BRAND, icon: 'people' as const },
  ];

  return (
    <View style={sumStyles.wrap}>
      {cells.map((cell, i) => (
        <React.Fragment key={cell.label}>
          {i > 0 ? <View style={[sumStyles.sep, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)' }]} /> : null}
          <View style={sumStyles.cell}>
            <Ionicons name={cell.icon} size={13} color={cell.color} />
            <View>
              <Text style={[sumStyles.value, { color: cell.color }]} numberOfLines={1}>{cell.value}</Text>
              <Text style={[sumStyles.label, { color: isDark ? 'rgba(255,255,255,0.4)' : '#94A3B8' }]}>{cell.label}</Text>
            </View>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

function DueSlipsButton({ onPress, isDark }: { onPress: () => void; isDark: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Fee due slips"
      style={({ pressed, hovered }: any) => [
        dueStyles.btn,
        webCursor,
        {
          backgroundColor: isDark ? 'rgba(5,150,105,0.16)' : '#ECFDF5',
          borderColor: isDark ? 'rgba(16,185,129,0.35)' : '#A7F3D0',
          opacity: pressed ? 0.88 : 1,
          transform: [{ scale: pressed ? 0.98 : hovered ? 1.02 : 1 }],
        },
      ]}
    >
      <Ionicons name="documents-outline" size={15} color="#059669" />
      <Text style={dueStyles.text}>Due slips</Text>
    </Pressable>
  );
}

function WorkspaceHeader({
  stats, isDark, wide, onDueSlips,
}: {
  stats: SummaryStats;
  isDark: boolean;
  wide: boolean;
  onDueSlips: () => void;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(360)}
      style={[
        wsStyles.wrap,
        {
          backgroundColor: isDark ? FEE_UX.clayDark : FEE_UX.surfaceLight,
          borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(76,90,120,0.08)',
          flexDirection: wide ? 'row' : 'column',
          alignItems: wide ? 'center' : 'stretch',
        },
      ]}
    >
      <View style={wsStyles.titleCol}>
        <View style={wsStyles.kickerRow}>
          <View style={wsStyles.kickerDot} />
          <Text style={wsStyles.kicker}>FEE DESK</Text>
        </View>
        <Text style={[wsStyles.title, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>Collect school fees</Text>
        <Text style={[wsStyles.sub, { color: isDark ? 'rgba(255,255,255,0.42)' : '#64748B' }]}>
          Pick a class or search a student — ledgers open in one tap
        </Text>
      </View>
      <View style={[wsStyles.actions, wide && wsStyles.actionsWide]}>
        <CompactKpis stats={stats} isDark={isDark} />
        <DueSlipsButton onPress={onDueSlips} isDark={isDark} />
      </View>
    </Animated.View>
  );
}

const sumStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  cell: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  sep: { width: 1, height: 28 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  value: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
});

const dueStyles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    flexShrink: 0,
  },
  text: { color: '#047857', fontWeight: '800', fontSize: 12 },
});

const wsStyles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderWidth: 1,
    gap: 12,
    ...Platform.select({
      web: { boxShadow: '0 10px 28px -16px rgba(76,90,120,0.28)' } as any,
      default: {
        shadowColor: '#6B7A99',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
        elevation: 3,
      },
    }),
  },
  titleCol: { flex: 1, minWidth: 180, gap: 2 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  kickerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: BRAND },
  kicker: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, color: BRAND },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  sub: { fontSize: 13, fontWeight: '500', marginTop: 2, lineHeight: 18 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  actionsWide: { justifyContent: 'flex-end' },
});

// ─── Filter Pill ──────────────────────────────────────────────────────────────
function FilterPill({
  label, active, count, isDark, onPress,
}: {
  label: FilterType; active: boolean; count: number; isDark: boolean; onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const accent = FILTER_ACCENT[label];
  const showCount = label === 'All' ? count > 0 : count > 0;

  return (
    <Animated.View style={aStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={[
          pillStyles.pill,
          webCursor,
          active
            ? { backgroundColor: accent }
            : { backgroundColor: 'transparent' },
        ]}
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.96, { damping: 16, stiffness: 240 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 16, stiffness: 240 }); }}
      >
        {!active ? <View style={[pillStyles.dot, { backgroundColor: accent }]} /> : null}
        <Text style={[pillStyles.label, { color: active ? '#fff' : (isDark ? 'rgba(255,255,255,0.62)' : '#475569') }]}>
          {label}
        </Text>
        {showCount ? (
          <View style={[pillStyles.badge, { backgroundColor: active ? 'rgba(255,255,255,0.22)' : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)') }]}>
            <Text style={[pillStyles.badgeText, { color: active ? '#fff' : (isDark ? 'rgba(255,255,255,0.55)' : '#64748B') }]}>
              {count}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}
const pillStyles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, minHeight: 36 },
  label: { fontSize: 13, fontWeight: '700' },
  badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, minWidth: 20, alignItems: 'center' },
  badgeText: { fontSize: 10, fontWeight: '800' },
  dot: { width: 7, height: 7, borderRadius: 4 },
});

const formatDueDate = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const classBadgeLabel = (className?: string) => {
  const match = (className || '').match(/\d+/);
  return match?.[0] || (className || '?').charAt(0).toUpperCase();
};

const buildParentLine = (gender?: string, fatherName?: string): string | undefined => {
  const name = fatherName?.trim();
  if (!name) return undefined;
  const g = (gender || '').toLowerCase();
  if (g === 'male') return `S/o ${name}`;
  if (g === 'female') return `D/o ${name}`;
  return undefined;
};

const hasActiveStudentFilters = (filters: {
  submittedSearch: string;
  selectedClassId: string | null;
  submittedAdmissionNo: string;
  submittedFatherName: string;
  submittedMobile: string;
  submittedVillage: string;
  activeFilter: FilterType;
}) =>
  filters.activeFilter !== 'All'
  || filters.submittedSearch.length > 0
  || !!filters.selectedClassId
  || filters.submittedAdmissionNo.length > 0
  || filters.submittedFatherName.length > 0
  || filters.submittedMobile.length > 0
  || filters.submittedVillage.length > 0;

/** Narrow enough to query the API — avoids loading the full student roster on open. */
const hasStudentQueryCriteria = (filters: {
  submittedSearch: string;
  selectedClassId: string | null;
  submittedAdmissionNo: string;
  submittedFatherName: string;
  submittedMobile: string;
  submittedVillage: string;
}) =>
  filters.submittedSearch.length > 0
  || !!filters.selectedClassId
  || filters.submittedAdmissionNo.length > 0
  || filters.submittedFatherName.length > 0
  || filters.submittedMobile.length > 0
  || filters.submittedVillage.length > 0;

// ─── Class Structure Card ─────────────────────────────────────────────────────
const ClassStructureCard = React.memo(function ClassStructureCard({
  item, index, isDark,
}: {
  item: ClassFeeStructure; index: number; isDark: boolean;
}) {
  const textPri = isDark ? '#F9FAFB' : '#111827';
  const textSec = isDark ? 'rgba(255,255,255,0.45)' : '#64748B';
  const amount = Number(item.amount) || 0;

  return (
    <Animated.View entering={FadeInDown.delay(index * 40).duration(350).springify()}>
      <View
        style={[
          structureStyles.card,
          {
            backgroundColor: isDark ? '#2A3142' : '#EEF1F8',
            borderTopWidth: 1.5,
            borderTopColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.9)',
            borderBottomWidth: 3,
            borderBottomColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(76,90,120,0.18)',
            shadowColor: isDark ? '#000' : '#6B7A99',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: isDark ? 0.30 : 0.18,
            shadowRadius: 14,
            elevation: 4,
          }
        ]}
      >
        <View style={[StyleSheet.absoluteFill, { borderRadius: 24, overflow: 'hidden' }]}>
          <LinearGradient
            colors={isDark ? ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.5)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </View>

        <View style={[structureStyles.classBadge, { backgroundColor: isDark ? 'rgba(107,47,160,0.22)' : BRAND_SOFT }]}>
          <Text style={structureStyles.classBadgeText}>{classBadgeLabel(item.class_name)}</Text>
        </View>

        <View style={structureStyles.infoBlock}>
          <Text style={[structureStyles.title, { color: textPri }]} numberOfLines={1}>
            {item.fee_type} - {item.academic_year}
          </Text>
          <Text style={[structureStyles.subtitle, { color: textSec }]} numberOfLines={1}>
            {item.class_name}
            {item.section_name ? ` · ${item.section_name}` : ''}
            {' · Due '}{formatDueDate(item.due_date)}
          </Text>
        </View>

        <View style={structureStyles.amountBlock}>
          <Text style={structureStyles.amount}>₹{amount.toLocaleString('en-IN')}</Text>
          <Text style={[structureStyles.frequency, { color: textSec }]}>
            {(item.frequency || 'MONTHLY').toUpperCase()}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
});

const structureStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 24,
    padding: 14,
    marginBottom: 12,
    position: 'relative',
  },
  classBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  classBadgeText: {
    fontSize: 18,
    fontWeight: '800',
    color: BRAND,
  },
  infoBlock: { flex: 1, zIndex: 2 },
  title: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 12, fontWeight: '600' },
  amountBlock: { alignItems: 'flex-end', zIndex: 2 },
  amount: { fontSize: 18, fontWeight: '800', color: BRAND },
  frequency: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4, marginTop: 2 },
});

// ─── View Mode Pill ───────────────────────────────────────────────────────────
const VIEW_MODE_META: Record<ViewMode, { icon: keyof typeof Ionicons.glyphMap; iconActive: keyof typeof Ionicons.glyphMap; short: string }> = {
  Students: { icon: 'people-outline', iconActive: 'people', short: 'Students' },
  'Fee Recovery': { icon: 'shield-checkmark-outline', iconActive: 'shield-checkmark', short: 'Recovery' },
  'Class Structures': { icon: 'layers-outline', iconActive: 'layers', short: 'Structures' },
};

function ViewModePill({
  label, active, isDark, onPress,
}: {
  label: ViewMode; active: boolean; isDark: boolean; onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    flex: 1,
  }));
  const meta = VIEW_MODE_META[label];

  return (
    <Animated.View style={aStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={[
          viewModeStyles.pill,
          webCursor,
          active && {
            backgroundColor: isDark ? '#3A2458' : '#FFFFFF',
            ...Platform.select({
              web: { boxShadow: isDark ? '0 6px 16px -8px rgba(0,0,0,0.45)' : '0 6px 16px -8px rgba(76,90,120,0.28)' } as any,
              default: {
                shadowColor: isDark ? '#000' : '#6B7A99',
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: isDark ? 0.25 : 0.12,
                shadowRadius: 6,
                elevation: 2,
              },
            }),
          },
        ]}
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.97, { damping: 16, stiffness: 240 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 16, stiffness: 240 }); }}
      >
        <Ionicons
          name={active ? meta.iconActive : meta.icon}
          size={15}
          color={active ? (isDark ? '#F3E8FF' : BRAND) : (isDark ? 'rgba(255,255,255,0.38)' : '#94A3B8')}
        />
        <Text style={[viewModeStyles.label, { color: active ? (isDark ? '#F8FAFC' : '#0F172A') : (isDark ? 'rgba(255,255,255,0.4)' : '#64748B') }]}>
          {meta.short}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const viewModeStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
    height: 40,
  },
  label: { fontSize: 13, fontWeight: '800' },
});

type FilterKey = 'class' | 'admission' | 'father' | 'mobile' | 'village' | 'search' | 'status';

function FilterField({
  label, icon, value, onChange, placeholder, isDark, onSubmit, keyboardType,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  isDark: boolean;
  onSubmit: () => void;
  keyboardType?: 'default' | 'phone-pad';
}) {
  return (
    <View style={filterPanelStyles.inputCell}>
      <Text style={[filterPanelStyles.label, { color: isDark ? 'rgba(255,255,255,0.45)' : '#64748B' }]}>{label}</Text>
      <View style={[
        filterPanelStyles.field,
        {
          backgroundColor: isDark ? 'rgba(0,0,0,0.28)' : '#FFFFFF',
          borderColor: value
            ? (isDark ? 'rgba(107,47,160,0.45)' : 'rgba(107,47,160,0.28)')
            : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(76,90,120,0.12)'),
        },
      ]}>
        <Ionicons name={icon} size={14} color={value ? BRAND : (isDark ? 'rgba(255,255,255,0.35)' : '#94A3B8')} />
        <AppTextInput
          style={[ds.inputInChrome, filterPanelStyles.input, { color: isDark ? '#F9FAFB' : '#111827' }]}
          placeholder={placeholder}
          placeholderTextColor={isDark ? 'rgba(255,255,255,0.28)' : '#94A3B8'}
          value={value}
          onChangeText={onChange}
          keyboardType={keyboardType}
          returnKeyType="search"
          onSubmitEditing={onSubmit}
        />
        {value ? (
          <Pressable onPress={() => onChange('')} hitSlop={8} style={webCursor}>
            <Ionicons name="close-circle" size={15} color={isDark ? 'rgba(255,255,255,0.35)' : '#94A3B8'} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function StudentFiltersPanel({
  expanded,
  onToggle,
  isDark,
  classes,
  selectedClassId,
  onSelectClass,
  admissionNo,
  onAdmissionNoChange,
  fatherName,
  onFatherNameChange,
  mobile,
  onMobileChange,
  village,
  onVillageChange,
  onClear,
  onSubmit,
  hasActiveFilters,
  hasDraft,
  activeChips,
  onRemoveFilter,
}: {
  expanded: boolean;
  onToggle: () => void;
  isDark: boolean;
  classes: ClassInfo[];
  selectedClassId: string | null;
  onSelectClass: (id: string | null) => void;
  admissionNo: string;
  onAdmissionNoChange: (value: string) => void;
  fatherName: string;
  onFatherNameChange: (value: string) => void;
  mobile: string;
  onMobileChange: (value: string) => void;
  village: string;
  onVillageChange: (value: string) => void;
  onClear: () => void;
  onSubmit: () => void;
  hasActiveFilters: boolean;
  hasDraft: boolean;
  activeChips: { key: FilterKey; label: string }[];
  onRemoveFilter: (key: FilterKey) => void;
}) {
  const refineCount = [admissionNo, fatherName, mobile, village].filter((v) => v.trim().length > 0).length;
  const muted = isDark ? 'rgba(255,255,255,0.42)' : '#64748B';

  const classChip = (active: boolean) => ({
    backgroundColor: active ? BRAND : (isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF'),
    borderColor: active ? BRAND : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(76,90,120,0.12)'),
  });
  const classText = (active: boolean) => ({
    color: active ? '#fff' : (isDark ? 'rgba(255,255,255,0.7)' : '#334155'),
  });

  return (
    <View style={filterPanelStyles.wrap}>
      <View style={filterPanelStyles.classHead}>
        <Text style={[filterPanelStyles.sectionLabel, { color: muted }]}>Browse by class</Text>
        <View style={filterPanelStyles.classHeadRight}>
          {hasActiveFilters ? (
            <Pressable onPress={onClear} hitSlop={8} style={webCursor}>
              <Text style={filterPanelStyles.clearText}>Clear all</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onToggle}
            style={[filterPanelStyles.moreBtn, webCursor, expanded && { backgroundColor: isDark ? 'rgba(107,47,160,0.22)' : BRAND_SOFT }]}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Hide extra filters' : 'Show extra filters'}
          >
            <Ionicons name="options-outline" size={14} color={expanded || refineCount ? BRAND : muted} />
            <Text style={[filterPanelStyles.moreText, { color: expanded || refineCount ? BRAND : muted }]}>
              {expanded ? 'Less' : 'More filters'}
            </Text>
            {refineCount > 0 ? (
              <View style={filterPanelStyles.moreBadge}>
                <Text style={filterPanelStyles.moreBadgeText}>{refineCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      <TourTarget id="accounts.fees.filters" native><View style={filterPanelStyles.chipCloud}>
        <Pressable
          style={[filterPanelStyles.chip, webCursor, classChip(!selectedClassId)]}
          onPress={() => onSelectClass(null)}
          accessibilityRole="button"
          accessibilityLabel="All classes"
          accessibilityState={{ selected: !selectedClassId }}
        >
          <Text style={[filterPanelStyles.chipText, classText(!selectedClassId)]}>All classes</Text>
        </Pressable>
        {classes.map((cls) => {
          const active = selectedClassId === cls.id;
          return (
            <Pressable
              key={cls.id}
              style={[filterPanelStyles.chip, webCursor, classChip(active)]}
              onPress={() => onSelectClass(active ? null : cls.id)}
              accessibilityRole="button"
              accessibilityLabel={`Class ${cls.name}`}
              accessibilityState={{ selected: active }}
            >
              <Text style={[filterPanelStyles.chipText, classText(active)]}>{cls.name}</Text>
            </Pressable>
          );
        })}
      </View></TourTarget>

      {expanded ? (
        <Animated.View entering={FadeIn.duration(220)} style={filterPanelStyles.refineBox}>
          <View style={filterPanelStyles.inputRow}>
            <FilterField
              label="Admission no"
              icon="id-card-outline"
              value={admissionNo}
              onChange={onAdmissionNoChange}
              placeholder="Exact or prefix"
              isDark={isDark}
              onSubmit={onSubmit}
            />
            <FilterField
              label="Father / guardian"
              icon="person-outline"
              value={fatherName}
              onChange={onFatherNameChange}
              placeholder="Parent name"
              isDark={isDark}
              onSubmit={onSubmit}
            />
          </View>
          <View style={filterPanelStyles.inputRow}>
            <FilterField
              label="Mobile"
              icon="call-outline"
              value={mobile}
              onChange={onMobileChange}
              placeholder="Parent phone"
              isDark={isDark}
              onSubmit={onSubmit}
              keyboardType="phone-pad"
            />
            <FilterField
              label="Village / stop"
              icon="location-outline"
              value={village}
              onChange={onVillageChange}
              placeholder="Transport stop"
              isDark={isDark}
              onSubmit={onSubmit}
            />
          </View>
          <Pressable
            onPress={onSubmit}
            style={({ pressed }: any) => [
              filterPanelStyles.searchButton,
              webCursor,
              {
                backgroundColor: BRAND,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.99 : 1 }],
              },
            ]}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.7, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <Ionicons name="search" size={15} color="#fff" />
            <Text style={filterPanelStyles.searchButtonText}>
              {hasDraft ? 'Apply filters' : 'Search students'}
            </Text>
          </Pressable>
        </Animated.View>
      ) : null}

      {activeChips.length > 0 ? (
        <View style={filterPanelStyles.chipCloud}>
          {activeChips.map((chip) => (
            <Pressable
              key={chip.key}
              onPress={() => onRemoveFilter(chip.key)}
              style={[filterPanelStyles.activeChip, webCursor, { backgroundColor: isDark ? 'rgba(107,47,160,0.2)' : '#F3E8FF' }]}
              accessibilityLabel={`Remove filter ${chip.label}`}
            >
              <Text style={[filterPanelStyles.activeChipText, { color: isDark ? '#E9D5FF' : BRAND_DARK }]}>{chip.label}</Text>
              <Ionicons name="close" size={12} color={BRAND} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const filterPanelStyles = StyleSheet.create({
  wrap: { gap: 10 },
  classHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  classHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  clearText: { fontSize: 12, fontWeight: '800', color: BRAND },
  moreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 999,
  },
  moreText: { fontSize: 12, fontWeight: '800' },
  moreBadge: {
    backgroundColor: BRAND,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  moreBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  chipCloud: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: '700' },
  refineBox: { gap: 10, marginTop: 2 },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  inputRow: { flexDirection: 'row', gap: 10 },
  inputCell: { flex: 1, gap: 6, minWidth: 0 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    height: 40,
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  searchButtonText: { fontSize: 13, fontWeight: '800', color: '#fff', zIndex: 2 },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  activeChipText: { fontSize: 11, fontWeight: '700' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AccountsFees() {
  const { user } = useAuth();
  const { isEnabled: isFeatureEnabled } = useFeatures();
  const recoveryEnabled = isFeatureEnabled('nav.fees');
  const visibleViewModes = useMemo(() => VIEW_MODES.filter(mode => mode !== 'Fee Recovery' || recoveryEnabled), [recoveryEnabled]);
  const { theme, isDark } = useTheme();
  const { shellActive } = useAccountsWebChrome();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const searchRef = useRef<TextInput>(null);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [admissionNoInput, setAdmissionNoInput] = useState('');
  const [submittedAdmissionNo, setSubmittedAdmissionNo] = useState('');
  const [fatherNameInput, setFatherNameInput] = useState('');
  const [submittedFatherName, setSubmittedFatherName] = useState('');
  const [mobileInput, setMobileInput] = useState('');
  const [submittedMobile, setSubmittedMobile] = useState('');
  const [villageInput, setVillageInput] = useState('');
  const [submittedVillage, setSubmittedVillage] = useState('');
  const [activeView, setActiveView] = useState<ViewMode>('Students');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [structuresLoading, setStructuresLoading] = useState(true);
  const [students, setStudents] = useState<FeeListStudent[]>([]);
  const [structures, setStructures] = useState<ClassFeeStructure[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterType>('All');
  const [searchFocused, setSearchFocused] = useState(false);
  const [summaryStats, setSummaryStats] = useState<SummaryStats>({
    collectedTotal: 0,
    pendingDues: 0,
    pendingStudents: 0,
  });
  const [meta, setMeta] = useState<FeeSummaryMeta>({
    total: 0,
    page: 1,
    limit: PAGE_LIMIT,
    total_pages: 1,
    counts: EMPTY_COUNTS,
  });
  const requestIdRef = useRef(0);

  const { data: statsPayload, refetch: refetchStats } = useApiQuery<any>(
    '/fees/dashboard-stats',
    'accounts-fees-stats',
    CACHE_TTL_MS,
    user?.id,
    { query: { for_accounts: '1' } }
  );

  const { data: structuresPayload, loading: structuresQueryLoading, refetch: refetchStructures } = useApiQuery<any[]>(
    '/fees/structure',
    'accounts-fees-structures',
    CACHE_TTL_MS,
    user?.id
  );

  const mapFeeSummary = useCallback((d: any): FeeListStudent => {
    const fatherName = d.father_name || '';
    const fatherMobile = d.father_mobile || '';
    const studentGender = d.student_gender || '';
    return {
      id: d.student_id,
      name: d.student_name,
      admissionNo: d.admission_no || '',
      class: d.class_name || '',
      fatherName,
      fatherMobile,
      studentGender,
      parentLine: buildParentLine(studentGender, fatherName),
      photoUrl: d.photo_url || '',
      status: d.status,
      total: d.total_amount,
      paid: d.paid_amount,
      due: d.due_amount,
      rawId: `${d.student_id}_${d.class_name || ''}`,
    };
  }, []);

  const mapStructure = useCallback((item: any): ClassFeeStructure => ({
    id: String(item.id),
    class_name: item.class_name || '—',
    section_name: item.section_name || undefined,
    fee_type: item.fee_type || 'Fee',
    academic_year: item.academic_year || '—',
    amount: Number(item.amount) || 0,
    due_date: item.due_date,
    frequency: item.frequency,
  }), []);

  useEffect(() => {
    if (!statsPayload) return;
    const stats = statsPayload.stats || statsPayload;
    setSummaryStats({
      collectedTotal: Number(stats.collected_total || 0),
      pendingDues: Number(stats.pending_dues || 0),
      pendingStudents: Number(stats.defaulter_count || 0),
    });
  }, [statsPayload]);

  useEffect(() => {
    if (!structuresPayload) return;
    const payload = structuresPayload as any;
    const rows = Array.isArray(payload)
      ? payload
      : payload?.structures ?? payload?.data ?? [];
    setStructures((Array.isArray(rows) ? rows : []).map(mapStructure));
    setStructuresLoading(false);
  }, [mapStructure, structuresPayload]);

  useEffect(() => {
    if (structuresQueryLoading && !structuresPayload) setStructuresLoading(true);
  }, [structuresQueryLoading, structuresPayload]);

  const loadData = useCallback(async ({
    nextPage = 1,
    append = false,
    isRefreshing = false,
  }: {
    nextPage?: number;
    append?: boolean;
    isRefreshing?: boolean;
  } = {}) => {
    if (!user) return;

    const requestId = ++requestIdRef.current;
    if (append) setLoadingMore(true);
    else if (isRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await FeeService.getStudentFeeSummaries({
        page: nextPage,
        limit: PAGE_LIMIT,
        search: submittedSearch || undefined,
        class_id: selectedClassId || undefined,
        admission_no: submittedAdmissionNo || undefined,
        father_name: submittedFatherName || undefined,
        mobile: submittedMobile || undefined,
        village: submittedVillage || undefined,
        status: activeFilter === 'All' ? undefined : activeFilter,
      });

      if (requestId !== requestIdRef.current) return;

      const mapped = response.data.map(mapFeeSummary);
      setStudents((prev) => {
        if (!append) return mapped;
        const seen = new Set(prev.map((student) => student.rawId));
        return [...prev, ...mapped.filter((student) => !seen.has(student.rawId))];
      });
      setMeta({
        total: response.meta?.total ?? mapped.length,
        page: response.meta?.page ?? nextPage,
        limit: response.meta?.limit ?? PAGE_LIMIT,
        total_pages: response.meta?.total_pages ?? 1,
        counts: { ...EMPTY_COUNTS, ...(response.meta?.counts || {}) },
      });
    } catch {
      if (requestId === requestIdRef.current && !append) {
        setStudents([]);
        setMeta({
          total: 0,
          page: 1,
          limit: PAGE_LIMIT,
          total_pages: 1,
          counts: EMPTY_COUNTS,
        });
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    }
  }, [
    activeFilter,
    submittedAdmissionNo,
    submittedFatherName,
    submittedMobile,
    submittedSearch,
    submittedVillage,
    mapFeeSummary,
    selectedClassId,
    user,
  ]);

  useEffect(() => {
    ClassService.getClasses()
      .then(setClasses)
      .catch(() => setClasses([]));
  }, []);

  // Free-text filters commit only on Enter / the Search button — typing alone
  // never fires a request. React batches the setters, so one submit triggers
  // at most one fetch via the load effect below.
  const commitStudentSearch = useCallback(() => {
    const query = searchQuery.trim();
    setSubmittedSearch(query.length >= 2 ? query : '');
    setSubmittedAdmissionNo(admissionNoInput.trim());
    const father = fatherNameInput.trim();
    setSubmittedFatherName(father.length >= 2 ? father : '');
    const digits = mobileInput.trim().replace(/\D/g, '');
    setSubmittedMobile(digits.length >= 3 ? digits : '');
    const village = villageInput.trim();
    setSubmittedVillage(village.length >= 2 ? village : '');
    setFiltersExpanded(false);
  }, [admissionNoInput, fatherNameInput, mobileInput, searchQuery, villageInput]);

  // Class Structures view filters locally on searchQuery, so submit only
  // matters for the Students view.
  const handleSearchSubmit = useCallback(() => {
    if (activeView === 'Students') commitStudentSearch();
  }, [activeView, commitStudentSearch]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setSubmittedSearch('');
  }, []);

  const studentFiltersActive = hasActiveStudentFilters({
    submittedSearch,
    selectedClassId,
    submittedAdmissionNo,
    submittedFatherName,
    submittedMobile,
    submittedVillage,
    activeFilter,
  });

  const studentQueryReady = hasStudentQueryCriteria({
    submittedSearch,
    selectedClassId,
    submittedAdmissionNo,
    submittedFatherName,
    submittedMobile,
    submittedVillage,
  });

  const hasDraftFilters =
    searchQuery.trim() !== submittedSearch
    || admissionNoInput.trim() !== submittedAdmissionNo
    || fatherNameInput.trim() !== submittedFatherName
    || mobileInput.trim().replace(/\D/g, '') !== submittedMobile
    || villageInput.trim() !== submittedVillage;

  const activeFilterChips = useMemo(() => {
    const chips: { key: FilterKey; label: string }[] = [];
    if (submittedSearch) chips.push({ key: 'search', label: `"${submittedSearch}"` });
    if (selectedClassId) {
      const name = classes.find((c) => c.id === selectedClassId)?.name;
      chips.push({ key: 'class', label: name ? `Class ${name}` : 'Class' });
    }
    if (submittedAdmissionNo) chips.push({ key: 'admission', label: `#${submittedAdmissionNo}` });
    if (submittedFatherName) chips.push({ key: 'father', label: submittedFatherName });
    if (submittedMobile) chips.push({ key: 'mobile', label: submittedMobile });
    if (submittedVillage) chips.push({ key: 'village', label: submittedVillage });
    if (activeFilter !== 'All') chips.push({ key: 'status', label: activeFilter });
    return chips;
  }, [
    activeFilter,
    classes,
    selectedClassId,
    submittedAdmissionNo,
    submittedFatherName,
    submittedMobile,
    submittedSearch,
    submittedVillage,
  ]);

  const removeFilter = useCallback((key: FilterKey) => {
    switch (key) {
      case 'class':
        setSelectedClassId(null);
        break;
      case 'admission':
        setAdmissionNoInput('');
        setSubmittedAdmissionNo('');
        break;
      case 'father':
        setFatherNameInput('');
        setSubmittedFatherName('');
        break;
      case 'mobile':
        setMobileInput('');
        setSubmittedMobile('');
        break;
      case 'village':
        setVillageInput('');
        setSubmittedVillage('');
        break;
      case 'search':
        setSearchQuery('');
        setSubmittedSearch('');
        break;
      case 'status':
        setActiveFilter('All');
        break;
    }
  }, []);

  useEffect(() => {
    if (!IS_WEB) return;
    const onKey = (e: { metaKey?: boolean; ctrlKey?: boolean; key: string; preventDefault: () => void }) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey as EventListener);
    return () => window.removeEventListener('keydown', onKey as EventListener);
  }, []);

  const clearStudentFilters = useCallback(() => {
    setSelectedClassId(null);
    setAdmissionNoInput('');
    setSubmittedAdmissionNo('');
    setFatherNameInput('');
    setSubmittedFatherName('');
    setMobileInput('');
    setSubmittedMobile('');
    setVillageInput('');
    setSubmittedVillage('');
    setSearchQuery('');
    setSubmittedSearch('');
    setActiveFilter('All');
    setFiltersExpanded(false);
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    if (activeView !== 'Students') return;

    if (!studentQueryReady) {
      requestIdRef.current += 1;
      setStudents([]);
      setMeta({
        total: 0,
        page: 1,
        limit: PAGE_LIMIT,
        total_pages: 1,
        counts: EMPTY_COUNTS,
      });
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    loadData({ nextPage: 1 });
  }, [
    activeFilter,
    activeView,
    submittedAdmissionNo,
    submittedFatherName,
    submittedMobile,
    submittedSearch,
    submittedVillage,
    loadData,
    selectedClassId,
    studentQueryReady,
    user,
  ]);

  const filterCounts = meta.counts;

  const filteredStructures = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return structures;
    return structures.filter((item) => {
      const haystack = [
        item.class_name,
        item.section_name,
        item.fee_type,
        item.academic_year,
        item.frequency,
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [searchQuery, structures]);

  const handleViewLedger = useCallback((student: any) => {
    router.push({
      pathname: '/accounts/fees/details' as any,
      params: {
        studentId: student.id,
        name: student.name,
        fatherName: student.fatherName,
        fatherMobile: student.fatherMobile,
      },
    });
  }, [router]);

  const handleFilterChange = useCallback((filter: FilterType) => {
    setActiveFilter(filter);
  }, []);

  const handleRefresh = useCallback(() => {
    void refetchStats();
    void refetchStructures();
    if (activeView === 'Students') {
      if (studentQueryReady) {
        loadData({ nextPage: 1, isRefreshing: true });
      } else {
        setRefreshing(true);
        setTimeout(() => setRefreshing(false), 400);
      }
    } else {
      setRefreshing(true);
      setTimeout(() => setRefreshing(false), 400);
    }
  }, [activeView, loadData, refetchStats, refetchStructures, studentQueryReady]);

  const hasMore = meta.page < meta.total_pages;

  const handleEndReached = useCallback(() => {
    if (!studentQueryReady || loading || loadingMore || refreshing || !hasMore) return;
    loadData({ nextPage: meta.page + 1, append: true });
  }, [hasMore, loadData, loading, loadingMore, meta.page, refreshing, studentQueryReady]);

  const renderStudentItem = useCallback(({ item, index }: { item: any; index: number }) => (
    <StudentCard
      item={item}
      index={index}
      isDark={isDark}
      onPress={() => handleViewLedger(item)}
    />
  ), [isDark, handleViewLedger]);

  const renderStructureItem = useCallback(({ item, index }: { item: ClassFeeStructure; index: number }) => (
    <ClassStructureCard item={item} index={index} isDark={isDark} />
  ), [isDark]);

  const openDueSlips = useCallback(() => {
    router.push('/accounts/fees/fee-due-slips' as any);
  }, [router]);

  const focusSearch = useCallback(() => {
    searchRef.current?.focus();
  }, []);

  const viewSwitcher = (
    <View style={styles.viewModeRow}>
      {visibleViewModes.map((mode) => (
        <ViewModePill
          key={mode}
          label={mode}
          active={activeView === mode}
          isDark={isDark}
          onPress={() => setActiveView(mode)}
        />
      ))}
    </View>
  );

  const resultsBar = activeView === 'Students' && !loading && studentQueryReady ? (
    <Animated.View entering={FadeIn.duration(280)} style={styles.resultsBar}>
      <View style={styles.resultsLeft}>
        <View style={[styles.resultsIcon, { backgroundColor: isDark ? 'rgba(107,47,160,0.22)' : BRAND_SOFT }]}>
          <Ionicons name="people" size={13} color={BRAND} />
        </View>
        <Text style={styles.resultsCount}>
          {meta.total} student{meta.total !== 1 ? 's' : ''}
          {activeFilter !== 'All' ? ` · ${activeFilter}` : ''}
        </Text>
      </View>
      <Text style={styles.resultsHint} numberOfLines={1}>
        Tap a card to collect or open the ledger
      </Text>
    </Animated.View>
  ) : activeView === 'Class Structures' && !structuresLoading ? (
    <Animated.View entering={FadeIn.duration(280)} style={styles.resultsBar}>
      <View style={styles.resultsLeft}>
        <View style={[styles.resultsIcon, { backgroundColor: isDark ? 'rgba(107,47,160,0.22)' : BRAND_SOFT }]}>
          <Ionicons name="layers" size={13} color={BRAND} />
        </View>
        <Text style={styles.resultsCount}>
          {filteredStructures.length} structure{filteredStructures.length !== 1 ? 's' : ''}
        </Text>
      </View>
      <Text style={styles.resultsHint} numberOfLines={1}>
        {searchQuery.trim() ? `"${searchQuery.trim()}"` : 'Class fee setup overview'}
      </Text>
    </Animated.View>
  ) : null;

  const ListFooter = useMemo(() => (
    loadingMore ? (
      <View style={styles.footerLoader}>
        <ActivityIndicator color={BRAND} />
      </View>
    ) : null
  ), [loadingMore, styles.footerLoader]);

  const EmptyState = useMemo(() => {
    if (activeView === 'Class Structures') {
      const hasQuery = searchQuery.trim().length > 0;
      return (
        <View style={styles.emptyWrap}>
          <View style={[styles.emptyIconWrap, { backgroundColor: isDark ? 'rgba(107,47,160,0.2)' : BRAND_SOFT }]}>
            <Ionicons name="layers-outline" size={28} color={BRAND} />
          </View>
          <Text style={styles.emptyTitle}>
            {hasQuery ? 'No class fee structures found' : 'No class fee structures yet'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {hasQuery
              ? 'Try a different class, fee type, or academic year'
              : 'Ask an admin to configure class fees under Admin → Fee Setup'}
          </Text>
        </View>
      );
    }

    const hasQuery = studentQueryReady;
    return (
      <View style={styles.emptyWrap}>
        <View style={[styles.emptyIconWrap, { backgroundColor: isDark ? 'rgba(107,47,160,0.2)' : BRAND_SOFT }]}>
          <Ionicons name={hasQuery ? 'search-outline' : 'wallet-outline'} size={28} color={BRAND} />
        </View>
        <Text style={styles.emptyTitle}>
          {hasQuery ? 'No students match these filters' : 'Start with a class or a name'}
        </Text>
        <Text style={styles.emptySubtitle}>
          {hasQuery
            ? 'Clear a chip above, pick another class, or search a different name'
            : 'Accountants collect fastest by tapping a class. You can also search a student or parent phone.'}
        </Text>
        {!hasQuery ? (
          <View style={styles.emptyTips}>
            {[
              { icon: 'school-outline' as const, text: 'Tap a class above', action: undefined },
              { icon: 'person-outline' as const, text: 'Search a name', action: 'search' as const },
              { icon: 'call-outline' as const, text: 'Filter by phone', action: 'refine' as const },
            ].map((tip) => (
              <Pressable
                key={tip.text}
                onPress={() => {
                  if (tip.action === 'search') focusSearch();
                  if (tip.action === 'refine') setFiltersExpanded(true);
                }}
                style={[styles.emptyTip, webCursor, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F3E8FF' }]}
              >
                <Ionicons name={tip.icon} size={13} color={BRAND} />
                <Text style={[styles.emptyTipText, { color: isDark ? 'rgba(255,255,255,0.7)' : '#475569' }]}>{tip.text}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Pressable onPress={clearStudentFilters} style={[styles.emptyReset, webCursor]}>
            <Text style={styles.emptyResetText}>Reset filters</Text>
          </Pressable>
        )}
      </View>
    );
  }, [activeView, clearStudentFilters, focusSearch, isDark, searchQuery, studentQueryReady, styles.emptyIconWrap, styles.emptyReset, styles.emptyResetText, styles.emptySubtitle, styles.emptyTip, styles.emptyTipText, styles.emptyTips, styles.emptyTitle, styles.emptyWrap]);

  const isListLoading = activeView === 'Students'
    ? loading && studentQueryReady && students.length === 0
    : structuresLoading;

  return (
    <TourTarget id="screen.accounts-fees.workspace" native><View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={isDark ? '#0F1117' : '#1E293B'}
      />
      {!shellActive && <AdminHeader title="Fee Management" showBackButton />}

      <TourTarget id="screen.accounts-fees.overview"><WorkspaceHeader
        stats={summaryStats}
        isDark={isDark}
        wide={wide}
        onDueSlips={openDueSlips}
      /></TourTarget>

      {activeView !== 'Fee Recovery' && (
        <Animated.View
          entering={FadeInDown.duration(400)}
          style={[styles.searchWrapFrame, searchFocused && styles.searchWrapFrameFocused]}
        >
          <View style={[styles.searchRecessedWell, searchFocused && styles.searchRecessedWellFocused]}>
            <Ionicons
              name="search"
              size={18}
              color={searchFocused ? BRAND : (isDark ? 'rgba(255,255,255,0.45)' : '#64748B')}
            />
            <TourTarget id="accounts.fees.search" native event="accounts.fees.search"><AppTextInput
              ref={searchRef}
              style={[ds.inputInChrome, styles.searchInput]}
              placeholder={activeView === 'Students'
                ? 'Search student name, admission no, or parent phone'
                : 'Search class, fee type or year'}
              placeholderTextColor={isDark ? 'rgba(255,255,255,0.28)' : '#94A3B8'}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              returnKeyType="search"
              onSubmitEditing={handleSearchSubmit}
              blurOnSubmit={false}
            /></TourTarget>
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={handleClearSearch} hitSlop={8} style={webCursor}>
                <Ionicons name="close-circle" size={18} color={isDark ? 'rgba(255,255,255,0.4)' : '#64748B'} />
              </TouchableOpacity>
            )}
            {IS_WEB && !searchFocused && searchQuery.length === 0 ? (
              <View style={styles.kbdHint} pointerEvents="none">
                <Text style={styles.kbdHintText}>{Platform.OS === 'web' ? '⌘K' : ''}</Text>
              </View>
            ) : null}
            {activeView === 'Students' ? (
              <TouchableOpacity
                onPress={handleSearchSubmit}
                style={styles.searchAction}
                activeOpacity={0.85}
                accessibilityLabel="Search students"
              >
                <Text style={styles.searchActionText}>Search</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </Animated.View>
      )}

      <View style={[
        styles.deskChrome,
        {
          backgroundColor: isDark ? FEE_UX.clayDark : FEE_UX.surfaceLight,
          borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(76,90,120,0.08)',
        },
      ]}>
        {viewSwitcher}

        {activeView === 'Students' ? (
          <>
            <StudentFiltersPanel
              expanded={filtersExpanded}
              onToggle={() => setFiltersExpanded((prev) => !prev)}
              isDark={isDark}
              classes={classes}
              selectedClassId={selectedClassId}
              onSelectClass={setSelectedClassId}
              admissionNo={admissionNoInput}
              onAdmissionNoChange={setAdmissionNoInput}
              fatherName={fatherNameInput}
              onFatherNameChange={setFatherNameInput}
              mobile={mobileInput}
              onMobileChange={setMobileInput}
              village={villageInput}
              onVillageChange={setVillageInput}
              onClear={clearStudentFilters}
              onSubmit={commitStudentSearch}
              hasActiveFilters={studentFiltersActive}
              hasDraft={hasDraftFilters}
              activeChips={activeFilterChips}
              onRemoveFilter={removeFilter}
            />
            <View style={styles.statusTrack}>
              {FILTERS.map((f) => (
                <FilterPill
                  key={f}
                  label={f}
                  active={activeFilter === f}
                  count={filterCounts[f]}
                  isDark={isDark}
                  onPress={() => handleFilterChange(f)}
                />
              ))}
            </View>
          </>
        ) : null}

        {resultsBar}
      </View>

      {isListLoading && activeView !== 'Fee Recovery' ? (
        <View style={styles.loadingWrap}>
          <LogoLoader size={52} color={BRAND} />
          <Text style={styles.loadingText}>
            {activeView === 'Students' ? 'Loading students…' : 'Loading class fee structures…'}
          </Text>
        </View>
      ) : activeView === 'Fee Recovery' ? (
        <FeeRecoveryView
          onSelectStudent={(studentId) => {
            router.push({
              pathname: '/accounts/fees/details',
              params: { studentId },
            });
          }}
        />
      ) : activeView === 'Students' ? (
        <FlatList
          data={students}
          keyExtractor={(item) => `${item.id}_${item.rawId}`}
          renderItem={renderStudentItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={EmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={BRAND}
              colors={[BRAND]}
            />
          }
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.45}
          removeClippedSubviews
          initialNumToRender={12}
          maxToRenderPerBatch={10}
        />
      ) : (
        <FlatList
          data={filteredStructures}
          keyExtractor={(item) => item.id}
          renderItem={renderStructureItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={EmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={BRAND}
              colors={[BRAND]}
            />
          }
          removeClippedSubviews
          initialNumToRender={12}
          maxToRenderPerBatch={10}
        />
      )}
    </View></TourTarget>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const getStyles = (theme: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDark ? FEE_UX.pageBgDark : FEE_UX.pageBgLight,
  },

  searchWrapFrame: {
    backgroundColor: isDark ? FEE_UX.clayDark : '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(76,90,120,0.10)',
    padding: 5,
    ...Platform.select({
      web: { boxShadow: '0 10px 24px -14px rgba(76,90,120,0.35)' } as any,
      default: {
        shadowColor: '#6B7A99',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 2,
      },
    }),
  },
  searchWrapFrameFocused: {
    borderColor: isDark ? 'rgba(107,47,160,0.55)' : 'rgba(107,47,160,0.35)',
    ...Platform.select({
      web: { boxShadow: '0 10px 28px -12px rgba(107,47,160,0.35)' } as any,
      default: {},
    }),
  },
  searchRecessedWell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: isDark ? 'rgba(0,0,0,0.28)' : '#F4F6FB',
    paddingHorizontal: 12,
    height: 48,
    borderRadius: 14,
  },
  searchRecessedWellFocused: {
    backgroundColor: isDark ? 'rgba(0,0,0,0.4)' : '#FFFFFF',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: isDark ? '#F9FAFB' : '#111827',
  },
  searchAction: {
    backgroundColor: BRAND,
    paddingHorizontal: 16,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchActionText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  kbdHint: {
    paddingHorizontal: 8,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(76,90,120,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kbdHintText: {
    fontSize: 11,
    fontWeight: '700',
    color: isDark ? 'rgba(255,255,255,0.4)' : '#94A3B8',
  },

  deskChrome: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 20,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },

  viewModeRow: {
    flexDirection: 'row',
    padding: 4,
    backgroundColor: isDark ? 'rgba(0,0,0,0.28)' : '#EEF0F6',
    borderRadius: 14,
  },

  statusTrack: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 4,
    backgroundColor: isDark ? 'rgba(0,0,0,0.22)' : '#F1F3F8',
    borderRadius: 14,
    gap: 4,
    alignSelf: 'flex-start',
  },

  resultsBar: {
    paddingHorizontal: 4,
    paddingTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  resultsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  resultsIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultsCount: {
    fontSize: 13,
    fontWeight: '800',
    color: isDark ? 'rgba(255,255,255,0.72)' : '#334155',
    letterSpacing: -0.1,
  },
  resultsHint: {
    flex: 1,
    textAlign: 'right',
    fontSize: 11,
    fontWeight: '600',
    color: isDark ? 'rgba(255,255,255,0.35)' : '#94A3B8',
  },

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 36,
    flexGrow: 1,
  },
  footerLoader: {
    paddingVertical: 18,
    alignItems: 'center',
  },

  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '600',
    color: isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF',
  },

  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    borderRadius: 22,
    marginTop: 4,
    backgroundColor: isDark ? FEE_UX.clayDark : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(76,90,120,0.08)',
    gap: 10,
  },
  emptyIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: isDark ? 'rgba(255,255,255,0.86)' : '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 13,
    color: isDark ? 'rgba(255,255,255,0.42)' : '#64748B',
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 380,
  },
  emptyTips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  emptyTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(76,90,120,0.10)',
  },
  emptyTipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyReset: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: isDark ? 'rgba(107,47,160,0.2)' : BRAND_SOFT,
  },
  emptyResetText: {
    color: BRAND,
    fontSize: 13,
    fontWeight: '800',
  },
});
