import { TourTarget } from '@/src/features/app-tour';
import React from 'react';
import StaffHeader from '../../src/components/StaffHeader';
import ScreenLayout from '../../src/components/ScreenLayout';
import PopupHistoryScreen from '../../src/features/popups/screens/PopupHistoryScreen';

export default function StaffUpdatesRoute() {
  return (
    <TourTarget id="screen.staff-updates.workspace" style={{ flex: 1 }}><ScreenLayout>
      <TourTarget id="screen.staff-updates.overview"><StaffHeader showBackButton title="Updates" /></TourTarget>
      <PopupHistoryScreen embedded />
    </ScreenLayout></TourTarget>
  );
}
