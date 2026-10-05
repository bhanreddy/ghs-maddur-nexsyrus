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
import { useRouter } from 'expo-router';
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

export default function AccountsCalendarScreen() {
  const router = useRouter();
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
      alertCompat('Error', 'Failed to load accounts calendar');
    }
  }, [currentDate]);

  const fetchDayStatus = useCallback(async (date: string) => {
    try {
      const status = await calendarService.getDayStatus(date);
      setDayStatus(status);
    } catch {
      // optional
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
      {/* Header */}
      <TourTarget id="screen.accounts-calendar.overview" native><View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <Text style={styles.headerTitle}>Financial & Academic Calendar</Text>
          <Text style={styles.headerSub}>Fee due dates, payroll cycles, and terms</Text>
        </View>
        <TouchableOpacity style={styles.exportBtn} onPress={handleExportIcs}>
          <Ionicons name="download-outline" size={18} color="#4F46E5" />
        </TouchableOpacity>
      </View></TourTarget>

      {/* Toolbar */}
      <TourTarget id="screen.accounts-calendar.workspace" native><View style={styles.toolbar}>
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
              Fee Schedule
            </Text>
          </TouchableOpacity>
        </View>
      </View></TourTarget>

      {loading ? (
        <View style={styles.centeredLoader}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingLabel}>Loading Accounts Calendar...</Text>
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
                onSelectDate={(d) => {
                  setSelectedDate(d);
                  fetchDayStatus(d);
                }}
                onChangeMonth={(delta) => {
                  const next = new Date(currentDate);
                  next.setMonth(next.getMonth() + delta);
                  setCurrentDate(next);
                }}
                onGoToday={() => {
                  const today = new Date();
                  setCurrentDate(today);
                  const todayStr = today.toISOString().split('T')[0];
                  setSelectedDate(todayStr);
                  fetchDayStatus(todayStr);
                }}
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
              selectedEventType="FEE_DUE"
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 12,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : '#FFFFFF',
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.06)',
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9',
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleCol: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: theme.colors.text,
      letterSpacing: -0.3,
    },
    headerSub: {
      fontSize: 12,
      color: isDark ? '#94A3B8' : '#64748B',
      marginTop: 2,
    },
    exportBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.15)' : '#EEF2FF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 8,
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
