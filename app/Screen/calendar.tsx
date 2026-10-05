import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StudentHeader from '../../src/components/StudentHeader';
import ScreenLayout from '../../src/components/ScreenLayout';
import { useTheme } from '../../src/hooks/useTheme';
import { useAuth } from '../../src/hooks/useAuth';
import {
  CalendarEvent,
  SchoolDayStatus,
  calendarService,
  monthWindow,
} from '../../src/services/calendarService';
import { CalendarMonthGrid } from '../../src/components/calendar/CalendarMonthGrid';
import { CalendarDayView } from '../../src/components/calendar/CalendarDayView';
import { CalendarAgendaList } from '../../src/components/calendar/CalendarAgendaList';
import { EventDetailModal } from '../../src/components/calendar/EventDetailModal';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { todayYmd, shiftMonthKeepingDay } from '../../src/components/calendar/CalendarTheme';
import * as Haptics from '../../src/utils/haptics';
import { useTranslation } from 'react-i18next';

type ViewMode = 'MONTH' | 'AGENDA';

export default function StudentCalendarScreen() {
  const { theme, isDark } = useTheme();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 768;
  const splitMonth = width >= 1024;
  const styles = React.useMemo(
    () => getStyles(theme, isDark, compact, splitMonth),
    [theme, isDark, compact, splitMonth],
  );

  const [viewMode, setViewMode] = useState<ViewMode>('MONTH');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayYmd());

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [dayStatus, setDayStatus] = useState<SchoolDayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const studentId = (user as any)?.student_id || (user as any)?.studentId || (user as any)?.id;

  const fetchEvents = useCallback(async () => {
    try {
      const { startDate, endDate } = monthWindow(currentDate);
      const data = await calendarService.getEvents({
        startDate,
        endDate,
        studentId: studentId ? String(studentId) : undefined,
      });
      setEvents(data);
    } catch {
      alertCompat(t('studentCalendar.loadErrorTitle'), t('studentCalendar.loadError'));
    }
  }, [currentDate, studentId]);

  const fetchDayStatus = useCallback(async (date: string) => {
    try {
      const status = await calendarService.getDayStatus(date);
      setDayStatus(status);
    } catch {
      // Day status is optional
    }
  }, []);

  const loadEvents = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    await fetchEvents();
    setLoading(false);
  }, [fetchEvents]);

  useEffect(() => {
    loadEvents(true);
  }, [loadEvents]);

  useEffect(() => {
    fetchDayStatus(selectedDate);
  }, [fetchDayStatus, selectedDate]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchEvents(), fetchDayStatus(selectedDate)]);
    setRefreshing(false);
  };

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
  };

  const handleChangeMonth = (delta: number) => {
    const { nextMonth, nextSelected } = shiftMonthKeepingDay(currentDate, delta, selectedDate);
    setCurrentDate(nextMonth);
    setSelectedDate(nextSelected);
  };

  const handleGoToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(todayYmd());
  };

  const handleExportIcs = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const url = calendarService.getIcsExportUrl();
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => {
        alertCompat(t('studentCalendar.exportTitle'), t('studentCalendar.exportError'));
      });
    }
  };

  const selectedDayEvents = React.useMemo(() => {
    return events.filter((ev) => {
      const start = ev.start_date;
      const end = ev.end_date || start;
      return selectedDate >= start && selectedDate <= end;
    });
  }, [events, selectedDate]);

  const tabs: Array<{ key: ViewMode; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { key: 'MONTH', label: t('studentCalendar.month'), icon: 'calendar' },
    { key: 'AGENDA', label: t('studentCalendar.agenda'), icon: 'list' },
  ];

  return (
    <ScreenLayout>
      <View style={styles.container}>
        <TourTarget id="screen.screen-calendar.overview"><StudentHeader title={t('studentCalendar.title')} /></TourTarget>

        <TourTarget id="screen.screen-calendar.workspace" native><View style={styles.toolbar}>
          <View style={styles.tabs}>
            {tabs.map((tab) => {
              const active = viewMode === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={styles.tabHit}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setViewMode(tab.key);
                  }}
                  activeOpacity={0.85}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                >
                  {active ? (
                    <LinearGradient
                      colors={['#4F46E5', '#7C3AED']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.tab}
                    >
                      <Ionicons name={tab.icon} size={14} color="#FFFFFF" />
                      <Text style={styles.activeTabText}>{tab.label}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={styles.tab}>
                      <Ionicons name={tab.icon} size={14} color={theme.colors.text} />
                      <Text style={styles.tabText}>{tab.label}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.syncBtn}
            onPress={handleExportIcs}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('studentCalendar.syncA11y')}
          >
            <Ionicons name="download-outline" size={16} color="#4F46E5" />
            {!compact ? <Text style={styles.syncBtnText}>{t('studentCalendar.sync')}</Text> : null}
          </TouchableOpacity>
        </View></TourTarget>

        {loading ? (
          <View style={styles.centeredLoader}>
            <ActivityIndicator size="large" color="#4F46E5" />
            <Text style={styles.loadingLabel}>{t('studentCalendar.loading')}</Text>
          </View>
        ) : (
          <TourScrollView
            style={styles.scrollContent}
            contentContainerStyle={[
              styles.scrollInner,
              { paddingBottom: Math.max(insets.bottom, 16) + (compact ? 28 : 40) },
            ]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            showsVerticalScrollIndicator={false}
          >
            {viewMode === 'MONTH' && (
              <View style={styles.monthLayout}>
                <View style={styles.monthCol}>
                  <CalendarMonthGrid
                    currentDate={currentDate}
                    selectedDate={selectedDate}
                    events={events}
                    onSelectDate={handleSelectDate}
                    onChangeMonth={handleChangeMonth}
                    onGoToday={handleGoToday}
                  />
                </View>
                <View style={styles.dayCol}>
                  <CalendarDayView
                    selectedDate={selectedDate}
                    dayStatus={dayStatus}
                    events={selectedDayEvents}
                    onSelectEvent={(ev) => setSelectedEvent(ev)}
                    isAdmin={false}
                  />
                </View>
              </View>
            )}

            {viewMode === 'AGENDA' && (
              <CalendarAgendaList events={events} onSelectEvent={(ev) => setSelectedEvent(ev)} />
            )}
          </TourScrollView>
        )}

        <EventDetailModal
          visible={!!selectedEvent}
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          isAdmin={false}
        />
      </View>
    </ScreenLayout>
  );
}

function getStyles(theme: any, isDark: boolean, compact: boolean, splitMonth: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: compact ? 12 : 20,
      paddingVertical: 10,
      gap: 10,
    },
    tabs: {
      flex: 1,
      flexDirection: 'row',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255,255,255,0.72)',
      borderRadius: 16,
      padding: 4,
      gap: 4,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255,255,255,0.95)',
    },
    tabHit: {
      flex: 1,
    },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 40,
      paddingHorizontal: 10,
      borderRadius: 12,
      overflow: 'hidden',
    },
    tabText: {
      fontSize: 13,
      fontWeight: '800',
      color: theme.colors.text,
    },
    activeTabText: {
      fontSize: 13,
      fontWeight: '800',
      color: '#FFFFFF',
    },
    syncBtn: {
      width: compact ? 40 : undefined,
      height: 40,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: compact ? 0 : 14,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.18)' : '#EEF2FF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(79, 70, 229, 0.28)' : '#C7D2FE',
    },
    syncBtnText: {
      fontSize: 13,
      fontWeight: '800',
      color: '#4F46E5',
    },
    centeredLoader: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    loadingLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? '#94A3B8' : '#64748B',
      marginTop: 12,
    },
    scrollContent: {
      flex: 1,
    },
    scrollInner: {
      paddingHorizontal: compact ? 12 : 20,
      paddingTop: 4,
    },
    monthLayout: {
      flexDirection: splitMonth ? 'row' : 'column',
      alignItems: 'stretch',
      gap: compact ? 14 : 18,
    },
    monthCol: {
      flex: splitMonth ? 1.1 : undefined,
      width: splitMonth ? undefined : '100%',
      minWidth: 0,
    },
    dayCol: {
      flex: splitMonth ? 0.9 : undefined,
      width: splitMonth ? undefined : '100%',
      minWidth: 0,
    },
  });
}
