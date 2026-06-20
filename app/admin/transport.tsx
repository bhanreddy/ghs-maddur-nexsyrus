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
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
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
};

const DIR_LABEL: Record<string, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  both: 'Both',
};

export default function AdminTransport() {
  const router = useRouter();
  const { theme } = useTheme();
  const styles = React.useMemo(() => getStyles(theme as any), [theme]);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [tab, setTab] = useState<'buses' | 'routes' | 'live'>('buses');
  const [transportData, setTransportData] = useState<BusItem[]>([]);
  const [routeRows, setRouteRows] = useState<RouteRow[]>([]);
  const [liveRows, setLiveRows] = useState<LiveRouteRow[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Bus Assignment State
  const [assignBusOpen, setAssignBusOpen] = useState(false);
  const [assignBusId, setAssignBusId] = useState<string | null>(null);
  const [assignDriverId, setAssignDriverId] = useState<string | null>(null);
  const [assignRouteId, setAssignRouteId] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<any[]>([]);

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

  const fetchRoutes = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get<RouteRow[]>('/transport/routes');
      setRouteRows(Array.isArray(data) ? data : []);
    } catch {
      alertCompat('Error', 'Failed to load routes');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLive = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get<LiveRouteRow[]>('/transport/live-today');
      setLiveRows(Array.isArray(data) ? data : []);
    } catch {
      alertCompat('Error', 'Failed to load live routes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'buses') fetchTransportData();
    else if (tab === 'routes') fetchRoutes();
    else fetchLive();
  }, [tab, fetchTransportData, fetchRoutes, fetchLive]);

  useEffect(() => {
    if (tab !== 'live') return undefined;
    const id = setInterval(fetchLive, 30000);
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

  const openAssignModal = async (bus: BusItem) => {
    setAssignBusId(bus.id);
    setAssignDriverId(null);
    setAssignRouteId(null);
    try {
      const drvs = await api.get<any[]>('/transport/drivers');
      setDrivers(Array.isArray(drvs) ? drvs : []);
      if (routeRows.length === 0) {
        await fetchRoutes();
      }
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
    if (!assignDriverId || !assignRouteId || !assignBusId) {
      alertCompat('Validation', 'Please select both driver and route');
      return;
    }
    try {
      setCreating(true);
      // Link Driver to Bus
      await api.put(`/transport/buses/${assignBusId}`, { driver_id: assignDriverId });
      // Link Bus to Route
      await api.put(`/transport/routes/${assignRouteId}`, { bus_id: assignBusId });
      // Set Driver on Route directly
      await api.post(`/transport/routes/${assignRouteId}/assign-driver`, { driver_id: assignDriverId });
      
      setAssignBusOpen(false);
      await fetchTransportData();
      alertCompat('Success', 'Bus, Route, and Driver unified successfully');
    } catch (e: any) {
      alertCompat('Error', e?.message || 'Assignment failed');
    } finally {
      setCreating(false);
    }
  };

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

  const renderBusItem = ({ item, index }: { item: BusItem; index: number }) => (
    <Animated.View entering={FadeInDown.delay(index * 60).duration(400).springify()}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.routeContainer}>
            <LinearGradient
              colors={['#4F46E5', '#6366F1']}
              style={styles.iconBox}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="bus" size={22} color="#fff" />
            </LinearGradient>
            <View>
              <Text style={styles.routeTitle}>{item.route_name || 'Unassigned'}</Text>
              <Text style={styles.vehicleText}>{item.bus_no}</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, item.is_active ? styles.statusOnTime : styles.statusDelayed]}>
            <Text style={[styles.statusText, { color: item.is_active ? '#065F46' : '#92400E' }]}>
              {item.is_active ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.detailsContainer}>
          <View style={styles.detailRow}>
            <Ionicons name="person" size={16} color="#94A3B8" style={styles.detailIcon} />
            <Text style={styles.detailText}>
              {item.driver_name || 'No Driver'} ({item.registration_no || 'No Reg'})
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="people" size={16} color="#94A3B8" style={styles.detailIcon} />
            <Text style={styles.detailText}>Capacity: {item.capacity}</Text>
          </View>
        </View>
        
        <TouchableOpacity
          style={styles.trackButton}
          onPress={() => openAssignModal(item)}
          activeOpacity={0.8}
        >
          <Text style={styles.trackButtonText}>Assign Route & Driver</Text>
        </TouchableOpacity>
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
                <Ionicons name="person-circle-outline" size={16} color="#CBD5E1" />
                <Text style={styles.driverHint} numberOfLines={1}>
                  {item.route_driver_name ? item.route_driver_name : 'No driver assigned'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
          <View style={styles.busActionsRow}>
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
            onPress={async () => {
              try {
                const detail = await api.get<{
                  route: string;
                  trip: { ui_status?: string } | null;
                  stops: { name: string; status: string | null }[];
                }>(`/transport/routes/${item.route_id}/live`);
                const lines = detail.stops
                  .map((s) => `${s.name}: ${s.status || '—'}`)
                  .join('\n');
                alertCompat(detail.route, lines || 'No stops details');
              } catch {
                alertCompat('Error', 'Could not load route live status');
              }
            }}
          >
            <Text style={styles.trackButtonText}>View Stop Progress</Text>
            <MaterialIcons name="arrow-forward-ios" size={14} color="#0EA5E9" />
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  };

  const onRefresh = () => {
    if (tab === 'buses') fetchTransportData();
    else if (tab === 'routes') fetchRoutes();
    else fetchLive();
  };

  const EmptyState = ({ message, icon }: { message: string; icon: keyof typeof Ionicons.glyphMap }) => (
    <Animated.View entering={FadeInUp.duration(500)} style={styles.emptyContainer}>
      <View style={styles.emptyIconWrapper}>
        <Ionicons name={icon} size={64} color="#CBD5E1" />
      </View>
      <Text style={styles.emptyTitle}>{message}</Text>
      <Text style={styles.emptySub}>Refresh the page or check back later.</Text>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />
      <AdminHeader
        title="Transport Management"
        showBackButton={true}
        rightAction={{
          icon: 'cloud-upload-outline',
          onPress: () => router.push('/admin/transport-import'),
        }}
      />

      <FlatList
        data={(tab === 'buses' ? transportData : tab === 'routes' ? routeRows : liveRows) as any[]}
        keyExtractor={(item: any) => item.route_id ? String(item.route_id) : item.id ? String(item.id) : Math.random().toString()}
        renderItem={tab === 'buses' ? renderBusItem as any : tab === 'routes' ? renderRouteItem as any : renderLiveRow as any}
        contentContainerStyle={[styles.listContent, isDesktop && styles.listContentDesktop]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor="#6366F1" />}
        ListHeaderComponent={
          <>
            <View style={styles.statsContainer}>
              <View style={styles.statCard}>
                <View style={[styles.statIconBadge, { backgroundColor: '#EEF2FF' }]}>
                  <Ionicons name="bus-outline" size={24} color="#6366F1" />
                </View>
                <View style={styles.statTextGroup}>
                  <Text style={styles.statValue}>{transportData.length}</Text>
                  <Text style={styles.statLabel}>Total Buses</Text>
                </View>
              </View>
              <View style={styles.statCard}>
                <View style={[styles.statIconBadge, { backgroundColor: '#ECFDF5' }]}>
                  <Ionicons name="map-outline" size={24} color="#10B981" />
                </View>
                <View style={styles.statTextGroup}>
                  <Text style={styles.statValue}>{routeRows.length}</Text>
                  <Text style={styles.statLabel}>Active Routes</Text>
                </View>
              </View>
              {isDesktop && (
                <View style={[styles.statCard, { marginRight: 0 }]}>
                  <View style={[styles.statIconBadge, { backgroundColor: '#E0F2FE' }]}>
                    <Ionicons name="navigate-circle-outline" size={24} color="#0EA5E9" />
                  </View>
                  <View style={styles.statTextGroup}>
                    <Text style={styles.statValue}>{liveRows.length}</Text>
                    <Text style={styles.statLabel}>Live Trips</Text>
                  </View>
                </View>
              )}
            </View>

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
          </>
        }
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              message={tab === 'buses' ? 'No buses found' : tab === 'routes' ? 'No routes found' : 'No live trips today'}
              icon={tab === 'buses' ? 'bus-outline' : tab === 'routes' ? 'map-outline' : 'navigate-outline'}
            />
          ) : (
            <View style={styles.loaderArea}>
              <LogoLoader size={60} color="#6366F1" />
            </View>
          )
        }
      />

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

      {/* ASSIGN BUS MODAL */}
      <Modal visible={assignBusOpen} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => !creating && setAssignBusOpen(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.sheetTitle}>Assign Bus to Driver & Route</Text>
              
              <Text style={styles.inputLabel}>Select Driver</Text>
              <FlatList 
                data={drivers}
                style={{ maxHeight: 150, marginBottom: 12 }}
                keyExtractor={(d) => d.id}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={[styles.segChip, assignDriverId === item.id && styles.segChipOn, { marginBottom: 6, justifyContent: 'flex-start' }]} 
                    onPress={() => setAssignDriverId(item.id)}
                  >
                    <Text style={[styles.segChipTxt, assignDriverId === item.id && styles.segChipTxtOn]}>{item.display_name}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={{ color: '#64748B', fontStyle: 'italic', paddingVertical: 8 }}>No drivers available</Text>}
              />

              <Text style={styles.inputLabel}>Select Route</Text>
              <FlatList 
                data={routeRows}
                style={{ maxHeight: 150, marginBottom: 16 }}
                keyExtractor={(r) => r.id}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={[styles.segChip, assignRouteId === item.id && styles.segChipOn, { marginBottom: 6, justifyContent: 'flex-start' }]} 
                    onPress={() => setAssignRouteId(item.id)}
                  >
                    <Text style={[styles.segChipTxt, assignRouteId === item.id && styles.segChipTxtOn]}>{item.name}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={{ color: '#64748B', fontStyle: 'italic', paddingVertical: 8 }}>No routes created yet</Text>}
              />
              
              <View style={styles.sheetActions}>
                <TouchableOpacity style={styles.cancelBtn} disabled={creating} onPress={() => setAssignBusOpen(false)}>
                  <Text style={styles.cancelBtnTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.submitBtn} disabled={creating} onPress={confirmBusAssignment}>
                  {creating ? (
                    <Text style={styles.submitBtnTxt}>Assigning...</Text>
                  ) : (
                    <LinearGradient colors={['#10B981', '#059669']} style={styles.submitBtnBg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                      <Text style={styles.submitBtnTxt}>Confirm Assignment</Text>
                    </LinearGradient>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
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
      padding: 18,
      marginBottom: 16,
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
  });
