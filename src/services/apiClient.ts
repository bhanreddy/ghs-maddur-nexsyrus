import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as SecureStore from 'expo-secure-store';
import type { Session } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { showAlert } from '../components/CustomAlert';
import { API_URL, SCHOOL_ID } from '../constants/school';
import { supabase } from './supabaseConfig';
import { getOrCreateDeviceId } from './deviceId';
import { getActiveContextId } from './activeContextStore';
import { clearStaffPortalSession, getStaffPortalSession } from './staffPortalSession';

/**
 * Cross-platform error alert — always uses the illustrated CustomAlert popup.
 */
function alertFn(title: string, message: string) {
  showAlert({ type: 'error', title, message });
}

// ─── Transient alert suppression during account / portal switches ─────────────
// When switching accounts, the outgoing portal's role-specific screens are still
// mounted+focused at the moment the live session flips to the incoming account.
// Their in-flight/re-triggered queries (e.g. a staff screen's /attendance/staff/me)
// briefly run under the NEW identity and get a cross-role 4xx (404 "Staff profile
// not found", 403, etc.). Those are expected, harmless churn — the destination
// screen refetches correctly — but without this they pop a blocking error dialog
// over the freshly-loaded home. During a short switch window we downgrade such
// requests to silent: the APIError still throws (callers keep their existing data),
// we just don't alarm the user with a dialog for a switch we initiated.
let suppressTransientAlertsUntil = 0;

/** Silence blocking API error dialogs for `ms` while an account/portal switch settles. */
export function suppressTransientApiAlerts(ms = 2500) {
  suppressTransientAlertsUntil = Math.max(suppressTransientAlertsUntil, Date.now() + ms);
}

function transientAlertsSuppressed() {
  return Date.now() < suppressTransientAlertsUntil;
}

/** school_id for all API requests — from build-time env. Never hardcode. */
const SCHOOL_ID_PARAM = String(SCHOOL_ID);

export const getApiBaseUrl = () => {
  const url = API_URL.trim();
  // Web browser: ensure we use localhost (not Android emulator address)
  if (Platform.OS === 'web') {
    return url.replace(/10\.0\.2\.2/g, 'localhost').replace(/10\.0\.3\.2/g, 'localhost');
  }
  // Android emulator: 10.0.2.2 reaches the host machine. Both localhost and
  // 127.0.0.1 point at the emulator itself, so rewrite them.
  if (Platform.OS === 'android') {
    return url.replace(/localhost|127\.0\.0\.1/g, '10.0.2.2');
  }
  return url;
};

const API_BASE_URL = getApiBaseUrl();

const TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const EXPIRY_SKEW_SECONDS = 60;

// ── Token storage helpers ──────────────────────────────────────────────
// Use SecureStore for tokens to guarantee encryption on device.
// Limits are respected since JWT tokens generally won't exceed SecureStore's 2048-byte limit across most identities.
async function tokenGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}
async function tokenSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}
async function tokenDelete(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key).catch(() => { });
  }
}

// Token management
export async function getAccessToken(): Promise<string | null> {
  return await tokenGet(TOKEN_KEY);
}

export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  await tokenSet(TOKEN_KEY, accessToken);
  await tokenSet(REFRESH_TOKEN_KEY, refreshToken);
}

export async function clearTokens(): Promise<void> {
  clearStaffPortalSession();
  await tokenDelete(TOKEN_KEY);
  await tokenDelete(REFRESH_TOKEN_KEY);
  // Also clear additional auth fields
  await tokenDelete('user_id').catch(() => { });
  await tokenDelete('user_role').catch(() => { });
  await tokenDelete('session_expiry').catch(() => { });
}

export type SessionRecoveryReason = 'missing' | 'expired' | 'unauthorized';
type SessionRecoveryCallback = (
  reason: SessionRecoveryReason
) => Promise<Session | null>;
let sessionRecoveryCallback: SessionRecoveryCallback | null = null;
let recoveryPromise: Promise<Session | null> | null = null;

/**
 * AuthService registers the one recovery pipeline here. This avoids a circular
 * import while ensuring API 401s use the same refresh-token + saved-credential
 * single flight as cold start and foreground recovery.
 */
export const registerSessionRecoveryCallback = (
  fn: SessionRecoveryCallback
) => {
  sessionRecoveryCallback = fn;
};

async function attemptSessionRecovery(
  reason: SessionRecoveryReason
): Promise<Session | null> {
  if (recoveryPromise) return recoveryPromise;
  recoveryPromise = (async () => {
    if (sessionRecoveryCallback) return sessionRecoveryCallback(reason);
    const { data, error } = await supabase.auth.refreshSession();
    return error ? null : data.session;
  })().finally(() => {
    recoveryPromise = null;
  });
  return recoveryPromise;
}

function canRecoverAuthForEndpoint(endpoint: string): boolean {
  return !(
    endpoint.includes('/login') ||
    endpoint.includes('/refresh') ||
    endpoint.includes('/auth/validate-school-user')
  );
}

const MAX_TRANSIENT_READ_RETRIES = 4;

// These 503s mean a feature is not wired up yet. Retrying them only spams the
// backend; the response will not change until env/config is updated.
const NON_TRANSIENT_UNAVAILABLE_CODES = new Set([
  'BILLING_NOT_CONFIGURED',
  'CLUSTER_NOT_CONFIGURED',
  'PHONEPE_NOT_CONFIGURED',
]);

function transientRetryDelay(attempt: number): number {
  return Math.min(500 * Math.pow(2, attempt), 5000);
}

async function waitForNetworkRestore(timeoutMs = 10000): Promise<void> {
  const current = await NetInfo.fetch().catch(() => null);
  if (current?.isConnected && current.isInternetReachable !== false) return;

  await new Promise<void>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe = () => {};
    const finish = () => {
      if (settled) return;
      settled = true;
      unsubscribe();
      if (timer) clearTimeout(timer);
      resolve();
    };
    unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) finish();
    });
    timer = setTimeout(finish, timeoutMs);
  });
}

// In-flight GET deduplication — identical concurrent GETs share one network call
const inflightGets = new Map<string, Promise<unknown>>();

// API Error class
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errors?: Record<string, string[]>,
    public requestId?: string,
    public code?: string) {
    super(message);
    this.name = 'APIError';
  }

  // Compatibility getter
  get status() {
    return this.statusCode;
  }
}

// Generic API request function
export interface APIOptions extends RequestInit {
  silent?: boolean;
  /**
   * Kept for call-site compatibility. Active portal context is now attached to
   * every authenticated API request, so switching roles changes both the UI
   * and the server-side authorization scope.
   */
  sendActiveContext?: boolean;
  _isRetry?: boolean;
  _retryCount?: number; // tracks 503 / 429 retry attempts
  _multipart?: boolean;
  /** Request timeout in ms (default 60000). Use longer values for bulk uploads. */
  timeoutMs?: number;
  /** Frozen delegated staff target for retries and GET de-duplication. */
  _staffPortalId?: string;
}

function buildGetDedupeKey(endpoint: string, method: string, staffPortalId?: string): string | null {
  if (method !== 'GET') return null;
  const sep = endpoint.includes('?') ? '&' : '?';
  const finalEndpoint = `${endpoint}${sep}school_id=${encodeURIComponent(SCHOOL_ID_PARAM)}`;
  return `GET:${API_BASE_URL}${finalEndpoint}:staff=${staffPortalId || 'self'}`;
}

export async function apiRequest<T>(
  endpoint: string,
  options: APIOptions = {})
  : Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const staffPortalId = options._staffPortalId ?? getStaffPortalSession().staffId;
  const frozenOptions = staffPortalId && !options._staffPortalId
    ? { ...options, _staffPortalId: staffPortalId }
    : options;
  const retryCount = options._retryCount ?? 0;
  const dedupeKey = !options._isRetry && retryCount === 0
    ? buildGetDedupeKey(endpoint, method, staffPortalId)
    : null;

  if (dedupeKey) {
    const existing = inflightGets.get(dedupeKey);
    if (existing) return existing as Promise<T>;
  }

  const promise = apiRequestInner<T>(endpoint, frozenOptions);
  if (dedupeKey) {
    inflightGets.set(dedupeKey, promise);
    // The cleanup runs off a SEPARATE chain from the `promise` we return. If the
    // request rejects (e.g. an expected 404 like "no class assigned"), this
    // branch would otherwise surface as an *unhandled* rejection — a dev-only
    // redbox — even when the real caller catches the error on the returned
    // `promise`. The trailing .catch() neutralises only this internal branch;
    // the returned `promise` still rejects normally for callers to handle.
    promise
      .finally(() => {
        if (inflightGets.get(dedupeKey) === promise) inflightGets.delete(dedupeKey);
      })
      .catch(() => {});
  }
  return promise;
}

async function apiRequestInner<T>(
  endpoint: string,
  options: APIOptions = {})
  : Promise<T> {
  const { silent: rawSilent, sendActiveContext, _isRetry, _retryCount = 0, _multipart, timeoutMs = 60000, _staffPortalId, ...fetchOptions } = options;
  // Suppress blocking error dialogs for transient cross-role failures while an
  // account/portal switch is settling (the request still runs and still throws).
  const silent = rawSilent || transientAlertsSuppressed();
  const isMultipart = _multipart === true;
  const { data: { session: liveSession } } = await supabase.auth.getSession();
  let session = liveSession;
  const sessionExpiresSoon =
    !session?.expires_at ||
    session.expires_at <= Math.floor(Date.now() / 1000) + EXPIRY_SKEW_SECONDS;
  if (
    sessionExpiresSoon &&
    !_isRetry &&
    canRecoverAuthForEndpoint(endpoint)
  ) {
    session = (
      await attemptSessionRecovery(session ? 'expired' : 'missing')
    ) ?? session;
  }
  const token = session?.access_token ?? null;

  if (__DEV__) {
    console.log(`[apiClient] ${fetchOptions.method || 'GET'} ${endpoint} — session: ${session ? 'YES' : 'NULL'}, token: ${token ? token.substring(0, 15) + '...' : 'NULL'}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string>),
  };
  if (!isMultipart) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (_staffPortalId) {
    headers['X-Staff-Portal-Id'] = _staffPortalId;
  }

  // A portal switch changes the active server-side authorization scope, not
  // merely the screen shown by the app. Previously these headers were only
  // sent to /auth/contexts endpoints, so every subsequent portal request was
  // authorized with the role from the original login. That made switches such
  // as student → staff or driver → admin fail with access errors.
  //
  // Vault account switching uses a different JWT and clears this stored value,
  // so it remains isolated from the selected portal context.
  try {
    const deviceId = await getOrCreateDeviceId();
    if (deviceId) headers['X-Device-Id'] = deviceId;
    const activeContextId = await getActiveContextId();
    if (activeContextId) headers['X-Active-Context'] = activeContextId;
  } catch {
    // Context persistence is best-effort; never block an otherwise valid API request.
  }

  const method = (fetchOptions.method || 'GET').toUpperCase();

  // SchoolIMS: every request MUST include school_id (GET/DELETE: query; POST/PUT/PATCH: body)
  let finalEndpoint = endpoint;
  let finalBody = fetchOptions.body;

  if (method === 'GET' || method === 'DELETE') {
    const sep = endpoint.includes('?') ? '&' : '?';
    finalEndpoint = `${endpoint}${sep}school_id=${encodeURIComponent(SCHOOL_ID_PARAM)}`;
  } else if (isMultipart) {
    const sep = endpoint.includes('?') ? '&' : '?';
    finalEndpoint = `${endpoint}${sep}school_id=${encodeURIComponent(SCHOOL_ID_PARAM)}`;
    if (fetchOptions.body instanceof FormData) {
      fetchOptions.body.append('school_id', SCHOOL_ID_PARAM);
    }
    finalBody = fetchOptions.body;
  } else if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    const parsed = fetchOptions.body ? JSON.parse(fetchOptions.body as string) : {};
    finalBody = JSON.stringify({ school_id: SCHOOL_ID_PARAM, ...parsed });
  }

  const url = `${API_BASE_URL}${finalEndpoint}`;

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      body: finalBody,
      headers,
      // On web, `fetch` honours the browser HTTP cache by default, so a page
      // reload can serve a stale GET response instead of hitting the server.
      // Force `no-store` for reads so reloads always fetch the latest data.
      ...(Platform.OS === 'web' && (method === 'GET' || method === 'DELETE')
        ? { cache: 'no-store' as RequestCache }
        : {}),
      // @ts-ignore - React Native setup might not have full AbortSignal types
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const requestId = response.headers.get('x-request-id') || response.headers.get('request-id') || undefined;

    // Handle different status codes
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      // Handle unauthorized (401)
      if (response.status === 401) {

        // 1. IGNORE Login/Refresh endpoints (invalid credentials, not session expiry)
        if (endpoint.includes('/login') || endpoint.includes('/refresh')) {
          if (!silent) alertFn('Login Failed', errorData.error || 'Invalid credentials');
          throw new APIError(
            errorData.error || 'Invalid credentials',
            401,
            undefined,
            requestId
          );
        }

        // Every 401 enters the same single-flight recovery pipeline. It first
        // rotates the refresh token and can fall back to the native saved login.
        if (!_isRetry && canRecoverAuthForEndpoint(endpoint)) {
          const recovered = await attemptSessionRecovery('unauthorized').catch(() => null);
          if (recovered) {
            await setTokens(recovered.access_token, recovered.refresh_token);
            return await apiRequest<T>(endpoint, {
              ...options,
              _isRetry: true,
              headers: {
                ...options.headers,
                Authorization: `Bearer ${recovered.access_token}`,
              },
            });
          }
        }

        // A failed recovery never destroys the cached app identity. The caller
        // can keep its last data while foreground/network events retry.
        const netState = await NetInfo.fetch();
        const isOnline = netState.isConnected && netState.isInternetReachable !== false;

        if (!isOnline) {
          throw new APIError('Data refresh is waiting for network.', 0, undefined, requestId);
        }

        throw new APIError('Session recovery is still in progress.', 401, undefined, requestId);
      }

      // Handle transient upstream/gateway errors — 503 (backend "auth service
      // temporarily unavailable" / timeout), plus 502 & 504 from the Cloudflare
      // Worker when Cloud Run is briefly stuck or unreachable. All are transient
      // and safe to retry, so they get the same silent retry-then-fail path
      // instead of surfacing as a hard error popup.
      if (response.status === 503 || response.status === 502 || response.status === 504) {
        const isConfigUnavailable = NON_TRANSIENT_UNAVAILABLE_CODES.has(errorData.code);
        if (!isConfigUnavailable && method === 'GET' && _retryCount < MAX_TRANSIENT_READ_RETRIES) {
          await new Promise((r) => setTimeout(
            r,
            transientRetryDelay(_retryCount)
          ));
          return await apiRequestInner<T>(endpoint, {
            ...options,
            _retryCount: _retryCount + 1
          });
        }
        const message = errorData.error || 'Server temporarily unavailable. Please try again.';
        throw new APIError(message, response.status, undefined, requestId, errorData.code);
      }

      // Handle validation errors (422) and B1-style 400 (school_id required)
      if (response.status === 422 || response.status === 400) {
        const rawError = errorData.error || errorData.message;
        const baseMessage = rawError === 'school_id is required'
          ? 'Tenant context missing. Please restart the app and try again.'
          : (errorData.message || rawError || 'Validation failed');
        const message = errorData.details && !baseMessage.includes(errorData.details)
          ? `${baseMessage}\n\n${errorData.details}`
          : baseMessage;
        if (!silent) {
          alertFn('Error', message);
        }
        throw new APIError(
          message,
          response.status,
          errorData.errors,
          requestId,
          errorData.code
        );
      }

      // Handle Rate Limit (429). The global limiter uses a 15-min window, so on
      // overflow `Retry-After` can be many minutes out. Sleeping that long makes
      // the app look frozen and the retry still fails — so only retry when the
      // wait is short (a brief burst); otherwise fail fast instead of hanging.
      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('Retry-After');
        const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
        const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
          ? retryAfterSec * 1000
          : (_retryCount + 1) * 1000;
        const MAX_RETRY_WAIT_MS = 5000;
        if (_retryCount < 2 && waitMs <= MAX_RETRY_WAIT_MS) {
          await new Promise((r) => setTimeout(r, waitMs));
          return await apiRequest<T>(endpoint, {
            ...options,
            silent: true,
            _retryCount: _retryCount + 1,
          });
        }
        const message = errorData.error || errorData.message || 'Rate limit exceeded. Please try again later.';
        if (!silent) alertFn('Too Many Requests', message);
        throw new APIError(message, 429, undefined, requestId);
      }

      // Handle forbidden (403)
      if (response.status === 403) {
        const message = errorData.error || errorData.message || 'Access denied';
        const code = errorData.code;
        if (!silent) alertFn('Access Denied', message);
        throw new APIError(message, 403, undefined, requestId, code);
      }

      // Generic error
      const genericMsg = errorData.message || errorData.error || 'Request failed';

      if (!silent) alertFn('Error', `${genericMsg}\n\nCode: ${response.status}\nID: ${requestId || 'N/A'}`);
      throw new APIError(
        genericMsg,
        response.status,
        undefined,
        requestId
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null as T;
    }

    const json = await response.json();

    // SchoolIMS F4: validate school_id in response matches build-time tenant
    if (json && typeof json.school_id !== 'undefined' && String(json.school_id) !== SCHOOL_ID_PARAM) {
      throw new APIError('Tenant mismatch — response school_id does not match this app. Abort.', 403);
    }

    // SchoolIMS: unwrap { success, school_id, data } envelope so callers receive payload directly
    if (json && json.success === true && 'data' in json) {
      return json.data as T;
    }

    return json as T;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error instanceof APIError) {
      throw error;
    }

    if (method === 'GET' && _retryCount < MAX_TRANSIENT_READ_RETRIES) {
      await waitForNetworkRestore();
      await new Promise((resolve) =>
        setTimeout(resolve, transientRetryDelay(_retryCount))
      );
      return apiRequestInner<T>(endpoint, {
        ...options,
        _retryCount: _retryCount + 1,
      });
    }

    if (error?.name === 'AbortError') {
      throw new APIError('Data refresh timed out and will retry later.', 0);
    }

    // Do not raise a blocking connection popup. Query hooks retain cached data
    // and retry on focus/reconnect; mutations still reject so callers never
    // mistake an unsent write for success.
    throw new APIError('Data refresh is temporarily unavailable.', 0);
  }
}

/** Download a binary file (e.g. Excel) using the same Supabase auth as apiRequest. */
export async function downloadFile(endpoint: string, filename: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;

  const sep = endpoint.includes('?') ? '&' : '?';
  const finalEndpoint = `${endpoint}${sep}school_id=${encodeURIComponent(SCHOOL_ID_PARAM)}`;
  const url = `${API_BASE_URL}${finalEndpoint}`;

  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const staffPortalId = getStaffPortalSession().staffId;
  if (staffPortalId) headers['X-Staff-Portal-Id'] = staffPortalId;
  try {
    const deviceId = await getOrCreateDeviceId();
    if (deviceId) headers['X-Device-Id'] = deviceId;
    const activeContextId = await getActiveContextId();
    if (activeContextId) headers['X-Active-Context'] = activeContextId;
  } catch {
    // Match normal API requests: context storage failures must not block downloads.
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new APIError(err.error || err.message || 'Download failed', response.status);
  }

  if (Platform.OS === 'web') {
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
    return;
  }

  const blob = await response.blob();
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the downloaded file.'));
    reader.onloadend = () => {
      const dataUrl = String(reader.result || '');
      const comma = dataUrl.indexOf(',');
      if (comma < 0) reject(new Error('Downloaded file data is invalid.'));
      else resolve(dataUrl.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });

  const FileSystem: any = await import('expo-file-system/legacy');
  const Sharing = await import('expo-sharing');
  const safeFilename = filename.replace(/[^A-Za-z0-9._-]/g, '_');
  const targetDirectory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!targetDirectory) throw new Error('No writable directory is available on this device.');
  const uri = `${targetDirectory}${Date.now()}-${safeFilename}`;
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('File sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, {
    mimeType: response.headers.get('content-type') || 'application/octet-stream',
    dialogTitle: `Save ${filename}`,
    UTI: filename.toLowerCase().endsWith('.xlsx')
      ? 'org.openxmlformats.spreadsheetml.sheet'
      : filename.toLowerCase().endsWith('.html')
        ? 'public.html'
        : 'public.data',
  });
}

// Helper methods for common HTTP verbs
export const api = {
  get: <T,>(endpoint: string, params?: Record<string, any>, options?: APIOptions): Promise<T> => {
    let queryString = '';
    if (params) {
      const cleanParams = Object.fromEntries(
        Object.entries(params).filter(([_, v]) => v !== undefined)
      );
      queryString = '?' + new URLSearchParams(cleanParams).toString();
    }
    return apiRequest<T>(`${endpoint}${queryString}`, { method: 'GET', ...options });
  },

  post: <T,>(endpoint: string, data?: any, options?: APIOptions): Promise<T> => {
    return apiRequest<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      ...options
    });
  },

  put: <T,>(endpoint: string, data?: any, options?: APIOptions): Promise<T> => {
    return apiRequest<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
      ...options
    });
  },

  patch: <T,>(endpoint: string, data?: any, options?: APIOptions): Promise<T> => {
    return apiRequest<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
      ...options
    });
  },

  delete: <T,>(endpoint: string, options?: APIOptions): Promise<T> => {
    return apiRequest<T>(endpoint, { method: 'DELETE', ...options });
  },

  uploadFormData: <T,>(endpoint: string, formData: FormData, options?: APIOptions): Promise<T> => {
    return apiRequest<T>(endpoint, {
      method: 'POST',
      body: formData,
      _multipart: true,
      ...options,
    });
  },

  downloadFile: (endpoint: string, filename: string): Promise<void> => {
    return downloadFile(endpoint, filename);
  },
};
