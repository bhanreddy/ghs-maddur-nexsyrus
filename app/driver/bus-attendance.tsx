import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  Dimensions,
  StatusBar,
  Pressable,
  Platform,
  ViewStyle,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  FadeInUp,
  ZoomIn,
  Layout,
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/hooks/useTheme';
import StudentHeader from '../../src/components/StudentHeader';
import { api } from '../../src/services/apiClient';
import { BusAttendanceService, BusStopStudent } from '../../src/services/busAttendanceService';
import { alertCompat } from '../../src/utils/crossPlatformAlert';

const { width: SW } = Dimensions.get('window');
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ─── Status meta (clay-tinted) ─────────────────────────────────
const STATUS_META = {
  present: {
    label: 'Present',
    accent: '#00C48C',
    icon: 'checkmark-circle' as const,
    bgDark: 'rgba(0,196,140,0.16)',
    bgLight: 'rgba(0,196,140,0.12)',
    textDark: '#2DE0A8',
    textLight: '#00875F',
  },
  absent: {
    label: 'Absent',
    accent: '#FF4D6A',
    icon: 'close-circle' as const,
    bgDark: 'rgba(255,77,106,0.16)',
    bgLight: 'rgba(255,77,106,0.12)',
    textDark: '#FF7A90',
    textLight: '#C21F41',
  },
};

// ─── Clay shadow helper ─────────────────────────────────────────────────────
function clayShadow(isDark: boolean, intensity: 'soft' | 'medium' = 'soft'): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: isDark ? '#000000' : '#94A3B8',
      shadowOffset: { width: 0, height: intensity === 'medium' ? 14 : 8 },
      shadowOpacity: isDark ? (intensity === 'medium' ? 0.45 : 0.32) : (intensity === 'medium' ? 0.16 : 0.10),
      shadowRadius: intensity === 'medium' ? 24 : 14,
    },
    android: {
      elevation: intensity === 'medium' ? 9 : 4,
    },
    default: {},
  }) as ViewStyle;
}

// ─── Shared press-scale interaction ─────────────────────────────────────────
function usePressScale(minScale: number = 0.96) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const onPressIn = () => {
    scale.value = withTiming(minScale, { duration: 90 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };
  const onPressOut = () => {
    scale.value = withSpring(1, { damping: 14, stiffness: 220 });
  };
  return { style, onPressIn, onPressOut };
}

// ─── Stat chip ──────────────────────────────────────────────────────────────
function StatChip({ label, value, color, icon, isDark }: { label: string; value: number; color: string; icon: keyof typeof Ionicons.glyphMap; isDark: boolean }) {
  const bg = isDark ? `${color}22` : `${color}14`;
  return (
    <View style={[styles.statChip, { backgroundColor: bg }]}>
      <View style={styles.statChipTop}>
        <Ionicons name={icon} size={14} color={color} />
        <Text style={[styles.statChipValue, { color: isDark ? '#FFFFFF' : '#111827' }]}>{value}</Text>
      </View>
      <Text style={[styles.statChipLabel, { color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(17,24,39,0.55)' }]}>
        {label}
      </Text>
    </View>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function DriverBusStopAttendanceScreen() {
  const { isDark, theme } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Active trip & stops state
  const [trip, setTrip] = useState<any>(null);
  const [stops, setStops] = useState<any[]>([]);
  const [selectedStopIdx, setSelectedStopIdx] = useState<number>(-1);

  // Student list state
  const [students, setStudents] = useState<BusStopStudent[]>([]);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => { scrollY.value = e.contentOffset.y; },
  });

  const prevBtn = usePressScale(0.9);
  const nextBtn = usePressScale(0.9);
  const saveBtn = usePressScale(0.95);

  // Theme tokens
  const pageBg = isDark ? '#0E0F1A' : '#F4F5F9';
  const cardBg = isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  const titleColor = isDark ? '#FFFFFF' : '#111827';
  const subColor = isDark ? 'rgba(255,255,255,0.50)' : 'rgba(0,0,0,0.50)';
  const navBtnBg = isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB';
  const orb1Color = isDark ? 'rgba(124,111,255,0.08)' : 'rgba(124,111,255,0.04)';
  const orb2Color = isDark ? 'rgba(0,196,140,0.06)' : 'rgba(0,196,140,0.04)';

  // 1. Initial Checks: check if feature is enabled + load current trip
  const initScreen = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const settingsRes = await BusAttendanceService.isEnabled();
      setIsEnabled(settingsRes.enabled);

      if (!settingsRes.enabled) {
        setLoading(false);
        return;
      }

      // Load active trip
      const tripData = await api.get<any>('/transport/driver/my-trip');
      if (tripData?.trip) {
        setTrip(tripData.trip);
        setStops(tripData.stops || []);
        
        // Find first incomplete stop or default to first stop
        const firstPendingIdx = (tripData.stops || []).findIndex((s: any) => s.status !== 'completed');
        setSelectedStopIdx(firstPendingIdx !== -1 ? firstPendingIdx : 0);
      } else {
        setTrip(null);
        setStops([]);
        setSelectedStopIdx(-1);
      }
    } catch (error) {
      console.error('Failed to init bus stop attendance screen:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void initScreen();
  }, [initScreen]);

  // 2. Fetch students whenever stop selection changes
  const loadStopStudents = useCallback(async () => {
    if (selectedStopIdx < 0 || !stops[selectedStopIdx] || !trip) return;
    const currentStop = stops[selectedStopIdx];
    try {
      const studentData = await BusAttendanceService.getStopStudents(currentStop.stop_id, trip.id);
      
      // Default unset status to 'absent'
      const sanitized = studentData.map(s => ({
        ...s,
        attendance_status: s.attendance_status || 'absent'
      }));
      setStudents(sanitized);
    } catch (error) {
      console.error('Failed to load stop students:', error);
    }
  }, [selectedStopIdx, stops, trip]);

  useEffect(() => {
    void loadStopStudents();
  }, [loadStopStudents]);

  // 3. Status Flip handler
  const toggleStudentStatus = (studentId: string) => {
    Haptics.selectionAsync().catch(() => {});
    setStudents(prev =>
      prev.map(s => {
        if (s.student_id === studentId) {
          const nextStatus = s.attendance_status === 'present' ? 'absent' : 'present';
          return { ...s, attendance_status: nextStatus };
        }
        return s;
      })
    );
  };

  // 4. Save Attendance
  const handleSave = async () => {
    if (selectedStopIdx < 0 || !stops[selectedStopIdx] || !trip || saving) return;
    const currentStop = stops[selectedStopIdx];
    setSaving(true);
    try {
      const records = students.map(s => ({
        student_id: s.student_id,
        status: s.attendance_status || 'absent'
      }));

      await BusAttendanceService.markAttendance({
        trip_id: trip.id,
        stop_id: currentStop.stop_id,
        route_id: trip.route_id,
        date: new Date().toISOString().split('T')[0],
        attendance: records
      });

      alertCompat('✓ Saved', 'Stop attendance marked successfully.', [
        {
          text: 'OK',
          onPress: () => {
            // Suggest navigating to the next stop if available
            if (selectedStopIdx < stops.length - 1) {
              setSelectedStopIdx(prev => prev + 1);
            }
          }
        }
      ]);
    } catch (error: any) {
      alertCompat('Error', error?.message || 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAllPresent = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setStudents(prev => prev.map(s => ({ ...s, attendance_status: 'present' })));
  };

  // Stats
  const stats = useMemo(() => {
    let present = 0;
    let absent = 0;
    students.forEach(s => {
      if (s.attendance_status === 'present') present++;
      else absent++;
    });
    return {
      present,
      absent,
      remaining: students.length - (present + absent),
      total: students.length
    };
  }, [students]);

  const onRefresh = () => {
    setRefreshing(true);
    void initScreen(true);
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: pageBg, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#7C6FFF" />
      </View>
    );
  }

  if (isEnabled === false) {
    return (
      <View style={[styles.container, { backgroundColor: pageBg }]}>
        <StudentHeader title="Bus Attendance" menuUserType="driver" />
        <View style={styles.centerBox}>
          <Ionicons name="lock-closed-outline" size={60} color={subColor} />
          <Text style={[styles.emptyTitle, { color: titleColor }]}>Feature Disabled</Text>
          <Text style={[styles.emptySub, { color: subColor }]}>
            Bus stop attendance is currently disabled by the school administrator.
          </Text>
        </View>
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={[styles.container, { backgroundColor: pageBg }]}>
        <StudentHeader title="Bus Attendance" menuUserType="driver" />
        <View style={styles.centerBox}>
          <Ionicons name="bus-outline" size={64} color={subColor} />
          <Text style={[styles.emptyTitle, { color: titleColor }]}>No Active Trip</Text>
          <Text style={[styles.emptySub, { color: subColor }]}>
            Please start a trip first in the "My Trip" tab before taking attendance.
          </Text>
        </View>
      </View>
    );
  }

  const currentStop = stops[selectedStopIdx] || null;

  return (
    <View style={[styles.container, { backgroundColor: pageBg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={pageBg} />

      <View style={[styles.orb1, { backgroundColor: orb1Color }]} />
      <View style={[styles.orb2, { backgroundColor: orb2Color }]} />

      <StudentHeader title="Bus Attendance" menuUserType="driver" />

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? '#FFF' : '#7C6FFF'} />
        }
      >
        {/* ── Stop Navigation Card ── */}
        <Animated.View
          entering={FadeInDown.duration(400).springify()}
          style={[styles.clayCardWrap, { backgroundColor: cardBg }, clayShadow(isDark, 'medium')]}
        >
          <View style={[styles.clayCard, { borderColor: cardBorder }]}>
            <LinearGradient
              colors={isDark ? ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.7)', 'rgba(255,255,255,0)']}
              style={styles.cardSheen}
            />

            <View style={styles.cardHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.stopRouteName, { color: subColor }]}>
                  {trip.route_name || 'Route'} · STOP {selectedStopIdx + 1} OF {stops.length}
                </Text>
                <Text style={[styles.stopNameText, { color: titleColor }]} numberOfLines={1}>
                  {currentStop?.stop_name || 'Select Stop'}
                </Text>
              </View>

              <View style={styles.navButtons}>
                <AnimatedPressable
                  disabled={selectedStopIdx <= 0}
                  onPress={() => setSelectedStopIdx(prev => prev - 1)}
                  onPressIn={prevBtn.onPressIn}
                  onPressOut={prevBtn.onPressOut}
                  style={[
                    styles.navBtn,
                    { backgroundColor: navBtnBg, borderColor: cardBorder },
                    selectedStopIdx <= 0 && { opacity: 0.3 },
                    prevBtn.style
                  ]}
                >
                  <Ionicons name="chevron-back" size={18} color={subColor} />
                </AnimatedPressable>

                <AnimatedPressable
                  disabled={selectedStopIdx >= stops.length - 1}
                  onPress={() => setSelectedStopIdx(prev => prev + 1)}
                  onPressIn={nextBtn.onPressIn}
                  onPressOut={nextBtn.onPressOut}
                  style={[
                    styles.navBtn,
                    { backgroundColor: navBtnBg, borderColor: cardBorder },
                    selectedStopIdx >= stops.length - 1 && { opacity: 0.3 },
                    nextBtn.style
                  ]}
                >
                  <Ionicons name="chevron-forward" size={18} color={subColor} />
                </AnimatedPressable>
              </View>
            </View>

            {/* Stats chips */}
            <View style={styles.statChipsRow}>
              <StatChip label="Present" value={stats.present} color={STATUS_META.present.accent} icon="checkmark-circle" isDark={isDark} />
              <StatChip label="Absent" value={stats.absent} color={STATUS_META.absent.accent} icon="close-circle" isDark={isDark} />
              <StatChip label="Students" value={stats.total} color="#7C6FFF" icon="people" isDark={isDark} />
            </View>
          </View>
        </Animated.View>

        {/* ── Quick Actions ── */}
        {students.length > 0 && (
          <View style={styles.quickActionsRow}>
            <AnimatedPressable
              onPress={handleMarkAllPresent}
              style={[styles.quickActionBtn, { backgroundColor: isDark ? 'rgba(0,196,140,0.1)' : 'rgba(0,196,140,0.06)' }]}
            >
              <Ionicons name="checkmark-done" size={16} color={STATUS_META.present.accent} />
              <Text style={[styles.quickActionText, { color: STATUS_META.present.textLight }]}>Mark All Present</Text>
            </AnimatedPressable>
          </View>
        )}

        {/* ── Student List ── */}
        {students.length === 0 ? (
          <Animated.View entering={ZoomIn.duration(400)} style={styles.emptyBox}>
            <View style={styles.emptyIconRing}>
              <Ionicons name="people-outline" size={32} color="#7C6FFF" />
            </View>
            <Text style={[styles.emptyTitle, { color: titleColor }]}>No Passengers</Text>
            <Text style={[styles.emptySub, { color: subColor }]}>
              No students are assigned to boarding/deboarding at this stop.
            </Text>
          </Animated.View>
        ) : (
          <View style={styles.studentsList}>
            {students.map((student, index) => {
              const status = student.attendance_status || 'absent';
              const meta = STATUS_META[status];
              const pillBg = isDark ? meta.bgDark : meta.bgLight;
              const textClr = isDark ? meta.textDark : meta.textLight;

              return (
                <Animated.View
                  key={student.student_id}
                  entering={FadeInUp.delay(Math.min(index * 40, 200)).duration(350).springify()}
                  layout={Layout.springify()}
                  style={[styles.studentCardWrap, { backgroundColor: cardBg }, clayShadow(isDark, 'soft')]}
                >
                  <Pressable
                    onPress={() => toggleStudentStatus(student.student_id)}
                    style={[styles.studentCard, { borderColor: cardBorder }]}
                  >
                    <View style={styles.studentInfoCol}>
                      <Text style={[styles.studentName, { color: titleColor }]} numberOfLines={1}>
                        {student.student_name}
                      </Text>
                      <Text style={[styles.studentSub, { color: subColor }]}>
                        {student.class_name ? `${student.class_name}-${student.section_name}` : 'No Class'} · Adm: {student.admission_no || '—'}
                      </Text>
                    </View>

                    {/* Status Pill Badge */}
                    <View style={[styles.statusBadge, { backgroundColor: pillBg }]}>
                      <Ionicons name={meta.icon} size={14} color={textClr} style={{ marginRight: 4 }} />
                      <Text style={[styles.statusBadgeText, { color: textClr }]}>{meta.label}</Text>
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        )}

        {/* ── Save CTA ── */}
        {students.length > 0 && (
          <AnimatedPressable
            onPress={handleSave}
            onPressIn={saveBtn.onPressIn}
            onPressOut={saveBtn.onPressOut}
            style={[styles.saveBtn, { backgroundColor: theme.colors.primary }, saveBtn.style, clayShadow(isDark, 'soft')]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="save-outline" size={18} color="#FFF" />
                <Text style={styles.saveBtnText}>Save Stop Attendance</Text>
              </>
            )}
          </AnimatedPressable>
        )}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  orb1: { position: 'absolute', width: 300, height: 300, borderRadius: 150, top: -80, right: -100 },
  orb2: { position: 'absolute', width: 200, height: 200, borderRadius: 100, bottom: 80, left: -80 },

  scrollContent: { paddingTop: 96, paddingHorizontal: 20, paddingBottom: 100 },

  // Clay navigation card
  clayCardWrap: { borderRadius: 24, marginBottom: 16 },
  clayCard: { borderRadius: 24, padding: 16, borderWidth: 1, overflow: 'hidden' },
  cardSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 60 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  stopRouteName: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  stopNameText: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, marginTop: 4 },
  navButtons: { flexDirection: 'row', gap: 8 },
  navBtn: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },

  // Stats chips
  statChipsRow: { flexDirection: 'row', gap: 8 },
  statChip: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 14 },
  statChipTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statChipValue: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  statChipLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.2, marginTop: 2 },

  // Quick actions
  quickActionsRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 },
  quickActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 18 },
  quickActionText: { fontSize: 12, fontWeight: '700' },

  // Student list
  studentsList: { gap: 10, marginBottom: 20 },
  studentCardWrap: { borderRadius: 18 },
  studentCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderWidth: 1, borderRadius: 18, justifyContent: 'space-between' },
  studentInfoCol: { flex: 1, marginRight: 12 },
  studentName: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  studentSub: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  statusBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },

  // Save button
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 16, marginTop: 10, marginBottom: 20 },
  saveBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700', letterSpacing: 0.1 },

  // Empty state / Error state
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30, gap: 12 },
  emptyBox: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyIconRing: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(124,111,255,0.08)' },
  emptyTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3, textAlign: 'center' },
  emptySub: { fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
});
