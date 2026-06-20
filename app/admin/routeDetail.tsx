import React, { useState, useCallback, useEffect, useRef } from 'react';
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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import AdminHeader from '../../src/components/AdminHeader';
import { api } from '../../src/services/apiClient';
import LogoLoader from '../../src/components/LogoLoader';
import { alertCompat } from '../../src/utils/crossPlatformAlert';

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

export default function RouteDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ routeId: string; routeName?: string }>();
  const routeId = String(params.routeId || '');
  const routeTitle = params.routeName ? decodeURIComponent(String(params.routeName)) : 'Route';

  const [direction, setDirection] = useState<string | null>(null);
  const [routeName, setRouteName] = useState('');
  const [stops, setStops] = useState<StopRow[]>([]);
  const [students, setStudents] = useState<StudentAssignRow[]>([]);
  const [liveTrip, setLiveTrip] = useState<LivePayload['trip'] | null>(null);
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

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadAll = useCallback(async () => {
    if (!routeId) return;
    try {
      setLoading(true);
      const [stopsRes, studentsRes, liveRes, routeBundle] = await Promise.all([
        api.get<StopRow[]>(`/transport/routes/${routeId}/stops`),
        api.get<StudentAssignRow[]>(`/transport/routes/${routeId}/students`),
        api.get<LivePayload>(`/transport/routes/${routeId}/live`).catch(() => null),
        api.get<{ direction?: string | null; name?: string }>(`/transport/routes/${routeId}`),
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
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await api.get<{ data?: any[] } | any[]>(`/students`, {
          search: q,
          limit: 20,
          page: 1,
        });
        const rows = Array.isArray(res) ? res : (res as { data?: any[] })?.data ?? [];
        setSearchResults(rows);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
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

  const tripBadge = () => {
    const raw = liveTrip?.ui_status || liveTrip?.status;
    if (!liveTrip) return { label: 'No trip today', bg: '#F3F4F6', fg: '#6B7280' };
    if (raw === 'completed') return { label: 'Completed', bg: '#E5E7EB', fg: '#374151' };
    if (raw === 'scheduled') return { label: 'Scheduled', bg: '#FEF3C7', fg: '#92400E' };
    if (raw === 'in_progress' || raw === 'active') return { label: 'In progress', bg: '#DBEAFE', fg: '#1D4ED8' };
    return { label: raw || '—', bg: '#F3F4F6', fg: '#374151' };
  };

  const tripChip = tripBadge();

  const renderStop = ({ item, drag, isActive, getIndex }: RenderItemParams<StopRow>) => {
    const index = getIndex?.() ?? stops.findIndex((s) => s.id === item.id);
    const canMoveUp = index > 0;
    const canMoveDown = index >= 0 && index < stops.length - 1;

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
        <View style={[styles.stopCard, isActive && { opacity: 0.9 }]}>
          <View style={styles.orderBadge}>
            <Text style={styles.orderBadgeTxt}>{item.stop_order}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.stopName} numberOfLines={2}>{item.name || 'Unnamed stop'}</Text>
            <Text style={styles.stopMeta}>{studentCountAtStop(item.id)} student(s)</Text>
          </View>
          <TouchableOpacity
            onPress={() => openEditStopModal(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.stopActionBtn}
          >
            <Ionicons name="create-outline" size={20} color="#4338CA" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => confirmDeleteStop(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.stopActionBtn}
          >
            <Ionicons name="trash-outline" size={20} color="#DC2626" />
          </TouchableOpacity>
          <View style={styles.stopReorderCol}>
            <TouchableOpacity
              onPress={() => moveStop(index, index - 1)}
              disabled={!canMoveUp}
              style={[styles.stopMoveBtn, !canMoveUp && styles.stopMoveBtnDisabled]}
              hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-up" size={18} color={canMoveUp ? '#4338CA' : '#CBD5E1'} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => moveStop(index, index + 1)}
              disabled={!canMoveDown}
              style={[styles.stopMoveBtn, !canMoveDown && styles.stopMoveBtnDisabled]}
              hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
            >
              <Ionicons name="chevron-down" size={18} color={canMoveDown ? '#4338CA' : '#CBD5E1'} />
            </TouchableOpacity>
          </View>
          <Pressable
            onLongPress={drag}
            delayLongPress={Platform.OS === 'web' ? 200 : 120}
            style={({ pressed }) => [
              styles.dragHandle,
              pressed && styles.dragHandlePressed,
              Platform.OS === 'web' && { cursor: 'grab' as const },
            ]}
          >
            <Ionicons name="reorder-three" size={28} color="#94A3B8" />
          </Pressable>
        </View>
      </Swipeable>
    </ScaleDecorator>
    );
  };

  if (loading && stops.length === 0 && students.length === 0) {
    return (
      <View style={styles.container}>
        <AdminHeader
          title={routeTitle}
          showBackButton
          showProfileButton={false}
          rightAction={{ icon: 'trash-outline', onPress: confirmDeleteRoute }}
        />
        <View style={styles.center}>
          <LogoLoader size={56} color="#6366F1" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <AdminHeader
        title={routeTitle}
        showBackButton
        showProfileButton={false}
        rightAction={{ icon: 'trash-outline', onPress: confirmDeleteRoute }}
      />

      <View style={styles.headerRow}>
        {direction ? (
          <View style={styles.dirChip}>
            <Text style={styles.dirChipTxt}>{direction}</Text>
          </View>
        ) : null}
        <View style={[styles.tripChip, { backgroundColor: tripChip.bg }]}>
          <Text style={[styles.tripChipTxt, { color: tripChip.fg }]}>{tripChip.label}</Text>
        </View>
        <TouchableOpacity style={styles.routeEditLink} onPress={openEditRouteModal}>
          <Ionicons name="create-outline" size={16} color="#4338CA" />
          <Text style={styles.routeEditLinkTxt}>Edit route</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.routeDeleteLink} onPress={confirmDeleteRoute}>
          <Ionicons name="trash-outline" size={16} color="#DC2626" />
          <Text style={styles.routeDeleteLinkTxt}>Delete route</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.driverRow}>
        <Text style={styles.driverLabel}>Driver assignment</Text>
        <TouchableOpacity style={styles.linkBtn} onPress={openDrivers}>
          <Text style={styles.linkBtnTxt}>Assign / change driver</Text>
          <Ionicons name="chevron-forward" size={18} color="#4338CA" />
        </TouchableOpacity>
      </View>

      <View style={styles.switchRow}>
        <TouchableOpacity
          style={[styles.switchBtn, tab === 'stops' && styles.switchOn]}
          onPress={() => setTab('stops')}
        >
          <Text style={[styles.switchTxt, tab === 'stops' && styles.switchTxtOn]}>Stops</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.switchBtn, tab === 'students' && styles.switchOn]}
          onPress={() => setTab('students')}
        >
          <Text style={[styles.switchTxt, tab === 'students' && styles.switchTxtOn]}>Students</Text>
        </TouchableOpacity>
      </View>

      {tab === 'stops' ? (
        <>
          {stops.length > 1 ? (
            <Text style={styles.reorderHint}>
              Use arrows or drag the handle to set stop order
            </Text>
          ) : null}
          <DraggableFlatList
            data={stops}
            keyExtractor={(item) => item.id}
            onDragEnd={onDragEndStops}
            renderItem={renderStop}
            ListFooterComponent={
              <TouchableOpacity style={styles.addFab} onPress={() => setAddStopOpen(true)}>
                <Ionicons name="add-circle" size={22} color="#4338CA" />
                <Text style={styles.addFabTxt}>Add stop</Text>
              </TouchableOpacity>
            }
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          />
        </>
      ) : (
        <>
          <TouchableOpacity
            style={styles.assignBtn}
            onPress={() => {
              setAssignOpen(true);
              setAssignStep(1);
              setPickedStudent(null);
              setSearchQ('');
            }}
          >
            <Ionicons name="person-add-outline" size={20} color="#fff" />
            <Text style={styles.assignBtnTxt}>Assign student</Text>
          </TouchableOpacity>
          <FlatList
            data={students}
            keyExtractor={(item) => item.assignment_id}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            renderItem={({ item }) => (
              <View style={styles.studentCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.studentName}>{item.student_name}</Text>
                  <Text style={styles.studentMeta}>
                    {item.admission_no} · {item.class_name ?? '—'}{' '}
                    {item.section_name ? `· ${item.section_name}` : ''}
                  </Text>
                  <View style={styles.stopChip}>
                    <Text style={styles.stopChipTxt}>{item.stop_name || 'Stop'}</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => removeStudent(item.student_id)}>
                  <Text style={styles.removeTxt}>Remove</Text>
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.empty}>No students on this route.</Text>}
          />
        </>
      )}

      <Modal visible={driverModal} transparent animationType="slide">
        <Pressable style={styles.modalBackdrop} onPress={() => setDriverModal(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Select driver</Text>
            <FlatList
              data={drivers}
              keyExtractor={(d) => d.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.driverPick}
                  onPress={() => assignDriver(item.id)}
                >
                  <Text style={styles.driverPickName}>{item.display_name}</Text>
                  {item.current_route_name ? (
                    <Text style={styles.driverPickSub}>On: {item.current_route_name}</Text>
                  ) : (
                    <Text style={styles.driverPickSub}>Not assigned to a route</Text>
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.empty}>No drivers found</Text>}
            />
            <TouchableOpacity style={styles.cancelSheet} onPress={() => setDriverModal(false)}>
              <Text>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={editRouteOpen} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <Pressable style={styles.modalBackdropInner} onPress={() => !savingRoute && setEditRouteOpen(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.sheetTitle}>Edit route</Text>
              <Text style={styles.fieldLabel}>Route name</Text>
              <TextInput
                style={styles.input}
                placeholder="Route name"
                value={editRouteName}
                onChangeText={setEditRouteName}
              />
              <Text style={styles.fieldLabel}>Trip direction</Text>
              <View style={styles.dirRow}>
                {(['morning', 'afternoon', 'evening', 'both'] as const).map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.dirPick, editRouteDirection === d && styles.dirPickOn]}
                    onPress={() => setEditRouteDirection(d)}
                  >
                    <Text style={[styles.dirPickTxt, editRouteDirection === d && styles.dirPickTxtOn]}>
                      {d}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.sheetActions}>
                <TouchableOpacity onPress={() => setEditRouteOpen(false)} disabled={savingRoute}>
                  <Text style={savingRoute ? styles.disabledLink : undefined}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveEditRoute} disabled={savingRoute}>
                  <Text style={[styles.primaryLink, savingRoute && styles.disabledLink]}>
                    {savingRoute ? 'Saving…' : 'Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={editStopOpen} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <Pressable style={styles.modalBackdropInner} onPress={() => !savingStop && setEditStopOpen(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.sheetTitle}>Edit stop</Text>
              <TextInput
                style={styles.input}
                placeholder="Stop name"
                value={editStopName}
                onChangeText={setEditStopName}
              />
              <View style={styles.sheetActions}>
                <TouchableOpacity onPress={() => setEditStopOpen(false)} disabled={savingStop}>
                  <Text style={savingStop ? styles.disabledLink : undefined}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveEditStop} disabled={savingStop}>
                  <Text style={[styles.primaryLink, savingStop && styles.disabledLink]}>
                    {savingStop ? 'Saving…' : 'Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={addStopOpen} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <Pressable style={styles.modalBackdropInner} onPress={() => setAddStopOpen(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.sheetTitle}>New stop</Text>
              <TextInput
                style={styles.input}
                placeholder="Stop name"
                value={newStopName}
                onChangeText={setNewStopName}
              />
              <View style={styles.sheetActions}>
                <TouchableOpacity onPress={() => setAddStopOpen(false)} disabled={savingStop}>
                  <Text style={savingStop ? styles.disabledLink : undefined}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveNewStop} disabled={savingStop}>
                  <Text style={[styles.primaryLink, savingStop && styles.disabledLink]}>
                    {savingStop ? 'Saving…' : 'Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={assignOpen} transparent animationType="slide">
        <Pressable style={styles.modalBackdrop} onPress={() => setAssignOpen(false)}>
          <Pressable style={styles.sheetTall} onPress={(e) => e.stopPropagation()}>
            {assignStep === 1 ? (
              <>
                <Text style={styles.sheetTitle}>Find student</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Search name or admission no."
                  value={searchQ}
                  onChangeText={setSearchQ}
                />
                {searching ? <Text style={styles.empty}>Searching…</Text> : null}
                <FlatList
                  data={searchResults}
                  keyExtractor={(s) => s.id}
                  style={{ maxHeight: 360 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.searchRow}
                      onPress={() => {
                        setPickedStudent({
                          id: item.id,
                          name: item.person?.display_name || item.display_name || 'Student',
                        });
                        setAssignStep(2);
                      }}
                    >
                      <Text style={styles.studentName}>
                        {item.person?.display_name || item.display_name}
                      </Text>
                      <Text style={styles.studentMeta}>{item.admission_no}</Text>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    searchQ.trim().length >= 2 && !searching ? (
                      <Text style={styles.empty}>No results</Text>
                    ) : null
                  }
                />
              </>
            ) : (
              <>
                <Text style={styles.sheetTitle}>Boarding stop</Text>
                <Text style={styles.pickedName}>{pickedStudent?.name}</Text>
                <FlatList
                  data={stops}
                  keyExtractor={(s) => s.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.searchRow}
                      onPress={() => confirmAssignStudent(item.id)}
                    >
                      <Text style={styles.studentName}>{item.name}</Text>
                      <Text style={styles.studentMeta}>Order {item.stop_order}</Text>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={<Text style={styles.empty}>Add stops first</Text>}
                />
                <TouchableOpacity onPress={() => setAssignStep(1)}>
                  <Text style={styles.primaryLink}>← Back to search</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={styles.cancelSheet} onPress={() => setAssignOpen(false)}>
              <Text>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    flexWrap: 'wrap',
  },
  dirChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  dirChipTxt: { fontSize: 12, fontWeight: '700', color: '#4338CA', textTransform: 'capitalize' },
  tripChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  tripChipTxt: { fontSize: 12, fontWeight: '700' },
  routeEditLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  routeEditLinkTxt: { color: '#4338CA', fontWeight: '700', fontSize: 12 },
  routeDeleteLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FEF2F2',
  },
  routeDeleteLinkTxt: { color: '#DC2626', fontWeight: '700', fontSize: 12 },
  driverRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  driverLabel: { fontSize: 14, color: '#64748B', fontWeight: '600' },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkBtnTxt: { color: '#4338CA', fontWeight: '700', fontSize: 14 },
  switchRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    padding: 4,
  },
  switchBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  switchOn: { backgroundColor: '#fff' },
  switchTxt: { color: '#64748B', fontWeight: '600' },
  switchTxtOn: { color: '#111827' },
  stopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    flexWrap: 'nowrap',
  },
  orderBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderBadgeTxt: { fontWeight: '800', color: '#4338CA', fontSize: 14 },
  stopName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  stopMeta: { fontSize: 13, color: '#64748B', marginTop: 2 },
  stopActionBtn: {
    padding: 4,
  },
  stopReorderCol: {
    alignItems: 'center',
    marginRight: 4,
  },
  stopMoveBtn: {
    padding: 2,
  },
  stopMoveBtnDisabled: {
    opacity: 0.35,
  },
  dragHandle: {
    paddingHorizontal: 4,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  dragHandlePressed: {
    opacity: 0.7,
  },
  reorderHint: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginHorizontal: 16,
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  dirRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  dirPick: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dirPickOn: { backgroundColor: '#EEF2FF', borderColor: '#818CF8' },
  dirPickTxt: { fontSize: 13, fontWeight: '700', color: '#64748B', textTransform: 'capitalize' },
  dirPickTxtOn: { color: '#4338CA' },
  swipeDel: {
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    marginBottom: 10,
    borderRadius: 14,
  },
  addFab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  addFabTxt: { fontSize: 16, fontWeight: '700', color: '#4338CA' },
  assignBtn: {
    marginHorizontal: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#4338CA',
    paddingVertical: 12,
    borderRadius: 12,
  },
  assignBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  studentName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  studentMeta: { fontSize: 13, color: '#64748B', marginTop: 4 },
  stopChip: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#ECFDF5',
  },
  stopChipTxt: { fontSize: 12, fontWeight: '700', color: '#047857' },
  removeTxt: { color: '#DC2626', fontWeight: '700', fontSize: 14 },
  empty: { textAlign: 'center', color: '#94A3B8', marginTop: 24 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalBackdropInner: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: '70%',
  },
  sheetTall: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: '85%',
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12, color: '#111827' },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  sheetActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  primaryLink: { color: '#4338CA', fontWeight: '700', fontSize: 16 },
  disabledLink: { color: '#94A3B8' },
  driverPick: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  driverPickName: { fontSize: 16, fontWeight: '700' },
  driverPickSub: { fontSize: 13, color: '#64748B', marginTop: 4 },
  cancelSheet: { alignItems: 'center', paddingVertical: 14 },
  searchRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  pickedName: { fontSize: 15, fontWeight: '600', marginBottom: 12, color: '#334155' },
})
