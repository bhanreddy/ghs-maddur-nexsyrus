// Set default test environment variables
process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'mock-anon-key';
process.env.EXPO_PUBLIC_API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://mock.api.com';
process.env.EXPO_PUBLIC_SCHOOL_ID = process.env.EXPO_PUBLIC_SCHOOL_ID || '1';
process.env.EXPO_PUBLIC_SCHOOL_CODE = process.env.EXPO_PUBLIC_SCHOOL_CODE || 'DEMO';

import 'react-native-gesture-handler/jestSetup';

// Mock Supabase to prevent background auth refresh timers during tests
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
  })),
}));

// Mock Async Storage
jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock Global Fetch
global.fetch = jest.fn(() =>
    Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
    })
);

// Silence the warning: Animated: `useNativeDriver` is not supported because the native animated module is missing
// jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

// Mock Expo Haptics
jest.mock('expo-haptics', () => ({
    ImpactFeedbackStyle: {
        Light: 'light',
        Medium: 'medium',
        Heavy: 'heavy',
    },
    impactAsync: jest.fn(),
    notificationAsync: jest.fn(),
    selectionAsync: jest.fn(),
}));

// Mock Expo Linear Gradient
jest.mock('expo-linear-gradient', () => ({
    LinearGradient: 'LinearGradient',
}));

// Mock Expo AV
jest.mock('expo-av', () => ({
    Audio: {
        Sound: {
            createAsync: jest.fn().mockResolvedValue({
                sound: {
                    playAsync: jest.fn(),
                    unloadAsync: jest.fn(),
                    setStatusAsync: jest.fn(),
                    setOnPlaybackStatusUpdate: jest.fn(),
                },
            }),
        },
        setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
    },
}));
// expo-audio's native SharedObject prototypes are not present in Jest.
jest.mock('expo-audio', () => ({
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
    createAudioPlayer: jest.fn(() => ({
        play: jest.fn(), pause: jest.fn(), remove: jest.fn(),
        setPlaybackRate: jest.fn(), addListener: jest.fn(() => ({ remove: jest.fn() })),
    })),
}));
