import { useEffect } from 'react';
import { getApp } from '@react-native-firebase/app';
import { getMessaging, getInitialNotification, onNotificationOpenedApp } from '@react-native-firebase/messaging';
import { useRouter } from 'expo-router';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from './useAuth';

// Verified route map — fallback if deepLink missing from payload
const NOTIFICATION_ROUTES: Record<string, string> = {
  ATTENDANCE_ABSENT: '/Screen/attendance',
  ATTENDANCE_PRESENT: '/Screen/attendance',
  DIARY_UPDATED: '/Screen/diary',
  RESULT_RELEASED: '/results',
  COMPLAINT_CREATED: '/Screen/complaints',
  COMPLAINT_RESPONSE: '/Screen/complaints',
  LMS_CONTENT: '/Screen/lms',
  TIMETABLE_UPDATED: '/Screen/timetable',
  NOTICE_ADMIN_STUDENT: '/Screen/announcements',
  FEE_REMINDER: '/Screen/fees',
  FEE_COLLECTED: '/Screen/fees',
  LEAVE_SUBMITTED: '/admin/leaves',
  LEAVE_APPROVED: '/staff/leaves',
  LEAVE_REJECTED: '/staff/leaves',
  EXPENSE_CREATED: '/admin/expenses',
  EXPENSE_APPROVED: '/accounts/expenses',
  EXPENSE_REJECTED: '/accounts/expenses',
  PAYROLL_SUCCESS: '/staff/payslip',
  ACCESS_RESPONSE: '/Screen/access',
  GIRL_SAFETY_RECEIVED: '/Screen/girl-safety',
  GIRL_SAFETY_UPDATE: '/Screen/girl-safety',
};

// Stored when notification tapped before auth is ready
let pendingRoute: string | null = null;

// Map old backend paths to avoid routing failures, since some old
// notifications on user devices may still have the old deepLinks in their payload
const LEGACY_ROUTES: Record<string, string> = {
  '/student/attendance': '/Screen/attendance',
  '/student/diary': '/Screen/diary',
  '/student/results': '/results',
  '/student/complaints': '/Screen/complaints',
  '/student/lms': '/Screen/lms',
  '/student/timetable': '/Screen/timetable',
  '/student/notices': '/Screen/announcements',
  '/student/fees': '/Screen/fees',
  '/staff/payroll': '/staff/payslip',
};

function resolveRoute(data: Record<string, any> | null | undefined): string | null {
  if (!data) return null;
  // Priority 1 — explicit deepLink from FCM payload (already correct path)
  if (data.deepLink && data.deepLink.trim() !== '') {
    const link = data.deepLink.trim();
    // Intercept legacy paths from old notifications
    return LEGACY_ROUTES[link] || link;
  }
  // Priority 2 — type-based fallback map
  if (data.type && NOTIFICATION_ROUTES[data.type]) {
    return NOTIFICATION_ROUTES[data.type];
  }
  return null;
}

export function useNotificationObserver() {
  const router = useRouter();
  const { user, loading } = useAuth();

  function navigate(route: string) {
    // Clean any accidental protocol prefix just in case
    const cleanRoute = '/' + route.replace(/^testapp:\/+/, '').replace(/^\/+/, '');
    try {
      if (!user || loading) {
        console.log('[Notifications] Auth not ready — storing pending route:', cleanRoute);
        pendingRoute = cleanRoute;
        return;
      }
      console.log('[Notifications] Navigating to:', cleanRoute);
      router.push(cleanRoute as any);
    } catch (err) {
      console.log('[Notifications] Navigation error:', err);
    }
  }

  // Flush pending route once auth is ready
  useEffect(() => {
    if (user && !loading && pendingRoute) {
      const route = pendingRoute;
      pendingRoute = null;
      console.log('[Notifications] Flushing pending route:', route);
      setTimeout(() => {
        try { router.push(route as any); } catch { }
      }, 300);
    }
  }, [user, loading]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let isMounted = true;
    const app = getApp();
    const msg = getMessaging(app);

    // CASE 1 — App KILLED, user tapped FCM notification
    getInitialNotification(msg).then((remoteMessage) => {
      if (!remoteMessage || !isMounted) return;
      const route = resolveRoute(remoteMessage.data);
      if (route) setTimeout(() => navigate(route), 500);
    });

    // CASE 2 — App BACKGROUNDED, user tapped FCM notification
    const unsubFCM = onNotificationOpenedApp(msg, (remoteMessage) => {
      const route = resolveRoute(remoteMessage.data);
      if (route) navigate(route);
    });

    // CASE 3 — User tapped expo-notifications notification (all states)
    const unsubExpo = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        const route = resolveRoute(data);
        if (route) navigate(route);
      }
    );

    // CASE 4 — App KILLED, user tapped expo-notifications notification
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response || !isMounted) return;
      const data = response.notification.request.content.data;
      const route = resolveRoute(data);
      if (route) setTimeout(() => navigate(route), 500);
    });

    return () => {
      isMounted = false;
      unsubFCM();
      unsubExpo.remove();
    };
  }, []);
}