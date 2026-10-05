import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import ScreenLayout from '@/src/components/ScreenLayout';
import StudentSubpageHeader from '@/src/components/StudentSubpageHeader';
import { useTheme } from '@/src/hooks/useTheme';
import { eventService, type EventItem } from '@/src/services/eventService';
import { useAuth } from '@/src/hooks/useAuth';
import { clayCard } from '@/src/theme/clayStyles';
import { getEventTypeConfig, formatEventDateRange } from '@/src/components/calendar/CalendarTheme';
import * as Haptics from '@/src/utils/haptics';
import LogoLoader from '@/src/components/LogoLoader';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

type Filter = 'upcoming' | 'all';

const LIVE_STATUSES = new Set([
  'PUBLISHED',
  'SCHEDULED',
  'REGISTRATION_OPEN',
  'APPROVED',
  'ONGOING',
]);

function statusMeta(status: string | undefined, isDark: boolean, t: TFunction) {
  const value = (status || '').toUpperCase();
  if (value === 'ONGOING') {
    return { label: t('studentEventDesk.happeningNow'), color: '#059669', bg: isDark ? 'rgba(5,150,105,0.22)' : '#ECFDF5' };
  }
  if (value === 'REGISTRATION_OPEN') {
    return { label: t('studentEventDesk.openToJoin'), color: '#4F46E5', bg: isDark ? 'rgba(79,70,229,0.22)' : '#EEF2FF' };
  }
  if (value === 'COMPLETED' || value === 'CLOSED') {
    return { label: t('studentEventDesk.completed'), color: isDark ? '#94A3B8' : '#64748B', bg: isDark ? 'rgba(148,163,184,0.16)' : '#F1F5F9' };
  }
  if (value === 'CANCELLED') {
    return { label: t('studentEventDesk.cancelled'), color: '#DC2626', bg: isDark ? 'rgba(220,38,38,0.2)' : '#FEF2F2' };
  }
  return { label: t('studentEventDesk.upcomingStatus'), color: '#2563EB', bg: isDark ? 'rgba(37,99,235,0.22)' : '#EFF6FF' };
}

function countdown(startDate: string | undefined, t: TFunction) {
  if (!startDate) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDate = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(eventDate.getTime())) return '';
  const diff = Math.round((eventDate.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return t('studentEventDesk.today');
  if (diff === 1) return t('studentEventDesk.tomorrow');
  if (diff > 1 && diff <= 14) return t('studentEventDesk.inDays', { count: diff });
  if (diff < 0 && diff >= -1) return t('studentEventDesk.yesterday');
  return '';
}

export default function ParentEventsScreen() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('te') ? 'te-IN' : 'en-IN';
  const { student } = useAuth() as any;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [filter, setFilter] = useState<Filter>('upcoming');

  const styles = useMemo(() => createStyles(isDark, theme.colors), [isDark, theme.colors]);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await eventService.listEligibleEvents();
      setEvents(res.data || []);
    } catch {
      const fallback = await eventService.listEvents({ status: 'UPCOMING' }).catch(() => ({ data: [] as EventItem[] }));
      setEvents(fallback.data || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upcomingCount = useMemo(
    () => events.filter((ev) => LIVE_STATUSES.has((ev.status || '').toUpperCase())).length,
    [events],
  );

  const visible = useMemo(() => {
    const list = filter === 'upcoming'
      ? events.filter((ev) => LIVE_STATUSES.has((ev.status || '').toUpperCase()))
      : events;
    return [...list].sort((a, b) => String(a.start_date || '').localeCompare(String(b.start_date || '')));
  }, [events, filter]);

  return (
    <ScreenLayout>
      <View style={styles.root}>
        <TourTarget id="screen.screen-events.overview"><StudentSubpageHeader
          title={t('studentEventDesk.title')}
          subtitle={t('studentEventDesk.subtitle')}
          onBack={() => router.back()}
        /></TourTarget>

        <TourTarget id="screen.screen-events.workspace" native><View style={styles.filters}>
          {([
            { key: 'upcoming' as Filter, label: t('studentEventDesk.upcoming'), count: upcomingCount },
            { key: 'all' as Filter, label: t('studentEventDesk.allEvents'), count: events.length },
          ]).map((tab) => {
            const on = filter === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setFilter(tab.key);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{tab.label}</Text>
                <View style={[styles.count, on && styles.countOn]}>
                  <Text style={[styles.countText, on && styles.countTextOn]}>{tab.count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View></TourTarget>

        {loading ? (
          <View style={styles.loader}>
            <LogoLoader size={72} />
            <Text style={styles.loaderLabel}>{t('studentEventDesk.finding')}</Text>
          </View>
        ) : (
          <TourScrollView
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.colors.primary} />
            }
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          >
            {visible.length === 0 ? (
              <Animated.View entering={FadeIn.duration(280)} style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="sparkles-outline" size={30} color={theme.colors.primary} />
                </View>
                <Text style={styles.emptyTitle}>
                  {filter === 'upcoming' ? t('studentEventDesk.emptyUpcoming') : t('studentEventDesk.emptyAll')}
                </Text>
                <Text style={styles.emptyCopy}>
                  {filter === 'upcoming' ? t('studentEventDesk.emptyUpcomingCopy') : t('studentEventDesk.emptyAllCopy')}
                </Text>
                <TouchableOpacity
                  style={styles.emptyAction}
                  onPress={() => {
                    Haptics.selectionAsync();
                    router.push('/Screen/calendar' as any);
                  }}
                  accessibilityRole="button"
                >
                  <Ionicons name="calendar-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.emptyActionText}>{t('studentEventDesk.openCalendar')}</Text>
                </TouchableOpacity>
              </Animated.View>
            ) : (
              visible.map((ev, index) => {
                const type = getEventTypeConfig(ev.event_type || ev.category);
                const status = statusMeta(ev.status, isDark, t);
                const when = countdown(ev.start_date, t);
                return (
                  <Animated.View key={ev.id} entering={FadeInDown.delay(Math.min(index, 6) * 40).duration(260)}>
                    <TouchableOpacity
                      style={styles.card}
                      onPress={() => {
                        Haptics.selectionAsync();
                        router.push({
                          pathname: '/Screen/eventDetails',
                          params: { id: ev.id, studentId: student?.id || '' },
                        } as any);
                      }}
                      activeOpacity={0.84}
                      accessibilityRole="button"
                      accessibilityLabel={ev.title}
                    >
                      <View style={[styles.accent, { backgroundColor: type.color }]} />
                      <View
                        style={[
                          styles.iconBox,
                          { backgroundColor: isDark ? type.bgDark : type.bgLight },
                        ]}
                      >
                        <Ionicons name={type.icon as any} size={18} color={type.color} />
                      </View>
                      <View style={styles.body}>
                        <View style={styles.titleRow}>
                          <Text style={styles.cardTitle} numberOfLines={2}>{ev.title}</Text>
                          <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
                        </View>
                        <Text style={styles.cardMeta} numberOfLines={1}>
                          {formatEventDateRange(ev.start_date, ev.end_date, ev.is_all_day, undefined, undefined, locale)}
                          {ev.location ? `  ·  ${ev.location}` : `  ·  ${t('studentEventDesk.campus')}`}
                        </Text>
                        <View style={styles.chipRow}>
                          <View style={[styles.typeChip, { backgroundColor: isDark ? type.bgDark : type.bgLight }]}>
                            <Text style={[styles.typeChipText, { color: type.color }]}>
                              {t(`studentCalendar.eventType.${ev.event_type || 'SCHOOL_EVENT'}`, type.label)}
                            </Text>
                          </View>
                          <View style={[styles.statusChip, { backgroundColor: isDark ? `${status.color}22` : status.bg }]}>
                            <Text style={[styles.statusChipText, { color: status.color }]}>{status.label}</Text>
                          </View>
                          {when ? (
                            <View style={styles.whenChip}>
                              <Text style={styles.whenChipText}>{when}</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })
            )}
          </TourScrollView>
        )}
      </View>
    </ScreenLayout>
  );
}

function createStyles(
  isDark: boolean,
  colors: { background: string; textStrong: string; textMuted: string; primary: string; text: string },
) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    filters: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginBottom: 8,
      padding: 4,
      gap: 4,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.045)',
      width: '92%',
      maxWidth: 560,
      alignSelf: 'center',
    },
    chip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 42,
      borderRadius: 12,
      gap: 8,
    },
    chipOn: { backgroundColor: isDark ? 'rgba(79,70,229,0.28)' : '#FFFFFF' },
    chipText: { fontSize: 13, fontWeight: '800', color: colors.textMuted },
    chipTextOn: { color: isDark ? '#F8FAFC' : colors.textStrong },
    count: {
      minWidth: 22,
      height: 22,
      paddingHorizontal: 6,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
    },
    countOn: { backgroundColor: colors.primary },
    countText: { fontSize: 11, fontWeight: '800', color: isDark ? '#E2E8F0' : '#334155' },
    countTextOn: { color: '#FFFFFF' },
    loader: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80, gap: 12 },
    loaderLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
    list: { padding: 16, paddingBottom: 48, gap: 12, flexGrow: 1, width: '100%', maxWidth: 640, alignSelf: 'center' },
    empty: { alignItems: 'center', paddingTop: 72, paddingHorizontal: 28, gap: 8 },
    emptyIcon: {
      width: 72,
      height: 72,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
      backgroundColor: isDark ? 'rgba(79,70,229,0.18)' : '#EEF2FF',
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.textStrong,
      textAlign: 'center',
      letterSpacing: -0.3,
    },
    emptyCopy: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.textMuted,
      textAlign: 'center',
      maxWidth: 300,
    },
    emptyAction: {
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 14,
    },
    emptyActionText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
    card: {
      ...clayCard(isDark, 'sm'),
      flexDirection: 'row',
      alignItems: 'stretch',
      paddingVertical: 12,
      paddingRight: 12,
      paddingLeft: 0,
      borderRadius: 20,
    },
    accent: {
      width: 5,
      borderTopLeftRadius: 20,
      borderBottomLeftRadius: 20,
      marginRight: 12,
    },
    iconBox: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    body: { flex: 1, minWidth: 0, marginLeft: 10 },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    cardTitle: {
      flex: 1,
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: -0.25,
      color: colors.textStrong,
      lineHeight: 21,
    },
    cardMeta: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
      marginTop: 4,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 6,
      marginTop: 8,
    },
    typeChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    typeChipText: { fontSize: 10, fontWeight: '800' },
    statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    statusChipText: { fontSize: 10, fontWeight: '800' },
    whenChip: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(79,70,229,0.18)' : '#EEF2FF',
    },
    whenChipText: { fontSize: 10, fontWeight: '800', color: '#4F46E5' },
  });
}
