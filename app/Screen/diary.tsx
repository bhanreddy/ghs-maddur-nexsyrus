import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Dimensions,
  StatusBar,
  Modal,
  RefreshControl,
  TouchableWithoutFeedback,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
  Layout,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import StudentHeader from '../../src/components/StudentHeader';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/hooks/useAuth';
import i18n from '@/src/i18n';

import { withObservables } from '@nozbe/watermelondb/react';
import { Q } from '@nozbe/watermelondb';
import database from '../../src/database';
import DiaryEntry from '../../src/database/models/DiaryEntry';
import { sync, hasRemoteDiaryChanges } from '../../src/database/sync';
import { useTheme, SchoolTheme } from '../../src/hooks/useTheme';
import { IconBadgeColors, IconBadgeColorsDark } from '../../src/theme/themes';
import { isTelugu, t_field } from '../../src/utils/lang';
import AppDatePicker from '@/src/components/AppDatePicker';
import LogoLoader from '../../src/components/LogoLoader';
import ReadAloudButton from '../../src/components/ReadAloudButton';
import { readAloudService } from '../../src/services/readAloudService';
import { isPhotoFallbackContent, normalizeDiaryAttachments } from '../../src/utils/smartDiary/attachments';

// ─── Constants ────────────────────────────────────────────────────────────────

const DIARY_HISTORY_PRIOR_DAYS = 14;
const CONTENT_MAX_WIDTH = 580;
type TabId = 'today' | 'history';
type HistoryCounts = Record<string, number>;

// ─── Subject Config ───────────────────────────────────────────────────────────

type SubjectConfig = {
  color: string;
  icon: string;
  gradient: readonly [string, string, string];
  darkGradient: readonly [string, string, string];
  label: string;
};

function getSubjectStyle(subject: string = ''): SubjectConfig {
  const s = subject.toLowerCase();
  if (s.includes('math'))
    return { color: '#2563EB', icon: 'calculate', gradient: ['#1D4ED8', '#3B82F6', '#60A5FA'] as const, darkGradient: ['#1E3A8A', '#2563EB', '#3B82F6'] as const, label: 'Mathematics' };
  if (s.includes('science') || s.includes('bio'))
    return { color: '#7C3AED', icon: 'biotech', gradient: ['#6D28D9', '#8B5CF6', '#A78BFA'] as const, darkGradient: ['#4C1D95', '#6D28D9', '#7C3AED'] as const, label: 'Science' };
  if (s.includes('english'))
    return { color: '#D97706', icon: 'menu-book', gradient: ['#B45309', '#D97706', '#FBBF24'] as const, darkGradient: ['#78350F', '#B45309', '#D97706'] as const, label: 'English' };
  if (s.includes('telugu') || s.includes('hindi'))
    return { color: '#DC2626', icon: 'translate', gradient: ['#B91C1C', '#DC2626', '#F87171'] as const, darkGradient: ['#7F1D1D', '#B91C1C', '#DC2626'] as const, label: 'Language' };
  if (s.includes('social'))
    return { color: '#DB2777', icon: 'public', gradient: ['#BE185D', '#DB2777', '#F472B6'] as const, darkGradient: ['#831843', '#BE185D', '#DB2777'] as const, label: 'Social Studies' };
  if (s.includes('art') || s.includes('draw'))
    return { color: '#059669', icon: 'palette', gradient: ['#047857', '#059669', '#34D399'] as const, darkGradient: ['#064E3B', '#047857', '#059669'] as const, label: 'Arts' };
  return { color: '#4F46E5', icon: 'description', gradient: ['#4338CA', '#4F46E5', '#818CF8'] as const, darkGradient: ['#312E81', '#4338CA', '#4F46E5'] as const, label: 'General' };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toYmd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromYmd(ymd: string) {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function priorHistoryYmds(anchor: Date): string[] {
  return Array.from({ length: DIARY_HISTORY_PRIOR_DAYS }, (_, i) => {
    const d = new Date(anchor);
    d.setDate(d.getDate() - (i + 1));
    return toYmd(d);
  });
}

function buildCalendarMonth(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// ─── Mini Calendar ────────────────────────────────────────────────────────────
// Fixed pixel sizes so the grid renders correctly on both native and web.
// On web, percentage widths inside a full-screen Modal grow to enormous sizes;
// hard-coding the cell dimensions avoids that entirely.

const CAL_CELL = 44;   // outer tap target (px)
const CAL_INNER = 38;  // visible day circle (px)
const CAL_TOTAL_W = CAL_CELL * 7; // 308 px — fits any phone; centered on web

function MiniCalendar({
  selectedYmd,
  onSelect,
  availableYmds,
  minimumYmd,
  maximumYmd,
}: {
  selectedYmd: string;
  onSelect: (ymd: string) => void;
  availableYmds: string[];
  minimumYmd: string;
  maximumYmd: string;
}) {
  const { theme, isDark } = useTheme();
  const { i18n: translationI18n } = useTranslation();
  const dateLocale = isTelugu(translationI18n.language) ? 'te-IN' : 'en-IN';
  const todayYmd = toYmd(new Date());

  const [viewYear, setViewYear] = useState(() => parseInt(selectedYmd.split('-')[0]));
  const [viewMonth, setViewMonth] = useState(() => parseInt(selectedYmd.split('-')[1]) - 1);

  const cells = buildCalendarMonth(viewYear, viewMonth);
  const availableSet = new Set(availableYmds);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(dateLocale, {
    month: 'long', year: 'numeric',
  });
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) =>
      new Date(2024, 0, 7 + index).toLocaleDateString(dateLocale, { weekday: 'narrow' }).toUpperCase()
    ),
    [dateLocale]
  );

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  return (
    // Centre the fixed-width calendar inside whatever container it's in
    <View style={{ paddingBottom: 8, alignItems: 'center' }}>

      {/* Month navigation */}
      <View style={{
        width: CAL_TOTAL_W,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        paddingHorizontal: 2,
      }}>
        <Pressable
          onPress={prevMonth}
          hitSlop={10}
          style={{
            width: 36, height: 36, borderRadius: 10,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)',
          }}
        >
          <Ionicons name="chevron-back" size={18} color={theme.colors.textSecondary} />
        </Pressable>

        <Text style={{
          fontSize: 16, fontWeight: '800', color: theme.colors.textStrong, letterSpacing: -0.4,
        }}>
          {monthLabel}
        </Text>

        <Pressable
          onPress={nextMonth}
          hitSlop={10}
          style={{
            width: 36, height: 36, borderRadius: 10,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)',
          }}
        >
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
        </Pressable>
      </View>

      {/* Weekday headers */}
      <View style={{ width: CAL_TOTAL_W, flexDirection: 'row', marginBottom: 4 }}>
        {weekDays.map((d, index) => (
          <View key={`${d}-${index}`} style={{ width: CAL_CELL, alignItems: 'center', paddingVertical: 4 }}>
            <Text style={{
              fontSize: 10, fontWeight: '800',
              color: theme.colors.textMuted, letterSpacing: 0.8,
            }}>
              {d}
            </Text>
          </View>
        ))}
      </View>

      {/* Day grid — fixed width, wrapping rows of 7 */}
      <View style={{ width: CAL_TOTAL_W, flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((day, idx) => {
          // Empty spacer
          if (!day) {
            return <View key={`e${idx}`} style={{ width: CAL_CELL, height: CAL_CELL }} />;
          }

          const ymd = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isSelected = ymd === selectedYmd;
          const isToday = ymd === todayYmd;
          const hasData = availableSet.has(ymd);
          const isOutsideHistory = ymd < minimumYmd || ymd > maximumYmd;

          return (
            <Pressable
              key={ymd}
              onPress={() => !isOutsideHistory && onSelect(ymd)}
              disabled={isOutsideHistory}
              style={{
                width: CAL_CELL,
                height: CAL_CELL,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: isOutsideHistory ? 0.28 : 1,
              }}
            >
              {/* Day circle */}
              <View style={{
                width: CAL_INNER,
                height: CAL_INNER,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                borderWidth: isToday && !isSelected ? 2 : 0,
                borderColor: theme.colors.primary,
              }}>
                {isSelected && (
                  <LinearGradient
                    colors={['#4338CA', '#6366F1']}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  />
                )}
                <Text style={{
                  fontSize: 14,
                  fontWeight: '700',
                  zIndex: 1,
                  color: isSelected
                    ? '#FFFFFF'
                    : isToday
                      ? theme.colors.primary
                      : theme.colors.textStrong,
                }}>
                  {day}
                </Text>
                {/* Homework dot */}
                {hasData && !isSelected ? (
                  <View style={{
                    position: 'absolute',
                    bottom: 4,
                    width: 4, height: 4, borderRadius: 2,
                    backgroundColor: theme.colors.primary,
                  }} />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Date Picker Bottom Sheet ─────────────────────────────────────────────────

function DatePickerSheet({
  visible,
  selectedYmd,
  availableYmds,
  minimumYmd,
  maximumYmd,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selectedYmd: string;
  availableYmds: string[];
  minimumYmd: string;
  maximumYmd: string;
  onSelect: (ymd: string) => void;
  onClose: () => void;
}) {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const { t } = useTranslation();

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(150)}
          style={styles.sheetOverlay}
        />
      </TouchableWithoutFeedback>

      <Animated.View
        entering={SlideInDown.springify().damping(22).stiffness(260)}
        exiting={SlideOutDown.duration(220)}
        style={styles.sheetContainer}
      >
        <LinearGradient
          colors={isDark ? ['#161B2E', '#0F172A'] : ['#FFFFFF', '#F5F7FF']}
          style={[styles.sheetCard, {
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)',
          }]}
        >
          {/* Drag handle */}
          <View style={[styles.sheetHandle, {
            backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.15)',
          }]} />

          {/* Header */}
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>{t('studentDiary.pickDate')}</Text>
              <Text style={styles.sheetSubtitle}>
                {t('studentDiary.calendarHint')}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              style={[styles.sheetCloseBtn, {
                backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.05)',
              }]}
            >
              <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          <MiniCalendar
            selectedYmd={selectedYmd}
            onSelect={(ymd) => { onSelect(ymd); onClose(); }}
            availableYmds={availableYmds}
            minimumYmd={minimumYmd}
            maximumYmd={maximumYmd}
          />
        </LinearGradient>
      </Animated.View>
    </Modal>
  );
}

// ─── Tab Switcher ─────────────────────────────────────────────────────────────

function TabSwitcher({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const { t } = useTranslation();

  const tabs: { id: TabId; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
    { id: 'today', icon: 'today-outline', label: t('studentDiary.todayTab') },
    { id: 'history', icon: 'time-outline', label: t('studentDiary.historyTab') },
  ];

  return (
    <View style={[styles.tabBar, {
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.05)',
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
    }]}>
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <Pressable
            key={tab.id}
            style={styles.tabItem}
            onPress={() => onChange(tab.id)}
            android_ripple={{ color: '#6366F1' + '18', borderless: true }}
          >
            {isActive && (
              <Animated.View entering={FadeIn.duration(180)} style={[StyleSheet.absoluteFill, { borderRadius: 12, overflow: 'hidden' }]}>
                <LinearGradient
                  colors={['#4338CA', '#6366F1']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            )}
            <Ionicons name={tab.icon} size={16} color={isActive ? '#FFFFFF' : theme.colors.textMuted} />
            <Text style={[styles.tabLabel, { color: isActive ? '#FFFFFF' : theme.colors.textMuted }]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Date Selector Button ─────────────────────────────────────────────────────

function DateSelectorButton({
  selectedYmd,
  onPress,
  onSelect,
  minimumYmd,
  maximumYmd,
}: {
  selectedYmd: string;
  onPress: () => void;
  onSelect?: (ymd: string) => void;
  minimumYmd: string;
  maximumYmd: string;
}) {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const { t, i18n: translationI18n } = useTranslation();
  const dateLocale = isTelugu(translationI18n.language) ? 'te-IN' : 'en-IN';

  if (Platform.OS === 'web' && onSelect) {
    return (
      <Animated.View
        entering={FadeInDown.duration(300).springify()}
        layout={Layout.springify()}
        style={styles.dateSelectorWrap}
      >
        <AppDatePicker
          label={t('studentDiary.pickDate')}
          value={selectedYmd}
          onChange={onSelect}
          minimumDate={minimumYmd}
          maximumDate={maximumYmd}
          isDark={isDark}
          containerStyle={{ marginBottom: 0 }}
        />
      </Animated.View>
    );
  }

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const date = fromYmd(selectedYmd);

  let relLabel = '';
  const diff = Math.round((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (date.toDateString() === yesterday.toDateString()) relLabel = t('studentDiary.yesterday');
  else if (diff <= 7) relLabel = t('studentDiary.daysAgo', { count: diff });
  else relLabel = t('studentDiary.weeksAgo', { count: Math.round(diff / 7) });

  const fullLabel = date.toLocaleDateString(dateLocale, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <Animated.View
      entering={FadeInDown.duration(300).springify()}
      layout={Layout.springify()}
      style={styles.dateSelectorWrap}
    >
      <Pressable onPress={onPress} android_ripple={{ color: '#6366F1' + '18' }}>
        <LinearGradient
          colors={isDark
            ? ['rgba(99,102,241,0.2)', 'rgba(15,23,42,0.85)']
            : ['rgba(99,102,241,0.08)', 'rgba(255,255,255,0.96)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.dateSelector, {
            borderColor: isDark ? 'rgba(99,102,241,0.32)' : 'rgba(99,102,241,0.2)',
          }]}
        >
          <LinearGradient colors={['#4338CA', '#6366F1']} style={styles.dsIconBox}>
            <Ionicons name="calendar" size={16} color="#FFFFFF" />
          </LinearGradient>

          <View style={styles.dsText}>
            <Text style={styles.dsLabel} numberOfLines={1}>{fullLabel}</Text>
            <Text style={[styles.dsRel, { color: theme.colors.primary }]}>{relLabel}</Text>
          </View>

          <View style={[styles.dsChevron, {
            backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.05)',
          }]}>
            <Ionicons name="chevron-down" size={14} color={theme.colors.textSecondary} />
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

// ─── Clear history overview ──────────────────────────────────────────────────

function HistoryOverview({
  dates,
  counts,
  selectedYmd,
  onSelect,
}: {
  dates: string[];
  counts: HistoryCounts;
  selectedYmd: string;
  onSelect: (ymd: string) => void;
}) {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const { t, i18n: translationI18n } = useTranslation();
  const dateLocale = isTelugu(translationI18n.language) ? 'te-IN' : 'en-IN';
  const daysWithEntries = Object.values(counts).filter(count => count > 0).length;
  const railRef = useRef<ScrollView>(null);

  useEffect(() => {
    const selectedIndex = dates.indexOf(selectedYmd);
    if (selectedIndex < 0) return;
    // Keep an auto-selected older date visible instead of leaving the rail at yesterday.
    requestAnimationFrame(() => {
      railRef.current?.scrollTo({ x: Math.max(0, selectedIndex * 78 - 32), animated: true });
    });
  }, [dates, selectedYmd]);

  return (
    <Animated.View entering={FadeInDown.duration(320).springify()} style={styles.historyPanel}>
      <View style={styles.historyHeader}>
        <LinearGradient colors={['#4338CA', '#6366F1']} style={styles.historyIconBox}>
          <Ionicons name="time-outline" size={19} color="#FFFFFF" />
        </LinearGradient>
        <View style={styles.historyHeaderText}>
          <Text style={styles.historyTitle}>{t('studentDiary.historyTitle')}</Text>
          <Text style={styles.historyWindow}>{t('studentDiary.historyWindow')}</Text>
        </View>
        <View style={[styles.historyCountBadge, {
          backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.1)',
        }]}>
          <Text style={[styles.historyCountNumber, { color: theme.colors.primary }]}>{daysWithEntries}</Text>
          <Text style={styles.historyCountLabel}>{t('studentDiary.daysWithEntries')}</Text>
        </View>
      </View>

      <Text style={styles.historyHint}>
        {daysWithEntries > 0
          ? t('studentDiary.historyHint')
          : t('studentDiary.noRecentHistory')}
      </Text>

      <TourScrollView
        ref={railRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.historyDateRail}
        accessibilityRole="tablist"
      >
        {dates.map((ymd) => {
          const date = fromYmd(ymd);
          const count = counts[ymd] ?? 0;
          const selected = ymd === selectedYmd;
          return (
            <Pressable
              key={ymd}
              onPress={() => onSelect(ymd)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={`${date.toLocaleDateString(dateLocale, { dateStyle: 'full' })}, ${t('studentDiary.entryCount', { count })}`}
              style={[
                styles.historyDateChip,
                {
                  backgroundColor: selected
                    ? theme.colors.primary
                    : isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
                  borderColor: selected
                    ? theme.colors.primary
                    : count > 0
                      ? isDark ? 'rgba(99,102,241,0.45)' : 'rgba(99,102,241,0.28)'
                      : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(148,163,184,0.2)',
                },
              ]}
            >
              <Text style={[styles.historyChipWeekday, { color: selected ? 'rgba(255,255,255,0.8)' : theme.colors.textMuted }]}>
                {date.toLocaleDateString(dateLocale, { weekday: 'short' })}
              </Text>
              <Text style={[styles.historyChipDay, { color: selected ? '#FFFFFF' : theme.colors.textStrong }]}>
                {date.getDate()}
              </Text>
              <Text style={[styles.historyChipMonth, { color: selected ? 'rgba(255,255,255,0.8)' : theme.colors.textSecondary }]}>
                {date.toLocaleDateString(dateLocale, { month: 'short' })}
              </Text>
              <View style={[
                styles.historyEntryBadge,
                { backgroundColor: selected ? 'rgba(255,255,255,0.2)' : count > 0 ? theme.colors.primary + '18' : 'transparent' },
              ]}>
                <Ionicons
                  name={count > 0 ? 'document-text' : 'remove'}
                  size={10}
                  color={selected ? '#FFFFFF' : count > 0 ? theme.colors.primary : theme.colors.textMuted}
                />
                <Text style={[
                  styles.historyEntryCount,
                  { color: selected ? '#FFFFFF' : count > 0 ? theme.colors.primary : theme.colors.textMuted },
                ]}>
                  {count}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </TourScrollView>
    </Animated.View>
  );
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function DiaryPhoto({ src }: { src: string }) {
  const { theme, isDark } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const imageSource = useMemo(() => ({ uri: src }), [src]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerFailed, setViewerFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [viewerAttempt, setViewerAttempt] = useState(0);

  const retry = () => {
    setStatus('loading');
    setAttempt((value) => value + 1);
  };

  return (
    <>
      <View style={styles.attachmentThumb}>
        {status === 'failed' ? (
          <View style={styles.photoStatus}>
            <Ionicons name="image-outline" size={24} color={theme.colors.textMuted} />
            <Text style={styles.photoStatusText}>{t('studentDiary.photoUnavailable')}</Text>
            <Pressable onPress={retry} accessibilityRole="button" accessibilityLabel={t('studentDiary.retryPhoto')} style={styles.photoRetry}>
              <Text style={[styles.photoRetryText, { color: theme.colors.primary }]}>{t('studentDiary.retry')}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setViewerOpen(true)} disabled={status !== 'ready'} accessibilityRole="button" accessibilityLabel={t('studentDiary.openPhoto')} style={styles.photoFill}>
            <Image
              key={`${src}:${attempt}`}
              source={imageSource}
              style={styles.photoFill}
              resizeMode="contain"
              onLoad={() => setStatus('ready')}
              onError={() => setStatus('failed')}
            />
            {status === 'loading' ? <ActivityIndicator style={styles.photoLoading} color={theme.colors.primary} /> : null}
          </Pressable>
        )}
      </View>
      <Modal visible={viewerOpen} transparent animationType="fade" onRequestClose={() => setViewerOpen(false)}>
        <Pressable style={styles.photoViewerOverlay} onPress={() => setViewerOpen(false)}>
          {viewerFailed ? (
            <View style={styles.photoStatus}>
              <Text style={[styles.photoStatusText, { color: '#FFFFFF' }]}>{t('studentDiary.photoUnavailable')}</Text>
              <Pressable onPress={(event) => { event.stopPropagation(); setViewerFailed(false); setViewerAttempt((value) => value + 1); }} accessibilityRole="button" accessibilityLabel={t('studentDiary.retryPhoto')} style={styles.photoRetry}>
                <Text style={styles.photoViewerRetryText}>{t('studentDiary.retry')}</Text>
              </Pressable>
            </View>
          ) : (
            <Image
              key={`${src}:viewer:${viewerAttempt}`}
              source={imageSource}
              style={styles.photoViewerImage}
              resizeMode="contain"
              onError={() => setViewerFailed(true)}
            />
          )}
        </Pressable>
      </Modal>
    </>
  );
}

function TaskCard({ item, index, hideAttachments }: { item: DiaryEntry; index: number; hideAttachments?: boolean }) {
  const { t, i18n: translationI18n } = useTranslation();
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const subj = getSubjectStyle(item.subjectName || item.title);
  const pressed = useSharedValue(0);
  const dateLocale = isTelugu(translationI18n.language) ? 'te-IN' : 'en-IN';
  const localizedTitle = t_field(item.title, item.titleTe);
  const localizedContent = t_field(item.content, item.contentTe);
  const photos = normalizeDiaryAttachments(item.attachments);
  const photoOnly = photos.length > 0 && isPhotoFallbackContent(localizedContent);
  const dueDateText = item.homeworkDueDate
    ? `${t('studentDiary.due')} ${fromYmd(item.homeworkDueDate.slice(0, 10)).toLocaleDateString(dateLocale, { month: 'long', day: 'numeric' })}`
    : undefined;

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pressed.value, [0, 1], [1, 0.975], Extrapolation.CLAMP) }],
    opacity: interpolate(pressed.value, [0, 1], [1, 0.87], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View entering={FadeInDown.delay(index * 75).duration(500).springify()} style={animStyle}>
      <Pressable
        onPressIn={() => { pressed.value = withSpring(1, { damping: 20, stiffness: 300 }); }}
        onPressOut={() => { pressed.value = withSpring(0, { damping: 20, stiffness: 300 }); }}
        android_ripple={{ color: subj.color + '18' }}
      >
        <View style={[styles.taskCard, isDark ? styles.taskCardDark : styles.taskCardLight]}>
          <LinearGradient colors={isDark ? subj.darkGradient : subj.gradient} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.accentStrip} />
          <View style={styles.iconColumn}>
            <LinearGradient colors={isDark ? subj.darkGradient : subj.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.subjIconBadge}>
              <MaterialIcons name={subj.icon as any} size={18} color="#FFFFFF" />
            </LinearGradient>
          </View>
          <View style={styles.cardContent}>
            <View style={styles.cardMeta}>
              <View style={[styles.subjPill, { backgroundColor: isDark ? subj.color + '22' : subj.color + '12', borderColor: isDark ? subj.color + '40' : subj.color + '28' }]}>
                <View style={[styles.subjDot, { backgroundColor: subj.color }]} />
                <Text style={[styles.subjPillText, { color: subj.color }]}>{item.subjectName || subj.label}</Text>
              </View>
              {item.homeworkDueDate ? (
                <View style={[styles.dueChip, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)' }]}>
                  <Ionicons name="time-outline" size={11} color={theme.colors.textMuted} />
                  <Text style={styles.dueText}>
                    {t('studentDiary.due')} {fromYmd(item.homeworkDueDate.slice(0, 10)).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })}
                  </Text>
                </View>
              ) : null}
              <ReadAloudButton
                id={`diary-${item.id}`}
                text={[item.subjectName || subj.label, localizedTitle, localizedContent, dueDateText]}
                color={subj.color}
                size={32}
                style={styles.readAloudButton}
              />
            </View>
            {item.title && !photoOnly ? <Text style={styles.taskTitle}>{localizedTitle}</Text> : null}
            {!photoOnly && localizedContent ? <Text style={styles.taskBody}>{localizedContent}</Text> : null}
            {!hideAttachments && photos.length > 0 ? (
              <View style={styles.attachmentRow}>
                {photos.map((src) => <DiaryPhoto key={src} src={src} />)}
                <Text style={styles.attachmentHint}>{t('studentDiary.originalPhoto', 'Original diary photo')}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── DiaryTaskList ────────────────────────────────────────────────────────────

function groupClassDiaryTasks(tasks: DiaryEntry[]) {
  const byPhoto = new Map<string, DiaryEntry[]>();
  for (const task of tasks) {
    const first = normalizeDiaryAttachments(task.attachments)[0];
    if (!first) continue;
    const list = byPhoto.get(first) || [];
    list.push(task);
    byPhoto.set(first, list);
  }
  const bundles = [...byPhoto.values()].filter((items) => items.length > 1);
  const bundled = new Set(bundles.flatMap((items) => items.map((item) => item.id)));
  return {
    bundles,
    rest: tasks.filter((item) => !bundled.has(item.id)),
  };
}

function DiaryTaskList({
  tasks,
  emptyTitle,
  emptyLabel,
}: {
  tasks: DiaryEntry[];
  emptyTitle?: string;
  emptyLabel?: string;
}) {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const { t } = useTranslation();
  const badge = isDark ? IconBadgeColorsDark.diary : IconBadgeColors.diary;

  if (tasks.length === 0) {
    return (
      <Animated.View entering={FadeIn.duration(500)}>
        <LinearGradient
          colors={isDark ? ['rgba(99,102,241,0.1)', 'rgba(56,189,248,0.06)', 'rgba(15,23,42,0.8)'] : ['rgba(99,102,241,0.04)', 'rgba(56,189,248,0.04)', '#F8FAFC']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.emptyCard, { borderColor: isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.18)' }]}
        >
          <View style={[styles.emptyRing, styles.emptyRingOuter, { borderColor: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.1)' }]} />
          <View style={[styles.emptyRing, styles.emptyRingInner, { borderColor: isDark ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.18)' }]} />
          <LinearGradient colors={isDark ? ['rgba(99,102,241,0.3)', 'rgba(56,189,248,0.15)'] : ['rgba(99,102,241,0.12)', 'rgba(56,189,248,0.08)']} style={styles.emptyIconCircle}>
            <Ionicons name="sparkles" size={30} color={badge.icon} />
          </LinearGradient>
          <Text style={styles.emptyTitle}>{emptyTitle ?? t('studentDiary.allCaughtUp')}</Text>
          <Text style={styles.emptyBody}>{emptyLabel ?? t('studentDiary.noHomeworkToday')}</Text>
        </LinearGradient>
      </Animated.View>
    );
  }

  return (
    <View style={styles.taskList}>
      {groupClassDiaryTasks(tasks).bundles.map((bundle) => {
        const photos = normalizeDiaryAttachments(bundle[0].attachments);
        return (
          <View key={photos[0] || bundle[0].id} style={{ gap: 8, marginBottom: 8 }}>
            <Text style={styles.taskTitle}>{t('studentDiary.classDiary', "Today's Class Diary")}</Text>
            {bundle.map((item, i) => <TaskCard key={item.id} item={item} index={i} hideAttachments />)}
            {photos.length ? (
              <View style={styles.attachmentRow}>
                {photos.map((src) => <DiaryPhoto key={src} src={src} />)}
                <Text style={styles.attachmentHint}>{t('studentDiary.originalPhoto', 'Original diary photo')}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
      {groupClassDiaryTasks(tasks).rest.map((item, i) => <TaskCard key={item.id} item={item} index={i} />)}
    </View>
  );
}

// ─── WatermelonDB observers ───────────────────────────────────────────────────

const DiaryForDateRaw = ({
  tasks,
  emptyTitle,
  emptyLabel,
}: {
  tasks: DiaryEntry[];
  emptyTitle?: string;
  emptyLabel?: string;
}) => <DiaryTaskList tasks={tasks} emptyTitle={emptyTitle} emptyLabel={emptyLabel} />;

// The class filter is ALWAYS applied — never conditionally. The local WatermelonDB is a
// single device-wide store shared by every account a parent has switched into, so a query
// without `class_section_id` returns the union of every class ever synced on this device
// and shows one sibling's homework inside the other sibling's portal. An empty classId
// therefore has to match nothing (fail closed) rather than match everything.
const enhanceForDate = withObservables(
  ['date', 'classId'],
  ({ date, classId }: { date: string; classId: string }) => ({
    tasks: database.collections
      .get<DiaryEntry>('diary_entries')
      .query(Q.where('entry_date', date), Q.where('class_section_id', classId)),
  })
);
const DiaryListForDate = enhanceForDate(DiaryForDateRaw);

// Silent observer: tells us which history dates have entries (for calendar dots)
const DiaryHistoryDotsRaw = ({
  tasks,
  classId,
  historyContextKey,
  onHistoryCounts,
}: {
  tasks: DiaryEntry[];
  classId: string;
  historyContextKey: string;
  onHistoryCounts: (contextKey: string, counts: HistoryCounts) => void;
}) => {
  const counts = useMemo(() => tasks.filter(task => task.classSectionId === classId).reduce<HistoryCounts>((result, task) => {
    result[task.entryDate] = (result[task.entryDate] ?? 0) + 1;
    return result;
  }, {}), [classId, tasks]);
  useEffect(() => { onHistoryCounts(historyContextKey, counts); }, [counts, historyContextKey, onHistoryCounts]);
  return null;
};

const enhanceHistoryDots = withObservables(
  ['historyDates', 'classId'],
  ({ historyDates, classId }: { historyDates: string[]; classId: string }) => ({
    tasks: database.collections
      .get<DiaryEntry>('diary_entries')
      .query(Q.where('entry_date', Q.oneOf(historyDates)), Q.where('class_section_id', classId)),
  })
);
const DiaryHistoryDots = enhanceHistoryDots(DiaryHistoryDotsRaw);

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function DiaryScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const { t } = useTranslation();
  const { user } = useAuth();

  useFocusEffect(useCallback(() => () => {
    void readAloudService.stop();
  }, []));

  const today = useMemo(() => new Date(), []);
  const todayYmd = useMemo(() => toYmd(today), [today]);
  const priorDates = useMemo(() => priorHistoryYmds(today), [today]);

  const [activeTab, setActiveTab] = useState<TabId>('today');
  const [historyDate, setHistoryDate] = useState(() => priorDates[0]); // default: yesterday
  const [historyState, setHistoryState] = useState<{ contextKey: string; counts: HistoryCounts }>({
    contextKey: '',
    counts: {},
  });
  const [pickerVisible, setPickerVisible] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // If History is opened before the local observer finishes, select the newest
  // populated date as soon as counts arrive. A manual date choice cancels this.
  const pendingHistoryAutoSelectRef = useRef(false);
  // Guards against a pull-to-refresh and a probe-triggered sync overlapping.
  const syncingRef = useRef(false);
  // Which account the local store was last synced for, so a switch forces a full pull.
  const syncedOwnerRef = useRef<string | null>(null);
  // Set once the first sync for this account has finished, so the focus listener
  // doesn't probe against a store that is still being filled on mount.
  const didInitialSyncRef = useRef(false);

  const winW = Dimensions.get('window').width;
  const hPad = winW >= CONTENT_MAX_WIDTH + 40 ? Math.max(20, (winW - CONTENT_MAX_WIDTH) / 2) : 20;
  const classId = (user as any)?.classId || '';
  const historyContextKey = `${user?.userId ?? ''}:${classId}`;
  // Context-keying makes stale counts impossible to display during a sibling switch.
  const historyCounts = useMemo(
    () => historyState.contextKey === historyContextKey ? historyState.counts : {},
    [historyContextKey, historyState]
  );
  const datesWithData = useMemo(
    () => Object.keys(historyCounts).filter(date => historyCounts[date] > 0).sort((a, b) => b.localeCompare(a)),
    [historyCounts]
  );
  const historyMinimumYmd = priorDates[priorDates.length - 1];
  const historyMaximumYmd = priorDates[0];

  const onHistoryCounts = useCallback((contextKey: string, counts: HistoryCounts) => {
    setHistoryState({ contextKey, counts });
  }, []);

  const onHistoryDateSelect = useCallback((ymd: string) => {
    pendingHistoryAutoSelectRef.current = false;
    setHistoryDate(ymd);
  }, []);

  const onTabChange = useCallback((tab: TabId) => {
    if (tab === 'history') {
      // Never open history on a blank yesterday when an older retained day has entries.
      setHistoryDate(datesWithData[0] ?? priorDates[0]);
      pendingHistoryAutoSelectRef.current = datesWithData.length === 0;
    }
    setActiveTab(tab);
  }, [datesWithData, priorDates]);

  useEffect(() => {
    if (activeTab === 'history' && pendingHistoryAutoSelectRef.current && datesWithData.length > 0) {
      setHistoryDate(datesWithData[0]);
      pendingHistoryAutoSelectRef.current = false;
    }
  }, [activeTab, datesWithData]);

  useEffect(() => {
    setActiveTab('today');
    setHistoryDate(priorDates[0]);
    pendingHistoryAutoSelectRef.current = false;
  }, [historyContextKey, priorDates]);

  // Automatic refresh is gated on the cheap /diary/sync-state probe: we only spend a
  // full pull when the live diary has actually changed. On an unchanged window this
  // costs one tiny request and touches nothing, which matters on a 2G connection.
  // Anything the probe misses is still recoverable — the parent can pull to refresh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      // A just-switched account has no rows of its own yet, so sync unconditionally;
      // the probe would compare against the previous student's data.
      const isNewOwner = syncedOwnerRef.current !== user.userId;
      if (isNewOwner) didInitialSyncRef.current = false;
      syncedOwnerRef.current = user.userId;
      if (!isNewOwner) {
        const changed = await hasRemoteDiaryChanges(user.userId, classId).catch(() => false);
        if (cancelled || !changed) return;
      }
      if (!cancelled) await runSync();
    })();
    return () => { cancelled = true; };
  }, [user?.userId]);

  // Re-check whenever the screen regains focus, so a diary posted while the parent was
  // elsewhere in the app shows up without them having to pull.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!user || syncedOwnerRef.current !== user.userId) return;
        // Mount already syncs; without this the focus pass would probe a half-filled
        // store and fire a second, redundant pull on every cold open.
        if (!didInitialSyncRef.current || syncingRef.current) return;
        const changed = await hasRemoteDiaryChanges(user.userId, classId).catch(() => false);
        if (!cancelled && changed) await runSync();
      })();
      return () => { cancelled = true; };
      // classId is a dependency too: a session refresh can populate it after the
      // first render, and a stale closure here would keep probing without a class.
    }, [user?.userId, classId])
  );

  async function runSync() {
    if (!user || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    // Pass the signed-in account so sync can drop another student's rows from the
    // shared local DB before pulling this one's.
    try { await sync(user.userId); } catch { } finally {
      didInitialSyncRef.current = true;
      syncingRef.current = false;
      setSyncing(false);
    }
  }

  // Pull-to-refresh always forces a full pull — the parent asked, so we never let the
  // probe talk us out of it.
  const onRefresh = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    try { await runSync(); } finally { setRefreshing(false); }
  }, [user?.userId]);

  // Hero metadata
  const dateLocale = isTelugu(i18n.language) ? 'te-IN' : 'en-IN';
  const monthShort = today.toLocaleDateString(dateLocale, { month: 'short' }).toUpperCase();
  const dayNum = today.getDate().toString();
  const weekday = today.toLocaleDateString(dateLocale, { weekday: 'short' }).toUpperCase();
  const todayFull = today.toLocaleDateString(dateLocale, { weekday: 'long', month: 'long', day: 'numeric' });

  const activeDate = activeTab === 'today' ? todayYmd : historyDate;

  return (
    <View style={styles.root}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <LinearGradient
        colors={isDark ? ['#07090F', '#0C1120', '#0F172A'] : ['#F5F7FF', '#FAFBFF', '#F0F4FF']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      {isDark && (
        <>
          <View style={styles.glowBlob1} pointerEvents="none" />
          <View style={styles.glowBlob2} pointerEvents="none" />
        </>
      )}

      {/* Silently observe history dates for calendar dots */}
      {user && classId ? (
        <DiaryHistoryDots
          historyDates={priorDates}
          classId={classId}
          historyContextKey={historyContextKey}
          onHistoryCounts={onHistoryCounts}
        />
      ) : null}

      <TourTarget id="screen.screen-diary.overview"><StudentHeader showBackButton title={t('home.diary', 'Diary')} /></TourTarget>

      <TourScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: hPad }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
            progressBackgroundColor={isDark ? '#161B2E' : '#FFFFFF'}
          />
        }
      >
        <View style={{ maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', width: '100%' }}>

          {/* ── Hero Card ─────────────────────────────── */}
          <Animated.View entering={FadeInDown.duration(600).springify()}>
            <LinearGradient
              colors={isDark
                ? ['rgba(99,102,241,0.18)', 'rgba(15,23,42,0.95)', 'rgba(15,23,42,0.98)']
                : ['#FFFFFF', '#FAFBFF', '#F0F4FF']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              <LinearGradient
                colors={isDark ? ['rgba(99,102,241,0.35)', 'transparent'] : ['rgba(99,102,241,0.15)', 'transparent']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.heroCornerAccent}
              />
              <View style={styles.heroBody}>
                <LinearGradient
                  colors={isDark ? ['rgba(99,102,241,0.3)', 'rgba(99,102,241,0.15)'] : ['rgba(99,102,241,0.12)', 'rgba(99,102,241,0.06)']}
                  style={[styles.heroDateBlock, { borderColor: isDark ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.15)' }]}
                >
                  <Text style={[styles.heroDateMonth, { color: theme.colors.primary }]}>{monthShort}</Text>
                  <Text style={[styles.heroDateDay, { color: theme.colors.textStrong }]}>{dayNum}</Text>
                  <Text style={[styles.heroDateWeekday, { color: theme.colors.textSecondary }]}>{weekday}</Text>
                </LinearGradient>
                <View style={styles.heroTextBlock}>
                  <Text style={styles.heroTitle}>{t('home.diary', 'Diary')}</Text>
                  <Text style={[styles.heroDate, { color: theme.colors.primary }]}>{todayFull}</Text>
                  <Text style={styles.heroTagline}>{t('studentDiary.heroTagline')}</Text>
                </View>
                <View style={[styles.syncChip, {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)',
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.07)',
                }]}>
                  {syncing
                    ? <LogoLoader size={22} color={theme.colors.primary} />
                    : <Ionicons name="cloud-done-outline" size={20} color={theme.colors.textMuted} />}
                </View>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* ── Tab Switcher ──────────────────────────── */}
          <TourTarget id="student.diary.date" native><Animated.View entering={FadeInDown.delay(120).duration(500).springify()} style={styles.tabWrap}>
            <TourTarget id="screen.screen-diary.workspace"><TabSwitcher active={activeTab} onChange={onTabChange} /></TourTarget>
          </Animated.View></TourTarget>

          {/* ── History: date selector ────────────────── */}
          {activeTab === 'history' ? (
            <>
              <HistoryOverview
                dates={priorDates}
                counts={historyCounts}
                selectedYmd={historyDate}
                onSelect={onHistoryDateSelect}
              />
              <DateSelectorButton
                selectedYmd={historyDate}
                onPress={() => setPickerVisible(true)}
                onSelect={onHistoryDateSelect}
                minimumYmd={historyMinimumYmd}
                maximumYmd={historyMaximumYmd}
              />
              <View style={styles.selectedDateHeading}>
                <Text style={styles.selectedDateTitle}>{t('studentDiary.entriesForDate')}</Text>
                <Text style={[styles.selectedDateCount, { color: theme.colors.primary }]}>
                  {t('studentDiary.entryCount', { count: historyCounts[historyDate] ?? 0 })}
                </Text>
              </View>
            </>
          ) : null}

          {/* ── Task content ──────────────────────────── */}
          <TourTarget id="student.diary.entries" native><Animated.View
            key={activeDate}
            entering={FadeInDown.delay(60).duration(360).springify()}
          >
            {user && classId ? (
              <DiaryListForDate
                key={`${i18n.language}-${activeDate}`}
                date={activeDate}
                classId={classId}
                emptyTitle={activeTab === 'history' ? t('studentDiary.noEntriesTitle') : undefined}
                emptyLabel={activeTab === 'history' ? t('studentDiary.noDiaryForDate') : undefined}
              />
            ) : user ? (
              // Class not resolved yet (profile still syncing, or no active enrolment).
              // Showing the normal "no homework" card here would be a lie, and showing an
              // unfiltered list would leak another student's diary — so say what's true.
              <DiaryTaskList
                tasks={[]}
                emptyTitle={t('studentDiary.classLoadingTitle')}
                emptyLabel={t(
                  'studentDiary.noClassAssigned'
                )}
              />
            ) : null}
          </Animated.View></TourTarget>

        </View>
      </TourScrollView>

      {/* ── Date Picker Bottom Sheet ──────────────── */}
      <DatePickerSheet
        visible={pickerVisible}
        selectedYmd={historyDate}
        availableYmds={datesWithData}
        minimumYmd={historyMinimumYmd}
        maximumYmd={historyMaximumYmd}
        onSelect={onHistoryDateSelect}
        onClose={() => setPickerVisible(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const getStyles = (theme: SchoolTheme, isDark: boolean) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: 'transparent' },
    scroll: { flex: 1 },
    scrollContent: { paddingTop: 12, paddingBottom: 80 },

    // Ambient glows
    glowBlob1: { position: 'absolute', width: 320, height: 320, borderRadius: 160, backgroundColor: 'rgba(99,102,241,0.07)', top: -80, right: -80 },
    glowBlob2: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(56,189,248,0.05)', top: 200, left: -60 },

    // Hero
    heroCard: {
      borderRadius: 24, overflow: 'hidden', marginBottom: 16, borderWidth: 1,
      borderColor: isDark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.2)',
      ...Platform.select({
        ios: { shadowColor: isDark ? '#4F46E5' : '#6366F1', shadowOffset: { width: 0, height: 8 }, shadowOpacity: isDark ? 0.25 : 0.1, shadowRadius: 24 },
        android: { elevation: 8 },
      }),
    },
    heroCornerAccent: { position: 'absolute', top: 0, right: 0, width: 120, height: 120, borderTopRightRadius: 24 },
    heroBody: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 16 },
    heroDateBlock: { width: 56, height: 72, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    heroDateMonth: { fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
    heroDateDay: { fontSize: 26, fontWeight: '800', letterSpacing: -1, lineHeight: 30 },
    heroDateWeekday: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
    heroTextBlock: { flex: 1, gap: 2 },
    heroTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.textStrong, letterSpacing: -0.5, lineHeight: 26 },
    heroDate: { fontSize: 12, fontWeight: '600', letterSpacing: 0.1, marginBottom: 2 },
    heroTagline: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 18 },
    syncChip: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },

    // Tabs
    tabWrap: { marginBottom: 14 },
    tabBar: {
      flexDirection: 'row', borderRadius: 16, borderWidth: 1, padding: 4, gap: 4,
    },
    tabItem: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 7, paddingVertical: 12, borderRadius: 12, overflow: 'hidden',
    },
    tabLabel: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },

    // History overview
    historyPanel: {
      marginBottom: 14, padding: 16, borderRadius: 20, borderWidth: 1,
      backgroundColor: isDark ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.92)',
      borderColor: isDark ? 'rgba(99,102,241,0.22)' : 'rgba(99,102,241,0.16)',
    },
    historyHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    historyIconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    historyHeaderText: { flex: 1, gap: 2 },
    historyTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.textStrong, letterSpacing: -0.4 },
    historyWindow: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600' },
    historyCountBadge: { minWidth: 64, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, alignItems: 'center' },
    historyCountNumber: { fontSize: 17, fontWeight: '800', lineHeight: 19 },
    historyCountLabel: { fontSize: 9, color: theme.colors.textMuted, fontWeight: '700', textAlign: 'center' },
    historyHint: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18, marginTop: 12, marginBottom: 12 },
    historyDateRail: { gap: 8, paddingRight: 4 },
    historyDateChip: {
      width: 70, minHeight: 100, borderRadius: 15, borderWidth: 1,
      alignItems: 'center', justifyContent: 'center', paddingVertical: 9,
    },
    historyChipWeekday: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    historyChipDay: { fontSize: 23, fontWeight: '800', lineHeight: 27, marginTop: 1 },
    historyChipMonth: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    historyEntryBadge: {
      minWidth: 34, height: 20, borderRadius: 10, paddingHorizontal: 6, marginTop: 6,
      flexDirection: 'row', gap: 3, alignItems: 'center', justifyContent: 'center',
    },
    historyEntryCount: { fontSize: 10, fontWeight: '800' },
    selectedDateHeading: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 10, paddingHorizontal: 2, gap: 12,
    },
    selectedDateTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: theme.colors.textStrong },
    selectedDateCount: { fontSize: 12, fontWeight: '700' },

    // Date selector button
    dateSelectorWrap: { marginBottom: 14 },
    dateSelector: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 13, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1,
    },
    dsIconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    dsText: { flex: 1, gap: 2 },
    dsLabel: { fontSize: 14, fontWeight: '700', color: theme.colors.textStrong, letterSpacing: -0.3 },
    dsRel: { fontSize: 12, fontWeight: '600' },
    dsChevron: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

    // Task list
    taskList: { gap: 12 },

    // Task card
    taskCard: { flexDirection: 'row', borderRadius: 18, overflow: 'hidden', borderWidth: 1, minHeight: 100 },
    taskCardLight: {
      backgroundColor: '#FFFFFF', borderColor: 'rgba(148,163,184,0.18)',
      ...Platform.select({ ios: { shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12 }, android: { elevation: 3 } }),
    },
    taskCardDark: {
      backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)',
      ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 }, android: { elevation: 4 } }),
    },
    accentStrip: { width: 4 },
    iconColumn: { paddingTop: 16, paddingLeft: 14 },
    subjIconBadge: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    cardContent: { flex: 1, paddingTop: 14, paddingBottom: 16, paddingLeft: 12, paddingRight: 16, gap: 6 },
    cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    readAloudButton: { marginLeft: 'auto' },
    subjPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
    subjDot: { width: 5, height: 5, borderRadius: 3 },
    subjPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    dueChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
    dueText: { fontSize: 11, color: theme.colors.textMuted, fontWeight: '600' },
    taskTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.textStrong, letterSpacing: -0.3, lineHeight: 21 },
    taskBody: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 19 },
    attachmentRow: { marginTop: 10, gap: 6 },
    attachmentThumb: { width: '100%', height: 220, borderRadius: 16, overflow: 'hidden', backgroundColor: 'rgba(15,23,42,0.06)' },
    attachmentHint: { fontSize: 11, fontWeight: '600', color: theme.colors.textTertiary },
    photoFill: { width: '100%', height: '100%' },
    photoLoading: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
    photoStatus: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
    photoStatusText: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
    photoRetry: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.primary },
    photoRetryText: { fontSize: 13, fontWeight: '700' },
    photoViewerOverlay: { flex: 1, backgroundColor: 'rgba(11,16,32,0.92)', alignItems: 'center', justifyContent: 'center', padding: 16 },
    photoViewerImage: { width: '100%', height: '80%' },
    photoViewerRetryText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

    // Empty state
    emptyCard: {
      alignItems: 'center', justifyContent: 'center', paddingVertical: 52,
      paddingHorizontal: 24, borderRadius: 24, borderWidth: 1, overflow: 'hidden',
    },
    emptyRing: { position: 'absolute', borderRadius: 999, borderWidth: 1 },
    emptyRingOuter: { width: 160, height: 160 },
    emptyRingInner: { width: 110, height: 110 },
    emptyIconCircle: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.textStrong, letterSpacing: -0.4, marginBottom: 6 },
    emptyBody: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 },

    // Bottom sheet
    sheetOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
    sheetContainer: { position: 'absolute', bottom: 0, left: 0, right: 0 },
    sheetCard: {
      borderTopLeftRadius: 28, borderTopRightRadius: 28,
      paddingBottom: 40, borderWidth: 1, borderBottomWidth: 0,
    },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
    sheetHeader: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
      paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
    },
    sheetTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.textStrong, letterSpacing: -0.5 },
    sheetSubtitle: { fontSize: 12, color: theme.colors.textMuted, marginTop: 3, fontWeight: '500' },
    sheetCloseBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

    // MiniCalendar uses fully inline fixed-px styles (no stylesheet entries needed).
  });
