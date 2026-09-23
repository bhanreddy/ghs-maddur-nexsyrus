const mockStore = new Map<string, string>();
const mockApi = {
  get: jest.fn(),
  post: jest.fn()
};
const mockLocation = {
  getForegroundPermissionsAsync: jest.fn(),
  getBackgroundPermissionsAsync: jest.fn(),
  hasStartedLocationUpdatesAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  Accuracy: {
    High: 6
  }
};
let mockAuthId = 'driver-a';
let mockContext: string | null = 'context-a';
let mockTask: any;
let mockId = 0;
jest.mock('react-native', () => ({
  Platform: {
    OS: 'android'
  }
}));
jest.mock('expo-location', () => mockLocation);
jest.mock('expo-task-manager', () => ({
  defineTask: (_name: string, task: any) => {
    mockTask = task;
  }
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => `fix-${++mockId}`
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => mockStore.get(k) || null,
    setItem: async (k: string, v: string) => {
      mockStore.set(k, v);
    },
    removeItem: async (k: string) => {
      mockStore.delete(k);
    },
    getAllKeys: async () => [...mockStore.keys()],
    multiRemove: async (keys: string[]) => keys.forEach(k => mockStore.delete(k))
  }
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: async () => ({
      isConnected: true,
      isInternetReachable: true
    }),
    addEventListener: () => () => {}
  }
}));
jest.mock('./apiClient', () => ({
  api: mockApi
}));
jest.mock('./supabaseConfig', () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: {
          session: {
            user: {
              id: mockAuthId
            }
          }
        }
      })
    }
  }
}));
jest.mock('./activeContextStore', () => ({
  getActiveContextId: async () => mockContext
}));
jest.mock('../constants/school', () => ({
  SCHOOL_ID: 1
}));
const tracking = require('./driverLocationTask') as typeof import('./driverLocationTask');
const position = (timestamp = Date.now(), coords = {}) => ({
  timestamp,
  coords: {
    latitude: 17,
    longitude: 78,
    accuracy: 5,
    altitude: null,
    altitudeAccuracy: null,
    speed: 0,
    heading: -1,
    ...coords
  },
  mocked: false
});
const ack = (body: any) => ({
  acknowledgements: body.fixes.map((f: any, index: number) => ({
    index,
    fix_id: f.fix_id,
    status: 'accepted'
  }))
});
beforeEach(async () => {
  await tracking.stopDriverLocationUpdates();
  mockStore.clear();
  jest.clearAllMocks();
  mockAuthId = 'driver-a';
  mockContext = 'context-a';
  mockLocation.getForegroundPermissionsAsync.mockResolvedValue({
    granted: true
  });
  mockLocation.getBackgroundPermissionsAsync.mockResolvedValue({
    granted: true
  });
  mockLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(false);
  mockLocation.startLocationUpdatesAsync.mockResolvedValue(undefined);
  mockLocation.stopLocationUpdatesAsync.mockResolvedValue(undefined);
  mockLocation.watchPositionAsync.mockResolvedValue({
    remove: jest.fn()
  });
  mockApi.get.mockResolvedValue({
    trip: {
      id: 'trip-a',
      bus_id: 'bus-a',
      status: 'in_progress'
    }
  });
  mockApi.post.mockImplementation(async (path: string, body: any) => path.includes('tracking-session') ? {
    trip_id: 'trip-a',
    bus_id: 'bus-a',
    session_id: 'session-a',
    device_id: 'device-a'
  } : ack(body));
});
afterAll(async () => {
  await tracking.stopDriverLocationUpdates();
});
test('unknown heading/speed become null and invalid coordinates are rejected', () => {
  const fix = tracking.toQueuedFix(position(Date.now(), {
    speed: -1
  }));
  expect(fix?.heading).toBeNull();
  expect(fix?.speed).toBeNull();
  expect(tracking.toQueuedFix(position(Date.now(), {
    latitude: null
  }))).toBeNull();
});
test('two screens starting simultaneously create one native subscription', async () => {
  mockLocation.hasStartedLocationUpdatesAsync.mockImplementation(async () => mockLocation.startLocationUpdatesAsync.mock.calls.length > 0);
  await Promise.all([tracking.startDriverLocationUpdates('bus-a'), tracking.startDriverLocationUpdates('bus-a')]);
  expect(mockLocation.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
});
test('background callback uploads trip and session identity without a screen', async () => {
  await tracking.startDriverLocationUpdates('bus-a');
  await mockTask({
    data: {
      locations: [position()]
    }
  });
  const call = mockApi.post.mock.calls.find((c: any) => c[0].includes('/locations/batch'));
  expect(call[1]).toMatchObject({
    trip_id: 'trip-a',
    session_id: 'session-a'
  });
  expect(call[1].fixes[0].accuracy).toBe(5);
  expect(tracking.getTrackingHealth().queued).toBe(0);
});
test('partial acknowledgements retain only unacknowledged fixes', async () => {
  await tracking.startDriverLocationUpdates('bus-a');
  await tracking.enqueueBusLocations('bus-a', [position(Date.now() - 1000), position()]);
  let calls = 0;
  mockApi.post.mockImplementation(async (_path: string, body: any) => {
    calls++;
    if (calls > 1) throw new Error('offline');
    return {
      acknowledgements: [{
        index: 0,
        fix_id: body.fixes[0].fix_id,
        status: 'rejected'
      }]
    };
  });
  await expect(tracking.flushQueuedBusLocations('bus-a')).rejects.toThrow('offline');
  expect(tracking.getTrackingHealth().queued).toBe(1);
});
test('large offline queues upload in bounded chunks', async () => {
  await tracking.startDriverLocationUpdates('bus-a');
  const now = Date.now();
  await tracking.enqueueBusLocations('bus-a', Array.from({
    length: 230
  }, (_, i) => position(now - i * 10)));
  await tracking.flushQueuedBusLocations('bus-a');
  const batches = mockApi.post.mock.calls.filter((c: any) => c[0].includes('/locations/batch'));
  expect(batches.map((c: any) => c[1].fixes.length)).toEqual([100, 100, 30]);
});
test('account change cannot send previous driver queue', async () => {
  await tracking.startDriverLocationUpdates('bus-a');
  await tracking.enqueueBusLocations('bus-a', [position()]);
  mockAuthId = 'driver-b';
  expect(await tracking.flushQueuedBusLocations('bus-a')).toBe(0);
  expect(mockApi.post.mock.calls.filter((c: any) => c[0].includes('/locations/batch'))).toHaveLength(0);
  await tracking.reconcileDriverTracking();
  expect(mockStore.size).toBe(0);
});
test('stop wins against an in-flight asynchronous start', async () => {
  let release!: (value: unknown) => void;
  mockApi.get.mockImplementationOnce(() => new Promise(r => {
    release = r;
  }));
  const start = tracking.startDriverLocationUpdates('bus-a');
  for (let i = 0; i < 8; i++) await Promise.resolve();
  const stop = tracking.stopDriverLocationUpdates();
  release({
    trip: {
      id: 'trip-a',
      bus_id: 'bus-a',
      status: 'in_progress'
    }
  });
  await Promise.all([start, stop]);
  expect(mockLocation.startLocationUpdatesAsync).not.toHaveBeenCalled();
  expect(mockStore.size).toBe(0);
});
test('foreground fallback is explicit when background permission is absent', async () => {
  mockLocation.getBackgroundPermissionsAsync.mockResolvedValue({
    granted: false
  });
  await tracking.startDriverLocationUpdates('bus-a');
  expect(tracking.getTrackingHealth().mode).toBe('foreground_only');
  expect(mockLocation.watchPositionAsync).toHaveBeenCalledTimes(1);
});
