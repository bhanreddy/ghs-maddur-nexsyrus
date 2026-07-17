
import { getApp } from '@react-native-firebase/app';
import { getMessaging, getToken, onMessage, onTokenRefresh, requestPermission, AuthorizationStatus } from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './apiClient';
import { translateNotification } from './notificationTranslations';
import { registerAllVaultedAccountsForPush } from './pushFanout';

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

export async function requestNotificationPermission() {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[NotificationManager] POST_NOTIFICATIONS permission blocked by user');
      return false;
    }
  }
  return true;
}

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

    const NOTIFICATION_CHANNEL_VERSION = '2';
    const savedVersion = await AsyncStorage.getItem('notification_channel_version');

    if (savedVersion === NOTIFICATION_CHANNEL_VERSION) {
      this.channelsReady = true;
      return;
    }

    if (__DEV__) console.log('[NotificationManager] Creating fresh notification channels (Version ' + NOTIFICATION_CHANNEL_VERSION + ')');

    // Delete existing channels for a clean slate
    const existingChannels = await Notifications.getNotificationChannelsAsync();
    for (const channel of existingChannels ?? []) {
      await Notifications.deleteNotificationChannelAsync(channel.id);
    }

    // Base sets of channels for the 5 categories
    const categories = [
      { id: 'emergency', name: 'Emergency Alerts', sound: 'emergency.wav', vibrate: [0, 500, 500, 500] },
      { id: 'fee_reminder', name: 'Fee Reminders', sound: 'fee_reminder.wav', vibrate: [0, 250, 250, 250] },
      { id: 'voice_alert', name: 'General Alerts', sound: 'voice_alert.wav', vibrate: [0, 250, 250, 250] },
      { id: 'attendance_absent_alert', name: 'Absent Alerts', sound: 'attendance_absent_alert.wav', vibrate: [0, 500, 500, 500] },
      { id: 'bus_present', name: 'Bus Boarding', sound: 'bus_present.wav', vibrate: [0, 250, 250, 250] },
      { id: 'notification_default', name: 'Default Notifications', sound: 'notification_default.wav', vibrate: [0, 250, 250, 250] }
    ];

    for (const cat of categories) {
      await Notifications.setNotificationChannelAsync(`${cat.id}_custom`, {
        name: `${cat.name}`,
        importance: Notifications.AndroidImportance.MAX,
        sound: cat.sound,
        vibrationPattern: cat.vibrate,
        enableVibrate: true,
        enableLights: true,
        lightColor: '#FF231F7C',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false
      });
    }

    await AsyncStorage.setItem('notification_channel_version', NOTIFICATION_CHANNEL_VERSION);
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
      if (__DEV__) console.log('[NotificationManager] Previous sync failed — retrying...');
      await AsyncStorage.removeItem('fcm_token_last_synced');
    }

    let token: string | undefined;

    try {
      if (__DEV__) console.log('[NotificationManager] Starting registration...');

      // 1. Request permission explicitly for Android 13+ (MUST be before channel creation)
      const hasPermission = await requestNotificationPermission();
      if (!hasPermission) return undefined;

      // 2. Create channels first
      if (Platform.OS === 'android') {
        await this.createChannels();
        if (__DEV__) console.log('[NotificationManager] Channels created successfully');
      }

      if (Platform.OS === 'web') {
        return;
      }

      // 3. Request permission via Firebase (handles iOS and older Androids)
      const app = getApp();
      const msg = getMessaging(app);
      const authStatus = await requestPermission(msg);
      const enabled =
        authStatus === AuthorizationStatus.AUTHORIZED ||
        authStatus === AuthorizationStatus.PROVISIONAL;

      if (__DEV__) console.log('[NotificationManager] Firebase auth status:', authStatus, 'enabled:', enabled);
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
            if (__DEV__) console.log(`[NotificationManager] Token obtained on attempt ${attempt}:`, `${token.substring(0, 20)}...`);
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
        if (__DEV__) console.error('[NotificationManager] All token attempts failed:', lastError);
        await AsyncStorage.setItem('push_token_needs_sync', 'true');
        return undefined;
      }

      if (token) {
        // Phase 3a: fan out to ALL vaulted accounts via /notifications/register-multi
        // (idempotent upserts). Runs UNCONDITIONALLY — deliberately not gated by the
        // single-token dedup — because the set of vaulted accounts can change even
        // when the FCM token itself does not (an account added in a previous session,
        // or a prior partial failure that needs re-registering). This replaces the old
        // single-account this.syncToken(token), whose backend route purges the token
        // from sibling accounts and would defeat fan-out.
        try {
          if (__DEV__) console.log('[NotificationManager] Fanning out FCM token to all vaulted accounts...');
          await registerAllVaultedAccountsForPush(token);
          await AsyncStorage.setItem('fcm_token_last_synced', token);
          await AsyncStorage.setItem('last_fcm_token', token);
          await AsyncStorage.removeItem('push_token_needs_sync');
          if (__DEV__) console.log('[NotificationManager] Fan-out complete');
        } catch (syncErr) {
          if (__DEV__) console.error('[NotificationManager] Fan-out FAILED:', syncErr);
          await AsyncStorage.setItem('push_token_needs_sync', 'true');
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

  /**
   * @deprecated Phase 3a — single-account register superseded by the fan-out path
   * (registerAllVaultedAccountsForPush). Kept for reference; no longer called by
   * the registration flow because /notifications/register purges the token from
   * sibling accounts, which would defeat multi-account fan-out.
   */
  async syncToken(token: string) {
    // Read user's language preference and send with token
    const languageCode = (await AsyncStorage.getItem('appLanguage')) || 'en';

    await api.post('/notifications/register', {
      fcm_token: token,
      platform: Platform.OS,
      language_code: languageCode
    }, { silent: true });
  }

  /**
   * Phase 3a — re-run the multi-account fan-out using the last cached FCM token.
   * Used by call sites that don't already hold a fresh token (e.g. post-addAccount,
   * where the active account — and thus the FCM registration trigger — is unchanged).
   * No-op if no token has been obtained yet.
   */
  async fanOutRegister(): Promise<void> {
    try {
      const token =
        (await AsyncStorage.getItem('last_fcm_token')) ||
        (await AsyncStorage.getItem('fcm_token_last_synced'));
      if (!token) {
        if (__DEV__) console.log('[NotificationManager] fanOutRegister: no cached FCM token yet, skipping');
        return;
      }
      await registerAllVaultedAccountsForPush(token);
    } catch (e) {
      if (__DEV__) console.warn('[NotificationManager] fanOutRegister failed:', e);
    }
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
    if (__DEV__) console.log(`[NotificationManager] displayNotification called (${source})`, JSON.stringify(remoteMessage?.data || {}).substring(0, 200));

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

    // 6. Ensure language is loaded for headless/background execution
    if (source === 'background') {
      await this.loadLanguagePreference();
    }

    // 6. Resolve channelId
    const knownCategories = [
      'emergency', 'fee_reminder',
      'voice_alert', 'attendance_absent_alert', 'bus_present', 'notification_default'
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
    // In background, if remoteMessage.notification exists, the OS automatically handles the display!
    if (source === 'foreground' || !remoteMessage.notification) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: title || 'Notification',
          body: body || '',
          data: { ...remoteMessage.data, deepLink, type },
          sound: finalSound
        },
        trigger: { channelId } as Notifications.ChannelAwareTriggerInput,
      });
    }

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
      if (__DEV__) console.log('[NotificationManager] Token refreshed:', newToken ? `${newToken.substring(0, 20)}...` : 'NULL');
      try {
        // Phase 3a: FCM rotated → re-register the new token under ALL vaulted accounts.
        await registerAllVaultedAccountsForPush(newToken);
        await AsyncStorage.setItem('fcm_token_last_synced', newToken);
        await AsyncStorage.setItem('last_fcm_token', newToken);
        await AsyncStorage.removeItem('push_token_needs_sync');
        if (__DEV__) console.log('[NotificationManager] Refreshed token fanned out');
      } catch (err) {
        if (__DEV__) console.error('[NotificationManager] Token refresh sync FAILED:', err);
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