import { TourTarget } from '@/src/features/app-tour';
import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRequireRole } from '@/src/hooks/useRequireRole';
import MessengerScreen from '@/src/components/messenger/MessengerScreen';
import StaffHeader from '@/src/components/StaffHeader';
import ViewAsBanner from '@/src/components/ViewAsBanner';
import { useEffectiveStaffId } from '@/src/hooks/useEffectiveStaffId';

/**
 * Teacher messenger: admin pinned at the top, plus a school-wide student
 * directory the teacher can search to start a chat with any student.
 */
export default function StaffMessages() {
  useRequireRole('staff', 'teacher', 'admin');
  const { t } = useTranslation();
  const { isViewingAsAdmin, viewAsName } = useEffectiveStaffId();

  return (
    <TourTarget id="screen.staff-messages.overview" style={{ flex: 1 }}><TourTarget id="screen.staff-messages.workspace" style={{ flex: 1 }}><MessengerScreen
      title={t('messages.title', 'Messages')}
      pinAdminInDirectory
      directoryTabs={[
        { key: 'directory', label: t('messages.tab_people', 'People'), roles: ['admin', 'student', 'parent'] },
      ]}
      renderHeader={({ onBack }) => (
        <View>
          <StaffHeader
            title={t('messages.title', 'Messages')}
            subtitle={t('messages.staff_subtitle', 'Stay close to your class')}
            showBackButton
            showMenuButton={false}
            onBack={onBack}
          />
          {isViewingAsAdmin && <ViewAsBanner name={viewAsName} />}
        </View>
      )}
    /></TourTarget></TourTarget>
  );
}
