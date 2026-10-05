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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import StaffHeader from '../../src/components/StaffHeader';
import { useTheme } from '../../src/hooks/useTheme';
import { clayCard } from '../../src/theme/clayStyles';
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

type ViewMode = 'MONTH' | 'AGENDA';

export default function StaffCalendarScreen() {
  const { theme, isDark } = useTheme();
  const styles = React.useMemo(() => getStyles(theme, isDark), [theme, isDark]);

  const [viewMode, setViewMode] = useState<ViewMode>('MONTH');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [dayStatus, setDayStatus] = useState<SchoolDayStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      const { startDate, endDate } = monthWindow(currentDate);
      const data = await calendarService.getEvents({
        startDate,
        endDate,
      });
      setEvents(data);
    } catch {
      alertCompat('Error', 'Failed to load staff calendar');
    }
  }, [currentDate]);

  const fetchDayStatus = useCallback(async (date: string) => {
    try {
      const status = await calendarService.getDayStatus(date);
      setDayStatus(status);
    } catch {
      // Day status is optional
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchEvents(), fetchDayStatus(selectedDate)]);
    setLoading(false);
  }, [fetchEvents, fetchDayStatus, selectedDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchEvents(), fetchDayStatus(selectedDate)]);
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
    const todayStr = today.toISOString().split('T')[0];
    setSelectedDate(todayStr);
    fetchDayStatus(todayStr);
  };

  const handleExportIcs = () => {
    const url = calendarService.getIcsExportUrl();
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => {
        alertCompat('Export', 'Could not open calendar sync URL');
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

  return (
    <View style={styles.container}>
      <TourTarget id="screen.staff-calendar.overview"><StaffHeader
        title="Academic Calendar"
        subtitle="School schedule & working days"
        showBackButton={true}
      /></TourTarget>

      {/* Toolbar */}
      <TourTarget id="screen.staff-calendar.workspace" native><View style={styles.toolbar}>
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, viewMode === 'MONTH' && styles.activeTab]}
            onPress={() => setViewMode('MONTH')}
          >
            <Ionicons
              name="calendar"
              size={14}
              color={viewMode === 'MONTH' ? '#FFFFFF' : theme.colors.text}
            />
            <Text
              style={[
                styles.tabText,
                viewMode === 'MONTH' && styles.activeTabText,
              ]}
            >
              Month View
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, viewMode === 'AGENDA' && styles.activeTab]}
            onPress={() => setViewMode('AGENDA')}
          >
            <Ionicons
              name="list"
              size={14}
              color={viewMode === 'AGENDA' ? '#FFFFFF' : theme.colors.text}
            />
            <Text
              style={[
                styles.tabText,
                viewMode === 'AGENDA' && styles.activeTabText,
              ]}
            >
              All Events
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.syncBtn}
          onPress={handleExportIcs}
          activeOpacity={0.7}
        >
          <Ionicons name="download-outline" size={16} color="#4F46E5" />
          <Text style={styles.syncBtnText}>Sync (.ics)</Text>
        </TouchableOpacity>
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
            <>
              <CalendarMonthGrid
                currentDate={currentDate}
                selectedDate={selectedDate}
                events={events}
                onSelectDate={handleSelectDate}
                onChangeMonth={handleChangeMonth}
                onGoToday={handleGoToday}
              />

              <CalendarDayView
                selectedDate={selectedDate}
                dayStatus={dayStatus}
                events={selectedDayEvents}
                onSelectEvent={(ev) => setSelectedEvent(ev)}
                isAdmin={false}
              />
            </>
          )}

          {viewMode === 'AGENDA' && (
            <CalendarAgendaList
              events={events}
              onSelectEvent={(ev) => setSelectedEvent(ev)}
            />
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
  );
}

function getStyles(theme: any, isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : '#FFFFFF',
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.06)',
    },
    tabs: {
      flexDirection: 'row',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F1F5F9',
      borderRadius: 10,
      padding: 3,
      gap: 2,
    },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
    },
    activeTab: {
      backgroundColor: '#4F46E5',
    },
    tabText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.text,
    },
    activeTabText: {
      color: '#FFFFFF',
    },
    syncBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.15)' : '#EEF2FF',
    },
    syncBtnText: {
      fontSize: 12,
      fontWeight: '600',
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
      color: isDark ? '#94A3B8' : '#64748B',
      marginTop: 12,
    },
    scrollContent: {
      flex: 1,
    },
    scrollInner: {
      padding: 16,
      paddingBottom: 40,
    },
  });
}
