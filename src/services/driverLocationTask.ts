/** One app-owned tracker. Screens observe it; only trip/auth changes stop it. */
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { api } from './apiClient';
import { supabase } from './supabaseConfig';
import { getActiveContextId } from './activeContextStore';
import { SCHOOL_ID } from '../constants/school';
export const DRIVER_LOCATION_TASK = 'driver-bus-location-task';
const SESSION_KEY = 'transport_tracking_session_v2';
const QUEUE_PREFIX = 'transport_location_queue_v2:';
interface Scope {
  authUserId: string;
  contextId: string | null;
  schoolId: number;
  trip_id: string;
  bus_id: string;
  session_id: string;
  device_id: string;
}
export interface DriverStopTarget {
  latitude: number;
  longitude: number;
}
export interface QueuedDriverFix {
  fix_id: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
  recorded_at: string;
  is_mocked: boolean;
}
export interface TrackingHealth {
  mode: 'stopped' | 'starting' | 'background' | 'foreground_only' | 'permission_denied' | 'offline' | 'error';
  queued: number;
  lastFixAt: number | null;
  lastUploadAt: number | null;
  message: string;
}
let health: TrackingHealth = {
  mode: 'stopped',
  queued: 0,
  lastFixAt: null,
  lastUploadAt: null,
  message: 'Location sharing stopped'
};
const listeners = new Set<() => void>();
export const getTrackingHealth = () => health;
export const subscribeTrackingHealth = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const updateHealth = (update: Partial<TrackingHealth>) => {
  health = {
    ...health,
    ...update
  };
  listeners.forEach(l => l());
};
let lifecycle: Promise<unknown> = Promise.resolve(),
  queueWork: Promise<unknown> = Promise.resolve();
let generation = 0,
  foreground: Location.LocationSubscription | null = null,
  flushing: Promise<number> | null = null;
const serial = <T,>(fn: () => Promise<T>): Promise<T> => {
  const next = lifecycle.then(fn, fn);
  lifecycle = next.catch(() => {});
  return next;
};
const queueSerial = <T,>(fn: () => Promise<T>): Promise<T> => {
  const next = queueWork.then(fn, fn);
  queueWork = next.catch(() => {});
  return next;
};
const queueKey = (s: Scope) => QUEUE_PREFIX + [s.schoolId, s.authUserId, s.contextId || 'default', s.trip_id, s.session_id, s.device_id].join(':');
async function scope(): Promise<Scope | null> {
  try {
    return JSON.parse((await AsyncStorage.getItem(SESSION_KEY)) || 'null');
  } catch {
    return null;
  }
}
async function identityMatches(s: Scope) {
  const session = (await supabase.auth.getSession()).data.session;
  return session?.user.id === s.authUserId && (await getActiveContextId()) === s.contextId && SCHOOL_ID === s.schoolId;
}
const same = (a: Scope | null, b: Scope) => a?.session_id === b.session_id && a?.trip_id === b.trip_id && a?.authUserId === b.authUserId && a?.contextId === b.contextId;
async function readQueue(s: Scope): Promise<QueuedDriverFix[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(queueKey(s))) || '[]');
  } catch {
    return [];
  }
}
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export function toQueuedFix(loc: Location.LocationObject): QueuedDriverFix | null {
  const c = loc?.coords;
  if (!c || !finite(c.latitude) || Math.abs(c.latitude) > 90 || !finite(c.longitude) || Math.abs(c.longitude) > 180 || !finite(loc.timestamp)) return null;
  return {
    fix_id: Crypto.randomUUID(),
    latitude: c.latitude,
    longitude: c.longitude,
    speed: finite(c.speed) && c.speed >= 0 ? c.speed * 3.6 : null,
    heading: finite(c.heading) && c.heading >= 0 && c.heading < 360 ? c.heading : null,
    accuracy: finite(c.accuracy) && c.accuracy >= 0 ? c.accuracy : null,
    recorded_at: new Date(loc.timestamp).toISOString(),
    is_mocked: loc.mocked === true
  };
}
export async function enqueueBusLocations(busId: string, locations: Location.LocationObject[]) {
  const s = await scope(),
    version = generation;
  if (!s || s.bus_id !== busId || !(await identityMatches(s))) return;
  await queueSerial(async () => {
    if (version !== generation || !same(await scope(), s)) return;
    const merged = [...(await readQueue(s)), ...locations.map(toQueuedFix).filter((f): f is QueuedDriverFix => f !== null)];
    const fixes = [...new Map(merged.filter(f => Date.parse(f.recorded_at) >= Date.now() - 21600000).map(f => [f.recorded_at, f])).values()].slice(-1000);
    await AsyncStorage.setItem(queueKey(s), JSON.stringify(fixes));
    updateHealth({
      queued: fixes.length,
      lastFixAt: locations.at(-1)?.timestamp || health.lastFixAt
    });
  });
}
export async function flushQueuedBusLocations(busId: string): Promise<number> {
  if (flushing) return flushing;
  const flushGeneration = generation;
  flushing = (async () => {
    const s = await scope(),
      version = generation;
    if (!s || s.bus_id !== busId || !(await identityMatches(s))) return 0;
    const net = await NetInfo.fetch();
    if (net.isConnected === false || net.isInternetReachable === false) {
      updateHealth({
        mode: 'offline',
        message: 'Offline — locations saved on this device'
      });
      return 0;
    }
    let total = 0;
    for (let chunk = 0; chunk < 10; chunk++) {
      if (version !== generation || !(await identityMatches(s)) || !same(await scope(), s)) break;
      const fixes = (await queueSerial(() => readQueue(s))).slice(0, 100);
      if (!fixes.length) break;
      const result = await api.post<{
        acknowledgements: {
          index: number;
          fix_id: string | null;
          status: string;
        }[];
      }>(`/transport/buses/${busId}/locations/batch`, {
        trip_id: s.trip_id,
        session_id: s.session_id,
        fixes
      }, {
        silent: true,
        timeoutMs: 15000,
        transportIdentity: {
          authUserId: s.authUserId,
          contextId: s.contextId
        }
      });
      if (version !== generation) break;
      const acknowledged = new Set((result.acknowledgements || []).filter(a => ['accepted', 'duplicate', 'rejected'].includes(a.status) && fixes[a.index]?.fix_id === a.fix_id).map(a => a.fix_id));
      if (!acknowledged.size) throw new Error('Server did not acknowledge queued locations');
      await queueSerial(async () => {
        const remaining = (await readQueue(s)).filter(f => !acknowledged.has(f.fix_id));
        await AsyncStorage.setItem(queueKey(s), JSON.stringify(remaining));
        updateHealth({
          queued: remaining.length,
          lastUploadAt: Date.now(),
          message: 'Location sharing active'
        });
      });
      total += acknowledged.size;
    }
    return total;
  })().catch(error => {
    const status = error?.statusCode ?? error?.status;
    if (flushGeneration === generation) {
      if ([401, 403, 404, 409].includes(status)) void stopDriverLocationUpdates().catch(() => {});
      updateHealth({
        mode: 'error',
        message: 'Upload interrupted — retrying saved locations'
      });
    }
    throw error;
  }).finally(() => {
    flushing = null;
  });
  return flushing;
}
export async function postBusLocation(busId: string, loc: Location.LocationObject) {
  await enqueueBusLocations(busId, [loc]);
  try {
    await flushQueuedBusLocations(busId);
  } catch {/* Retain unacknowledged fixes. */}
}
// Fixed safe cadence also works without a mounted screen or an available next-stop target.
export async function setDriverNextStopTarget(_target: DriverStopTarget | null) {}
export async function adaptDriverLocationSampling(_loc: Location.LocationObject) {
  return 5000;
}
export async function isDriverLocationTaskRunning() {
  if (Platform.OS === 'web') return false;
  try {
    return await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK);
  } catch {
    return false;
  }
}
async function stopNative() {
  foreground?.remove();
  foreground = null;
  if (await isDriverLocationTaskRunning()) await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
}
export async function startDriverLocationUpdates(busId: string, tripId?: string): Promise<void> {
  const version = generation;
  return serial(async () => {
    if (Platform.OS === 'web' || version !== generation) return;
    const auth = (await supabase.auth.getSession()).data.session;
    if (!auth) return;
    const contextId = await getActiveContextId();
    const data = await api.get<{
      trip: {
        id: string;
        bus_id: string;
        status: string;
      } | null;
    }>('/transport/driver/my-trip', undefined, {
      silent: true,
      transportIdentity: {
        authUserId: auth.user.id,
        contextId
      }
    });
    const trip = data.trip;
    if (!trip || !['active', 'in_progress'].includes(trip.status) || trip.bus_id !== busId || tripId && trip.id !== tripId) return;
    const lease = await api.post<Pick<Scope, 'trip_id' | 'bus_id' | 'session_id' | 'device_id'>>(`/transport/trips/${trip.id}/tracking-session`, {}, {
      silent: true,
      transportIdentity: {
        authUserId: auth.user.id,
        contextId
      }
    });
    if (version !== generation) return;
    const s: Scope = {
      ...lease,
      authUserId: auth.user.id,
      contextId,
      schoolId: SCHOOL_ID
    };
    if (!(await identityMatches(s))) return;
    const old = await scope();
    if (!same(old, s)) {
      await stopNative();
      if (old) await AsyncStorage.removeItem(queueKey(old));
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s));
    }
    const fg = await Location.getForegroundPermissionsAsync();
    if (!fg.granted) {
      await stopNative();
      updateHealth({
        mode: 'permission_denied',
        message: 'Location permission is required — enable it in Settings'
      });
      return;
    }
    const bg = await Location.getBackgroundPermissionsAsync();
    if (version !== generation) return;
    if (bg.granted) {
      try {
        if (!(await isDriverLocationTaskRunning())) await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 0,
          pausesUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'Trip in progress',
            notificationBody: 'Sharing bus location with parents',
            killServiceOnDestroy: false
          }
        });
        foreground?.remove();
        foreground = null;
        updateHealth({
          mode: 'background',
          message: 'Background location sharing active'
        });
      } catch {
        await startForeground(s, version);
      }
    } else await startForeground(s, version);
    if (version !== generation) {
      await stopNative();
      return;
    }
    try {
      await flushQueuedBusLocations(busId);
    } catch {/* A later fix or reconnect retries. */}
  });
}
async function startForeground(s: Scope, version: number) {
  if (!foreground) foreground = await Location.watchPositionAsync({
    accuracy: Location.Accuracy.High,
    timeInterval: 5000,
    distanceInterval: 0
  }, loc => {
    if (version === generation) void postBusLocation(s.bus_id, loc);
  });
  updateHealth({
    mode: 'foreground_only',
    message: 'Foreground only — keep the app open or allow background location in Settings'
  });
}
export async function stopDriverLocationUpdates(expectedTripId?: string) {
  if (expectedTripId && (await scope())?.trip_id !== expectedTripId) return;
  generation++;
  return serial(async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    await stopNative();
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter(k => k.startsWith(QUEUE_PREFIX) || k.startsWith('driver_location_queue:') || k.startsWith('driver_tracking_')));
    updateHealth({
      mode: 'stopped',
      queued: 0,
      lastFixAt: null,
      lastUploadAt: null,
      message: 'Location sharing stopped'
    });
  });
}
export async function reconcileDriverTracking() {
  const s = await scope();
  if (!s) {
    if (await isDriverLocationTaskRunning()) await stopDriverLocationUpdates();
    return;
  }
  if (!(await identityMatches(s))) {
    await stopDriverLocationUpdates();
    return;
  }
  const data = await api.get<{
    trip: {
      id: string;
      status: string;
    } | null;
  }>('/transport/driver/my-trip', undefined, {
    silent: true,
    transportIdentity: {
      authUserId: s.authUserId,
      contextId: s.contextId
    }
  });
  if (!same(await scope(), s)) return;
  if (data.trip?.id !== s.trip_id || !['active', 'in_progress'].includes(data.trip.status)) {
    await stopDriverLocationUpdates(s.trip_id);
    return;
  }
  await startDriverLocationUpdates(s.bus_id, s.trip_id);
}
if (Platform.OS !== 'web') NetInfo.addEventListener(state => {
  if (state.isConnected && state.isInternetReachable !== false) void reconcileDriverTracking().catch(() => {});
});
if (Platform.OS !== 'web') TaskManager.defineTask(DRIVER_LOCATION_TASK, async ({
  data,
  error
}) => {
  if (error) {
    updateHealth({
      mode: 'error',
      message: 'Device location service interrupted'
    });
    return;
  }
  const s = await scope();
  if (!s) return;
  if (!(await identityMatches(s))) {
    await stopDriverLocationUpdates();
    return;
  }
  const locations = (data as {
    locations?: Location.LocationObject[];
  })?.locations;
  if (!locations?.length) return;
  await enqueueBusLocations(s.bus_id, locations);
  try {
    await flushQueuedBusLocations(s.bus_id);
  } catch {/* Keep the queue, including when the network is down. */}
});
