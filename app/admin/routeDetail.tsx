import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  Pressable,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ViewStyle,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolateColor,
  FadeInDown,
  FadeInUp,
  Layout,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import AdminHeader from '../../src/components/AdminHeader';
import { api } from '../../src/services/apiClient';
import LogoLoader from '../../src/components/LogoLoader';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { useTheme } from '../../src/hooks/useTheme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type StopRow = {
  id: string;
  name: string;
  stop_order: number;
  latitude?: number | null;
  longitude?: number | null;
};

type StudentAssignRow = {
  assignment_id: string;
  student_id: string;
  stop_id: string;
  student_name?: string;
  admission_no?: string;
  class_name?: string | null;
  section_name?: string | null;
  stop_name?: string | null;
};

type DriverRow = {
  id: string;
  display_name: string;
  photo_url?: string | null;
  currently_assigned_route_id?: string | null;
  current_route_name?: string | null;
};

type LivePayload = {
  route: string;
  trip: { ui_status?: string; status?: string } | null;
  stops: Array<{ id: string; name: string; stop_order: number }>;
};

// ─── PressScale Helper ────────────────────────────────────────────────────────
function PressScale({ children, onPress, style, disabled }: any) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => { s.value = withTiming(0.96, { duration: 80 }); }}
      onPressOut={() => { s.value = withTiming(1, { duration: 100 }); }}
      onPress={onPress}
      hitSlop={6}
    >
      <Animated.View style={[style, a]}>{children}</Animated.View>
    </Pressable>
  );
}

// ─── ClayView Primitives ──────────────────────────────────────────────────────
type ClayViewProps = {
  children: React.ReactNode;
  color?: string;
  radius?: number;
  style?: ViewStyle | ViewStyle[];
  flat?: boolean;
};

function ClayView({ children, color = '#FFFFFF', radius = 20, style, flat }: ClayViewProps) {
  const { isDark } = useTheme();

  if (Platform.OS === 'ios' && !flat) {
    return (
      <View style={[
        {
          borderRadius: radius,
          shadowColor: isDark ? '#000000' : '#94A3B8',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: isDark ? 0.35 : 0.12,
          shadowRadius: 10,
        },
        style
      ]}>
        <View style={{
          backgroundColor: color,
          borderRadius: radius,
          overflow: 'hidden',
          borderBottomWidth: 1.5,
          borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(76,90,120,0.08)',
          flex: 1,
        }}>
          <LinearGradient
            colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.6, y: 0.9 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {children}
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        {
          backgroundColor: color,
          borderRadius: radius,
          overflow: 'hidden',
          borderBottomWidth: 1.5,
          borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(76,90,120,0.08)',
        },
        !flat && Platform.select({ android: { elevation: 3 }, default: {} }),
        style,
      ]}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 0.9 }}
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

// ─── SegmentedTabs with Indicator ──────────────────────────────────────────────
function SegmentedTabs({ tabs, active, onChange }: { tabs: string[]; active: number; onChange: (i: number) => void }) {
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  const { theme } = useTheme();

  useEffect(() => {
    x.value = withSpring(active * (w / tabs.length), { damping: 20, stiffness: 180 });
  }, [active, w]);

  const ind = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width - 8)}
      style={[
        styles.tabsContainer,
        { backgroundColor: theme.colors.borderLight }
      ]}
    >
      {w > 0 && (
        <Animated.View style={[
          styles.tabIndicator,
          {
            width: w / tabs.length,
            backgroundColor: theme.colors.surface,
            shadowColor: theme.colors.textMuted,
          },
          ind
        ]} />
      )}
      {tabs.map((t, i) => (
        <Pressable
          key={t}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onChange(i);
          }}
          style={styles.tabPressable}
        >
          <Text style={[
            styles.tabText,
            {
              color: i === active
                ? theme.colors.textStrong
                : theme.colors.textSecondary,
              fontWeight: i === active ? '700' : '600',
            }
          ]}>
            {t}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── Animated Focus TextInput ───────────────────────────────────────────────
function PremiumField({ label, value, onChangeText, placeholder, secureTextEntry }: {
  label?: string; value: string; onChangeText: (t: string) => void; placeholder?: string; secureTextEntry?: boolean; isDark?: boolean;
}) {
  const focus = useSharedValue(0);
  const { theme } = useTheme();
  const border = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focus.value, [0, 1], [
      theme.colors.border,
      theme.colors.primary
    ]),
  }));

  return (
    <View style={{ marginBottom: 16 }}>
      {label && <Text style={[styles.fieldLabel, { color: theme.colors.textSecondary }]}>{label}</Text>}
      <Animated.View style={[
        styles.fieldContainer,
        { backgroundColor: theme.colors.background },
        border
      ]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textMuted}
          secureTextEntry={secureTextEntry}
          onFocus={() => { focus.value = withTiming(1, { duration: 150 }); }}
          onBlur={() => { focus.value = withTiming(0, { duration: 150 }); }}
          style={[styles.fieldInput, { color: theme.colors.textStrong }]}
        />
      </Animated.View>
    </View>
  );
}

export default function RouteDetailScreen() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const params = useLocalSearchParams<{ routeId: string; routeName?: string }>();
  const routeId = String(params.routeId || '');
  const routeTitle = params.routeName ? decodeURIComponent(String(params.routeName)) : 'Route';

  const [direction, setDirection] = useState<string | null>(null);
  const [routeName, setRouteName] = useState('');
  const [stops, setStops] = useState<StopRow[]>([]);
  const [students, setStudents] = useState<StudentAssignRow[]>([]);
  const [liveTrip, setLiveTrip] = useState<LivePayload['trip'] | null>(null);
  const [assignedDriver, setAssignedDriver] = useState<{ id: string; name: string; photo_url?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'stops' | 'students'>('stops');

  const [driverModal, setDriverModal] = useState(false);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [addStopOpen, setAddStopOpen] = useState(false);
  const [newStopName, setNewStopName] = useState('');
  const [savingStop, setSavingStop] = useState(false);
  const [editRouteOpen, setEditRouteOpen] = useState(false);
  const [editRouteName, setEditRouteName] = useState('');
  const [editRouteDirection, setEditRouteDirection] = useState<'morning' | 'afternoon' | 'evening' | 'both'>('both');
  const [editStopOpen, setEditStopOpen] = useState(false);
  const [editStopId, setEditStopId] = useState<string | null>(null);
  const [editStopName, setEditStopName] = useState('');
  const [savingRoute, setSavingRoute] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignStep, setAssignStep] = useState<1 | 2>(1);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [pickedStudent, setPickedStudent] = useState<{ id: string; name: string } | null>(null);
  const [currentAyId, setCurrentAyId] = useState<string | null>(null);

  const [expandedStopId, setExpandedStopId] = useState<string | null>(null);
  const [bulkAssignModal, setBulkAssignModal] = useState<StopRow | null>(null);
  const [bulkSearchQ, setBulkSearchQ] = useState('');
  const [bulkSearchResults, setBulkSearchResults] = useState<any[]>([]);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bulkSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadAll = useCallback(async () => {
    if (!routeId) return;
    try {
      setLoading(true);
      const [stopsRes, studentsRes, liveRes, routeBundle] = await Promise.all([
        api.get<StopRow[]>(`/transport/routes/${routeId}/stops`),
        api.get<StudentAssignRow[]>(`/transport/routes/${routeId}/students`),
        api.get<LivePayload>(`/transport/routes/${routeId}/live`).catch(() => null),
        api.get<{ direction?: string | null; name?: string; driver?: any }>(`/transport/routes/${routeId}`),
      ]);
      setStops(
        Array.isArray(stopsRes)
          ? [...stopsRes].sort((a, b) => (a.stop_order ?? 0) - (b.stop_order ?? 0))
          : [],
      );
      setStudents(Array.isArray(studentsRes) ? studentsRes : []);
      setLiveTrip(liveRes?.trip ?? null);
      setDirection(routeBundle?.direction ?? null);
      setRouteName(routeBundle?.name ?? routeTitle);
      setAssignedDriver(
        routeBundle?.driver
          ? { id: routeBundle.driver.driver_id, name: routeBundle.driver.driver_name, photo_url: routeBundle.driver.photo_url }
          : null
      );
    } catch {
      alertCompat('Error', 'Could not load route');
    } finally {
      setLoading(false);
    }
  }, [routeId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    api.get<{ id: string }>('/transport/academic-years/current')
      .then((ay) => setCurrentAyId(ay?.id ?? null))
      .catch(() => setCurrentAyId(null));
  }, []);

  const openDrivers = async () => {
    try {
      const list = await api.get<DriverRow[]>('/transport/drivers');
      setDrivers(Array.isArray(list) ? list : []);
      setDriverModal(true);
    } catch {
      alertCompat('Error', 'Could not load drivers');
    }
  };

  const assignDriver = async (driverId: string) => {
    try {
      await api.post(`/transport/routes/${routeId}/assign-driver`, { driver_id: driverId });
      setDriverModal(false);
      await loadAll();
      alertCompat('Done', 'Driver assigned');
    } catch (e: any) {
      alertCompat('Error', e?.message || 'Assign failed');
    }
  };

  const studentCountAtStop = (stopId: string) =>
    students.filter((s) => s.stop_id === stopId).length;

  const onDragEndStops = async ({ data }: { data: StopRow[] }) => {
    const orderedIds = data.map((s) => s.id);
    const unchanged = orderedIds.every((id, i) => id === stops[i]?.id);
    if (unchanged) return;

    const prev = stops;
    setStops(data.map((s, i) => ({ ...s, stop_order: i + 1 })));
    try {
      await api.post(`/transport/routes/${routeId}/stops/reorder`, {
        orderedStopIds: orderedIds,
      });
    } catch (e: any) {
      setStops(prev);
      alertCompat('Error', e?.message || 'Reorder failed');
    }
  };

  const moveStop = async (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= stops.length || fromIndex === toIndex) return;
    const reordered = [...stops];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    await onDragEndStops({ data: reordered });
  };

  const confirmDeleteRoute = () => {
    alertCompat(
      'Delete Route?',
      'Are you sure you want to delete this route? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/transport/routes/${routeId}`);
              alertCompat('Done', 'Route deleted');
              router.back();
            } catch (e: any) {
              alertCompat('Error', e?.message || 'Could not delete route');
            }
          }
        }
      ]
    );
  };

  const confirmDeleteStop = (stop: StopRow) => {
    alertCompat(
      'Remove stop?',
      stop.name,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/transport/routes/${routeId}/stops/${stop.id}`);
              await loadAll();
            } catch (e: any) {
              alertCompat('Error', e?.message || 'Delete failed');
            }
          },
        },
      ]
    );
  };

  const saveNewStop = async () => {
    const name = newStopName.trim();
    if (!name) {
      alertCompat('Validation', 'Stop name is required');
      return;
    }
    try {
      setSavingStop(true);
      await api.post(`/transport/routes/${routeId}/stops/auto`, {
        name,
        latitude: null,
        longitude: null,
      });
      setNewStopName('');
      setAddStopOpen(false);
      await loadAll();
      alertCompat('Done', 'Stop added successfully');
    } catch (e: any) {
      alertCompat('Error', e?.message || 'Could not add stop');
    } finally {
      setSavingStop(false);
    }
  };

  const openEditRouteModal = () => {
    setEditRouteName(routeName || routeTitle);
    const dir = (direction || 'both') as typeof editRouteDirection;
    setEditRouteDirection(['morning', 'afternoon', 'evening', 'both'].includes(dir) ? dir : 'both');
    setEditRouteOpen(true);
  };

  const saveEditRoute = async () => {
    if (!editRouteName.trim()) {
      alertCompat('Validation', 'Route name is required');
      return;
    }
    try {
      setSavingRoute(true);
      await api.put(`/transport/routes/${routeId}`, {
        name: editRouteName.trim(),
        direction: editRouteDirection,
      });
      setRouteName(editRouteName.trim());
      setDirection(editRouteDirection);
      setEditRouteOpen(false);
      await loadAll();
      alertCompat('Done', 'Route updated');
    } catch (e: any) {
      alertCompat('Error', e?.message || 'Could not update route');
    } finally {
      setSavingRoute(false);
    }
  };

  const openEditStopModal = (stop: StopRow) => {
    setEditStopId(stop.id);
    setEditStopName(stop.name);
    setEditStopOpen(true);
  };

  const saveEditStop = async () => {
    if (!editStopId || !editStopName.trim()) {
      alertCompat('Validation', 'Stop name is required');
      return;
    }
    try {
      setSavingStop(true);
      await api.put(`/transport/stops/${editStopId}`, {
        name: editStopName.trim(),
      });
      setEditStopOpen(false);
      await loadAll();
      alertCompat('Done', 'Stop updated');
    } catch (e: any) {
      alertCompat('Error', e?.message || 'Could not update stop');
    } finally {
      setSavingStop(false);
    }
  };

  useEffect(() => {
    if (!assignOpen || assignStep !== 1) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = searchQ.trim();
    const delay = q.length === 0 ? 0 : 300;

    searchTimer.current = setTimeout(async () => {
      try {
        setSearching(true);
        const params: any = { limit: 20, page: 1 };
        if (q.length >= 2) {
          params.search = q;
        }
        const res = await api.get<{ data?: any[] } | any[]>(`/students`, params);
        const rows = Array.isArray(res) ? res : (res as { data?: any[] })?.data ?? [];
        setSearchResults(rows);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, delay);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQ, assignOpen, assignStep]);

  const confirmAssignStudent = async (stopId: string) => {
    if (!pickedStudent || !currentAyId) {
      alertCompat('Error', currentAyId ? 'Pick a student' : 'No active academic year');
      return;
    }
    try {
      await api.post('/transport/assign-student', {
        student_id: pickedStudent.id,
        route_id: routeId,
        stop_id: stopId,
        academic_year_id: currentAyId,
      });
      setAssignOpen(false);
      setAssignStep(1);
      setPickedStudent(null);
      setSearchQ('');
      await loadAll();
      alertCompat('Done', 'Student assigned');
    } catch (e: any) {
      alertCompat('Error', e?.message || 'Assignment failed');
    }
  };

  const removeStudent = (studentId: string) => {
    if (!currentAyId) {
      alertCompat('Error', 'No active academic year');
      return;
    }
    alertCompat(
      'Remove from route?',
      'This clears the student transport assignment for the current year.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(
                `/transport/assign-student/${studentId}?academic_year_id=${encodeURIComponent(currentAyId)}`,
              );
              await loadAll();
            } catch (e: any) {
              alertCompat('Error', e?.message || 'Remove failed');
            }
          },
        },
      ],
    );
  };

  useEffect(() => {
    if (!bulkAssignModal) return;
    if (bulkSearchTimer.current) clearTimeout(bulkSearchTimer.current);
    const q = bulkSearchQ.trim();
    const delay = q.length === 0 ? 0 : 300;

    bulkSearchTimer.current = setTimeout(async () => {
      try {
        setSearching(true);
        const params: any = { limit: 30, page: 1 };
        if (q.length >= 2) {
          params.search = q;
        }
        const res = await api.get<{ data?: any[] } | any[]>(`/students`, params);
        const rows = Array.isArray(res) ? res : (res as { data?: any[] })?.data ?? [];
        setBulkSearchResults(rows);
      } catch {
        setBulkSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, delay);
    return () => {
      if (bulkSearchTimer.current) clearTimeout(bulkSearchTimer.current);
    };
  }, [bulkSearchQ, bulkAssignModal]);

  const toggleBulkSelect = (id: string) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    setBulkSelected(new Set(bulkSearchResults.map((s) => s.id)));
  };

  const handleClearSelection = () => {
    setBulkSelected(new Set());
  };

  const confirmBulkAssign = async () => {
    if (!bulkAssignModal || bulkSelected.size === 0 || !currentAyId) {
      alertCompat('Error', 'Invalid selection or missing academic year.');
      return;
    }
    try {
      setBulkSaving(true);
      const studentIds = Array.from(bulkSelected);

      await api.post('/transport/assign-students-bulk', {
        student_ids: studentIds,
        route_id: routeId,
        stop_id: bulkAssignModal.id,
        academic_year_id: currentAyId,
      });

      setBulkAssignModal(null);
      setBulkSelected(new Set());
      setBulkSearchQ('');
      setExpandedStopId(bulkAssignModal.id);
      await loadAll();
      alertCompat('Done', `${studentIds.length} students assigned to ${bulkAssignModal.name}`);
    } catch (e: any) {
      alertCompat('Error', e?.message || 'Bulk assignment failed');
    } finally {
      setBulkSaving(false);
    }
  };

  const tripBadge = () => {
    const raw = liveTrip?.ui_status || liveTrip?.status;
    if (!liveTrip) return { label: 'No trip today', bg: '#F1F5F9', fg: '#64748B', tone: 'info' as const };
    if (raw === 'completed') return { label: 'Completed', bg: '#E6F4EA', fg: '#137333', tone: 'success' as const };
    if (raw === 'scheduled') return { label: 'Scheduled', bg: '#FEF3C7', fg: '#B45309', tone: 'warning' as const };
    if (raw === 'in_progress' || raw === 'active') return { label: 'In progress', bg: '#E8F0FE', fg: '#1A73E8', tone: 'info' as const };
    return { label: raw || '—', bg: '#F1F5F9', fg: '#64748B', tone: 'info' as const };
  };

  const tripChip = tripBadge();

  const renderStop = ({ item, drag, isActive, getIndex }: RenderItemParams<StopRow>) => {
    const index = getIndex?.() ?? stops.findIndex((s) => s.id === item.id);
    const canMoveUp = index > 0;
    const canMoveDown = index >= 0 && index < stops.length - 1;
    const isExpanded = expandedStopId === item.id;
    const stopStudents = students.filter(s => s.stop_id === item.id);

    return (
      <ScaleDecorator>
        <Swipeable
          renderRightActions={() => (
            <TouchableOpacity
              style={styles.swipeDel}
              onPress={() => confirmDeleteStop(item)}
            >
              <Ionicons name="trash-outline" size={22} color="#fff" />
            </TouchableOpacity>
          )}
        >
          <View style={[
            styles.stopCardOuter,
            isActive && { opacity: 0.9 },
            { borderColor: theme.colors.border }
          ]}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setExpandedStopId(isExpanded ? null : item.id);
              }}
              style={[styles.stopCardInner, { backgroundColor: theme.colors.surface }]}
            >
              <View style={[styles.orderBadge, { backgroundColor: theme.colors.navPill }]}>
                <Text style={styles.orderBadgeTxt}>{item.stop_order}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
                <Text style={[styles.stopName, { color: theme.colors.textStrong }]} numberOfLines={2}>
                  {item.name || 'Unnamed stop'}
                </Text>
                <Text style={styles.stopMeta}>{studentCountAtStop(item.id)} student(s)</Text>
              </View>

              <View style={styles.stopActionRow}>
                <TouchableOpacity
                  onPress={() => openEditStopModal(item)}
                  hitSlop={8}
                  style={[styles.stopActionBtn, { backgroundColor: theme.colors.borderLight }]}
                >
                  <Ionicons name="create-outline" size={18} color={theme.colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => confirmDeleteStop(item)}
                  hitSlop={8}
                  style={[styles.stopActionBtn, { backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2' }]}
                >
                  <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                </TouchableOpacity>
              </View>

              <View style={styles.stopReorderCol}>
                <TouchableOpacity
                  onPress={() => moveStop(index, index - 1)}
                  disabled={!canMoveUp}
                  style={styles.stopMoveBtn}
                  hitSlop={6}
                >
                  <Ionicons name="chevron-up" size={16} color={canMoveUp ? theme.colors.primary : theme.colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => moveStop(index, index + 1)}
                  disabled={!canMoveDown}
                  style={styles.stopMoveBtn}
                  hitSlop={6}
                >
                  <Ionicons name="chevron-down" size={16} color={canMoveDown ? theme.colors.primary : theme.colors.textMuted} />
                </TouchableOpacity>
              </View>

              <Pressable
                onLongPress={drag}
                delayLongPress={Platform.OS === 'web' ? 200 : 120}
                style={({ pressed }) => [
                  styles.dragHandle,
                  pressed && styles.dragHandlePressed,
                  Platform.OS === 'web' && ({ cursor: 'grab' } as any),
                ]}
              >
                <Ionicons name="reorder-three" size={26} color={theme.colors.textMuted} />
              </Pressable>
            </Pressable>

            {isExpanded && (
              <Animated.View
                entering={FadeInDown.duration(200)}
                style={[
                  styles.stopExpandedArea,
                  { backgroundColor: theme.colors.background, borderTopColor: theme.colors.border }
                ]}
              >
                <View style={styles.stopExpandedHeader}>
                  <Text style={styles.stopExpandedTitle}>Assigned Students</Text>
                  <TouchableOpacity
                    style={[styles.stopAddBtn, { backgroundColor: theme.colors.primary }]}
                    onPress={() => {
                      setBulkAssignModal(item);
                      setBulkSelected(new Set());
                      setBulkSearchQ('');
                    }}
                  >
                    <Ionicons name="add" size={16} color="#fff" />
                    <Text style={styles.stopAddBtnTxt}>Add Students</Text>
                  </TouchableOpacity>
                </View>

                {stopStudents.length > 0 ? (
                  stopStudents.map(st => (
                    <ClayView key={st.assignment_id} color={theme.colors.surface} radius={14} style={styles.expandedStudentRow} flat>
                      <View style={[styles.expandedAvatar, { backgroundColor: theme.colors.navPill }]}>
                        <Text style={[styles.expandedAvatarTxt, { color: theme.colors.primary }]}>
                          {st.student_name?.charAt(0) || 'S'}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.expandedStudentName, { color: theme.colors.textStrong }]}>{st.student_name}</Text>
                        <Text style={styles.expandedStudentMeta}>
                          {st.admission_no} • {st.class_name ?? '—'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => removeStudent(st.student_id)}
                        hitSlop={8}
                        style={styles.expandedRemoveBtn}
                      >
                        <Text style={styles.expandedRemoveBtnTxt}>Remove</Text>
                      </TouchableOpacity>
                    </ClayView>
                  ))
                ) : (
                  <Text style={styles.expandedEmpty}>No students assigned.</Text>
                )}
              </Animated.View>
            )}
          </View>
        </Swipeable>
      </ScaleDecorator>
    );
  };

  if (loading && stops.length === 0 && students.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <AdminHeader
          title={routeTitle}
          showBackButton
          showProfileButton={false}
          rightAction={{ icon: 'trash-outline', onPress: confirmDeleteRoute }}
        />
        <View style={styles.center}>
          <LogoLoader size={56} color={theme.colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <AdminHeader
        title={routeTitle}
        showBackButton
        showProfileButton={false}
        rightAction={{ icon: 'trash-outline', onPress: confirmDeleteRoute }}
      />

      <FlatList
        data={[]}
        renderItem={null}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            {/* Top Summarized Clay Card */}
            <ClayView color={theme.colors.card} style={styles.topSummaryCard}>
              <View style={styles.cardMainRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.routeHeadline, { color: theme.colors.textStrong }]} numberOfLines={1}>{routeName}</Text>
                  <Text style={[styles.routeSubtitle, { color: theme.colors.textSecondary }]}>
                    {stops.length} Stops · {students.length} Students assigned
                  </Text>
                </View>

                <View style={styles.cardRightControls}>
                  <View style={styles.pillsRow}>
                    {direction && (
                      <View style={[styles.badgePill, { backgroundColor: theme.colors.navPill }]}>
                        <Text style={[styles.badgePillTxt, { color: theme.colors.primary }]}>{direction}</Text>
                      </View>
                    )}
                    <View style={[styles.badgePill, { backgroundColor: tripChip.bg }]}>
                      <Text style={[styles.badgePillTxt, { color: tripChip.fg }]}>{tripChip.label}</Text>
                    </View>
                  </View>

                  <View style={styles.cardActionIcons}>
                    <TouchableOpacity style={styles.iconActionBtn} onPress={openEditRouteModal}>
                      <Ionicons name="create-outline" size={18} color={theme.colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconActionBtn} onPress={confirmDeleteRoute}>
                      <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </ClayView>

            {/* Driver Assignment Section */}
            <Text style={[styles.sectionHeading, { color: theme.colors.textSecondary }]}>DRIVER ASSIGNMENT</Text>
            <ClayView color={theme.colors.card} style={styles.driverSectionCard}>
              {assignedDriver ? (
                <View style={styles.driverProfileRow}>
                  <View style={[styles.driverAvatar, { backgroundColor: theme.colors.navPill }]}>
                    <Ionicons name="person" size={22} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.driverNameText, { color: theme.colors.textStrong }]}>{assignedDriver.name}</Text>
                    <Text style={styles.driverSubtext}>Assigned Route Driver</Text>
                  </View>
                  <PressScale onPress={openDrivers}>
                    <View style={[styles.changeDriverPill, { backgroundColor: theme.colors.borderLight }]}>
                      <Text style={[styles.changeDriverPillTxt, { color: theme.colors.primary }]}>Change</Text>
                    </View>
                  </PressScale>
                </View>
              ) : (
                <Pressable onPress={openDrivers} style={styles.driverEmptyRow}>
                  <View style={styles.driverEmptyIcon}>
                    <Ionicons name="person-add" size={20} color={theme.colors.textMuted} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.driverNameText, { color: theme.colors.textSecondary }]}>No driver assigned</Text>
                    <Text style={styles.driverSubtext}>Tap to assign a driver to this route</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                </Pressable>
              )}
            </ClayView>

            {/* Premium Animated Segmented Tabs */}
            <View style={{ marginVertical: 16 }}>
              <SegmentedTabs
                tabs={['Stops', 'Students']}
                active={tab === 'stops' ? 0 : 1}
                onChange={(idx) => setTab(idx === 0 ? 'stops' : 'students')}
              />
            </View>
          </View>
        }
        ListFooterComponent={
          tab === 'stops' ? (
            <View style={{ paddingHorizontal: 16, paddingBottom: 60 }}>
              {stops.length > 1 && (
                <Text style={styles.reorderHint}>
                  💡 Drag the handles or use arrow icons to set stop sequence order.
                </Text>
              )}

              <DraggableFlatList
                data={stops}
                keyExtractor={(item) => item.id}
                onDragEnd={onDragEndStops}
                renderItem={renderStop}
                scrollEnabled={false}
                ListFooterComponent={
                  <PressScale onPress={() => setAddStopOpen(true)}>
                    <View style={[styles.addStopButton, { borderColor: theme.colors.primary }]}>
                      <Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} />
                      <Text style={[styles.addStopBtnTxt, { color: theme.colors.primary }]}>Add Stop</Text>
                    </View>
                  </PressScale>
                }
              />
            </View>
          ) : (
            <View style={{ paddingHorizontal: 16, paddingBottom: 60 }}>
              <PressScale onPress={() => {
                setAssignOpen(true);
                setAssignStep(1);
                setPickedStudent(null);
                setSearchQ('');
              }}>
                <View style={[styles.assignStudentBtn, { backgroundColor: theme.colors.primary }]}>
                  <Ionicons name="person-add-outline" size={18} color="#fff" />
                  <Text style={styles.assignStudentBtnTxt}>Assign Student to Route</Text>
                </View>
              </PressScale>

              <FlatList
                data={students}
                keyExtractor={(item) => item.assignment_id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <ClayView color={theme.colors.card} style={styles.studentCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.studentCardName, { color: theme.colors.textStrong }]}>{item.student_name}</Text>
                      <Text style={styles.studentCardMeta}>
                        Adm. No: {item.admission_no} · Class: {item.class_name ?? '—'}{' '}
                        {item.section_name ? `(${item.section_name})` : ''}
                      </Text>
                      <View style={[styles.stopBadgePill, { backgroundColor: isDark ? 'rgba(16,185,129,0.12)' : '#ECFDF5' }]}>
                        <Ionicons name="location-sharp" size={12} color={theme.colors.success} />
                        <Text style={[styles.stopBadgePillTxt, { color: theme.colors.success }]}>
                          {item.stop_name || 'Stop'}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => removeStudent(item.student_id)}
                      style={styles.removeStudentBtn}
                    >
                      <Text style={styles.removeStudentBtnTxt}>Remove</Text>
                    </TouchableOpacity>
                  </ClayView>
                )}
                ListEmptyComponent={
                  <Text style={[styles.emptyStateText, { color: theme.colors.textMuted }]}>
                    No students currently assigned to this route.
                  </Text>
                }
              />
            </View>
          )
        }
      />

      {/* Select Driver Bottom Sheet */}
      <Modal visible={driverModal} transparent animationType="slide">
        <Pressable style={styles.modalBackdrop} onPress={() => setDriverModal(false)}>
          <AnimatedPressable entering={FadeInUp} style={[styles.sheetTall, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }]} onPress={(e: any) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: isDark ? '#FFFFFF' : '#111827' }]}>Select Driver</Text>
            <FlatList
              data={drivers}
              keyExtractor={(d) => d.id}
              style={{ maxHeight: 380 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.driverPickRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9' }]}
                  onPress={() => assignDriver(item.id)}
                >
                  <Text style={[styles.driverPickName, { color: isDark ? '#FFFFFF' : '#1E293B' }]}>{item.display_name}</Text>
                  {item.current_route_name ? (
                    <Text style={styles.driverPickSub}>Currently on: {item.current_route_name}</Text>
                  ) : (
                    <Text style={[styles.driverPickSub, { color: '#059669' }]}>Not assigned to route (Available)</Text>
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.emptyStateText}>No drivers found</Text>}
            />
            <TouchableOpacity style={styles.cancelSheet} onPress={() => setDriverModal(false)}>
              <Text style={styles.cancelSheetTxt}>Cancel</Text>
            </TouchableOpacity>
          </AnimatedPressable>
        </Pressable>
      </Modal>

      {/* Edit Route Modal */}
      <Modal visible={editRouteOpen} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <Pressable style={styles.modalBackdropInner} onPress={() => !savingRoute && setEditRouteOpen(false)}>
            <AnimatedPressable entering={FadeInDown} style={[styles.sheet, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }]} onPress={(e: any) => e.stopPropagation()}>
              <Text style={[styles.sheetTitle, { color: isDark ? '#FFFFFF' : '#111827' }]}>Edit Route</Text>
              
              <PremiumField
                label="Route Name"
                placeholder="Enter route name"
                value={editRouteName}
                onChangeText={setEditRouteName}
                isDark={isDark}
              />

              <Text style={[styles.fieldLabel, { color: isDark ? 'rgba(255,255,255,0.6)' : '#64748B', marginBottom: 8 }]}>Trip Direction</Text>
              <View style={styles.dirRow}>
                {(['morning', 'afternoon', 'evening', 'both'] as const).map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[
                      styles.dirPick,
                      { backgroundColor: isDark ? '#111827' : '#F3F4F6', borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB' },
                      editRouteDirection === d && [styles.dirPickOn, { borderColor: isDark ? '#818CF8' : '#4338CA' }]
                    ]}
                    onPress={() => setEditRouteDirection(d)}
                  >
                    <Text style={[
                      styles.dirPickTxt,
                      { color: isDark ? 'rgba(255,255,255,0.6)' : '#64748B' },
                      editRouteDirection === d && { color: isDark ? '#818CF8' : '#4338CA' }
                    ]}>
                      {d}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.sheetActions}>
                <TouchableOpacity onPress={() => setEditRouteOpen(false)} disabled={savingRoute}>
                  <Text style={[styles.cancelSheetTxt, savingRoute && styles.disabledLink]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveEditRoute} disabled={savingRoute}>
                  <Text style={[styles.primaryLink, { color: isDark ? '#818CF8' : '#4338CA' }, savingRoute && styles.disabledLink]}>
                    {savingRoute ? 'Saving…' : 'Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            </AnimatedPressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Stop Modal */}
      <Modal visible={editStopOpen} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <Pressable style={styles.modalBackdropInner} onPress={() => !savingStop && setEditStopOpen(false)}>
            <AnimatedPressable entering={FadeInDown} style={[styles.sheet, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }]} onPress={(e: any) => e.stopPropagation()}>
              <Text style={[styles.sheetTitle, { color: isDark ? '#FFFFFF' : '#111827' }]}>Edit Stop</Text>
              
              <PremiumField
                label="Stop Name"
                placeholder="Enter stop name"
                value={editStopName}
                onChangeText={setEditStopName}
                isDark={isDark}
              />

              <View style={styles.sheetActions}>
                <TouchableOpacity onPress={() => setEditStopOpen(false)} disabled={savingStop}>
                  <Text style={[styles.cancelSheetTxt, savingStop && styles.disabledLink]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveEditStop} disabled={savingStop}>
                  <Text style={[styles.primaryLink, { color: isDark ? '#818CF8' : '#4338CA' }, savingStop && styles.disabledLink]}>
                    {savingStop ? 'Saving…' : 'Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            </AnimatedPressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Stop Modal */}
      <Modal visible={addStopOpen} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <Pressable style={styles.modalBackdropInner} onPress={() => setAddStopOpen(false)}>
            <AnimatedPressable entering={FadeInDown} style={[styles.sheet, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }]} onPress={(e: any) => e.stopPropagation()}>
              <Text style={[styles.sheetTitle, { color: isDark ? '#FFFFFF' : '#111827' }]}>New Stop</Text>
              
              <PremiumField
                label="Stop Name"
                placeholder="Enter stop name"
                value={newStopName}
                onChangeText={setNewStopName}
                isDark={isDark}
              />

              <View style={styles.sheetActions}>
                <TouchableOpacity onPress={() => setAddStopOpen(false)} disabled={savingStop}>
                  <Text style={[styles.cancelSheetTxt, savingStop && styles.disabledLink]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveNewStop} disabled={savingStop}>
                  <Text style={[styles.primaryLink, { color: isDark ? '#818CF8' : '#4338CA' }, savingStop && styles.disabledLink]}>
                    {savingStop ? 'Saving…' : 'Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            </AnimatedPressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Bulk Assign Modal */}
      <Modal visible={!!bulkAssignModal} transparent animationType="slide">
        <Pressable style={styles.modalBackdrop} onPress={() => setBulkAssignModal(null)}>
          <AnimatedPressable entering={FadeInUp} style={[styles.sheetTall, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }]} onPress={(e: any) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: isDark ? '#FFFFFF' : '#111827' }]}>Add to {bulkAssignModal?.name}</Text>
            
            <PremiumField
              placeholder="Search student by name or admission no."
              value={bulkSearchQ}
              onChangeText={setBulkSearchQ}
              isDark={isDark}
            />

            {bulkSearchResults.length > 0 && (
              <View style={styles.selectionHelperRow}>
                <TouchableOpacity onPress={handleSelectAll}>
                  <Text style={[styles.helperLink, { color: theme.colors.primary }]}>Select All</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleClearSelection}>
                  <Text style={[styles.helperLink, { color: theme.colors.textSecondary }]}>Clear Selection</Text>
                </TouchableOpacity>
              </View>
            )}

            {searching ? <Text style={styles.emptyStateText}>Searching…</Text> : null}
            <FlatList
              data={bulkSearchResults}
              keyExtractor={(s) => s.id}
              style={{ maxHeight: 300 }}
              renderItem={({ item }) => {
                const isSelected = bulkSelected.has(item.id);
                return (
                  <TouchableOpacity
                    style={[
                      styles.searchRow,
                      { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9' },
                      isSelected && [styles.searchRowSelected, { backgroundColor: isDark ? 'rgba(99,102,241,0.15)' : '#EEF2FF' }]
                    ]}
                    onPress={() => toggleBulkSelect(item.id)}
                  >
                    <View style={[
                      styles.checkbox,
                      { borderColor: isDark ? 'rgba(255,255,255,0.3)' : '#CBD5E1' },
                      isSelected && [styles.checkboxSelected, { backgroundColor: isDark ? '#818CF8' : '#4338CA', borderColor: isDark ? '#818CF8' : '#4338CA' }]
                    ]}>
                      {isSelected && <Ionicons name="checkmark" size={12} color="#fff" />}
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[styles.studentCardName, { color: isDark ? '#FFFFFF' : '#1E293B' }]}>
                        {item.person?.display_name || item.display_name}
                      </Text>
                      <Text style={styles.studentCardMeta}>Adm. No: {item.admission_no}</Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                bulkSearchQ.trim().length >= 2 && !searching ? (
                  <Text style={styles.emptyStateText}>No results found</Text>
                ) : null
              }
            />
            <View style={styles.bulkActionRow}>
              <TouchableOpacity style={styles.cancelSheet} onPress={() => setBulkAssignModal(null)}>
                <Text style={styles.cancelSheetTxt}>Cancel</Text>
              </TouchableOpacity>
              <PressScale onPress={confirmBulkAssign} disabled={bulkSelected.size === 0 || bulkSaving}>
                <View style={[
                  styles.primaryActionBtn,
                  { backgroundColor: isDark ? '#6366F1' : '#4F46E5' },
                  bulkSelected.size === 0 && styles.primaryBtnDisabled
                ]}>
                  <Text style={styles.primaryBtnTxt}>
                    {bulkSaving ? 'Saving...' : `Assign ${bulkSelected.size} Student(s)`}
                  </Text>
                </View>
              </PressScale>
            </View>
          </AnimatedPressable>
        </Pressable>
      </Modal>

      {/* Single Assign Modal */}
      <Modal visible={assignOpen} transparent animationType="slide">
        <Pressable style={styles.modalBackdrop} onPress={() => setAssignOpen(false)}>
          <AnimatedPressable entering={FadeInUp} style={[styles.sheetTall, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }]} onPress={(e: any) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            {assignStep === 1 ? (
              <>
                <Text style={[styles.sheetTitle, { color: isDark ? '#FFFFFF' : '#111827' }]}>Find Student</Text>
                
                <PremiumField
                  placeholder="Search student by name or admission no."
                  value={searchQ}
                  onChangeText={setSearchQ}
                  isDark={isDark}
                />

                {searching ? <Text style={styles.emptyStateText}>Searching…</Text> : null}
                <FlatList
                  data={searchResults}
                  keyExtractor={(s) => s.id}
                  style={{ maxHeight: 300 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.searchRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9' }]}
                      onPress={() => {
                        setPickedStudent({
                          id: item.id,
                          name: item.person?.display_name || item.display_name || 'Student',
                        });
                        setAssignStep(2);
                      }}
                    >
                      <Text style={[styles.studentCardName, { color: isDark ? '#FFFFFF' : '#1E293B' }]}>
                        {item.person?.display_name || item.display_name}
                      </Text>
                      <Text style={styles.studentCardMeta}>Adm. No: {item.admission_no}</Text>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    searchQ.trim().length >= 2 && !searching ? (
                      <Text style={styles.emptyStateText}>No results found</Text>
                    ) : null
                  }
                />
              </>
            ) : (
              <>
                <Text style={[styles.sheetTitle, { color: isDark ? '#FFFFFF' : '#111827' }]}>Select Boarding Stop</Text>
                <Text style={[styles.pickedNameText, { color: isDark ? '#818CF8' : '#4338CA' }]}>{pickedStudent?.name}</Text>
                <FlatList
                  data={stops}
                  keyExtractor={(s) => s.id}
                  style={{ maxHeight: 300 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.searchRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9' }]}
                      onPress={() => confirmAssignStudent(item.id)}
                    >
                      <Text style={[styles.studentCardName, { color: isDark ? '#FFFFFF' : '#1E293B' }]}>{item.name}</Text>
                      <Text style={styles.studentCardMeta}>Stop Sequence Order: {item.stop_order}</Text>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={<Text style={styles.emptyStateText}>Please add stops to this route first</Text>}
                />
                <TouchableOpacity onPress={() => setAssignStep(1)} style={{ marginTop: 12 }}>
                  <Text style={[styles.primaryLink, { color: isDark ? '#818CF8' : '#4338CA' }]}>← Back to search</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={styles.cancelSheet} onPress={() => setAssignOpen(false)}>
              <Text style={styles.cancelSheetTxt}>Close</Text>
            </TouchableOpacity>
          </AnimatedPressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Top summary card styles (clay Mode B layout)
  topSummaryCard: {
    padding: 12,
    marginBottom: 10,
  },
  cardMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  pillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgePillTxt: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  cardActionIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconActionBtn: {
    padding: 4,
  },
  routeHeadline: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  routeSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },

  // Driver Assignment Section
  sectionHeading: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 4,
    marginTop: 2,
  },
  driverSectionCard: {
    padding: 10,
    marginBottom: 10,
  },
  driverProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverNameText: {
    fontSize: 14,
    fontWeight: '700',
  },
  driverSubtext: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  changeDriverPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  changeDriverPillTxt: {
    fontSize: 12,
    fontWeight: '700',
  },
  driverEmptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverEmptyIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(148,163,184,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.15)',
    borderStyle: 'dashed',
  },

  // Sliding tab styles
  tabsContainer: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 4,
    height: 48,
    alignItems: 'center',
  },
  selectionHelperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 10,
    marginTop: -4,
  },
  helperLink: {
    fontSize: 13,
    fontWeight: '700',
  },
  tabIndicator: {
    position: 'absolute',
    top: 4,
    left: 4,
    bottom: 4,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabPressable: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  tabText: {
    fontSize: 14,
  },

  // Stop Cards Accordion
  stopCardOuter: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  stopCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  orderBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderBadgeTxt: {
    fontWeight: '800',
    color: '#6366F1',
    fontSize: 14,
  },
  stopName: {
    fontSize: 15,
    fontWeight: '700',
  },
  stopMeta: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  stopActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 6,
  },
  stopActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopReorderCol: {
    alignItems: 'center',
    marginRight: 6,
  },
  stopMoveBtn: {
    padding: 2,
  },
  dragHandle: {
    paddingHorizontal: 4,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  dragHandlePressed: {
    opacity: 0.6,
  },
  reorderHint: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 10,
  },

  // Expanded Accordion Area
  stopExpandedArea: {
    borderTopWidth: 1,
    padding: 16,
  },
  stopExpandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  stopExpandedTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  stopAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  stopAddBtnTxt: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  expandedStudentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    marginBottom: 8,
  },
  expandedAvatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  expandedAvatarTxt: {
    fontWeight: '800',
    fontSize: 13,
  },
  expandedStudentName: {
    fontSize: 14,
    fontWeight: '700',
  },
  expandedStudentMeta: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  expandedRemoveBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  expandedRemoveBtnTxt: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '700',
  },
  expandedEmpty: {
    color: '#94A3B8',
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 12,
  },

  // Swipe Action
  swipeDel: {
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    marginBottom: 12,
    borderRadius: 16,
  },

  // Add stop button
  addStopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 16,
    marginTop: 4,
  },
  addStopBtnTxt: {
    fontSize: 15,
    fontWeight: '700',
  },

  // Assign Student
  assignStudentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  assignStudentBtnTxt: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },

  // Student Card
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 24,
    marginBottom: 12,
  },
  studentCardName: {
    fontSize: 15,
    fontWeight: '700',
  },
  studentCardMeta: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  stopBadgePill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stopBadgePillTxt: {
    fontSize: 11,
    fontWeight: '700',
  },
  removeStudentBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  removeStudentBtnTxt: {
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 12,
  },
  emptyStateText: {
    textAlign: 'center',
    marginTop: 24,
    fontSize: 14,
  },

  // Modal / Bottom Sheets
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 15, 25, 0.45)',
    justifyContent: 'flex-end',
  },
  modalBackdropInner: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  sheetTall: {
    width: '100%',
    maxWidth: 600,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingTop: 16,
    maxHeight: '85%',
    alignSelf: 'center',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#CBD5E1',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  fieldContainer: {
    borderRadius: 14,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  fieldInput: {
    height: 48,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  dirRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  dirPick: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  dirPickOn: {},
  dirPickTxt: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  primaryLink: {
    fontWeight: '700',
    fontSize: 15,
  },
  disabledLink: {
    opacity: 0.5,
  },
  cancelSheet: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelSheetTxt: {
    color: '#64748B',
    fontWeight: '700',
    fontSize: 15,
  },

  // Driver / Student selection in Modal
  driverPickRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  driverPickName: {
    fontSize: 15,
    fontWeight: '700',
  },
  driverPickSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 3,
  },
  searchRow: {
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 4,
  },
  searchRowSelected: {
    borderRadius: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {},
  pickedNameText: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  bulkActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  primaryActionBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: {
    backgroundColor: '#CBD5E1',
  },
  primaryBtnTxt: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
