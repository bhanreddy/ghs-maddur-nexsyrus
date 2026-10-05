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
import { EventDetailModal } from '../../src/components/calendar/EventDetailModal';

export default function DriverCalendarScreen() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const styles = React.useMemo(() => getStyles(theme, isDark), [theme, isDark]);

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
      // Driver calendar fails gracefully
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

  const selectedDayEvents = React.useMemo(() => {
    return events.filter((ev) => {
      const start = ev.start_date;
      const end = ev.end_date || start;
      return selectedDate >= start && selectedDate <= end;
    });
  }, [events, selectedDate]);

  return (
    <TourTarget id="screen.driver-calendar.workspace" native><View style={styles.container}>
      {/* Driver Header */}
      <TourTarget id="screen.driver-calendar.overview" native><View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Transport Calendar</Text>
          <Text style={styles.headerSub}>Bus trip schedule & school working days</Text>
        </View>
      </View></TourTarget>

      {/* Bus Schedule Banner for Selected Day */}
      {dayStatus && (
        <View
          style={[
            styles.busBanner,
            dayStatus.isHoliday ? styles.busBannerHoliday : styles.busBannerWorking,
          ]}
        >
          <Ionicons
            name={dayStatus.isHoliday ? 'moon-outline' : 'bus-outline'}
            size={22}
            color={dayStatus.isHoliday ? '#DC2626' : '#059669'}
          />
          <View style={styles.busBannerInfo}>
            <Text style={styles.busBannerTitle}>
              {dayStatus.isHoliday
                ? 'No Bus Operations (Holiday)'
                : 'Bus Trips Active (Regular Schedule)'}
            </Text>
            <Text style={styles.busBannerSub}>
              {dayStatus.isHoliday
                ? `${dayStatus.holidayName || 'Official Holiday'} - All transport routes suspended`
                : 'Morning & evening student pickups/dropoffs operate as normal'}
            </Text>
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.centeredLoader}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingLabel}>Loading Transport Calendar...</Text>
        </View>
      ) : (
        <TourScrollView
          style={styles.scrollContent}
          contentContainerStyle={styles.scrollInner}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          <CalendarMonthGrid
            currentDate={currentDate}
            selectedDate={selectedDate}
            events={events}
            onSelectDate={(date) => {
              setSelectedDate(date);
              fetchDayStatus(date);
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
        </TourScrollView>
      )}

      <EventDetailModal
        visible={!!selectedEvent}
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        isAdmin={false}
      />
    </View></TourTarget>
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
    headerTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: theme.colors.text,
      letterSpacing: -0.3,
    },
    headerSub: {
      fontSize: 12,
      color: isDark ? '#94A3B8' : '#64748B',
      marginTop: 2,
    },
    busBanner: {
      ...clayCard(isDark, 'sm'),
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      margin: 16,
      marginBottom: 0,
      padding: 14,
    },
    busBannerWorking: {
      borderColor: isDark ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
    },
    busBannerHoliday: {
      borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : '#FECACA',
    },
    busBannerInfo: {
      flex: 1,
    },
    busBannerTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.text,
    },
    busBannerSub: {
      fontSize: 12,
      color: isDark ? '#94A3B8' : '#64748B',
      marginTop: 2,
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
