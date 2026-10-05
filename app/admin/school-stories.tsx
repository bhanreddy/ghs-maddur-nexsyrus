import { TourTarget } from '@/src/features/app-tour';
import React from 'react';
import { View } from 'react-native';
import AdminHeader from '../../src/components/AdminHeader';
import { useTheme } from '../../src/hooks/useTheme';
import SchoolStoriesManager from '../../src/features/school-stories/SchoolStoriesManager';

export default function AdminSchoolStoriesScreen() {
  const { theme } = useTheme();
  return (
    <TourTarget id="screen.admin-school-stories.workspace" native><View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <TourTarget id="screen.admin-school-stories.overview"><AdminHeader title="School Stories" showBackButton /></TourTarget>
      <SchoolStoriesManager scopeAll />
    </View></TourTarget>
  );
}
