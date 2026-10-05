import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  Modal,
  TextInput,
  Pressable,
  RefreshControl,
  Platform,
  useWindowDimensions,
  Switch,
  ScrollView,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AdminHeader from '../../src/components/AdminHeader';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { TransportService, BusItem } from '../../src/services/commonServices';
import { api } from '../../src/services/apiClient';
import { useTheme } from '../../src/hooks/useTheme';
import { Theme } from '../../src/theme/themes';
import LogoLoader from '../../src/components/LogoLoader';
import { LinearGradient } from 'expo-linear-gradient';

type LiveRouteRow = {
  route_id: string;
  route_name: string;
  trip_id: string | null;
  status: string | null;
  driver_name: string | null;
  last_stop_name: string | null;
};

type RouteRow = {
  id: string;
  name: string;
  direction?: string | null;
  stop_count?: number | string;
  student_count?: number | string;
  route_driver_name?: string | null;
  bus_id?: string | null;
  bus_no?: string | null;
};

type BusFilter = 'all' | 'needs' | 'no_driver' | 'no_route' | 'inactive';

const DIR_LABEL: Record<string, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  both: 'Both',
};

const BUS_FILTERS: { key: BusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'needs', label: 'Needs setup' },
  { key: 'no_driver', label: 'No driver' },
  { key: 'no_route', label: 'No route' },
  { key: 'inactive', label: 'Inactive' },
];

export default function AdminTransport() {
  const router = useRouter();
  const { theme } = useTheme();
  const styles = React.useMemo(() => getStyles(theme as any), [theme]);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [tab, setTab] = useState<'buses' | 'routes' | 'live' | 'safety' | 'settings'>('buses');
  const [transportData, setTransportData] = useState<BusItem[]>([]);
  const [routeRows, setRouteRows] = useState<RouteRow[]>([]);
  const [liveRows, setLiveRows] = useState<LiveRouteRow[]>([]);
  const [routeCount, setRouteCount] = useState(0);
  const [liveCount, setLiveCount] = useState(0);
  const [busAttendanceEnabled, setBusAttendanceEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const [safetyDashboard, setSafetyDashboard] = useState<{
    activeSosCount: number;
    unresolvedIncidentsCount: number;
    overspeedTodayCount: number;
    recentIncidents: any[];
  } | null>(null);
  const [safetyIncidents, setSafetyIncidents] = useState<any[]>([]);
  const [reconciling, setReconciling] = useState(false);

  const [busQuery, setBusQuery] = useState('');
  const [busFilter, setBusFilter] = useState<BusFilter>('all');
  const [routeQuery, setRouteQuery] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDirection, setNewDirection] = useState<'morning' | 'afternoon' | 'evening' | 'both'>('morning');
  const [creating, setCreating] = useState(false);

  // Bus Management State
  const [addBusOpen, setAddBusOpen] = useState(false);
  const [newBusNo, setNewBusNo] = useState('');
  const [newBusReg, setNewBusReg] = useState('');
  const [newBusCap, setNewBusCap] = useState('40');

  const [editBusOpen, setEditBusOpen] = useState(false);
  const [editBusId, setEditBusId] = useState<string | null>(null);
  const [editBusNo, setEditBusNo] = useState('');
  const [editBusReg, setEditBusReg] = useState('');
  const [editBusCap, setEditBusCap] = useState('');
  const [editBusActive, setEditBusActive] = useState(true);

  const [editRouteOpen, setEditRouteOpen] = useState(false);
  const [editRouteId, setEditRouteId] = useState<string | null>(null);
  const [editRouteName, setEditRouteName] = useState('');
  const [editRouteDirection, setEditRouteDirection] = useState<'morning' | 'afternoon' | 'evening' | 'both'>('morning');

  // Bus Assignment State — omit field to leave unchanged; null clears
  const [assignBusOpen, setAssignBusOpen] = useState(false);
  const [assignBusId, setAssignBusId] = useState<string | null>(null);
  const [assignBusLabel, setAssignBusLabel] = useState('');
  const [assignDriverId, setAssignDriverId] = useState<string | null>(null);
  const [assignRouteId, setAssignRouteId] = useState<string | null>(null);
  const [initialDriverId, setInitialDriverId] = useState<string | null>(null);
  const [initialRouteId, setInitialRouteId] = useState<string | null>(null);
  const [assignPickerQuery, setAssignPickerQuery] = useState('');
  const [assignFocus, setAssignFocus] = useState<'driver' | 'route'>('driver');
  const [drivers, setDrivers] = useState<any[]>([]);
  const [assignRoutes, setAssignRoutes] = useState<RouteRow[]>([]);

  const fetchTransportData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await TransportService.getAllBuses();
      setTransportData(data);
    } catch {
      alertCompat('Error', 'Failed to load transport data');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRoutes = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) setLoading(true);
      const data = await api.get<RouteRow[]>('/transport/routes');
      const rows = Array.isArray(data) ? data : [];
      setRouteRows(rows);
      setRouteCount(rows.length);
      return rows;
    } catch {
      if (!opts?.silent) alertCompat('Error', 'Failed to load routes');
      return [] as RouteRow[];
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  const fetchLive = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) setLoading(true);
      const data = await api.get<LiveRouteRow[]>('/transport/live-today');
      const rows = Array.isArray(data) ? data : [];
      setLiveRows(rows);
      setLiveCount(rows.filter((r) => r.trip_id && (r.status === 'in_progress' || r.status === 'active')).length);
      return rows;
    } catch {
      if (!opts?.silent) alertCompat('Error', 'Failed to load live routes');
      return [] as LiveRouteRow[];
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<any>('/school-settings');
      setBusAttendanceEnabled(res?.enable_driver_bus_attendance === 'true');
    } catch {
      alertCompat('Error', 'Failed to load transport settings');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSummaryCounts = useCallback(async () => {
    try {
      const [routes, live] = await Promise.all([
        api.get<RouteRow[]>('/transport/routes').catch(() => [] as RouteRow[]),
        api.get<LiveRouteRow[]>('/transport/live-today').catch(() => [] as LiveRouteRow[]),
      ]);
      const routeList = Array.isArray(routes) ? routes : [];
      const liveList = Array.isArray(live) ? live : [];
      setRouteCount(routeList.length);
      setLiveCount(liveList.filter((r) => r.trip_id && (r.status === 'in_progress' || r.status === 'active')).length);
      // Warm caches when not on those tabs so assignment sheet has routes ready
      if (routeList.length) setRouteRows((prev) => (prev.length ? prev : routeList));
    } catch {
      // non-blocking summary
    }
  }, []);

  const toggleBusAttendance = async (value: boolean) => {
    setBusAttendanceEnabled(value);
    try {
      await api.put('/school-settings', { enable_driver_bus_attendance: value ? 'true' : 'false' });
    } catch (e: any) {
      setBusAttendanceEnabled(!value);
      alertCompat('Error', e?.message || 'Failed to update setting');
    }
  };

  const fetchSafetyData = useCallback(async () => {
    try {
      setLoading(true);
      const [dashRes, incRes] = await Promise.all([
        api.get<any>('/transport/safety/dashboard'),
        api.get<any>('/transport/safety/incidents'),
      ]);
      setSafetyDashboard(dashRes?.data || dashRes || null);
      setSafetyIncidents(Array.isArray(incRes?.data) ? incRes.data : Array.isArray(incRes) ? incRes : []);
    } catch {
      alertCompat('Error', 'Failed to load safety data');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAcknowledge = async (id: string) => {
    try {
      await api.patch(`/transport/safety/incidents/${id}/acknowledge`);
      fetchSafetyData();
      alertCompat('Success', 'Incident acknowledged');
    } catch (e: any) {
      alertCompat('Error', e?.message || 'Failed to acknowledge incident');
    }
  };

  const handleResolve = async (id: string) => {
    try {
      await api.patch(`/transport/safety/incidents/${id}/resolve`, { resolutionNotes: 'Resolved by Admin' });
      fetchSafetyData();
      alertCompat('Success', 'Incident marked as resolved');
    } catch (e: any) {
      alertCompat('Error', e?.message || 'Failed to resolve incident');
    }
  };

  const handleReconcile = async () => {
    try {
      setReconciling(true);
      const res = await api.post<any>('/transport/safety/reconcile');
      alertCompat('Safeguarding Reconciled', `Processed ${res?.count ?? 0} safeguarding checks.`);
      fetchSafetyData();
    } catch (e: any) {
      alertCompat('Reconciliation Error', e?.message || 'Failed to run safeguarding reconciliation');
    } finally {
      setReconciling(false);
    }
  };

  useEffect(() => {
    if (tab === 'buses') fetchTransportData();
    else if (tab === 'routes') fetchRoutes();
    else if (tab === 'live') fetchLive();
    else if (tab === 'safety') fetchSafetyData();
    else fetchSettings();
  }, [tab, fetchTransportData, fetchRoutes, fetchLive, fetchSafetyData, fetchSettings]);

  useEffect(() => {
    refreshSummaryCounts();
  }, [refreshSummaryCounts]);

  useEffect(() => {
    if (tab !== 'live') return undefined;
    const id = setInterval(() => fetchLive({ silent: true }), 30000);
    return () => clearInterval(id);
  }, [tab, fetchLive]);

  const createRoute = async () => {
    const name = newName.trim();
    if (!name) {
      alertCompat('Validation', 'Route name is required');
      return;
    }
    try {
      setCreating(true);
      await api.post('/transport/routes', {
        name,
        direction: newDirection,
      });
      setAddOpen(false);
      setNewName('');
      await fetchRoutes();
      await refreshSummaryCounts();
      alertCompat('Done', 'Route created');
    } catch (e: any) {
      alertCompat('Error', e?.message || 'Could not create route');
    } finally {
      setCreating(false);
    }
  };

  const createBus = async () => {
    if (!newBusNo || !newBusReg || !newBusCap) {
      alertCompat('Validation', 'Please fill all bus details');
      return;
    }
    try {
      setCreating(true);
      await api.post('/transport/buses', {
        bus_no: newBusNo,
        registration_no: newBusReg,
        capacity: parseInt(newBusCap, 10),
      });
      setAddBusOpen(false);
      setNewBusNo('');
      setNewBusReg('');
      setNewBusCap('40');
      await fetchTransportData();
      alertCompat('Done', 'Bus created');
    } catch (e: any) {
      alertCompat('Error', e?.message || 'Could not create bus');
    } finally {
      setCreating(false);
    }
  };

  const openEditBusModal = (bus: BusItem) => {
    setEditBusId(bus.id);
    setEditBusNo(bus.bus_no || '');
    setEditBusReg(bus.registration_no || '');
    setEditBusCap(String(bus.capacity ?? 40));
    setEditBusActive(bus.is_active !== false);
    setEditBusOpen(true);
  };

  const saveEditBus = async () => {
    if (!editBusId || !editBusNo.trim() || !editBusReg.trim() || !editBusCap) {
      alertCompat('Validation', 'Please fill all bus details');
      return;
    }
    try {
      setCreating(true);
      await TransportService.updateBus(editBusId, {
        bus_no: editBusNo.trim(),
        registration_no: editBusReg.trim(),
        capacity: parseInt(editBusCap, 10),
        is_active: editBusActive,
      });
      setEditBusOpen(false);
      await fetchTransportData();
      alertCompat('Done', 'Bus updated');
    } catch (e: any) {
      alertCompat('Error', e?.message || 'Could not update bus');
    } finally {
      setCreating(false);
    }
  };

  const openEditRouteModal = (route: RouteRow) => {
    setEditRouteId(route.id);
    setEditRouteName(route.name || '');
    const dir = (route.direction || 'morning') as typeof editRouteDirection;
    setEditRouteDirection(['morning', 'afternoon', 'evening', 'both'].includes(dir) ? dir : 'morning');
    setEditRouteOpen(true);
  };

  const saveEditRoute = async () => {
    if (!editRouteId || !editRouteName.trim()) {
      alertCompat('Validation', 'Route name is required');
      return;
    }
    try {
      setCreating(true);
      await api.put(`/transport/routes/${editRouteId}`, {
        name: editRouteName.trim(),
        direction: editRouteDirection,
      });
      setEditRouteOpen(false);
      await fetchRoutes();
      alertCompat('Done', 'Route updated');
    } catch (e: any) {
      alertCompat('Error', e?.message || 'Could not update route');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRoute = (route: RouteRow) => {
    alertCompat(
      'Delete Route',
      `Delete "${route.name}"? All stops and student assignments on this route will be removed. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setCreating(true);
              await api.delete(`/transport/routes/${route.id}`);
              await fetchRoutes();
              alertCompat('Done', 'Route deleted');
            } catch (e: any) {
              alertCompat('Error', e?.message || 'Could not delete route');
            } finally {
              setCreating(false);
            }
          },
        },
      ],
    );
  };

  const openAssignModal = async (bus: BusItem, focus: 'driver' | 'route' = 'driver') => {
    setAssignBusId(bus.id);
    setAssignBusLabel(bus.bus_no || bus.registration_no || 'Bus');
    setAssignDriverId(bus.driver_id || null);
    setAssignRouteId(bus.route_id || null);
    setInitialDriverId(bus.driver_id || null);
    setInitialRouteId(bus.route_id || null);
    setAssignPickerQuery('');
    setAssignFocus(focus);
    try {
      const [drvs, routes] = await Promise.all([
        api.get<any[]>('/transport/drivers'),
        routeRows.length ? Promise.resolve(routeRows) : fetchRoutes({ silent: true }),
      ]);
      setDrivers(Array.isArray(drvs) ? drvs : []);
      setAssignRoutes(Array.isArray(routes) ? routes : routeRows);
      setAssignBusOpen(true);
    } catch {
      alertCompat('Error', 'Could not fetch assignment dependencies');
    }
  };

  const handleDeleteBus = (bus: BusItem) => {
    const label = bus.bus_no || bus.registration_no || 'this bus';
    alertCompat(
      'Delete Bus',
      `Delete "${label}"? It will be removed from any assigned routes.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setCreating(true);
              await TransportService.deleteBus(bus.id);
              await fetchTransportData();
              await refreshSummaryCounts();
              alertCompat('Done', 'Bus deleted');
            } catch (e: any) {
              alertCompat('Error', e?.message || 'Could not delete bus');
            } finally {
              setCreating(false);
            }
          },
        },
      ]
    );
  };

  const confirmBusAssignment = async () => {
    if (!assignBusId) return;

    const driverChanged = assignDriverId !== initialDriverId;
    const routeChanged = assignRouteId !== initialRouteId;

    if (!driverChanged && !routeChanged) {
      setAssignBusOpen(false);
      return;
    }

    try {
      setCreating(true);
      const payload: { driver_id?: string | null; route_id?: string | null } = {};
      if (driverChanged) payload.driver_id = assignDriverId;
      if (routeChanged) payload.route_id = assignRouteId;

      await TransportService.assignBus(assignBusId, payload);
      setAssignBusOpen(false);
      await Promise.all([fetchTransportData(), refreshSummaryCounts()]);
      alertCompat('Success', 'Assignment saved');
    } catch (e: any) {
      alertCompat('Error', e?.message || 'Assignment failed');
    } finally {
      setCreating(false);
    }
  };

  const filteredBuses = React.useMemo(() => {
    const q = busQuery.trim().toLowerCase();
    return transportData.filter((b) => {
      const hasDriver = Boolean(b.driver_id || b.driver_name);
      const hasRoute = Boolean(b.route_id || b.route_name);
      if (busFilter === 'needs' && hasDriver && hasRoute) return false;
      if (busFilter === 'no_driver' && hasDriver) return false;
      if (busFilter === 'no_route' && hasRoute) return false;
      if (busFilter === 'inactive' && b.is_active !== false) return false;
      if (!q) return true;
      const hay = [b.bus_no, b.registration_no, b.driver_name, b.route_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [transportData, busQuery, busFilter]);

  const filteredRoutes = React.useMemo(() => {
    const q = routeQuery.trim().toLowerCase();
    if (!q) return routeRows;
    return routeRows.filter((r) => {
      const hay = [r.name, r.bus_no, r.route_driver_name, r.direction]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [routeRows, routeQuery]);

  const filteredAssignDrivers = React.useMemo(() => {
    const q = assignPickerQuery.trim().toLowerCase();
    if (!q || assignFocus !== 'driver') return drivers;
    return drivers.filter((d) => String(d.display_name || '').toLowerCase().includes(q));
  }, [drivers, assignPickerQuery, assignFocus]);

  const filteredAssignRoutes = React.useMemo(() => {
    const q = assignPickerQuery.trim().toLowerCase();
    if (!q || assignFocus !== 'route') return assignRoutes;
    return assignRoutes.filter((r) => String(r.name || '').toLowerCase().includes(q));
  }, [assignRoutes, assignPickerQuery, assignFocus]);

  const selectedDriverName = React.useMemo(() => {
    if (!assignDriverId) return null;
    return drivers.find((d) => d.id === assignDriverId)?.display_name || 'Selected driver';
  }, [assignDriverId, drivers]);

  const selectedRoute = React.useMemo(() => {
    if (!assignRouteId) return null;
    return assignRoutes.find((r) => r.id === assignRouteId) || null;
  }, [assignRouteId, assignRoutes]);

  const routeConflict = React.useMemo(() => {
    if (!selectedRoute?.bus_id || selectedRoute.bus_id === assignBusId) return null;
    return selectedRoute.bus_no || 'another bus';
  }, [selectedRoute, assignBusId]);

  const assignDirty =
    assignDriverId !== initialDriverId || assignRouteId !== initialRouteId;

  const needsSetupCount = React.useMemo(
    () =>
      transportData.filter(
        (b) => !(b.driver_id || b.driver_name) || !(b.route_id || b.route_name),
      ).length,
    [transportData],
  );

  const dirChipStyle = (d?: string | null) => {
    const base = '#F3F4F6';
    const map: Record<string, string> = {
      morning: '#DBEAFE',
      afternoon: '#FEF3C7',
      evening: '#EDE9FE',
      both: '#D1FAE5',
    };
    return { backgroundColor: map[d || ''] || base };
  };

  const renderBusItem = ({ item, index }: { item: BusItem; index: number }) => {
    const hasDriver = Boolean(item.driver_id || item.driver_name);
    const hasRoute = Boolean(item.route_id || item.route_name);
    const needsSetup = !hasDriver || !hasRoute;

    return (
      <Animated.View entering={index < 10 ? FadeInDown.delay(index * 40).duration(280) : undefined}>
        <View style={[styles.card, needsSetup && styles.cardNeedsAttention]}>
          <View style={styles.cardHeader}>
            <View style={[styles.routeContainer, { flex: 1, paddingRight: 8 }]}>
              <LinearGradient
                colors={item.is_active === false ? ['#94A3B8', '#64748B'] : ['#4F46E5', '#6366F1']}
                style={styles.iconBox}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="bus" size={20} color="#fff" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.routeTitle} numberOfLines={1}>{item.bus_no || 'Untitled bus'}</Text>
                <Text style={styles.vehicleText} numberOfLines={1}>
                  {item.registration_no || 'No registration'} · Cap {item.capacity ?? '—'}
                </Text>
              </View>
            </View>
            <View style={[styles.statusBadge, item.is_active !== false ? styles.statusOnTime : styles.statusDelayed]}>
              <Text style={[styles.statusText, { color: item.is_active !== false ? '#065F46' : '#92400E' }]}>
                {item.is_active !== false ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>

          <View style={styles.assignChipRow}>
            <TouchableOpacity
              style={[styles.assignChip, !hasRoute && styles.assignChipWarn]}
              onPress={() => openAssignModal(item, 'route')}
              activeOpacity={0.85}
            >
              <Ionicons name="map-outline" size={14} color={hasRoute ? '#4338CA' : '#B45309'} />
              <Text style={[styles.assignChipTxt, !hasRoute && styles.assignChipTxtWarn]} numberOfLines={1}>
                {item.route_name || 'Assign route'}
              </Text>
              <Ionicons name="chevron-down" size={12} color={hasRoute ? '#818CF8' : '#D97706'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.assignChip, !hasDriver && styles.assignChipWarn]}
              onPress={() => openAssignModal(item, 'driver')}
              activeOpacity={0.85}
            >
              <Ionicons name="person-outline" size={14} color={hasDriver ? '#4338CA' : '#B45309'} />
              <Text style={[styles.assignChipTxt, !hasDriver && styles.assignChipTxtWarn]} numberOfLines={1}>
                {item.driver_name || 'Assign driver'}
              </Text>
              <Ionicons name="chevron-down" size={12} color={hasDriver ? '#818CF8' : '#D97706'} />
            </TouchableOpacity>
          </View>

          <View style={styles.busActionsRow}>
            <TouchableOpacity
              style={[styles.editActionBtn, styles.busActionBtn]}
              onPress={() => openEditBusModal(item)}
              disabled={creating}
              activeOpacity={0.8}
            >
              <Ionicons name="create-outline" size={16} color="#4338CA" />
              <Text style={styles.editActionText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.deleteActionBtn, styles.busActionBtn]}
              onPress={() => handleDeleteBus(item)}
              disabled={creating}
              activeOpacity={0.8}
            >
              <Ionicons name="trash-outline" size={16} color="#DC2626" />
              <Text style={styles.deleteActionText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    );
  };

  const renderRouteItem = ({ item, index }: { item: RouteRow; index: number }) => {
    const stops = Number(item.stop_count ?? 0);
    const studs = Number(item.student_count ?? 0);
    const dir = item.direction || 'morning';
    return (
      <Animated.View entering={FadeInDown.delay(index * 60).duration(400).springify()}>
        <View style={styles.card}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname: '/admin/routeDetail',
                params: {
                  routeId: item.id,
                  routeName: encodeURIComponent(item.name),
                },
              })
            }
          >
            <View style={styles.cardHeader}>
              <View style={styles.routeContainer}>
                <LinearGradient
                  colors={['#059669', '#10B981']}
                  style={styles.iconBox}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name="map" size={22} color="#fff" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.routeTitle}>{item.name}</Text>
                  <Text style={styles.vehicleText}>
                    {stops} stops · {studs} students
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={22} color="#CBD5E1" />
            </View>
            <View style={styles.divider} />
            <View style={styles.routeFooter}>
              <View style={[styles.dirBadge, dirChipStyle(dir)]}>
                <Text style={styles.dirBadgeTxt}>{DIR_LABEL[dir] || dir}</Text>
              </View>
              <View style={styles.driverInfo}>
                <Ionicons name="bus-outline" size={14} color="#CBD5E1" />
                <Text style={styles.driverHint} numberOfLines={1}>
                  {item.bus_no ? item.bus_no : 'No bus'}
                </Text>
                <Text style={styles.driverHintSep}>·</Text>
                <Ionicons name="person-circle-outline" size={16} color="#CBD5E1" />
                <Text style={styles.driverHint} numberOfLines={1}>
                  {item.route_driver_name ? item.route_driver_name : 'No driver'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
          <View style={styles.busActionsRow}>
            <TouchableOpacity
              style={[styles.editActionBtn, styles.busActionBtn]}
              onPress={() => router.push({
                pathname: '/admin/route-calibration' as any,
                params: { routeId: item.id, routeName: encodeURIComponent(item.name) },
              })}
              disabled={creating}
              activeOpacity={0.8}
            >
              <Ionicons name="analytics-outline" size={16} color="#4338CA" />
              <Text style={styles.editActionText}>Calibration</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.editActionBtn, styles.busActionBtn]}
              onPress={() => openEditRouteModal(item)}
              disabled={creating}
              activeOpacity={0.8}
            >
              <Ionicons name="create-outline" size={16} color="#4338CA" />
              <Text style={styles.editActionText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.deleteActionBtn, styles.busActionBtn]}
              onPress={() => handleDeleteRoute(item)}
              disabled={creating}
              activeOpacity={0.8}
            >
              <Ionicons name="trash-outline" size={16} color="#DC2626" />
              <Text style={styles.deleteActionText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    );
  };

  const renderLiveRow = ({ item, index }: { item: LiveRouteRow; index: number }) => {
    const badge =
      item.status === 'completed' ? 'Completed' :
        item.status === 'in_progress' || item.status === 'active' ? 'Live' :
          item.status === 'scheduled' ? 'Scheduled' : item.trip_id ? item.status : 'No trip';
    return (
      <Animated.View entering={FadeInDown.delay(index * 60).duration(400).springify()}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.routeContainer}>
              <LinearGradient
                colors={['#0284C7', '#0EA5E9']}
                style={styles.iconBox}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <Ionicons name="navigate" size={22} color="#fff" />
              </LinearGradient>
              <View>
                <Text style={styles.routeTitle}>{item.route_name}</Text>
                <Text style={styles.vehicleText}>
                  {item.driver_name || '—'} · last: {item.last_stop_name || '—'}
                </Text>
              </View>
            </View>
            <View style={[styles.statusBadge, styles.statusArrived]}>
              <Text style={[styles.statusText, { color: '#0369A1' }]}>{badge}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.trackButton}
            activeOpacity={0.8}
            onPress={() => router.push({
              pathname: '/admin/live-bus-tracking' as any,
              params: { routeId: item.route_id },
            })}
          >
            <Text style={styles.trackButtonText}>Track Live Bus</Text>
            <MaterialIcons name="arrow-forward-ios" size={14} color="#0EA5E9" />
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  };

  const onRefresh = () => {
    if (tab === 'buses') {
      fetchTransportData();
      refreshSummaryCounts();
    } else if (tab === 'routes') fetchRoutes();
    else if (tab === 'live') fetchLive();
    else if (tab === 'safety') fetchSafetyData();
    else fetchSettings();
  };

  const EmptyState = ({
    message,
    icon,
    actionLabel,
    onAction,
  }: {
    message: string;
    icon: keyof typeof Ionicons.glyphMap;
    actionLabel?: string;
    onAction?: () => void;
  }) => (
    <Animated.View entering={FadeInUp.duration(500)} style={styles.emptyContainer}>
      <View style={styles.emptyIconWrapper}>
        <Ionicons name={icon} size={64} color="#CBD5E1" />
      </View>
      <Text style={styles.emptyTitle}>{message}</Text>
      <Text style={styles.emptySub}>
        {actionLabel ? 'Get started with the action below.' : 'Pull to refresh or check back later.'}
      </Text>
      {actionLabel && onAction ? (
        <TouchableOpacity style={styles.emptyCta} onPress={onAction} activeOpacity={0.85}>
          <Text style={styles.emptyCtaTxt}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </Animated.View>
  );

  const renderSafetyItem = ({ item }: { item: any }) => {
    const isSos = item.incident_type === 'sos_alert' || item.incident_type === 'sos';
    const isOverspeed = item.incident_type === 'overspeed';
    const isSafeguarding = item.incident_type === 'safeguarding_mismatch' || item.incident_type === 'safeguarding_anomaly';

    const typeColor = isSos ? '#EF4444' : isOverspeed ? '#F59E0B' : '#8B5CF6';
    const typeIcon = isSos ? 'warning' : isOverspeed ? 'speedometer' : 'shield-half';
    const typeTitle = isSos ? 'Driver SOS Alert' : isOverspeed ? 'Sustained Overspeed' : 'Safeguarding Anomaly';

    const isResolved = item.status === 'resolved' || item.status === 'recovered' || item.status === 'false_positive';
    const isAck = item.status === 'acknowledged';
    const details = item.metadata || item.details || {};
    const recordedSpeed = item.speed ?? details.peak_speed ?? details.speed_kmh ?? '--';
    const limitSpeed = item.speed_limit ?? details.speed_limit ?? 50;

    return (
      <Animated.View entering={FadeInDown.duration(300)} style={styles.safetyCard}>
        <View style={styles.safetyCardHeader}>
          <View style={[styles.safetyTypeBadge, { backgroundColor: `${typeColor}15` }]}>
            <Ionicons name={typeIcon as any} size={16} color={typeColor} />
            <Text style={[styles.safetyTypeTxt, { color: typeColor }]}>{typeTitle}</Text>
          </View>
          <View style={[styles.safetyStatusBadge, isResolved ? styles.safetyStatusBadgeResolved : isAck ? styles.safetyStatusBadgeAck : styles.safetyStatusBadgeOpen]}>
            <Text style={[styles.safetyStatusTxt, isResolved ? styles.safetyStatusTxtResolved : isAck ? styles.safetyStatusTxtAck : styles.safetyStatusTxtOpen]}>
              {item.status ? item.status.toUpperCase() : 'ACTIVE'}
            </Text>
          </View>
        </View>

        <View style={styles.safetyCardBody}>
          {isOverspeed && (
            <Text style={styles.safetyDetailMain}>
              Recorded <Text style={{ fontWeight: '700', color: '#EF4444' }}>{recordedSpeed} km/h</Text> (Limit: {limitSpeed} km/h) for {Math.round(details.duration_seconds || 0)}s
            </Text>
          )}
          {isSafeguarding && (
            <Text style={styles.safetyDetailMain}>
              Student <Text style={{ fontWeight: '700' }}>{details.student_name || 'Student'}</Text> was boarded on bus but marked <Text style={{ fontWeight: '700', color: '#EF4444' }}>Absent</Text> in class {details.class_name || ''}
            </Text>
          )}
          {isSos && (
            <Text style={styles.safetyDetailMain}>
              Emergency SOS triggered by driver: {details.driver_name || 'Driver'}. Location: {item.location_lat ? `${Number(item.location_lat).toFixed(4)}, ${Number(item.location_lng).toFixed(4)}` : details.latitude ? `${details.latitude}, ${details.longitude}` : 'Live trip'}
            </Text>
          )}

          <View style={styles.safetyMetaRow}>
            <Text style={styles.safetyMetaTxt}>
              {item.created_at ? new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
              {item.bus_no ? ` • Bus ${item.bus_no}` : item.bus_id ? ` • Bus ID #${item.bus_id}` : ''}
              {item.route_name ? ` • Route ${item.route_name}` : item.route_id ? ` • Route #${item.route_id}` : ''}
            </Text>
          </View>
        </View>

        {!isResolved && (
          <View style={styles.safetyActionsRow}>
            {!isAck && (
              <TouchableOpacity
                style={styles.safetyAckBtn}
                onPress={() => handleAcknowledge(item.id)}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color="#4F46E5" />
                <Text style={styles.safetyAckBtnTxt}>Acknowledge</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.safetyResolveBtn}
              onPress={() => handleResolve(item.id)}
              activeOpacity={0.8}
            >
              <Ionicons name="shield-checkmark" size={16} color="#10B981" />
              <Text style={styles.safetyResolveBtnTxt}>Resolve</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    );
  };

  const listData =
    tab === 'buses' ? filteredBuses : tab === 'routes' ? filteredRoutes : tab === 'live' ? liveRows : tab === 'safety' ? safetyIncidents : [];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />
      <TourTarget id="screen.admin-transport.overview"><AdminHeader
        title="Transport Management"
        showBackButton={true}
        rightAction={{
          icon: 'cloud-upload-outline',
          onPress: () => router.push('/admin/transport-import'),
        }}
      /></TourTarget>

      <TourTarget id="screen.admin-transport.workspace" native><FlatList
        data={listData as any[]}
        keyExtractor={(item: any) =>
          item.route_id && !item.bus_no && item.trip_id !== undefined
            ? String(item.route_id)
            : item.id
              ? String(item.id)
              : String(item.route_id)
        }
        renderItem={tab === 'buses' ? renderBusItem as any : tab === 'routes' ? renderRouteItem as any : tab === 'live' ? renderLiveRow as any : tab === 'safety' ? renderSafetyItem as any : null}
        contentContainerStyle={[styles.listContent, isDesktop && styles.listContentDesktop]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor="#6366F1" />}
        windowSize={7}
        maxToRenderPerBatch={8}
        initialNumToRender={8}
        removeClippedSubviews
        ListHeaderComponent={
          <>
            <View style={styles.statsContainer}>
              <View style={styles.statCard}>
                <View style={[styles.statIconBadge, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="bus-outline" size={22} color="#6366F1" />
                </View>
                <View style={styles.statTextGroup}>
                  <Text style={styles.statValue}>{transportData.length}</Text>
                  <Text style={styles.statLabel}>Buses</Text>
                </View>
              </View>
              <View style={styles.statCard}>
                <View style={[styles.statIconBadge, { backgroundColor: '#ECFDF5' }]}>
                  <Ionicons name="map-outline" size={22} color="#10B981" />
                </View>
                <View style={styles.statTextGroup}>
                  <Text style={styles.statValue}>{routeCount}</Text>
                  <Text style={styles.statLabel}>Routes</Text>
                </View>
              </View>
              <View style={[styles.statCard, { marginRight: 0 }]}>
                <View style={[styles.statIconBadge, { backgroundColor: '#E0F2FE' }]}>
                  <Ionicons name="navigate-circle-outline" size={22} color="#0EA5E9" />
                </View>
                <View style={styles.statTextGroup}>
                  <Text style={styles.statValue}>{liveCount}</Text>
                  <Text style={styles.statLabel}>Live trips</Text>
                </View>
              </View>
            </View>

            {tab === 'buses' && needsSetupCount > 0 ? (
              <TouchableOpacity
                style={styles.setupBanner}
                onPress={() => setBusFilter('needs')}
                activeOpacity={0.85}
              >
                <Ionicons name="alert-circle" size={18} color="#B45309" />
                <Text style={styles.setupBannerTxt}>
                  {needsSetupCount} bus{needsSetupCount === 1 ? '' : 'es'} need a driver or route
                </Text>
                <Text style={styles.setupBannerAction}>Review</Text>
              </TouchableOpacity>
            ) : null}

            <View style={styles.controlsRow}>
              <View style={styles.pillNav}>
                <TouchableOpacity
                  style={[styles.pillBtn, tab === 'buses' && styles.pillBtnOn]}
                  onPress={() => setTab('buses')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.pillTxt, tab === 'buses' && styles.pillTxtOn]}>Buses</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pillBtn, tab === 'routes' && styles.pillBtnOn]}
                  onPress={() => setTab('routes')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.pillTxt, tab === 'routes' && styles.pillTxtOn]}>Routes</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pillBtn, tab === 'live' && styles.pillBtnOn]}
                  onPress={() => setTab('live')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.pillTxt, tab === 'live' && styles.pillTxtOn]}>Live Today</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pillBtn, tab === 'safety' && styles.pillBtnOn]}
                  onPress={() => setTab('safety')}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={[styles.pillTxt, tab === 'safety' && styles.pillTxtOn]}>Safety</Text>
                    {Boolean(safetyDashboard?.activeSosCount) && (
                      <View style={{ backgroundColor: '#EF4444', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{safetyDashboard?.activeSosCount}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pillBtn, tab === 'settings' && styles.pillBtnOn]}
                  onPress={() => setTab('settings')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.pillTxt, tab === 'settings' && styles.pillTxtOn]}>Settings</Text>
                </TouchableOpacity>
              </View>

              {tab === 'routes' && (
                <TouchableOpacity style={styles.actionBtn} onPress={() => setAddOpen(true)} activeOpacity={0.8}>
                  <LinearGradient colors={['#4F46E5', '#6366F1']} style={styles.actionBtnBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <Ionicons name="add" size={20} color="#fff" />
                    <Text style={styles.actionBtnTxt}>Add Route</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
              {tab === 'buses' && (
                <TouchableOpacity style={styles.actionBtn} onPress={() => setAddBusOpen(true)} activeOpacity={0.8}>
                  <LinearGradient colors={['#4F46E5', '#6366F1']} style={styles.actionBtnBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <Ionicons name="add" size={20} color="#fff" />
                    <Text style={styles.actionBtnTxt}>Add Bus</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>

            {tab === 'buses' && (
              <View style={styles.toolbarBlock}>
                <View style={styles.searchBar}>
                  <Ionicons name="search" size={18} color="#94A3B8" />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search bus, plate, driver, route…"
                    placeholderTextColor="#94A3B8"
                    value={busQuery}
                    onChangeText={setBusQuery}
                    autoCorrect={false}
                    clearButtonMode="while-editing"
                  />
                  {busQuery ? (
                    <TouchableOpacity onPress={() => setBusQuery('')} hitSlop={8}>
                      <Ionicons name="close-circle" size={18} color="#CBD5E1" />
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={styles.filterRow}>
                  {BUS_FILTERS.map((f) => (
                    <TouchableOpacity
                      key={f.key}
                      style={[styles.filterChip, busFilter === f.key && styles.filterChipOn]}
                      onPress={() => setBusFilter(f.key)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.filterChipTxt, busFilter === f.key && styles.filterChipTxtOn]}>
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {tab === 'routes' && (
              <View style={styles.toolbarBlock}>
                <View style={styles.searchBar}>
                  <Ionicons name="search" size={18} color="#94A3B8" />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search routes, bus, driver…"
                    placeholderTextColor="#94A3B8"
                    value={routeQuery}
                    onChangeText={setRouteQuery}
                    autoCorrect={false}
                    clearButtonMode="while-editing"
                  />
                  {routeQuery ? (
                    <TouchableOpacity onPress={() => setRouteQuery('')} hitSlop={8}>
                      <Ionicons name="close-circle" size={18} color="#CBD5E1" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            )}

            {tab === 'safety' && (
              <Animated.View entering={FadeInDown.duration(400)} style={styles.safetyOverviewBox}>
                <View style={styles.safetyKpiGrid}>
                  <View style={[styles.safetyKpiCard, safetyDashboard?.activeSosCount ? { borderColor: '#EF4444' } : null]}>
                    <Ionicons name="alert-circle" size={20} color={safetyDashboard?.activeSosCount ? '#EF4444' : '#64748B'} />
                    <Text style={[styles.safetyKpiVal, safetyDashboard?.activeSosCount ? { color: '#EF4444' } : null]}>
                      {safetyDashboard?.activeSosCount || 0}
                    </Text>
                    <Text style={styles.safetyKpiLbl}>Active SOS</Text>
                  </View>

                  <View style={styles.safetyKpiCard}>
                    <Ionicons name="speedometer-outline" size={20} color="#F59E0B" />
                    <Text style={styles.safetyKpiVal}>{safetyDashboard?.overspeedTodayCount || 0}</Text>
                    <Text style={styles.safetyKpiLbl}>Overspeed Today</Text>
                  </View>

                  <View style={styles.safetyKpiCard}>
                    <Ionicons name="shield-outline" size={20} color="#6366F1" />
                    <Text style={styles.safetyKpiVal}>{safetyDashboard?.unresolvedIncidentsCount || 0}</Text>
                    <Text style={styles.safetyKpiLbl}>Unresolved</Text>
                  </View>
                </View>

                <View style={styles.safetyActionBanner}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.safetyActionTitle}>Safeguarding Morning Check</Text>
                    <Text style={styles.safetyActionSub}>
                      Reconciles morning bus attendance against absent classroom records.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.safetyReconcileBtn, reconciling && { opacity: 0.6 }]}
                    onPress={handleReconcile}
                    disabled={reconciling}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="sync" size={16} color="#fff" />
                    <Text style={styles.safetyReconcileBtnTxt}>{reconciling ? 'Checking...' : 'Run Check'}</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}

            {tab === 'settings' && (
              <Animated.View
                entering={FadeInDown.duration(400).springify()}
                style={styles.settingsCard}
              >
                <View style={styles.settingsHeader}>
                  <Ionicons name="settings-outline" size={20} color="#6366F1" style={{ marginRight: 8 }} />
                  <Text style={styles.settingsTitle}>General Settings</Text>
                </View>
                <View style={styles.settingsRow}>
                  <View style={{ flex: 1, paddingRight: 16 }}>
                    <Text style={styles.settingLabel}>Enable Driver Bus Attendance</Text>
                    <Text style={styles.settingDesc}>
                      Allow drivers to mark student attendance at each assigned bus stop during trips.
                    </Text>
                  </View>
                  <Switch
                    value={busAttendanceEnabled}
                    onValueChange={toggleBusAttendance}
                    trackColor={{ false: '#D1D5DB', true: '#C7D2FE' }}
                    thumbColor={busAttendanceEnabled ? '#6366F1' : '#F3F4F6'}
                  />
                </View>
              </Animated.View>
            )}
          </>
        }
        ListEmptyComponent={
          !loading ? (
            tab === 'settings' ? null : (
              <EmptyState
                message={
                  tab === 'buses'
                    ? busQuery || busFilter !== 'all'
                      ? 'No buses match your filters'
                      : 'No buses yet'
                    : tab === 'routes'
                      ? routeQuery
                        ? 'No routes match your search'
                        : 'No routes yet'
                    : tab === 'safety'
                      ? 'No safety incidents recorded'
                      : 'No live trips today'
                }
                icon={tab === 'buses' ? 'bus-outline' : tab === 'routes' ? 'map-outline' : tab === 'safety' ? 'shield-checkmark-outline' : 'navigate-outline'}
                actionLabel={
                  tab === 'buses' && !busQuery && busFilter === 'all'
                    ? 'Add first bus'
                    : tab === 'routes' && !routeQuery
                      ? 'Add first route'
                      : undefined
                }
                onAction={
                  tab === 'buses'
                    ? () => setAddBusOpen(true)
                    : tab === 'routes'
                      ? () => setAddOpen(true)
                      : undefined
                }
              />
            )
          ) : (
            <View style={styles.loaderArea}>
              <LogoLoader size={60} color="#6366F1" />
            </View>
          )
        }
      /></TourTarget>

      <Modal visible={addOpen} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => !creating && setAddOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxWidth: 500 }}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.sheetTitle}>Create New Route</Text>
              <Text style={styles.inputLabel}>Route Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Route A - Morning"
                placeholderTextColor="#9CA3AF"
                value={newName}
                onChangeText={setNewName}
              />
              <Text style={styles.inputLabel}>Trip Direction</Text>
              <View style={styles.segRow}>
                {(['morning', 'afternoon', 'evening', 'both'] as const).map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.segChip, newDirection === d && styles.segChipOn]}
                    onPress={() => setNewDirection(d)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.segChipTxt, newDirection === d && styles.segChipTxtOn]}>
                      {DIR_LABEL[d]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.sheetActions}>
                <TouchableOpacity style={styles.cancelBtn} disabled={creating} onPress={() => setAddOpen(false)}>
                  <Text style={styles.cancelBtnTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.submitBtn} disabled={creating} onPress={createRoute}>
                  {creating ? (
                    <Text style={styles.submitBtnTxt}>Creating...</Text>
                  ) : (
                    <LinearGradient colors={['#4F46E5', '#6366F1']} style={styles.submitBtnBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                      <Text style={styles.submitBtnTxt}>Create Route</Text>
                    </LinearGradient>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* ADD BUS MODAL */}
      <Modal visible={addBusOpen} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => !creating && setAddBusOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxWidth: 500 }}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.sheetTitle}>Create New Bus</Text>
              
              <Text style={styles.inputLabel}>Bus Number / Name</Text>
              <TextInput style={styles.input} placeholder="e.g. Bus 01" placeholderTextColor="#9CA3AF" value={newBusNo} onChangeText={setNewBusNo} />
              
              <Text style={styles.inputLabel}>Registration Number</Text>
              <TextInput style={styles.input} placeholder="e.g. IND-1234" placeholderTextColor="#9CA3AF" value={newBusReg} onChangeText={setNewBusReg} />
              
              <Text style={styles.inputLabel}>Capacity</Text>
              <TextInput style={styles.input} placeholder="e.g. 40" placeholderTextColor="#9CA3AF" keyboardType="numeric" value={newBusCap} onChangeText={setNewBusCap} />
              
              <View style={styles.sheetActions}>
                <TouchableOpacity style={styles.cancelBtn} disabled={creating} onPress={() => setAddBusOpen(false)}>
                  <Text style={styles.cancelBtnTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.submitBtn} disabled={creating} onPress={createBus}>
                  {creating ? (
                    <Text style={styles.submitBtnTxt}>Creating...</Text>
                  ) : (
                    <LinearGradient colors={['#4F46E5', '#6366F1']} style={styles.submitBtnBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                      <Text style={styles.submitBtnTxt}>Create Bus</Text>
                    </LinearGradient>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* EDIT BUS MODAL */}
      <Modal visible={editBusOpen} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => !creating && setEditBusOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxWidth: 500 }}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.sheetTitle}>Edit Bus</Text>

              <Text style={styles.inputLabel}>Bus Number / Name</Text>
              <TextInput style={styles.input} placeholder="e.g. Bus 01" placeholderTextColor="#9CA3AF" value={editBusNo} onChangeText={setEditBusNo} />

              <Text style={styles.inputLabel}>Registration Number</Text>
              <TextInput style={styles.input} placeholder="e.g. IND-1234" placeholderTextColor="#9CA3AF" value={editBusReg} onChangeText={setEditBusReg} />

              <Text style={styles.inputLabel}>Capacity</Text>
              <TextInput style={styles.input} placeholder="e.g. 40" placeholderTextColor="#9CA3AF" keyboardType="numeric" value={editBusCap} onChangeText={setEditBusCap} />

              <Text style={styles.inputLabel}>Status</Text>
              <View style={styles.segRow}>
                <TouchableOpacity
                  style={[styles.segChip, editBusActive && styles.segChipOn]}
                  onPress={() => setEditBusActive(true)}
                >
                  <Text style={[styles.segChipTxt, editBusActive && styles.segChipTxtOn]}>Active</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segChip, !editBusActive && styles.segChipOn]}
                  onPress={() => setEditBusActive(false)}
                >
                  <Text style={[styles.segChipTxt, !editBusActive && styles.segChipTxtOn]}>Inactive</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.sheetActions}>
                <TouchableOpacity style={styles.cancelBtn} disabled={creating} onPress={() => setEditBusOpen(false)}>
                  <Text style={styles.cancelBtnTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.submitBtn} disabled={creating} onPress={saveEditBus}>
                  {creating ? (
                    <Text style={styles.submitBtnTxt}>Saving...</Text>
                  ) : (
                    <LinearGradient colors={['#4F46E5', '#6366F1']} style={styles.submitBtnBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                      <Text style={styles.submitBtnTxt}>Save Changes</Text>
                    </LinearGradient>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* EDIT ROUTE MODAL */}
      <Modal visible={editRouteOpen} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => !creating && setEditRouteOpen(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxWidth: 500 }}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.sheetTitle}>Edit Route</Text>
              <Text style={styles.inputLabel}>Route Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Anthwar Route"
                placeholderTextColor="#9CA3AF"
                value={editRouteName}
                onChangeText={setEditRouteName}
              />
              <Text style={styles.inputLabel}>Trip Direction</Text>
              <View style={styles.segRow}>
                {(['morning', 'afternoon', 'evening', 'both'] as const).map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.segChip, editRouteDirection === d && styles.segChipOn]}
                    onPress={() => setEditRouteDirection(d)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.segChipTxt, editRouteDirection === d && styles.segChipTxtOn]}>
                      {DIR_LABEL[d]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.sheetActions}>
                <TouchableOpacity style={styles.cancelBtn} disabled={creating} onPress={() => setEditRouteOpen(false)}>
                  <Text style={styles.cancelBtnTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.submitBtn} disabled={creating} onPress={saveEditRoute}>
                  {creating ? (
                    <Text style={styles.submitBtnTxt}>Saving...</Text>
                  ) : (
                    <LinearGradient colors={['#059669', '#10B981']} style={styles.submitBtnBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                      <Text style={styles.submitBtnTxt}>Save Changes</Text>
                    </LinearGradient>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* ASSIGN BUS MODAL — compact summary + focused picker */}
      <Modal visible={assignBusOpen} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => !creating && setAssignBusOpen(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ width: '100%', maxWidth: isDesktop ? 560 : 500 }}
          >
            <Pressable style={[styles.sheet, styles.assignSheet]} onPress={(e) => e.stopPropagation()}>
              <View style={styles.assignHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.assignKicker}>Assignment</Text>
                  <Text style={styles.assignTitle} numberOfLines={1}>{assignBusLabel}</Text>
                </View>
                <TouchableOpacity
                  style={styles.assignCloseBtn}
                  onPress={() => !creating && setAssignBusOpen(false)}
                  hitSlop={10}
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={styles.assignSummaryRow}>
                <TouchableOpacity
                  style={[
                    styles.assignSummaryCard,
                    assignFocus === 'driver' && styles.assignSummaryCardOn,
                    !assignDriverId && styles.assignSummaryCardEmpty,
                  ]}
                  onPress={() => {
                    setAssignFocus('driver');
                    setAssignPickerQuery('');
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.assignSummaryTop}>
                    <Ionicons
                      name="person"
                      size={14}
                      color={assignFocus === 'driver' ? '#4338CA' : '#64748B'}
                    />
                    <Text style={styles.assignSummaryLabel}>Driver</Text>
                  </View>
                  <Text
                    style={[
                      styles.assignSummaryValue,
                      !assignDriverId && styles.assignSummaryValueEmpty,
                    ]}
                    numberOfLines={1}
                  >
                    {selectedDriverName || 'Not assigned'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.assignSummaryCard,
                    assignFocus === 'route' && styles.assignSummaryCardOn,
                    !assignRouteId && styles.assignSummaryCardEmpty,
                  ]}
                  onPress={() => {
                    setAssignFocus('route');
                    setAssignPickerQuery('');
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.assignSummaryTop}>
                    <Ionicons
                      name="map"
                      size={14}
                      color={assignFocus === 'route' ? '#4338CA' : '#64748B'}
                    />
                    <Text style={styles.assignSummaryLabel}>Route</Text>
                  </View>
                  <Text
                    style={[
                      styles.assignSummaryValue,
                      !assignRouteId && styles.assignSummaryValueEmpty,
                    ]}
                    numberOfLines={1}
                  >
                    {selectedRoute?.name || 'Not assigned'}
                  </Text>
                </TouchableOpacity>
              </View>

              {routeConflict ? (
                <View style={styles.conflictBanner}>
                  <Ionicons name="warning" size={16} color="#B45309" />
                  <Text style={styles.conflictBannerTxt}>
                    This route is on {routeConflict}. Saving moves it to {assignBusLabel}.
                  </Text>
                </View>
              ) : null}

              <View style={styles.assignPickerHeader}>
                <Text style={styles.assignPickerTitle}>
                  {assignFocus === 'driver' ? 'Choose driver' : 'Choose route'}
                </Text>
                {(assignFocus === 'driver' ? assignDriverId : assignRouteId) ? (
                  <TouchableOpacity
                    style={styles.clearLink}
                    onPress={() =>
                      assignFocus === 'driver'
                        ? setAssignDriverId(null)
                        : setAssignRouteId(null)
                    }
                    hitSlop={8}
                  >
                    <Ionicons name="close-circle-outline" size={15} color="#DC2626" />
                    <Text style={styles.clearLinkTxt}>Clear</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.assignSearchBar}>
                <Ionicons name="search" size={16} color="#94A3B8" />
                <TextInput
                  style={styles.searchInput}
                  placeholder={
                    assignFocus === 'driver' ? 'Search drivers…' : 'Search routes…'
                  }
                  placeholderTextColor="#94A3B8"
                  value={assignPickerQuery}
                  onChangeText={setAssignPickerQuery}
                  autoCorrect={false}
                />
                {assignPickerQuery ? (
                  <TouchableOpacity onPress={() => setAssignPickerQuery('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color="#CBD5E1" />
                  </TouchableOpacity>
                ) : null}
              </View>

              <TourScrollView
                style={styles.assignListScroll}
                contentContainerStyle={styles.assignListContent}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {assignFocus === 'driver'
                  ? filteredAssignDrivers.length === 0
                    ? (
                      <Text style={styles.pickerEmpty}>
                        {assignPickerQuery ? 'No drivers match' : 'No drivers available'}
                      </Text>
                    )
                    : filteredAssignDrivers.map((item) => {
                        const selected = assignDriverId === item.id;
                        return (
                          <TouchableOpacity
                            key={item.id}
                            style={[styles.pickerRow, selected && styles.pickerRowOn]}
                            onPress={() => setAssignDriverId(item.id)}
                            activeOpacity={0.85}
                          >
                            <View style={[styles.pickerAvatar, selected && styles.pickerAvatarOn]}>
                              <Text style={[styles.pickerAvatarTxt, selected && styles.pickerAvatarTxtOn]}>
                                {String(item.display_name || '?').charAt(0).toUpperCase()}
                              </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.pickerRowTxt, selected && styles.pickerRowTxtOn]} numberOfLines={1}>
                                {item.display_name}
                              </Text>
                              {item.current_route_name ? (
                                <Text style={styles.pickerRowMeta} numberOfLines={1}>
                                  Currently on {item.current_route_name}
                                </Text>
                              ) : (
                                <Text style={styles.pickerRowMeta}>Available</Text>
                              )}
                            </View>
                            <View style={[styles.radioOuter, selected && styles.radioOuterOn]}>
                              {selected ? <View style={styles.radioInner} /> : null}
                            </View>
                          </TouchableOpacity>
                        );
                      })
                  : filteredAssignRoutes.length === 0
                    ? (
                      <Text style={styles.pickerEmpty}>
                        {assignPickerQuery ? 'No routes match' : 'No routes created yet'}
                      </Text>
                    )
                    : filteredAssignRoutes.map((item) => {
                        const selected = assignRouteId === item.id;
                        const takenByOther = Boolean(item.bus_id && item.bus_id !== assignBusId);
                        return (
                          <TouchableOpacity
                            key={item.id}
                            style={[
                              styles.pickerRow,
                              selected && styles.pickerRowOn,
                              takenByOther && !selected && styles.pickerRowConflict,
                            ]}
                            onPress={() => setAssignRouteId(item.id)}
                            activeOpacity={0.85}
                          >
                            <View style={[styles.pickerAvatar, styles.pickerAvatarRoute, selected && styles.pickerAvatarOn]}>
                              <Ionicons
                                name="map-outline"
                                size={16}
                                color={selected ? '#4338CA' : '#64748B'}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.pickerRowTxt, selected && styles.pickerRowTxtOn]} numberOfLines={1}>
                                {item.name}
                              </Text>
                              <Text
                                style={[
                                  styles.pickerRowMeta,
                                  takenByOther && styles.pickerRowMetaWarn,
                                ]}
                                numberOfLines={1}
                              >
                                {DIR_LABEL[item.direction || ''] || item.direction || 'Route'}
                                {takenByOther
                                  ? ` · on ${item.bus_no || 'another bus'}`
                                  : item.bus_no
                                    ? ` · ${item.bus_no}`
                                    : ' · free'}
                              </Text>
                            </View>
                            {takenByOther ? (
                              <View style={styles.conflictPill}>
                                <Text style={styles.conflictPillTxt}>In use</Text>
                              </View>
                            ) : null}
                            <View style={[styles.radioOuter, selected && styles.radioOuterOn]}>
                              {selected ? <View style={styles.radioInner} /> : null}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
              </TourScrollView>

              <View style={styles.assignFooter}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  disabled={creating}
                  onPress={() => setAssignBusOpen(false)}
                >
                  <Text style={styles.cancelBtnTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitBtn, (!assignDirty || creating) && styles.submitBtnDisabled]}
                  disabled={!assignDirty || creating}
                  onPress={confirmBusAssignment}
                >
                  <LinearGradient
                    colors={
                      creating || !assignDirty
                        ? ['#94A3B8', '#94A3B8']
                        : ['#4F46E5', '#6366F1']
                    }
                    style={styles.submitBtnBg}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Text style={styles.submitBtnTxt}>
                      {creating ? 'Saving…' : assignDirty ? 'Save changes' : 'No changes'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

    </View>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent', // softer default background
    },
    listContent: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 40,
    },
    listContentDesktop: {
      maxWidth: 1100,
      alignSelf: 'center',
      width: '100%',
    },
    statsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 24,
    },
    statCard: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#fff',
      padding: 16,
      borderRadius: 16,
      marginRight: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 5,
      elevation: 2,
    },
    statIconBadge: {
      width: 48,
      height: 48,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    statTextGroup: {
      flex: 1,
      justifyContent: 'center',
    },
    statValue: {
      fontSize: 22,
      fontWeight: '800',
      color: '#111827',
    },
    statLabel: {
      fontSize: 13,
      fontWeight: '500',
      color: '#6B7280',
      marginTop: 2,
    },
    controlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20,
      flexWrap: 'wrap',
      gap: 12,
    },
    pillNav: {
      flexDirection: 'row',
      backgroundColor: '#E5E7EB',
      borderRadius: 999,
      padding: 4,
    },
    pillBtn: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 999,
    },
    pillBtnOn: {
      backgroundColor: '#fff',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 3,
      elevation: 2,
    },
    pillTxt: {
      fontSize: 14,
      fontWeight: '600',
      color: '#4B5563',
    },
    pillTxtOn: {
      color: '#111827',
    },
    actionBtn: {
      borderRadius: 999,
      overflow: 'hidden',
      shadowColor: '#4F46E5',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 4,
    },
    actionBtnBg: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 6,
    },
    actionBtnTxt: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 14,
    },
    card: {
      backgroundColor: '#fff',
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
      borderWidth: 1,
      borderColor: '#F3F4F6',
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    routeContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconBox: {
      width: 48,
      height: 48,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 14,
    },
    routeTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: '#111827',
      marginBottom: 2,
    },
    vehicleText: {
      fontSize: 13,
      color: '#6B7280',
      fontWeight: '500',
    },
    statusBadge: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
    },
    statusOnTime: {
      backgroundColor: '#D1FAE5',
    },
    statusDelayed: {
      backgroundColor: '#FEF3C7',
    },
    statusArrived: {
      backgroundColor: '#E0F2FE',
    },
    statusText: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    divider: {
      height: 1,
      backgroundColor: '#F3F4F6',
      marginVertical: 16,
    },
    detailsContainer: {
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    detailIcon: {
      marginRight: 10,
    },
    detailText: {
      fontSize: 14,
      color: '#4B5563',
      fontWeight: '500',
    },
    routeFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    dirBadge: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 8,
    },
    dirBadgeTxt: { fontSize: 12, fontWeight: '700', color: '#374151', textTransform: 'uppercase' },
    driverInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
      justifyContent: 'flex-end',
    },
    driverHint: { fontSize: 13, color: '#64748B', fontWeight: '500' },
    busActionsRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 10,
    },
    busActionBtn: {
      flex: 1,
      paddingVertical: 8,
    },
    editActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#EEF2FF',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#C7D2FE',
      gap: 6,
    },
    editActionText: {
      color: '#4338CA',
      fontWeight: '700',
      fontSize: 13,
    },
    routeEditBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 14,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: '#EEF2FF',
      borderWidth: 1,
      borderColor: '#C7D2FE',
    },
    trackButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      backgroundColor: '#F0F9FF',
      borderRadius: 12,
      marginTop: 16,
      borderWidth: 1,
      borderColor: '#BAE6FD',
    },
    deleteActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FEF2F2',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#FECACA',
      gap: 6,
    },
    deleteActionText: {
      color: '#DC2626',
      fontWeight: '700',
      fontSize: 13,
    },
    trackButtonText: {
      color: '#0284C7',
      fontWeight: '700',
      marginRight: 8,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 60,
      paddingHorizontal: 20,
    },
    emptyIconWrapper: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: '#F1F5F9',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: '#1E293B',
      marginBottom: 8,
    },
    emptySub: {
      fontSize: 14,
      color: '#64748B',
      textAlign: 'center',
    },
    loaderArea: {
      marginTop: 80,
      alignItems: 'center',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    sheet: {
      backgroundColor: '#fff',
      borderRadius: 20,
      padding: 24,
      width: '100%',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.1,
      shadowRadius: 15,
      elevation: 10,
    },
    sheetTitle: {
      fontSize: 20,
      fontWeight: '800',
      marginBottom: 20,
      color: '#111827',
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: '#374151',
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    input: {
      backgroundColor: '#F9FAFB',
      borderWidth: 1,
      borderColor: '#E5E7EB',
      borderRadius: 12,
      padding: 14,
      fontSize: 16,
      marginBottom: 20,
      color: '#111827',
    },
    segRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
    segChip: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: '#F3F4F6',
      borderWidth: 1,
      borderColor: '#E5E7EB',
    },
    segChipOn: {
      backgroundColor: '#EEF2FF',
      borderColor: '#818CF8',
    },
    segChipTxt: { fontSize: 13, fontWeight: '700', color: '#64748B' },
    segChipTxtOn: { color: '#4338CA' },
    sheetActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 12,
      marginTop: 8,
    },
    cancelBtn: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: '#F3F4F6',
    },
    cancelBtnTxt: {
      color: '#4B5563',
      fontWeight: '700',
      fontSize: 14,
    },
    submitBtn: {
      borderRadius: 10,
      overflow: 'hidden',
    },
    submitBtnBg: {
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    submitBtnTxt: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 14,
    },
    settingsCard: {
      backgroundColor: '#fff',
      borderRadius: 20,
      padding: 20,
      marginHorizontal: 4,
      marginTop: 8,
      marginBottom: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 10,
      elevation: 2,
    },
    settingsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: '#F3F4F6',
      paddingBottom: 12,
    },
    settingsTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: '#111827',
    },
    settingsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    settingLabel: {
      fontSize: 15,
      fontWeight: '700',
      color: '#111827',
      marginBottom: 4,
    },
    settingDesc: {
      fontSize: 12,
      color: '#6B7280',
      lineHeight: 18,
    },
    cardNeedsAttention: {
      borderColor: '#FDE68A',
      backgroundColor: '#FFFBEB',
    },
    setupBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#FFFBEB',
      borderWidth: 1,
      borderColor: '#FCD34D',
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 14,
      minHeight: 48,
    },
    setupBannerTxt: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: '#92400E',
    },
    setupBannerAction: {
      fontSize: 13,
      fontWeight: '800',
      color: '#B45309',
    },
    assignChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 14,
      marginBottom: 4,
    },
    assignChip: {
      flexGrow: 1,
      flexBasis: '46%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: '#EEF2FF',
      borderWidth: 1,
      borderColor: '#C7D2FE',
      minHeight: 44,
    },
    assignChipWarn: {
      backgroundColor: '#FFFBEB',
      borderColor: '#FCD34D',
    },
    assignChipTxt: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: '#3730A3',
    },
    assignChipTxtWarn: {
      color: '#92400E',
    },
    toolbarBlock: {
      marginBottom: 16,
      gap: 10,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: '#fff',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#E5E7EB',
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === 'ios' ? 12 : 4,
      marginBottom: 4,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: '#111827',
      paddingVertical: 8,
    },
    filterRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: '#F3F4F6',
      borderWidth: 1,
      borderColor: '#E5E7EB',
      minHeight: 36,
      justifyContent: 'center',
    },
    filterChipOn: {
      backgroundColor: '#EEF2FF',
      borderColor: '#818CF8',
    },
    filterChipTxt: {
      fontSize: 12,
      fontWeight: '700',
      color: '#6B7280',
    },
    filterChipTxtOn: {
      color: '#4338CA',
    },
    emptyCta: {
      marginTop: 16,
      backgroundColor: '#4F46E5',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 12,
    },
    emptyCtaTxt: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 14,
    },
    assignSheet: {
      maxHeight: '90%',
      paddingTop: 18,
      paddingBottom: 16,
    },
    assignHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 14,
      gap: 12,
    },
    assignKicker: {
      fontSize: 11,
      fontWeight: '700',
      color: '#94A3B8',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    assignTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: '#111827',
      letterSpacing: -0.3,
    },
    assignCloseBtn: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: '#F1F5F9',
      alignItems: 'center',
      justifyContent: 'center',
    },
    assignSummaryRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 12,
    },
    assignSummaryCard: {
      flex: 1,
      backgroundColor: '#F8FAFC',
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: '#E2E8F0',
      paddingHorizontal: 12,
      paddingVertical: 12,
      minHeight: 72,
    },
    assignSummaryCardOn: {
      backgroundColor: '#EEF2FF',
      borderColor: '#818CF8',
    },
    assignSummaryCardEmpty: {
      borderStyle: 'dashed',
    },
    assignSummaryTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 6,
    },
    assignSummaryLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: '#64748B',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    assignSummaryValue: {
      fontSize: 14,
      fontWeight: '700',
      color: '#1E293B',
    },
    assignSummaryValueEmpty: {
      color: '#94A3B8',
      fontWeight: '600',
    },
    conflictBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: '#FFFBEB',
      borderWidth: 1,
      borderColor: '#FCD34D',
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
    },
    conflictBannerTxt: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: '#92400E',
      lineHeight: 18,
    },
    assignPickerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    assignPickerTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: '#111827',
    },
    clearLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
      paddingHorizontal: 6,
      minHeight: 32,
    },
    clearLinkTxt: {
      fontSize: 13,
      fontWeight: '700',
      color: '#DC2626',
    },
    assignSearchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#F8FAFC',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#E2E8F0',
      paddingHorizontal: 12,
      paddingVertical: Platform.OS === 'ios' ? 10 : 2,
      marginBottom: 10,
    },
    assignListScroll: {
      maxHeight: 260,
      marginBottom: 12,
    },
    assignListContent: {
      paddingBottom: 4,
    },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#E2E8F0',
      marginBottom: 8,
      minHeight: 56,
      gap: 10,
    },
    pickerRowOn: {
      backgroundColor: '#EEF2FF',
      borderColor: '#818CF8',
    },
    pickerRowConflict: {
      borderColor: '#FCD34D',
      backgroundColor: '#FFFBEB',
    },
    pickerAvatar: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: '#E2E8F0',
      alignItems: 'center',
      justifyContent: 'center',
    },
    pickerAvatarRoute: {
      backgroundColor: '#ECFDF5',
    },
    pickerAvatarOn: {
      backgroundColor: '#C7D2FE',
    },
    pickerAvatarTxt: {
      fontSize: 14,
      fontWeight: '800',
      color: '#475569',
    },
    pickerAvatarTxtOn: {
      color: '#3730A3',
    },
    pickerRowTxt: {
      fontSize: 14,
      fontWeight: '700',
      color: '#334155',
    },
    pickerRowTxtOn: {
      color: '#3730A3',
    },
    pickerRowMeta: {
      fontSize: 12,
      color: '#94A3B8',
      marginTop: 2,
      fontWeight: '500',
    },
    pickerRowMetaWarn: {
      color: '#B45309',
      fontWeight: '600',
    },
    conflictPill: {
      backgroundColor: '#FEF3C7',
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    conflictPillTxt: {
      fontSize: 10,
      fontWeight: '800',
      color: '#B45309',
      letterSpacing: 0.2,
    },
    radioOuter: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: '#CBD5E1',
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOuterOn: {
      borderColor: '#4F46E5',
    },
    radioInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#4F46E5',
    },
    pickerEmpty: {
      color: '#64748B',
      fontStyle: 'italic',
      paddingVertical: 16,
      textAlign: 'center',
    },
    assignFooter: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 10,
      paddingTop: 4,
      borderTopWidth: 1,
      borderTopColor: '#F1F5F9',
    },
    submitBtnDisabled: {
      opacity: 0.85,
    },
    driverHintSep: {
      color: '#CBD5E1',
      marginHorizontal: 2,
    },
    safetyOverviewBox: {
      marginBottom: 16,
      gap: 12,
    },
    safetyKpiGrid: {
      flexDirection: 'row',
      gap: 10,
    },
    safetyKpiCard: {
      flex: 1,
      backgroundColor: '#FFFFFF',
      borderRadius: 12,
      padding: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#E2E8F0',
    },
    safetyKpiVal: {
      fontSize: 20,
      fontWeight: '700',
      color: '#1E293B',
      marginTop: 4,
    },
    safetyKpiLbl: {
      fontSize: 11,
      color: '#64748B',
      marginTop: 2,
      textAlign: 'center',
    },
    safetyActionBanner: {
      backgroundColor: '#EEF2FF',
      borderRadius: 12,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: '#C7D2FE',
    },
    safetyActionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: '#312E81',
    },
    safetyActionSub: {
      fontSize: 11,
      color: '#4338CA',
      marginTop: 2,
    },
    safetyReconcileBtn: {
      backgroundColor: '#4F46E5',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    safetyReconcileBtnTxt: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '700',
    },
    safetyCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: '#E2E8F0',
    },
    safetyCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    safetyTypeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    safetyTypeTxt: {
      fontSize: 12,
      fontWeight: '700',
    },
    safetyStatusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
    },
    safetyStatusBadgeOpen: {
      backgroundColor: '#FEF2F2',
    },
    safetyStatusBadgeAck: {
      backgroundColor: '#EFF6FF',
    },
    safetyStatusBadgeResolved: {
      backgroundColor: '#ECFDF5',
    },
    safetyStatusTxt: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    safetyStatusTxtOpen: {
      color: '#DC2626',
    },
    safetyStatusTxtAck: {
      color: '#2563EB',
    },
    safetyStatusTxtResolved: {
      color: '#059669',
    },
    safetyCardBody: {
      gap: 4,
    },
    safetyDetailMain: {
      fontSize: 13,
      color: '#334155',
      lineHeight: 18,
    },
    safetyMetaRow: {
      marginTop: 4,
    },
    safetyMetaTxt: {
      fontSize: 11,
      color: '#94A3B8',
    },
    safetyActionsRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: '#F1F5F9',
    },
    safetyAckBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: '#EEF2FF',
    },
    safetyAckBtnTxt: {
      fontSize: 12,
      fontWeight: '600',
      color: '#4F46E5',
    },
    safetyResolveBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: '#ECFDF5',
    },
    safetyResolveBtnTxt: {
      fontSize: 12,
      fontWeight: '600',
      color: '#059669',
    },
  });
