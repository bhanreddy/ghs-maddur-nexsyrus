import React from 'react';
import { useTranslation } from 'react-i18next';
import { useRequireRole } from '@/src/hooks/useRequireRole';
import MessengerScreen from '@/src/components/messenger/MessengerScreen';
import AdminHeader from '@/src/components/AdminHeader';

/**
 * Admin messenger: Teachers + Students directory tabs, school-wide search,
 * and group creation (broadcast or open chat).
 */
export default function AdminMessages() {
  useRequireRole('admin', 'principal');
  const { t } = useTranslation();

  return (
    <MessengerScreen
      title={t('messages.title', 'Messages')}
      canCreateGroup
      directoryTabs={[
        { key: 'teachers', label: t('roles.teacher', 'Teachers'), roles: ['teacher', 'staff'] },
        { key: 'students', label: t('roles.student', 'Students'), roles: ['student', 'parent'] },
      ]}
      renderHeader={({ onCreateGroup }) => (
        <AdminHeader
          title={t('messages.title', 'Messages')}
          showBackButton
          showMenuButton={false}
          rightAction={{ icon: 'people-circle-outline', onPress: onCreateGroup }}
        />
      )}
    />
  );
}
