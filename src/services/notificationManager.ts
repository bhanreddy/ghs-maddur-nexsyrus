
import { getApp } from '@react-native-firebase/app';
import { getMessaging, getToken, onMessage, onTokenRefresh, requestPermission, AuthorizationStatus } from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './apiClient';
import { translateNotification } from './notificationTranslations';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldVibrate: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldSetBadge: true,
  }),
});

// ─── Deduplication Constants ───
const PROCESSED_IDS_KEY = 'fcm_processed_message_ids';
const MAX_STORED_IDS = 200; // Keep last 200 to avoid unbounded growth

class NotificationManager {

  private unsubscribeOnMessage?: () => void;
  private unsubscribeOnTokenRefresh?: () => void;

  // ─── In-memory dedup & channel guard ───
  private seenIds = new Set<string>();
  private channelsReady = false;
  private cachedLanguage: string = 'en';

  async loadLanguagePreference(): Promise<void> {
    try {
      const lang = await AsyncStorage.getItem('appLanguage');
      this.cachedLanguage = lang || 'en';
    } catch {
      this.cachedLanguage = 'en';
    }
  }

  // ─── Channel Management ───

  /**
   * Create all Android notification channels (Custom sound only).
   * Must be called before any notification is displayed.
   * Guarded to run only once per session.
   */
  async createChannels() {
    if (this.channelsReady) return;   // skip if already created this session
    if (Platform.OS !== 'android') return;



    // Base sets of channels for the 5 categories
    const categories = [
      { id: 'emergency', name: 'Emergency Alerts', sound: 'emergency.wav', vibrate: [0, 500, 500, 500] },
      { id: 'fee_reminder', name: 'Fee Reminders', sound: 'fee_reminder.wav', vibrate: [0, 250, 250, 250] },
      { id: 'voice_alert', name: 'General Alerts', sound: 'voice_alert.wav', vibrate: [0, 250, 250, 250] },
      { id: 'attendance_absent_alert', name: 'Absent Alerts', sound: 'attendance_absent_alert.wav', vibrate: [0, 500, 500, 500] },
      { id: 'notification_default', name: 'Default Notifications', sound: 'notification_default.wav', vibrate: [0, 250, 250, 250] }
    ];

    for (const cat of categories) {
      const importance = Notifications.AndroidImportance.MAX;
      // Strip sound file extension for Android channel
      const soundBase = cat.sound.replace(/\.[^/.]+$/, "");

      // Create Custom version only (with custom bundled sound - no extension)
      await Notifications.setNotificationChannelAsync(`${cat.id}_custom`, {
        name: `${cat.name}`,
        importance: importance,
        sound: soundBase,
        vibrationPattern: cat.vibrate,
        enableVibrate: true,
        lightColor: '#FF231F7C',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC
      });
    }

    this.channelsReady = true;
  }

  // ─── Token Registration ───

  async registerForPushNotificationsAsync() {
    // Hydrate in-memory dedup set from AsyncStorage on startup
    await this.hydrateSeenIds();
    await this.loadLanguagePreference();

    // Check if previous registration failed — force retry
    const needsSync = await AsyncStorage.getItem('push_token_needs_sync');
    if (needsSync === 'true') {
      console.log('[NotificationManager] Previous sync failed — retrying...');
      await AsyncStorage.removeItem('fcm_token_last_synced');
    }

    let token: string | undefined;

    try {
      console.log('[NotificationManager] Starting registration...');
      // 1. Create channels first
      if (Platform.OS === 'android') {
        await this.createChannels();
        console.log('[NotificationManager] Channels created successfully');
      }

      if (Platform.OS === 'web') {

        return;
      }

      // 2. Request permission explicitly for Android 13+
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        try {
          const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
          console.log('[NotificationManager] POST_NOTIFICATIONS permission:', granted);
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            console.warn('[NotificationManager] POST_NOTIFICATIONS permission DENIED');
            return undefined;
          }
        } catch (err) {
          console.error('[NotificationManager] Permission request error:', err);
        }
      }

      // 3. Request permission via Firebase (handles iOS and older Androids)
      const app = getApp();
      const msg = getMessaging(app);
      const authStatus = await requestPermission(msg);
      const enabled =
        authStatus === AuthorizationStatus.AUTHORIZED ||
        authStatus === AuthorizationStatus.PROVISIONAL;

      console.log('[NotificationManager] Firebase auth status:', authStatus, 'enabled:', enabled);
      if (!enabled) {
        console.warn('[NotificationManager] Firebase messaging permission NOT enabled');
        return undefined;
      }

      // 4. Get FCM Token — retry up to 3 times with backoff
      let lastError: any;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          token = await getToken(msg);
          if (token) {
            console.log(`[NotificationManager] Token obtained on attempt ${attempt}:`, `${token.substring(0, 20)}...`);
            break;
          }
        } catch (err) {
          lastError = err;
          console.warn(`[NotificationManager] getToken attempt ${attempt} failed:`, err);
          if (attempt < 3) {
            await new Promise(r => setTimeout(r, 2000 * attempt)); // 2s, 4s
          }
        }
      }

      if (!token && lastError) {
        console.error('[NotificationManager] All token attempts failed:', lastError);
        await AsyncStorage.setItem('push_token_needs_sync', 'true');
        return undefined;
      }

      if (token) {
        const lastSyncedToken = await AsyncStorage.getItem('fcm_token_last_synced');
        const needsSync = await AsyncStorage.getItem('push_token_needs_sync');

        if (token !== lastSyncedToken || needsSync === 'true') {
          try {
            console.log('[NotificationManager] Syncing token to backend...');
            await this.syncToken(token);
            await AsyncStorage.setItem('fcm_token_last_synced', token);
            await AsyncStorage.setItem('last_fcm_token', token);
            await AsyncStorage.removeItem('push_token_needs_sync');
            console.log('[NotificationManager] Token synced successfully');
          } catch (syncErr) {
            console.error('[NotificationManager] Token sync FAILED:', syncErr);
            await AsyncStorage.setItem('push_token_needs_sync', 'true');
          }
        } else {
          console.log('[NotificationManager] Token already synced, skipping');
        }
      } else {
        console.warn('[NotificationManager] No FCM token returned!');
      }

      return token;
    } catch (e) {
      console.error('[NotificationManager] registerForPushNotificationsAsync FAILED:', e);
      return undefined; // Gracefully suppress so it doesn't crash the app thread
    }
  }

  async syncToken(token: string) {
    // Read user's language preference and send with token
    const languageCode = (await AsyncStorage.getItem('appLanguage')) || 'en';

    await api.post('/notifications/register', {
      fcm_token: token,
      platform: Platform.OS,
      language_code: languageCode
    });
  }

  /**
   * Unregister FCM token from backend.
   *
   * ⚠️ IMPORTANT: Only call this on EXPLICIT user-initiated logout.
   * Do NOT call on:
   *   - Temporary auth failures
   *   - Network disconnections
   *   - Token refresh failures
   *   - Session policy expiry
   *
   * FCM token delivery is independent of access token lifecycle.
   * The backend stores FCM tokens against userId, not against sessions.
   * Notifications must continue to be delivered even if the access token is expired.
   */
  async unregisterPushToken() {
    try {
      const storedToken = await AsyncStorage.getItem('fcm_token_last_synced');
      if (!storedToken) return; // Never registered — nothing to unregister

      await api.post('/notifications/unregister', { fcm_token: storedToken }, { silent: true });

      // Clear all push token state from AsyncStorage
      await AsyncStorage.multiRemove(['fcm_token_last_synced', 'last_fcm_token', 'push_token_needs_sync']);
    } catch (error) {
      console.error('[NotificationManager] unregisterPushToken error:', error);
    }
  }

  // ─── Display Helper ───

  /**
   * Display a notification via expo-notifications with the correct channel.
   * Handles deduplication, Telugu translation, and proper data passing.
   * Used by BOTH foreground (onMessage) and background handlers.
   *
   * Execution order is optimized for minimum latency:
   *   1. Phantom filter (instant)
   *   2. Extract ID
   *   3. In-memory dedup (nanoseconds)
   *   4. Extract fields
   *   5. Resolve channel
   *   6. scheduleNotificationAsync with trigger:null — NOTHING async before this
   *   7. Fire-and-forget persist + translation
   */
  async displayNotification(remoteMessage: any, source: 'foreground' | 'background') {
    console.log(`[NotificationManager] displayNotification called (${source})`, JSON.stringify(remoteMessage?.data || {}).substring(0, 200));

    // 1. Phantom filter
    if (
      (!remoteMessage.data || Object.keys(remoteMessage.data).length === 0) &&
      remoteMessage.sentTime === 0 &&
      remoteMessage.originalPriority === 0
    ) return;

    // 2. Extract ID
    const messageId = remoteMessage.data?.messageId
      || remoteMessage.messageId;

    // 3. Memory dedup check — synchronous, no await
    if (messageId && this.seenIds?.has(messageId)) return;

    // 4. Lock immediately — synchronous, no await
    if (messageId) this.seenIds?.add(messageId);

    // 5. Extract fields
    let title = remoteMessage.notification?.title || remoteMessage.data?.title || '';
    let body = remoteMessage.notification?.body || remoteMessage.data?.body || '';
    const type = remoteMessage.data?.type || '';
    const deepLink = remoteMessage.data?.deepLink || '';
    let channelId = remoteMessage.data?.channelId || 'voice_alert_custom';

    // 6. Resolve channelId
    const knownCategories = [
      'emergency', 'fee_reminder',
      'voice_alert', 'attendance_absent_alert', 'notification_default'
    ];
    const base = channelId.replace('_custom', '').replace('_default', '');
    channelId = knownCategories.includes(base)
      ? `${base}_custom`
      : 'voice_alert_custom';

    // 7. Inline translation — synchronous using cachedLanguage
    if (this.cachedLanguage === 'te' && type) {
      const t = translateNotification(type, title, body);
      title = t.title;
      body = t.body;
    }

    // Explicit override for absent student sound
    let finalSound = remoteMessage.data?.sound
      ? `${remoteMessage.data.sound}.wav`
      : 'voice_alert.wav';

    if (type === 'ATTENDANCE_ABSENT') {
      finalSound = 'attendance_absent_alert.wav';
      channelId = 'attendance_absent_alert_custom';
    }

    // 8. ONE display call — the only scheduleNotificationAsync in this method
    await Notifications.scheduleNotificationAsync({
      content: {
        title: title || 'Notification',
        body: body || '',
        data: { ...remoteMessage.data, deepLink, type },
        sound: finalSound
      },
      trigger: { channelId } as Notifications.ChannelAwareTriggerInput,
    });

    // 9. Persist ID — fire and forget
    if (messageId) this.persistId(messageId).catch(() => { });
  }

  // ─── Private Helpers ───

  private async persistId(id: string): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(PROCESSED_IDS_KEY);
      const ids: string[] = raw ? JSON.parse(raw) : [];
      if (!ids.includes(id)) {
        await AsyncStorage.setItem(
          PROCESSED_IDS_KEY,
          JSON.stringify([id, ...ids].slice(0, MAX_STORED_IDS))
        );
      }
    } catch { }
  }

  async hydrateSeenIds(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(PROCESSED_IDS_KEY);
      if (raw) JSON.parse(raw).forEach((id: string) => this.seenIds.add(id));
    } catch { }
  }



  // ─── Listeners ───

  setupListeners() {
    if (Platform.OS === 'web') return;

    // Ensure we don't accidentally stack listeners if setup is called multiple times
    this.cleanupListeners();

    const app = getApp();
    const msg = getMessaging(app);

    // 1. Foreground: FCM suppresses data-only messages in foreground.
    //    We use expo-notifications to display them manually.
    this.unsubscribeOnMessage = onMessage(msg, async (remoteMessage) => {
      console.log('[NotificationManager] Foreground FCM message received:', remoteMessage?.messageId);
      await this.displayNotification(remoteMessage, 'foreground');
    });

    // 2. Token Refresh: Re-sync whenever FCM rotates the token
    this.unsubscribeOnTokenRefresh = onTokenRefresh(msg, async (newToken) => {
      console.log('[NotificationManager] Token refreshed:', newToken ? `${newToken.substring(0, 20)}...` : 'NULL');
      try {
        await this.syncToken(newToken);
        await AsyncStorage.setItem('fcm_token_last_synced', newToken);
        await AsyncStorage.setItem('last_fcm_token', newToken);
        await AsyncStorage.removeItem('push_token_needs_sync');
        console.log('[NotificationManager] Refreshed token synced');
      } catch (err) {
        console.error('[NotificationManager] Token refresh sync FAILED:', err);
        await AsyncStorage.setItem('push_token_needs_sync', 'true');
      }
    });
  }

  cleanupListeners() {
    if (this.unsubscribeOnMessage) {
      this.unsubscribeOnMessage();
      this.unsubscribeOnMessage = undefined;
    }
    if (this.unsubscribeOnTokenRefresh) {
      this.unsubscribeOnTokenRefresh();
      this.unsubscribeOnTokenRefresh = undefined;
    }
  }
}

export const notificationManager = new NotificationManager();