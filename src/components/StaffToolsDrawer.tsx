import React from 'react';
import { useNavigation, useRouter } from 'expo-router';
import MenuOverlay from './MenuOverlay';
import { getStaffDestinations } from '../config/staffNavigation';
import { useStaffPortalConfig } from '../hooks/useStaffPortalConfig';
import { useEffectiveStaffId } from '../hooks/useEffectiveStaffId';

/** Mounted only while open, so secondary tools do not fetch on every header mount. */
export default function StaffToolsDrawer({ onClose, photoUrl }: { onClose: () => void; photoUrl?: string | null }) {
  const { payslipsEnabled, loading } = useStaffPortalConfig();
  const navigation = useNavigation();
  const router = useRouter();
  const { staffId, isViewingAsAdmin, viewAsName, userId, actorUserId } = useEffectiveStaffId();
  return <MenuOverlay
    visible
    userType="staff"
    photoUrl={photoUrl}
    onClose={onClose}
    menuItems={getStaffDestinations(!loading && payslipsEnabled).map(item => ({
      key: item.key, label: item.title, icon: item.icon, link: item.route, group: item.group,
    }))}
    onNavigate={route => {
      if (!route.startsWith('/staff/')) { router.push(route as any); return; }
      // Use the staff pager, matching Home and the footer, and retain view-as context.
      (navigation as any).navigate(route.slice('/staff/'.length), isViewingAsAdmin
        ? { staffId, viewAsName, viewAsUserId: userId, viewAsActorId: actorUserId }
        : undefined);
    }}
  />;
}
