import { TourTarget } from '@/src/features/app-tour';
import React from 'react';
import { View } from 'react-native';
import AdminHeader from '../../src/components/AdminHeader';
import { useTheme } from '../../src/hooks/useTheme';
import PopupHistoryScreen from '../../src/features/popups/screens/PopupHistoryScreen';

export default function AccountsUpdatesRoute() {
  const { theme } = useTheme();
  return (
    <TourTarget id="screen.accounts-updates.workspace" native><View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <TourTarget id="screen.accounts-updates.overview"><AdminHeader title="Updates" showBackButton /></TourTarget>
      <PopupHistoryScreen embedded />
    </View></TourTarget>
  );
}
