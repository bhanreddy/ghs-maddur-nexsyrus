import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import AppTextInput from '@/src/components/AppTextInput';
import { styles as ds } from '@/src/theme/styles';

import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, Pressable, Platform, ActivityIndicator, RefreshControl, ScrollView, Image
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

// ─── Constants ────────────────────────────────────────────────────────────────
const FILTERS = ['All', 'Paid', 'Partial', 'Pending'] as const;
type FilterType = typeof FILTERS[number];
const VIEW_MODES = ['Students', 'Class Structures'] as const;
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

// ─── Mini Progress Bar ────────────────────────────────────────────────────────
function MiniProgress({ paid, total, isDark }: { paid: number; total: number; isDark: boolean }) {
  const ratio = total > 0 ? Math.min(paid / total, 1) : 0;
  const color = ratio >= 1 ? '#10B981' : ratio >= 0.5 ? '#F59E0B' : '#EF4444';
  return (
    <View style={{
      height: 3, borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : '#F3F4F6',
      overflow: 'hidden', marginTop: 10,
    }}>
      <View style={{ height: '100%', width: `${ratio * 100}%`, backgroundColor: color, borderRadius: 2 }} />
    </View>
  );
}

// ─── Student Card ─────────────────────────────────────────────────────────────
const StudentCard = React.memo(function StudentCard({
  item, index, isDark, onPress,
}: {
  item: any; index: number; isDark: boolean; onPress: () => void;
}) {
  const pressed = useSharedValue(0);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pressed.value, [0, 1], [1, 0.97]) }],
  }));

  const s = (STATUS_CONFIG[item.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.Pending)[isDark ? 'dark' : 'light'];
  const textPri = isDark ? '#F9FAFB' : '#111827';
  const textSec = isDark ? 'rgba(255,255,255,0.45)' : '#64748B';

  const due = parseFloat(item.due) || 0;
  const paid = parseFloat(item.paid) || 0;
  const total = parseFloat(item.total) || 0;

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(400).springify()} style={animStyle}>
      <Pressable
        style={[
          cardStyles.card,
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
        onPress={onPress}
        onPressIn={() => { pressed.value = withSpring(1, { damping: 20 }); }}
        onPressOut={() => { pressed.value = withSpring(0, { damping: 20 }); }}
      >
        <View style={[StyleSheet.absoluteFill, { borderRadius: 24, overflow: 'hidden' }]}>
          <LinearGradient
            colors={isDark ? ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.5)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </View>

        {/* Left accent line by status */}
        <View style={[cardStyles.accent, { backgroundColor: s.dot }]} />

        <View style={cardStyles.inner}>
          {/* Header row */}
          <View style={cardStyles.headerRow}>
            <View style={[cardStyles.avatarWrap, { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.7)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, overflow: 'hidden' }]}>
              {item.photoUrl || item.photo_url || item.profile_pic ? (
                <Image
                  source={{ uri: item.photoUrl || item.photo_url || item.profile_pic }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                />
              ) : (
                <Text style={[cardStyles.avatarText, { color: s.dot }]}>
                  {(item.name || 'S').charAt(0).toUpperCase()}
                </Text>
              )}
            </View>

            <View style={cardStyles.nameBlock}>
              <Text style={[cardStyles.name, { color: textPri }]} numberOfLines={1}>
                {item.name}
              </Text>
              {item.parentLine ? (
                <Text style={[cardStyles.parentLine, { color: textSec }]} numberOfLines={1}>
                  {item.parentLine}
                </Text>
              ) : null}
              <View style={cardStyles.metaRow}>
                {item.admissionNo ? (
                  <View style={[cardStyles.metaTag, { backgroundColor: isDark ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.6)' }]}>
                    <Text style={[cardStyles.metaTagText, { color: textSec }]}>#{item.admissionNo}</Text>
                  </View>
                ) : null}
                <View style={[cardStyles.metaTag, { backgroundColor: isDark ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.6)' }]}>
                  <Text style={[cardStyles.metaTagText, { color: textSec }]}>Class: {item.class}</Text>
                </View>
              </View>
            </View>

            <View style={[cardStyles.statusBadge, { backgroundColor: s.bg, borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)', borderTopWidth: 1 }]}>
              <View style={[cardStyles.statusDot, { backgroundColor: s.dot }]} />
              <Text style={[cardStyles.statusText, { color: s.text }]}>{item.status}</Text>
            </View>
          </View>

          {/* Figures row */}
          <View style={cardStyles.figRow}>
            <FigCell label="Total" value={`₹${total.toLocaleString('en-IN')}`} color={textPri} sec={textSec} />
            <View style={[cardStyles.figSep, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]} />
            <FigCell label="Collected" value={`₹${paid.toLocaleString('en-IN')}`} color="#10B981" sec={textSec} />
            <View style={[cardStyles.figSep, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]} />
            <FigCell label="Due" value={`₹${due.toLocaleString('en-IN')}`} color={due > 0 ? '#EF4444' : '#10B981'} sec={textSec} />
          </View>

          {/* Progress */}
          <MiniProgress paid={paid} total={total} isDark={isDark} />
        </View>

        {/* Chevron */}
        <View style={cardStyles.chevronWrap}>
          <Ionicons name="chevron-forward" size={16} color={isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF'} />
        </View>
      </Pressable>
    </Animated.View>
  );
});

function FigCell({ label, value, color, sec }: { label: string; value: string; color: string; sec: string }) {
  return (
    <View style={cardStyles.figCell}>
      <Text style={[cardStyles.figLabel, { color: sec }]}>{label}</Text>
      <Text style={[cardStyles.figValue, { color }]}>{value}</Text>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    marginBottom: 12,
    position: 'relative',
  },
  accent: { width: 4, alignSelf: 'stretch', zIndex: 2 },
  inner: { flex: 1, padding: 14, paddingLeft: 12, zIndex: 2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  avatarWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '800' },
  nameBlock: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  parentLine: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  metaRow: { flexDirection: 'row', gap: 5 },
  metaTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  metaTagText: { fontSize: 10, fontWeight: '700' },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '800' },
  figRow: { flexDirection: 'row', alignItems: 'center' },
  figCell: { flex: 1, alignItems: 'center' },
  figLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3, marginBottom: 2, textTransform: 'uppercase' },
  figValue: { fontSize: 14, fontWeight: '800' },
  figSep: { width: 1, height: 28, marginHorizontal: 4 },
  chevronWrap: { paddingRight: 12, zIndex: 2 },
});

// ─── Summary Header ───────────────────────────────────────────────────────────
function SummaryHeader({ stats, isDark }: { stats: SummaryStats; isDark: boolean }) {
  const bg = isDark ? '#2A3142' : '#EEF1F8';
  const textSec = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(15,23,42,0.45)';

  return (
    <Animated.View
      entering={FadeIn.duration(500)}
      style={[
        sumStyles.card,
        {
          backgroundColor: bg,
          borderTopWidth: 1.5,
          borderTopColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.9)',
          borderBottomWidth: 3.5,
          borderBottomColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(76,90,120,0.18)',
          shadowColor: isDark ? '#000' : '#6B7A99',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: isDark ? 0.35 : 0.22,
          shadowRadius: 18,
          elevation: 6,
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
      <View style={sumStyles.row}>
        <SumCell label="Total Collected" value={`₹${stats.collectedTotal.toLocaleString('en-IN')}`} color="#10B981" sec={textSec} />
        <View style={[sumStyles.sep, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)' }]} />
        <SumCell label="Total Outstanding" value={`₹${stats.pendingDues.toLocaleString('en-IN')}`} color="#EF4444" sec={textSec} />
        <View style={[sumStyles.sep, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)' }]} />
        <SumCell label="Pending Students" value={String(stats.pendingStudents)} color="#3B82F6" sec={textSec} />
      </View>
    </Animated.View>
  );
}

function SumCell({ label, value, color, sec }: { label: string; value: string; color: string; sec: string }) {
  return (
    <View style={sumStyles.cell}>
      <Text style={[sumStyles.label, { color: sec }]}>{label}</Text>
      <Text style={[sumStyles.value, { color }]}>{value}</Text>
    </View>
  );
}

const sumStyles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 24,
    padding: 16,
    position: 'relative',
  },
  row: { flexDirection: 'row', zIndex: 2 },
  sep: { width: 1, marginVertical: 2, zIndex: 2 },
  cell: { flex: 1, alignItems: 'center', zIndex: 2 },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase', textAlign: 'center' },
  value: { fontSize: 18, fontWeight: '900' },
});

// ─── Filter Pill ──────────────────────────────────────────────────────────────
function FilterPill({
  label, active, count, isDark, onPress,
}: {
  label: string; active: boolean; count: number; isDark: boolean; onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={aStyle}>
      <Pressable
        style={[
          pillStyles.pill,
          active
            ? {
                backgroundColor: '#3B82F6',
                borderTopWidth: 1.5,
                borderTopColor: 'rgba(255,255,255,0.45)',
                borderBottomWidth: 3,
                borderBottomColor: 'rgba(29,78,216,0.25)',
                shadowColor: '#3B82F6',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.22,
                shadowRadius: 8,
                elevation: 4,
              }
            : {
                backgroundColor: isDark ? '#1C1F2A' : '#EEF1F8',
                borderTopWidth: 1.5,
                borderTopColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.7)',
                borderBottomWidth: 3,
                borderBottomColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(76,90,120,0.1)',
                shadowColor: isDark ? '#000' : '#6B7A99',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: isDark ? 0.15 : 0.08,
                shadowRadius: 4,
                elevation: 1,
              }
        ]}
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.92); }}
        onPressOut={() => { scale.value = withSpring(1); }}
      >
        <View style={[StyleSheet.absoluteFill, { borderRadius: 20, overflow: 'hidden' }]}>
          <LinearGradient
            colors={active
              ? ['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']
              : (isDark ? ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.3)', 'rgba(255,255,255,0)'])}
            start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </View>
        <Text style={[pillStyles.label, { color: active ? '#fff' : (isDark ? 'rgba(255,255,255,0.55)' : '#475569'), zIndex: 2 }]}>
          {label}
        </Text>
        {count > 0 && label !== 'All' && (
          <View style={[pillStyles.badge, { backgroundColor: active ? 'rgba(255,255,255,0.25)' : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)'), zIndex: 2 }]}>
            <Text style={[pillStyles.badgeText, { color: active ? '#fff' : (isDark ? 'rgba(255,255,255,0.5)' : '#475569') }]}>
              {count}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}
const pillStyles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20, position: 'relative' },
  label: { fontSize: 13, fontWeight: '700' },
  badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: '800' },
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
  activeFilter: FilterType;
}) =>
  filters.activeFilter !== 'All'
  || filters.submittedSearch.length > 0
  || !!filters.selectedClassId
  || filters.submittedAdmissionNo.length > 0
  || filters.submittedFatherName.length > 0
  || filters.submittedMobile.length > 0;

/** Narrow enough to query the API — avoids loading the full student roster on open. */
const hasStudentQueryCriteria = (filters: {
  submittedSearch: string;
  selectedClassId: string | null;
  submittedAdmissionNo: string;
  submittedFatherName: string;
  submittedMobile: string;
}) =>
  filters.submittedSearch.length > 0
  || !!filters.selectedClassId
  || filters.submittedAdmissionNo.length > 0
  || filters.submittedFatherName.length > 0
  || filters.submittedMobile.length > 0;

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

        <View style={[structureStyles.classBadge, { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.7)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 }]}>
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
    color: '#3B82F6',
  },
  infoBlock: { flex: 1, zIndex: 2 },
  title: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 12, fontWeight: '600' },
  amountBlock: { alignItems: 'flex-end', zIndex: 2 },
  amount: { fontSize: 18, fontWeight: '800', color: '#2563EB' },
  frequency: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4, marginTop: 2 },
});

// ─── View Mode Pill ───────────────────────────────────────────────────────────
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

  return (
    <Animated.View style={aStyle}>
      <Pressable
        style={[
          viewModeStyles.pill,
          active && {
            backgroundColor: isDark ? '#2A3142' : '#FFFFFF',
            borderTopWidth: 1.5,
            borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.9)',
            borderBottomWidth: 3,
            borderBottomColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(76,90,120,0.15)',
            shadowColor: isDark ? '#000' : '#6B7A99',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: isDark ? 0.25 : 0.12,
            shadowRadius: 8,
            elevation: 3,
          }
        ]}
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.96); }}
        onPressOut={() => { scale.value = withSpring(1); }}
      >
        {active && (
          <View style={[StyleSheet.absoluteFill, { borderRadius: 16, overflow: 'hidden' }]}>
            <LinearGradient
              colors={isDark ? ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          </View>
        )}
        <Text style={[viewModeStyles.label, { color: active ? (isDark ? '#FFF' : '#1E293B') : (isDark ? 'rgba(255,255,255,0.4)' : '#64748B'), zIndex: 2 }]}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const viewModeStyles = StyleSheet.create({
  pill: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 16,
    height: 40,
    position: 'relative',
  },
  label: { fontSize: 13, fontWeight: '800' },
});

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
  onClear,
  onSubmit,
  hasActiveFilters,
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
  onClear: () => void;
  onSubmit: () => void;
  hasActiveFilters: boolean;
}) {
  const chipText = isDark ? 'rgba(255,255,255,0.55)' : '#6B7280';

  return (
    <View style={filterPanelStyles.wrap}>
      <Pressable 
        style={[
          filterPanelStyles.toggleRow, 
          { 
            backgroundColor: isDark ? '#1C1F2A' : '#EEF1F8',
            borderTopWidth: 1.5,
            borderTopColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)',
            borderBottomWidth: 3,
            borderBottomColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(76,90,120,0.15)',
            shadowColor: isDark ? '#000' : '#6B7A99',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: isDark ? 0.20 : 0.12,
            shadowRadius: 8,
            elevation: 3,
          }
        ]} 
        onPress={onToggle}
      >
        <View style={[StyleSheet.absoluteFill, { borderRadius: 16, overflow: 'hidden' }]}>
          <LinearGradient
            colors={isDark ? ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </View>

        <View style={[filterPanelStyles.toggleLeft, { zIndex: 2 }]}>
          <Ionicons name="options-outline" size={16} color={hasActiveFilters ? '#3B82F6' : (isDark ? 'rgba(255,255,255,0.4)' : '#64748B')} />
          <Text style={[filterPanelStyles.toggleText, { color: hasActiveFilters ? '#3B82F6' : (isDark ? 'rgba(255,255,255,0.7)' : '#334155') }]}>
            Filters{hasActiveFilters ? ' · active' : ''}
          </Text>
        </View>
        <View style={[filterPanelStyles.toggleRight, { zIndex: 2 }]}>
          {hasActiveFilters ? (
            <Pressable onPress={(e) => { e.stopPropagation?.(); onClear(); }} hitSlop={8}>
              <Text style={filterPanelStyles.clearText}>Clear</Text>
            </Pressable>
          ) : null}
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={isDark ? 'rgba(255,255,255,0.4)' : '#64748B'} />
        </View>
      </Pressable>

      {expanded ? (
        <Animated.View 
          entering={FadeIn.duration(250)} 
          style={[
            filterPanelStyles.panel, 
            { 
              backgroundColor: isDark ? '#141824' : '#E2E8F0',
              borderRadius: 16,
              marginTop: 10,
              padding: 16,
              borderTopWidth: 1.5,
              borderTopColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.12)',
            }
          ]}
        >
          <Text style={[filterPanelStyles.label, { color: chipText }]}>CLASS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={filterPanelStyles.chipRow}>
            <Pressable
              style={[
                filterPanelStyles.chip,
                {
                  borderRadius: 18,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  backgroundColor: !selectedClassId ? '#3B82F6' : (isDark ? '#1C1F2A' : '#EEF1F8'),
                  borderTopWidth: 1.5,
                  borderTopColor: !selectedClassId ? 'rgba(255,255,255,0.45)' : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.7)'),
                  borderBottomWidth: 3,
                  borderBottomColor: !selectedClassId ? 'rgba(29,78,216,0.25)' : (isDark ? 'rgba(0,0,0,0.5)' : 'rgba(76,90,120,0.1)'),
                }
              ]}
              onPress={() => onSelectClass(null)}
            >
              <View style={[StyleSheet.absoluteFill, { borderRadius: 18, overflow: 'hidden' }]}>
                <LinearGradient
                  colors={!selectedClassId 
                    ? ['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)'] 
                    : (isDark ? ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.3)', 'rgba(255,255,255,0)'])}
                  start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
              </View>
              <Text style={[filterPanelStyles.chipText, { color: !selectedClassId ? '#fff' : (isDark ? 'rgba(255,255,255,0.6)' : '#475569'), zIndex: 2 }]}>All</Text>
            </Pressable>
            {classes.map((cls) => {
              const active = selectedClassId === cls.id;
              return (
                <Pressable
                  key={cls.id}
                  style={[
                    filterPanelStyles.chip,
                    {
                      borderRadius: 18,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      backgroundColor: active ? '#3B82F6' : (isDark ? '#1C1F2A' : '#EEF1F8'),
                      borderTopWidth: 1.5,
                      borderTopColor: active ? 'rgba(255,255,255,0.45)' : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.7)'),
                      borderBottomWidth: 3,
                      borderBottomColor: active ? 'rgba(29,78,216,0.25)' : (isDark ? 'rgba(0,0,0,0.5)' : 'rgba(76,90,120,0.1)'),
                    }
                  ]}
                  onPress={() => onSelectClass(active ? null : cls.id)}
                >
                  <View style={[StyleSheet.absoluteFill, { borderRadius: 18, overflow: 'hidden' }]}>
                    <LinearGradient
                      colors={active 
                        ? ['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)'] 
                        : (isDark ? ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.3)', 'rgba(255,255,255,0)'])}
                      start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
                      style={StyleSheet.absoluteFill}
                      pointerEvents="none"
                    />
                  </View>
                  <Text style={[filterPanelStyles.chipText, { color: active ? '#fff' : (isDark ? 'rgba(255,255,255,0.6)' : '#475569'), zIndex: 2 }]}>{cls.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={filterPanelStyles.inputRow}>
            <View style={filterPanelStyles.inputCell}>
              <Text style={[filterPanelStyles.label, { color: chipText }]}>ADMISSION NO</Text>
              <View style={[
                filterPanelStyles.inputFrame,
                {
                  backgroundColor: isDark ? '#2A3142' : '#EEF1F8',
                  borderTopWidth: 1.5,
                  borderTopColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.85)',
                  borderBottomWidth: 2.5,
                  borderBottomColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(76,90,120,0.15)',
                  shadowColor: isDark ? '#000' : '#6B7A99',
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: isDark ? 0.22 : 0.08,
                  shadowRadius: 5,
                  elevation: 1,
                }
              ]}>
                <View style={[StyleSheet.absoluteFill, { borderRadius: 14, overflow: 'hidden' }]}>
                  <LinearGradient
                    colors={isDark ? ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
                    start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                </View>
                <AppTextInput
                  style={[
                    filterPanelStyles.input, 
                    { 
                      backgroundColor: isDark ? '#0A0B12' : '#D5E0ED', 
                      color: isDark ? '#F9FAFB' : '#111827', 
                      borderWidth: 0,
                      borderTopWidth: 1.5,
                      borderTopColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.08)',
                      borderBottomWidth: 1,
                      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
                      borderRadius: 10,
                      height: 38,
                      zIndex: 2,
                    }
                  ]}
                  placeholder="Exact or prefix"
                  placeholderTextColor={isDark ? 'rgba(255,255,255,0.25)' : '#9CA3AF'}
                  value={admissionNo}
                  onChangeText={onAdmissionNoChange}
                  returnKeyType="search"
                  onSubmitEditing={onSubmit}
                />
              </View>
            </View>
            <View style={filterPanelStyles.inputCell}>
              <Text style={[filterPanelStyles.label, { color: chipText }]}>FATHER / GUARDIAN</Text>
              <View style={[
                filterPanelStyles.inputFrame,
                {
                  backgroundColor: isDark ? '#2A3142' : '#EEF1F8',
                  borderTopWidth: 1.5,
                  borderTopColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.85)',
                  borderBottomWidth: 2.5,
                  borderBottomColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(76,90,120,0.15)',
                  shadowColor: isDark ? '#000' : '#6B7A99',
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: isDark ? 0.22 : 0.08,
                  shadowRadius: 5,
                  elevation: 1,
                }
              ]}>
                <View style={[StyleSheet.absoluteFill, { borderRadius: 14, overflow: 'hidden' }]}>
                  <LinearGradient
                    colors={isDark ? ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
                    start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                </View>
                <AppTextInput
                  style={[
                    filterPanelStyles.input, 
                    { 
                      backgroundColor: isDark ? '#0A0B12' : '#D5E0ED', 
                      color: isDark ? '#F9FAFB' : '#111827', 
                      borderWidth: 0,
                      borderTopWidth: 1.5,
                      borderTopColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.08)',
                      borderBottomWidth: 1,
                      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
                      borderRadius: 10,
                      height: 38,
                      zIndex: 2,
                    }
                  ]}
                  placeholder="Parent name"
                  placeholderTextColor={isDark ? 'rgba(255,255,255,0.25)' : '#9CA3AF'}
                  value={fatherName}
                  onChangeText={onFatherNameChange}
                  returnKeyType="search"
                  onSubmitEditing={onSubmit}
                />
              </View>
            </View>
          </View>

          <Text style={[filterPanelStyles.label, { color: chipText }]}>MOBILE</Text>
          <View style={[
            filterPanelStyles.inputFrame,
            {
              backgroundColor: isDark ? '#2A3142' : '#EEF1F8',
              borderTopWidth: 1.5,
              borderTopColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.85)',
              borderBottomWidth: 2.5,
              borderBottomColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(76,90,120,0.15)',
              shadowColor: isDark ? '#000' : '#6B7A99',
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: isDark ? 0.22 : 0.08,
              shadowRadius: 5,
              elevation: 1,
            }
          ]}>
            <View style={[StyleSheet.absoluteFill, { borderRadius: 14, overflow: 'hidden' }]}>
              <LinearGradient
                colors={isDark ? ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
            </View>
            <AppTextInput
              style={[
                filterPanelStyles.input, 
                filterPanelStyles.mobileInput, 
                { 
                  backgroundColor: isDark ? '#0A0B12' : '#D5E0ED', 
                  color: isDark ? '#F9FAFB' : '#111827', 
                  borderWidth: 0,
                  borderTopWidth: 1.5,
                  borderTopColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.08)',
                  borderBottomWidth: 1,
                  borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
                  borderRadius: 10,
                  height: 38,
                  zIndex: 2,
                }
              ]}
              placeholder="Parent phone number"
              placeholderTextColor={isDark ? 'rgba(255,255,255,0.25)' : '#9CA3AF'}
              value={mobile}
              onChangeText={onMobileChange}
              keyboardType="phone-pad"
              returnKeyType="search"
              onSubmitEditing={onSubmit}
            />
          </View>

          <Pressable 
            style={[
              filterPanelStyles.searchButton,
              {
                backgroundColor: '#3B82F6',
                borderTopWidth: 1.5,
                borderTopColor: 'rgba(255,255,255,0.45)',
                borderBottomWidth: 3.5,
                borderBottomColor: 'rgba(29,78,216,0.25)',
                shadowColor: '#3B82F6',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.25,
                shadowRadius: 10,
                elevation: 4,
                borderRadius: 12,
                height: 44,
                marginTop: 6,
              }
            ]} 
            onPress={onSubmit}
          >
            <View style={[StyleSheet.absoluteFill, { borderRadius: 12, overflow: 'hidden' }]}>
              <LinearGradient
                colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
            </View>
            <Ionicons name="search" size={15} color="#fff" style={{ zIndex: 2 }} />
            <Text style={[filterPanelStyles.searchButtonText, { zIndex: 2 }]}>Search students</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

const filterPanelStyles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, marginBottom: 12 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    position: 'relative',
  },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleText: { fontSize: 13, fontWeight: '800' },
  clearText: { fontSize: 12, fontWeight: '800', color: '#3B82F6' },
  panel: {
    marginTop: 8,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  chipRow: { gap: 8, paddingVertical: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 0,
    position: 'relative',
  },
  chipText: { fontSize: 12, fontWeight: '700' },
  inputRow: { flexDirection: 'row', gap: 10 },
  inputCell: { flex: 1, gap: 6 },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    position: 'relative',
  },
  searchButtonText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  inputFrame: {
    borderRadius: 14,
    padding: 4,
    position: 'relative',
  },
  input: {
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 38,
    fontSize: 14,
    fontWeight: '500',
  },
  mobileInput: { marginTop: 0 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AccountsFees() {
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  const { shellActive } = useAccountsWebChrome();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [admissionNoInput, setAdmissionNoInput] = useState('');
  const [submittedAdmissionNo, setSubmittedAdmissionNo] = useState('');
  const [fatherNameInput, setFatherNameInput] = useState('');
  const [submittedFatherName, setSubmittedFatherName] = useState('');
  const [mobileInput, setMobileInput] = useState('');
  const [submittedMobile, setSubmittedMobile] = useState('');
  const [activeView, setActiveView] = useState<ViewMode>('Students');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [structuresLoading, setStructuresLoading] = useState(true);
  const [students, setStudents] = useState<FeeListStudent[]>([]);
  const [structures, setStructures] = useState<ClassFeeStructure[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterType>('All');
  const [searchFocused, setSearchFocused] = useState(false);
  const [summaryStats, setSummaryStats] = useState<SummaryStats | null>(null);
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
  }, [admissionNoInput, fatherNameInput, mobileInput, searchQuery]);

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
    activeFilter,
  });

  const studentQueryReady = hasStudentQueryCriteria({
    submittedSearch,
    selectedClassId,
    submittedAdmissionNo,
    submittedFatherName,
    submittedMobile,
  });

  const clearStudentFilters = useCallback(() => {
    setSelectedClassId(null);
    setAdmissionNoInput('');
    setSubmittedAdmissionNo('');
    setFatherNameInput('');
    setSubmittedFatherName('');
    setMobileInput('');
    setSubmittedMobile('');
    setSearchQuery('');
    setSubmittedSearch('');
    setActiveFilter('All');
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

  const ListHeader = useMemo(() => (
    <>
      {!loading && summaryStats && (
        <SummaryHeader stats={summaryStats} isDark={isDark} />
      )}

      <View style={styles.viewModeRow}>
        {VIEW_MODES.map((mode) => (
          <ViewModePill
            key={mode}
            label={mode}
            active={activeView === mode}
            isDark={isDark}
            onPress={() => setActiveView(mode)}
          />
        ))}
      </View>

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
            onClear={clearStudentFilters}
            onSubmit={commitStudentSearch}
            hasActiveFilters={studentFiltersActive}
          />

          <View style={styles.filterRow}>
            {FILTERS.map(f => (
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

          {!loading && studentQueryReady && (
            <Animated.View entering={FadeIn.duration(300)}>
              <Text style={styles.resultsCount}>
                {meta.total} student{meta.total !== 1 ? 's' : ''}
                {activeFilter !== 'All' ? ` · ${activeFilter}` : ''}
                {submittedSearch ? ` · "${submittedSearch}"` : ''}
                {selectedClassId ? ` · ${classes.find((c) => c.id === selectedClassId)?.name || 'Class'}` : ''}
                {submittedAdmissionNo ? ` · Adm ${submittedAdmissionNo}` : ''}
                {submittedFatherName ? ` · ${submittedFatherName}` : ''}
                {submittedMobile ? ` · ${submittedMobile}` : ''}
              </Text>
            </Animated.View>
          )}
        </>
      ) : (
        !structuresLoading && (
          <Animated.View entering={FadeIn.duration(300)}>
            <Text style={styles.resultsCount}>
              {filteredStructures.length} class fee structure{filteredStructures.length !== 1 ? 's' : ''}
              {searchQuery.trim() ? ` · "${searchQuery.trim()}"` : ''}
            </Text>
          </Animated.View>
        )
      )}
    </>
  ), [
    activeFilter,
    activeView,
    admissionNoInput,
    classes,
    clearStudentFilters,
    commitStudentSearch,
    submittedAdmissionNo,
    submittedFatherName,
    submittedMobile,
    submittedSearch,
    filterCounts,
    filteredStructures.length,
    filtersExpanded,
    fatherNameInput,
    handleFilterChange,
    isDark,
    loading,
    meta.total,
    mobileInput,
    searchQuery,
    selectedClassId,
    studentFiltersActive,
    studentQueryReady,
    structuresLoading,
    styles.filterRow,
    styles.resultsCount,
    styles.viewModeRow,
    summaryStats,
  ]);

  const ListFooter = useMemo(() => (
    loadingMore ? (
      <View style={styles.footerLoader}>
        <ActivityIndicator color="#3B82F6" />
      </View>
    ) : null
  ), [loadingMore, styles.footerLoader]);

  const EmptyState = useMemo(() => {
    if (activeView === 'Class Structures') {
      const hasQuery = searchQuery.trim().length > 0;
      return (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>📋</Text>
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
        <Text style={styles.emptyIcon}>🔍</Text>
        <Text style={styles.emptyTitle}>
          {hasQuery ? 'No students found' : 'Search to find a student'}
        </Text>
        <Text style={styles.emptySubtitle}>
          {hasQuery
            ? 'Try different filters or clear them to see more students'
            : 'Type a name, admission number or mobile, then press Enter (or tap Search) to load students.'}
        </Text>
      </View>
    );
  }, [activeView, searchQuery, studentQueryReady, styles.emptyIcon, styles.emptySubtitle, styles.emptyTitle, styles.emptyWrap]);

  const isListLoading = activeView === 'Students'
    ? loading && studentQueryReady && students.length === 0
    : structuresLoading;

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={isDark ? '#0F1117' : '#1E293B'}
      />
      {!shellActive && <AdminHeader title="Fee Management" showBackButton />}

      {/* Search bar */}
      <Animated.View
        entering={FadeInDown.duration(400)}
        style={[styles.searchWrapFrame, searchFocused && styles.searchWrapFrameFocused]}
      >
        <View style={[StyleSheet.absoluteFill, { borderRadius: 24, overflow: 'hidden' }]}>
          <LinearGradient
            colors={isDark ? ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </View>

        <View style={[styles.searchRecessedWell, searchFocused && styles.searchRecessedWellFocused]}>
          <TouchableOpacity onPress={handleSearchSubmit} hitSlop={8} style={{ zIndex: 2 }}>
            <Ionicons
              name="search"
              size={18}
              color={searchFocused ? '#3B82F6' : (isDark ? 'rgba(255,255,255,0.45)' : '#64748B')}
            />
          </TouchableOpacity>
          <AppTextInput
            style={[ds.inputInChrome, styles.searchInput, { zIndex: 2 }]}
            placeholder={activeView === 'Students'
              ? 'Search name, ID or class — press Enter'
              : 'Search by class, fee type or year…'}
            placeholderTextColor={isDark ? 'rgba(255,255,255,0.25)' : '#94A3B8'}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            returnKeyType="search"
            onSubmitEditing={handleSearchSubmit}
            blurOnSubmit={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={handleClearSearch} style={{ zIndex: 2 }}>
              <Ionicons name="close-circle" size={18} color={isDark ? 'rgba(255,255,255,0.4)' : '#64748B'} />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {isListLoading ? (
        <View style={styles.loadingWrap}>
          <LogoLoader size={52} color="#3B82F6" />
          <Text style={styles.loadingText}>
            {activeView === 'Students' ? 'Loading fee data…' : 'Loading class fee structures…'}
          </Text>
        </View>
      ) : activeView === 'Students' ? (
        <FlatList
          data={students}
          keyExtractor={(item) => `${item.id}_${item.rawId}`}
          renderItem={renderStudentItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={ListHeader}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={EmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#3B82F6"
              colors={['#3B82F6']}
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
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={EmptyState}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#3B82F6"
              colors={['#3B82F6']}
            />
          }
          removeClippedSubviews
          initialNumToRender={12}
          maxToRenderPerBatch={10}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const getStyles = (theme: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  // Search
  searchWrapFrame: {
    backgroundColor: isDark ? '#2A3142' : '#EEF1F8',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    borderRadius: 24,
    borderTopWidth: 1.5,
    borderTopColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.9)',
    borderBottomWidth: 3,
    borderBottomColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(76,90,120,0.18)',
    shadowColor: isDark ? '#000' : '#6B7A99',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.25 : 0.15,
    shadowRadius: 12,
    elevation: 3,
    padding: 4,
    position: 'relative',
  },
  searchWrapFrameFocused: {
    backgroundColor: isDark ? '#2D3547' : '#EAF2FF',
  },
  searchRecessedWell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: isDark ? '#0A0B12' : '#D5E0ED',
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 20,
    borderWidth: 0,
    borderTopWidth: 1.5,
    borderTopColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.08)',
    borderBottomWidth: 1,
    borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
    zIndex: 2,
  },
  searchRecessedWellFocused: {
    backgroundColor: isDark ? '#08090E' : '#FFFFFF',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: isDark ? '#F9FAFB' : '#111827',
  },

  viewModeRow: {
    flexDirection: 'row',
    padding: 4,
    marginHorizontal: 16,
    backgroundColor: isDark ? '#141824' : '#E2E8F0',
    borderRadius: 20,
    marginTop: 4,
    marginBottom: 12,
  },

  // Filters
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },

  // Results count
  resultsCount: {
    fontSize: 12,
    fontWeight: '700',
    color: isDark ? 'rgba(255,255,255,0.25)' : '#9CA3AF',
    letterSpacing: 0.4,
    paddingHorizontal: 16,
    marginBottom: 10,
  },

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 30,
  },
  footerLoader: {
    paddingVertical: 18,
    alignItems: 'center',
  },

  // Loading
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

  // Empty
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    borderRadius: 24,
    marginTop: 24,
    backgroundColor: isDark ? '#1C1F2A' : '#EEF1F8',
    borderTopWidth: 1.5,
    borderTopColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)',
    borderBottomWidth: 3,
    borderBottomColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(76,90,120,0.15)',
    shadowColor: isDark ? '#000' : '#6B7A99',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.20 : 0.10,
    shadowRadius: 12,
    elevation: 2,
    gap: 10,
  },
  emptyIcon: { fontSize: 40 },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: isDark ? 'rgba(255,255,255,0.5)' : '#374151',
  },
  emptySubtitle: {
    fontSize: 13,
    color: isDark ? 'rgba(255,255,255,0.25)' : '#9CA3AF',
    fontWeight: '500',
    textAlign: 'center',
  },
});