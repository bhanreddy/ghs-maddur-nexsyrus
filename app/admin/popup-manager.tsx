import { TourTarget } from '@/src/features/app-tour';
import React from 'react';
import { View } from 'react-native';
import AdminHeader from '../../src/components/AdminHeader';
import { useTheme } from '../../src/hooks/useTheme';
import PopupManagerScreen from '../../src/features/popups/admin/PopupManagerScreen';

export default function AdminPopupManagerRoute() {
  const { theme } = useTheme();
  return (
    <TourTarget id="screen.admin-popup-manager.workspace" native><View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <TourTarget id="screen.admin-popup-manager.overview"><AdminHeader title="Popup Manager" showBackButton /></TourTarget>
      <PopupManagerScreen />
    </View></TourTarget>
  );
}
