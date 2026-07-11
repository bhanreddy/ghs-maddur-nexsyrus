import React from 'react';
import { useTranslation } from 'react-i18next';
import { useRequireRole } from '@/src/hooks/useRequireRole';
import MessengerScreen from '@/src/components/messenger/MessengerScreen';
import StaffHeader from '@/src/components/StaffHeader';

/**
 * Teacher messenger: admin pinned at the top, plus a school-wide student
 * directory the teacher can search to start a chat with any student.
 */
export default function StaffMessages() {
  useRequireRole('staff', 'teacher', 'admin');
  const { t } = useTranslation();

  return (
    <MessengerScreen
      title={t('messages.title', 'Messages')}
      pinAdminInDirectory
      directoryTabs={[
        { key: 'directory', label: t('messages.tab_people', 'People'), roles: ['admin', 'student', 'parent'] },
      ]}
      renderHeader={({ onBack }) => (
        <StaffHeader
          title={t('messages.title', 'Messages')}
          showBackButton
          showMenuButton={false}
          onBack={onBack}
        />
      )}
    />
  );
}
