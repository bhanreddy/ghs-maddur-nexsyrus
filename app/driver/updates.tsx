import { TourTarget } from '@/src/features/app-tour';
import React from 'react';
import { View, Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import PopupHistoryScreen from '../../src/features/popups/screens/PopupHistoryScreen';

export default function DriverUpdatesRoute() {
  const { theme, isDark } = useTheme();
  const router = useRouter();
  return (
    <TourTarget id="screen.driver-updates.overview" native><TourTarget id="screen.driver-updates.workspace" native><View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 12 }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }}
        >
          <Ionicons name="arrow-back" size={20} color={theme.colors.textStrong} />
        </Pressable>
        <Text style={{ fontSize: 20, fontWeight: '700', color: theme.colors.textStrong }}>Updates</Text>
      </View>
      <PopupHistoryScreen embedded />
    </View></TourTarget></TourTarget>
  );
}
