import { TourTarget } from '@/src/features/app-tour';
import React from 'react';
import StaffHeader from '../../src/components/StaffHeader';
import ScreenLayout from '../../src/components/ScreenLayout';
import ViewAsBanner from '../../src/components/ViewAsBanner';
import { useEffectiveStaffId } from '../../src/hooks/useEffectiveStaffId';
import SchoolStoriesManager from '../../src/features/school-stories/SchoolStoriesManager';

export default function StaffSchoolStoriesScreen() {
  const { isViewingAsAdmin, viewAsName } = useEffectiveStaffId();
  return (
    <TourTarget id="screen.staff-school-stories.workspace" style={{ flex: 1 }}><ScreenLayout>
      <TourTarget id="screen.staff-school-stories.overview"><StaffHeader showBackButton title="School Stories" /></TourTarget>
      {isViewingAsAdmin && <ViewAsBanner name={viewAsName} />}
      <SchoolStoriesManager scopeAll={false} />
    </ScreenLayout></TourTarget>
  );
}
