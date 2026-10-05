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
import AdminHeader from '../../src/components/AdminHeader';
import { useTheme } from '../../src/hooks/useTheme';
import { clayCard } from '../../src/theme/clayStyles';
import {
  CalendarEvent,
  SchoolDayStatus,
  CalendarAnalytics,
  AcademicTerm,
  calendarService,
  monthWindow,
} from '../../src/services/calendarService';
import { CalendarMonthGrid } from '../../src/components/calendar/CalendarMonthGrid';
import { CalendarDayView } from '../../src/components/calendar/CalendarDayView';
import { CalendarAgendaList } from '../../src/components/calendar/CalendarAgendaList';
import { EventDetailModal } from '../../src/components/calendar/EventDetailModal';
import { CreateEventModal } from '../../src/components/calendar/CreateEventModal';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { todayYmd } from '../../src/components/calendar/CalendarTheme';

type CalendarViewMode = 'MONTH' | 'AGENDA' | 'ANALYTICS';

export default function AdminCalendarScreen() {
  const { theme, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 768;
  const splitMonth = width >= 1100;
  const styles = React.useMemo(
    () => getStyles(theme, isDark, compact, splitMonth),
    [theme, isDark, compact, splitMonth],
  );

  const [viewMode, setViewMode] = useState<CalendarViewMode>('MONTH');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayYmd());

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [dayStatus, setDayStatus] = useState<SchoolDayStatus | null>(null);
  const [analytics, setAnalytics] = useState<CalendarAnalytics | null>(null);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [createInitialDate, setCreateInitialDate] = useState<string>(selectedDate);

  const fetchEvents = useCallback(async () => {
    try {
      const { startDate, endDate } = monthWindow(currentDate);
      const data = await calendarService.getEvents({
        startDate,
        endDate,
      });
      setEvents(data);
    } catch {
      alertCompat('Error', 'Failed to load calendar events');
    }
  }, [currentDate]);

  const fetchDayStatus = useCallback(async (date: string) => {
    try {
      const status = await calendarService.getDayStatus(date);
      setDayStatus(status);
    } catch {
      // Day status failure shouldn't crash page
    }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    try {
      const data = await calendarService.getAnalytics();
      setAnalytics(data);
      const termsData = await calendarService.getTerms();
      setTerms(termsData);
    } catch {
      // analytics failure is non-blocking
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchEvents(),
      fetchDayStatus(selectedDate),
      fetchAnalytics(),
    ]);
    setLoading(false);
  }, [fetchEvents, fetchDayStatus, fetchAnalytics, selectedDate]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchEvents(),
      fetchDayStatus(selectedDate),
      fetchAnalytics(),
    ]);
    setRefreshing(false);
  };

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    fetchDayStatus(date);
  };

  const handleChangeMonth = (delta: number) => {
    const next = new Date(currentDate);
    next.setMonth(next.getMonth() + delta);
    setCurrentDate(next);
  };

  const handleGoToday = () => {
    const today = new Date();
    setCurrentDate(today);
    const todayStr = todayYmd();
    setSelectedDate(todayStr);
    fetchDayStatus(todayStr);
  };

  const handleAddEvent = (date?: string) => {
    setEditEvent(null);
    setCreateInitialDate(date || selectedDate);
    setCreateModalVisible(true);
  };

  const handleEditEvent = (ev: CalendarEvent) => {
    setEditEvent(ev);
    setCreateInitialDate(ev.start_date);
    setCreateModalVisible(true);
  };

  const handleExportIcs = () => {
    const url = calendarService.getIcsExportUrl();
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => {
        alertCompat('Export', 'Could not open export link');
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

  const tabs: Array<{ key: CalendarViewMode; label: string; short: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { key: 'MONTH', label: 'Month', short: 'Month', icon: 'calendar' },
    { key: 'AGENDA', label: 'Agenda', short: 'Agenda', icon: 'list' },
    { key: 'ANALYTICS', label: 'Terms & Analytics', short: 'Terms', icon: 'stats-chart' },
  ];

  return (
    <View style={styles.container}>
      <TourTarget id="screen.admin-calendar.overview"><AdminHeader
        title="Academic Calendar"
        showBackButton={true}
        rightAction={{
          icon: 'download-outline',
          onPress: handleExportIcs,
        }}
      /></TourTarget>

      <TourTarget id="screen.admin-calendar.workspace" native><View style={styles.toolbar}>
        <View style={styles.viewTabs}>
          {tabs.map((tab) => {
            const active = viewMode === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.viewTab, active && styles.activeViewTab]}
                onPress={() => setViewMode(tab.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Ionicons name={tab.icon} size={14} color={active ? '#FFFFFF' : theme.colors.text} />
                <Text style={[styles.viewTabText, active && styles.activeViewTabText]}>
                  {compact ? tab.short : tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {!compact && (
          <TouchableOpacity
            style={styles.primaryAddBtn}
            onPress={() => handleAddEvent(selectedDate)}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.primaryAddBtnText}>Add Event</Text>
          </TouchableOpacity>
        )}
      </View></TourTarget>

      {loading ? (
        <View style={styles.centeredLoader}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingLabel}>Loading Academic Calendar...</Text>
        </View>
      ) : (
        <TourScrollView
          style={styles.scrollContent}
          contentContainerStyle={styles.scrollInner}
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
                  onAddEventForDay={handleAddEvent}
                  isAdmin={true}
                />
              </View>
            </View>
          )}

          {viewMode === 'AGENDA' && (
            <CalendarAgendaList
              events={events}
              onSelectEvent={(ev) => setSelectedEvent(ev)}
            />
          )}

          {viewMode === 'ANALYTICS' && (
            <View style={styles.analyticsTab}>
              <Text style={styles.subHeading}>Academic Year Operations</Text>
              <View style={styles.statsGrid}>
                <View style={[styles.statCard, { borderLeftColor: '#059669' }]}>
                  <Text style={styles.statLabel}>Working Days</Text>
                  <Text style={[styles.statValue, { color: '#059669' }]}>
                    {analytics?.total_working_days ?? 220}
                  </Text>
                  <Text style={styles.statSub}>Full sessions scheduled</Text>
                </View>

                <View style={[styles.statCard, { borderLeftColor: '#DC2626' }]}>
                  <Text style={styles.statLabel}>Official Holidays</Text>
                  <Text style={[styles.statValue, { color: '#DC2626' }]}>
                    {analytics?.holidays_count ?? 0}
                  </Text>
                  <Text style={styles.statSub}>Closed / non-instructional</Text>
                </View>

                <View style={[styles.statCard, { borderLeftColor: '#4F46E5' }]}>
                  <Text style={styles.statLabel}>Examinations</Text>
                  <Text style={[styles.statValue, { color: '#4F46E5' }]}>
                    {analytics?.exams_count ?? 0}
                  </Text>
                  <Text style={styles.statSub}>FA & SA assessment days</Text>
                </View>

                <View style={[styles.statCard, { borderLeftColor: '#D97706' }]}>
                  <Text style={styles.statLabel}>Total Events</Text>
                  <Text style={[styles.statValue, { color: '#D97706' }]}>
                    {analytics?.events_count ?? events.length}
                  </Text>
                  <Text style={styles.statSub}>Activities, meetings, sports</Text>
                </View>
              </View>

              <View style={styles.termsSection}>
                <View style={styles.termsHeader}>
                  <Text style={styles.subHeading}>Academic Terms & Semesters</Text>
                </View>

                {terms.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Ionicons name="folder-open-outline" size={32} color="#94A3B8" />
                    <Text style={styles.emptyTitle}>Standard Terms Active</Text>
                    <Text style={styles.emptySub}>
                      Term 1 (June - October) & Term 2 (November - April)
                    </Text>
                  </View>
                ) : (
                  terms.map((term) => (
                    <View key={term.id} style={styles.termCard}>
                      <View style={styles.termLeft}>
                        <View style={styles.termIconBox}>
                          <Ionicons name="school" size={16} color="#4F46E5" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.termName}>{term.name}</Text>
                          <Text style={styles.termDates}>
                            {term.start_date} to {term.end_date}
                          </Text>
                        </View>
                      </View>

                      {term.is_current && (
                        <View style={styles.activeTermPill}>
                          <Text style={styles.activeTermText}>Current</Text>
                        </View>
                      )}
                    </View>
                  ))
                )}
              </View>
            </View>
          )}
        </TourScrollView>
      )}

      {compact && !loading && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => handleAddEvent(selectedDate)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Add calendar event"
        >
          <Ionicons name="add" size={26} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      <EventDetailModal
        visible={!!selectedEvent}
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        isAdmin={true}
        onEditEvent={handleEditEvent}
        onEventUpdated={loadAll}
      />

      <CreateEventModal
        visible={createModalVisible}
        initialDate={createInitialDate}
        editEvent={editEvent}
        onClose={() => setCreateModalVisible(false)}
        onEventSaved={loadAll}
      />
    </View>
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
      paddingHorizontal: compact ? 12 : 16,
      paddingVertical: 8,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : '#FFFFFF',
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.06)',
      gap: 12,
    },
    viewTabs: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F1F5F9',
      borderRadius: 12,
      padding: 3,
      gap: 2,
    },
    viewTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      minHeight: 36,
      paddingHorizontal: compact ? 6 : 10,
      paddingVertical: 6,
      borderRadius: 10,
    },
    activeViewTab: {
      backgroundColor: '#4F46E5',
    },
    viewTabText: {
      fontSize: compact ? 12 : 12,
      fontWeight: '600',
      color: theme.colors.text,
    },
    activeViewTabText: {
      color: '#FFFFFF',
    },
    primaryAddBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#4F46E5',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
    },
    primaryAddBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    centeredLoader: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    loadingLabel: {
      fontSize: 14,
      color: isDark ? '#94A3B8' : '#64748B',
      marginTop: 12,
    },
    scrollContent: {
      flex: 1,
    },
    scrollInner: {
      padding: compact ? 12 : 16,
      paddingBottom: compact ? 96 : 40,
    },
    monthLayout: {
      flexDirection: splitMonth ? 'row' : 'column',
      alignItems: 'flex-start',
      gap: 16,
    },
    monthCol: {
      flex: splitMonth ? 1.15 : undefined,
      width: splitMonth ? undefined : '100%',
      minWidth: 0,
      alignSelf: 'stretch',
    },
    dayCol: {
      flex: splitMonth ? 0.85 : undefined,
      width: splitMonth ? undefined : '100%',
      minWidth: 0,
      alignSelf: 'stretch',
    },
    analyticsTab: {
      gap: 16,
    },
    subHeading: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 10,
      letterSpacing: -0.2,
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 16,
    },
    statCard: {
      ...clayCard(isDark, 'sm'),
      flexGrow: 1,
      flexBasis: compact ? '46%' : 160,
      minWidth: compact ? 140 : 150,
      padding: 14,
      borderLeftWidth: 4,
    },
    statLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? '#94A3B8' : '#64748B',
    },
    statValue: {
      fontSize: compact ? 22 : 24,
      fontWeight: '800',
      marginVertical: 4,
    },
    statSub: {
      fontSize: 11,
      color: isDark ? '#64748B' : '#94A3B8',
    },
    termsSection: {
      marginTop: 8,
    },
    termsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    termCard: {
      ...clayCard(isDark, 'sm'),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 14,
      marginBottom: 10,
      gap: 10,
    },
    termLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
      minWidth: 0,
    },
    termIconBox: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.2)' : '#EEF2FF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    termName: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.text,
    },
    termDates: {
      fontSize: 12,
      color: isDark ? '#94A3B8' : '#64748B',
      marginTop: 2,
    },
    activeTermPill: {
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(16, 185, 129, 0.4)' : '#A7F3D0',
    },
    activeTermText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#059669',
    },
    emptyCard: {
      ...clayCard(isDark, 'sm'),
      padding: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.text,
      marginTop: 8,
    },
    emptySub: {
      fontSize: 12,
      color: isDark ? '#94A3B8' : '#64748B',
      marginTop: 2,
      textAlign: 'center',
    },
    fab: {
      position: 'absolute',
      right: 16,
      bottom: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: '#4F46E5',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#4F46E5',
      shadowOpacity: 0.35,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
  });
}
