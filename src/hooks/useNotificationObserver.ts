import { useCallback, useEffect, useRef } from 'react';
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
};

interface PendingNotification {
  route: string;
  recipientUserId: string | null;
}

// Stored when notification tapped before auth is ready.
let pendingNotification: PendingNotification | null = null;

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

function resolveRecipientUserId(data: Record<string, any> | null | undefined): string | null {
  if (!data) return null;
  // `recipientUserId` is emitted by the current backend. Only use explicit
  // recipient fields: a generic `user_id` in an older notification can refer
  // to a sender or another entity, not the account that received the alert.
  const value = data.recipientUserId || data.recipient_user_id;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function useNotificationObserver() {
  const router = useRouter();
  const { user, loading, switchAccount } = useAuth();
  const authRef = useRef({ user, loading, switchAccount });
  const switchingRef = useRef(false);

  // The native listeners are registered once, so read the current auth state
  // from a ref instead of closing over the user present at mount time.
  authRef.current = { user, loading, switchAccount };

  const navigate = useCallback(async (route: string, recipientUserId: string | null) => {
    // Clean any accidental protocol prefix just in case
    const cleanRoute = '/' + route.replace(/^testapp:\/+/, '').replace(/^\/+/, '');
    try {
      const activeAuth = authRef.current;
      const activeUserId = activeAuth.user?.userId ?? null;
      if (!activeUserId || activeAuth.loading) {
        console.log('[Notifications] Auth not ready — storing pending route:', cleanRoute);
        pendingNotification = { route: cleanRoute, recipientUserId };
        return;
      }

      if (recipientUserId && recipientUserId !== activeUserId) {
        if (switchingRef.current) {
          // Keep the most recent tap and process it once the in-flight switch
          // settles. A notification must never open under the wrong account.
          pendingNotification = { route: cleanRoute, recipientUserId };
          return;
        }

        switchingRef.current = true;
        try {
          const result = await activeAuth.switchAccount(recipientUserId);
          if (result.error || result.session?.validatedUser?.userId !== recipientUserId) {
            // The notification's account is no longer stored locally or can no
            // longer be restored. Preserve the active account and do not route.
            console.warn('[Notifications] Could not switch to notification recipient:', result.error || 'recipient session unavailable');
            return;
          }
        } finally {
          switchingRef.current = false;
        }
      }

      console.log('[Notifications] Navigating to:', cleanRoute);
      router.push(cleanRoute as any);
    } catch (err) {
      console.log('[Notifications] Navigation error:', err);
    }
  }, [router]);

  // Flush a tap received before auth is ready.
  useEffect(() => {
    if (user && !loading && pendingNotification) {
      const notification = pendingNotification;
      pendingNotification = null;
      console.log('[Notifications] Flushing pending route:', notification.route);
      setTimeout(() => {
        void navigate(notification.route, notification.recipientUserId);
      }, 300);
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let isMounted = true;
    const app = getApp();
    const msg = getMessaging(app);

    // CASE 1 — App KILLED, user tapped FCM notification
    getInitialNotification(msg).then((remoteMessage) => {
      if (!remoteMessage || !isMounted) return;
      const route = resolveRoute(remoteMessage.data);
      if (route) setTimeout(() => void navigate(route, resolveRecipientUserId(remoteMessage.data)), 500);
    });

    // CASE 2 — App BACKGROUNDED, user tapped FCM notification
    const unsubFCM = onNotificationOpenedApp(msg, (remoteMessage) => {
      const route = resolveRoute(remoteMessage.data);
      if (route) void navigate(route, resolveRecipientUserId(remoteMessage.data));
    });

    // CASE 3 — User tapped expo-notifications notification (all states)
    const unsubExpo = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        const route = resolveRoute(data);
        if (route) void navigate(route, resolveRecipientUserId(data));
      }
    );

    // CASE 4 — App KILLED, user tapped expo-notifications notification
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response || !isMounted) return;
      const data = response.notification.request.content.data;
      const route = resolveRoute(data);
      if (route) setTimeout(() => void navigate(route, resolveRecipientUserId(data)), 500);
    });

    return () => {
      isMounted = false;
      unsubFCM();
      unsubExpo.remove();
    };
  }, [navigate]);
}
