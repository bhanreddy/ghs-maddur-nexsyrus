import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as SecureStore from 'expo-secure-store';
import type { Session } from '@supabase/supabase-js';
import { Alert, Platform } from 'react-native';
import Toast from 'react-native-toast-message';
import { showAlert } from '../components/CustomAlert';
import { API_URL, SCHOOL_ID, SUPABASE_ANON_KEY, SUPABASE_URL } from '../constants/school';
import { isPersistentSessionRole } from '../utils/roleHelpers';
import { SessionPolicy } from './sessionPolicyService';
import { SecureTokenStore } from './secureTokenStore';
import { supabase } from './supabaseConfig';

/**
 * Resolve the current role for the 401 guard WITHOUT depending on
 * SessionPolicy being populated. The persisted auth_session (written by
 * authService on every login/refresh) is the single source of truth for role.
 * SessionPolicy.startSession() was historically never called, which left the
 * student logout-suppression guard dead — this reads the role directly so
 * parent (student-role) sessions are never dropped on a transient 401.
 */
async function resolveStoredRole(): Promise<string | null> {
  try {
    const raw = await SecureTokenStore.getItem('auth_session');
    if (raw) {
      const parsed = JSON.parse(raw);
      const code = parsed?.validatedUser?.role?.code;
      if (code) return code;
    }
  } catch {
    // fall through to SessionPolicy
  }
  return SessionPolicy.getStoredRole();
}

/**
 * Cross-platform alert helper.
 * On web, Alert.alert() is a no-op, so we use CustomAlert (showAlert).
 * On native, Alert.alert() works fine and is used as the primary.
 */
function alertFn(title: string, message: string) {
  if (Platform.OS === 'web') {
    showAlert({ type: 'error', title, message });
  } else {
    Alert.alert(title, message);
  }
}

/** school_id for all API requests — from build-time env. Never hardcode. */
const SCHOOL_ID_PARAM = String(SCHOOL_ID);

export const getApiBaseUrl = () => {
  const url = API_URL.trim();
  // Web browser: ensure we use localhost (not Android emulator address)
  if (Platform.OS === 'web' && url.includes('10.0.2.2')) {
    return url.replace('10.0.2.2', 'localhost');
  }
  // Android emulator: needs 10.0.2.2 to reach host machine's localhost
  if (Platform.OS === 'android' && url.includes('localhost')) {
    return url.replace('localhost', '10.0.2.2');
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
  await tokenDelete(TOKEN_KEY);
  await tokenDelete(REFRESH_TOKEN_KEY);
  // Also clear additional auth fields
  await tokenDelete('user_id').catch(() => { });
  await tokenDelete('user_role').catch(() => { });
  await tokenDelete('session_expiry').catch(() => { });
}

let liveSessionRepairPromise: Promise<Session | null> | null = null;

async function refreshStoredSupabaseSession(refreshToken: string): Promise<Session | null> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!resp.ok) {
      if (__DEV__) console.warn('[apiClient] stored session repair refresh failed:', resp.status);
      return null;
    }

    const data = await resp.json();
    if (!data?.access_token || !data?.refresh_token) return null;
    return data as Session;
  } catch (e) {
    if (__DEV__) console.warn('[apiClient] stored session repair refresh error:', e);
    return null;
  }
}

async function restoreLiveSessionFromStoredAuth(): Promise<Session | null> {
  if (liveSessionRepairPromise) return liveSessionRepairPromise;

  liveSessionRepairPromise = (async (): Promise<Session | null> => {
    try {
      const raw = await SecureTokenStore.getItem('auth_session');
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      const stored = parsed?.supabaseSession as Session | undefined;
      if (!stored?.access_token || !stored?.refresh_token) return null;

      const nowS = Math.floor(Date.now() / 1000);
      const expiresAt =
        typeof stored.expires_at === 'number'
          ? stored.expires_at
          : typeof parsed?.tokenExpiresAt === 'number'
          ? Math.floor(parsed.tokenExpiresAt / 1000)
          : 0;

      let sessionForSet = stored;
      if (!expiresAt || expiresAt <= nowS + EXPIRY_SKEW_SECONDS) {
        const refreshed = await refreshStoredSupabaseSession(stored.refresh_token);
        if (!refreshed) return null;
        sessionForSet = { ...stored, ...refreshed };
      }

      const { data, error } = await supabase.auth.setSession({
        access_token: sessionForSet.access_token,
        refresh_token: sessionForSet.refresh_token,
      });

      if (error || !data?.session) {
        if (__DEV__) console.warn('[apiClient] stored session repair setSession failed:', error?.message);
        return null;
      }

      await setTokens(data.session.access_token, data.session.refresh_token);
      if (parsed?.validatedUser) {
        parsed.supabaseSession = data.session;
        parsed.tokenExpiresAt = data.session.expires_at
          ? data.session.expires_at * 1000
          : Date.now() + 3600000;
        await SecureTokenStore.setItem('auth_session', JSON.stringify(parsed));
      }

      if (__DEV__) console.log('[apiClient] repaired missing Supabase session from stored auth_session');
      return data.session;
    } catch (e) {
      if (__DEV__) console.warn('[apiClient] stored session repair failed:', e);
      return null;
    }
  })().finally(() => {
    liveSessionRepairPromise = null;
  });

  return liveSessionRepairPromise;
}

// Global Logout Callback to avoid circular dependency
let logoutCallback: (() => Promise<void>) | null = null;

export const registerLogoutCallback = (fn: () => Promise<void>) => {
  logoutCallback = fn;
};

// Single-flight refresh promise to prevent parallel redundant refreshes
let refreshPromise: Promise<any> | null = null;

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
  _isRetry?: boolean;
  _retryCount?: number; // tracks 503 / 429 retry attempts
  _multipart?: boolean;
  /** Request timeout in ms (default 60000). Use longer values for bulk uploads. */
  timeoutMs?: number;
}

function buildGetDedupeKey(endpoint: string, method: string): string | null {
  if (method !== 'GET') return null;
  const sep = endpoint.includes('?') ? '&' : '?';
  const finalEndpoint = `${endpoint}${sep}school_id=${encodeURIComponent(SCHOOL_ID_PARAM)}`;
  return `GET:${API_BASE_URL}${finalEndpoint}`;
}

export async function apiRequest<T>(
  endpoint: string,
  options: APIOptions = {})
  : Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const retryCount = options._retryCount ?? 0;
  const dedupeKey = !options._isRetry && retryCount === 0
    ? buildGetDedupeKey(endpoint, method)
    : null;

  if (dedupeKey) {
    const existing = inflightGets.get(dedupeKey);
    if (existing) return existing as Promise<T>;
  }

  const promise = apiRequestInner<T>(endpoint, options);
  if (dedupeKey) {
    inflightGets.set(dedupeKey, promise);
    promise.finally(() => {
      if (inflightGets.get(dedupeKey) === promise) inflightGets.delete(dedupeKey);
    });
  }
  return promise;
}

async function apiRequestInner<T>(
  endpoint: string,
  options: APIOptions = {})
  : Promise<T> {
  const { silent, _isRetry, _retryCount = 0, _multipart, timeoutMs = 60000, ...fetchOptions } = options;
  const isMultipart = _multipart === true;
  const { data: { session: liveSession } } = await supabase.auth.getSession();
  const session = liveSession ?? await restoreLiveSessionFromStoredAuth();
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

        // 2. TOKEN REFRESH — use Supabase SDK only (single source of truth)
        // Layer A fix: Removed the separate backend /auth/refresh path to
        // eliminate the triple-refresh race that could burn refresh tokens.
        // The Supabase SDK's autoRefreshToken + startAutoRefresh() is the
        // single authority for token refresh.
        if (!_isRetry) {
          if (__DEV__) console.log('[apiClient] 401 received — attempting Supabase refresh');

          try {
            if (!refreshPromise) {
              refreshPromise = supabase.auth.refreshSession().finally(() => {
                refreshPromise = null;
              });
            }

            const { data, error: refreshError } = await refreshPromise;

            if (!refreshError && data.session) {
              if (__DEV__) console.log('[apiClient] Supabase refresh succeeded — retrying request');

              // Update local storage tokens
              await setTokens(data.session.access_token, data.session.refresh_token);

              // Retry the original request with new token
              return await apiRequest<T>(endpoint, {
                ...options,
                _isRetry: true,
                headers: {
                  ...options.headers,
                  'Authorization': `Bearer ${data.session.access_token}`
                }
              });
            } else {
              if (__DEV__) console.warn('[apiClient] Supabase refresh failed:', refreshError?.message);
            }
          } catch (refreshErr) {
            if (__DEV__) console.warn('[apiClient] Refresh error:', refreshErr);
          }
        }

        // 3. Network-aware error handling
        // CRITICAL: Do NOT logout if the device is offline
        const netState = await NetInfo.fetch();
        const isOnline = netState.isConnected && netState.isInternetReachable !== false;

        if (!isOnline) {
          if (__DEV__) console.log('[apiClient] 401 but device is offline — suppressing');
          if (silent) return null as T;
          throw new APIError('Network unavailable. Logging suspended.', 0, undefined, requestId);
        }

        // Silent requests (e.g. background token sync) should NOT trigger logout
        if (silent) {
          return null as T;
        }

        // ── Persistent-role 401 guard ──────────────────────────────────
        // Parent/student, admin, driver and staff sessions NEVER expire. A 401
        // for these roles means a server/network/token-refresh hiccup, NOT a
        // real auth failure. Show a retry toast and reject WITHOUT triggering
        // any logout flow. Only `accountant` propagates a session-expired error.
        const storedRole = await resolveStoredRole();
        if (isPersistentSessionRole(storedRole)) {
          if (__DEV__) console.log(`[apiClient] 401 for persistent role "${storedRole}" — suppressing logout, showing retry toast`);
          Toast.show({
            type: 'error',
            text1: 'Connection issue',
            text2: 'Please try again.',
            visibilityTime: 3000,
          });
          throw new APIError('Connection issue. Please try again.', 401, undefined, requestId);
        }

        // accountant: propagate 401 as session-expired error. The caller (or
        // useAuth's handleRefresh via TOKEN_REFRESHED event) decides next steps.
        throw new APIError('Session expired. Please login again.', 401, undefined, requestId);
      }

      // Handle Service Unavailable (503) — transient backend timeout
      if (response.status === 503) {
        if (_retryCount < 2) {
          if (__DEV__) { }
          await new Promise((r) => setTimeout(r, 1500));
          return await apiRequestInner<T>(endpoint, {
            ...options,
            _retryCount: _retryCount + 1
          });
        }
        const message = errorData.error || 'Server temporarily unavailable. Please try again.';
        if (!silent) alertFn('Service Unavailable', message);
        throw new APIError(message, 503, undefined, requestId);
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
          requestId
        );
      }

      // Handle Rate Limit (429) — retry with Retry-After backoff before alerting
      if (response.status === 429) {
        if (_retryCount < 2) {
          const retryAfterHeader = response.headers.get('Retry-After');
          const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
          const delayMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
            ? retryAfterSec * 1000
            : (_retryCount + 1) * 1000;
          await new Promise((r) => setTimeout(r, delayMs));
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

    if (error?.name === 'AbortError') {
      if (!silent) alertFn('Network Timeout', 'The server took too long to respond. Please check your internet connection or try again later.');
      throw new APIError('Request timed out. Please try again.');
    }

    // Network error
    if (!silent) alertFn('Network Error', 'Please check your internet connection.');
    throw new APIError('Network error. Please check your connection.');
  }
}

/** Download a binary file (e.g. Excel) using the same Supabase auth as apiRequest. */
export async function downloadFile(endpoint: string, filename: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;

  const sep = endpoint.includes('?') ? '&' : '?';
  const finalEndpoint = `${endpoint}${sep}school_id=${encodeURIComponent(SCHOOL_ID_PARAM)}`;
  const url = `${API_BASE_URL}${finalEndpoint}`;

  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

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
  const reader = new FileReader();
  reader.onload = () => {
    console.log('Download ready', reader.result);
  };
  reader.readAsDataURL(blob);
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