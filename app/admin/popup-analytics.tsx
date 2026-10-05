import { TourTarget } from '@/src/features/app-tour';
import React from 'react';
import { View } from 'react-native';
import AdminHeader from '../../src/components/AdminHeader';
import { useTheme } from '../../src/hooks/useTheme';
import PopupAnalyticsScreen from '../../src/features/popups/admin/PopupAnalyticsScreen';

export default function AdminPopupAnalyticsRoute() {
  const { theme } = useTheme();
  return (
    <TourTarget id="screen.admin-popup-analytics.workspace" native><View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <TourTarget id="screen.admin-popup-analytics.overview"><AdminHeader title="Popup Analytics" showBackButton /></TourTarget>
      <PopupAnalyticsScreen />
    </View></TourTarget>
  );
}
