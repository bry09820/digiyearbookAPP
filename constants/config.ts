import { Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Infer the machine running Metro / Expo from the runtime host URI.
 * Useful on physical devices when EXPO_PUBLIC_API_URL is missing or stale.
 */
function inferLanApiUrl(): string | null {
  const expoConfig = Constants.expoConfig as { hostUri?: string } | null;
  const manifest2 = Constants.manifest2 as
    | { extra?: { expoClient?: { hostUri?: string } } }
    | null
    | undefined;
  const legacyManifest = Constants.manifest as { debuggerHost?: string } | null | undefined;

  const hostUri =
    expoConfig?.hostUri ||
    manifest2?.extra?.expoClient?.hostUri ||
    legacyManifest?.debuggerHost;

  if (typeof hostUri !== 'string' || !hostUri.includes(':')) {
    return null;
  }

  const host = hostUri.split(':')[0]?.trim();
  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return null;
  }

  return `http://${host}:8000/api`;
}

const EMULATOR_DEFAULT =
  Platform.OS === 'android' ? 'http://10.0.2.2:8000/api' : 'http://localhost:8000/api';

/**
 * Laravel API base URL resolution order:
 * 1. EXPO_PUBLIC_API_URL from `.env` (preferred for physical devices)
 * 2. Expo LAN host (same Wi‑Fi as Metro) → http://<host>:8000/api
 * 3. Emulator / simulator defaults
 *
 * Physical device: phone and PC must share Wi‑Fi; Laravel must listen on
 * 0.0.0.0 (e.g. `php artisan serve --host=0.0.0.0 --port=8000`).
 */
export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  inferLanApiUrl() ||
  EMULATOR_DEFAULT
).replace(/\/$/, '');

export const AUTH_BASE_URL = (
  process.env.EXPO_PUBLIC_AUTH_BASE_URL ||
  API_BASE_URL.replace(/\/api\/?$/, '')
).replace(/\/$/, '');

export const AUTH_TOKEN_KEY = 'auth_token';
export const TEMP_SESSION_KEY = 'temp_2fa_session';
export const BIOMETRIC_ENABLED_KEY = 'biometric_login_enabled';
export const BIOMETRIC_EMAIL_KEY = 'biometric_login_email';
export const BIOMETRIC_PASSWORD_KEY = 'biometric_login_password';

/** Axios request timeout (ms). Registration / OTP email can be slow. */
export const API_TIMEOUT_MS = 60000;

/** Laravel public storage / CDN base (APP_URL without /api). */
export const STORAGE_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

/**
 * Alumni Tracker deep link / web URL for cross-app navigation.
 * Prefer a custom scheme (e.g. alumnitracker://home) when the companion app is installed.
 * Yearbook return scheme is `capstoneapp://` (see app.json).
 */
export const ALUMNI_TRACKER_URL = (
  process.env.EXPO_PUBLIC_ALUMNI_TRACKER_URL || 'alumnitracker://home'
).trim();

/** Deep link Alumni Tracker can use to return to this Yearbook app. */
export const YEARBOOK_RETURN_URL = (
  process.env.EXPO_PUBLIC_YEARBOOK_RETURN_URL || 'capstoneapp://(tabs)/home'
).trim();

/**
 * Web billing / PayMongo checkout portal (Sinag-Bughaw).
 * Used when the API does not return a hosted checkout URL.
 */
export const BILLING_URL = (
  process.env.EXPO_PUBLIC_BILLING_URL || `${AUTH_BASE_URL}/billing`
).replace(/\/$/, '');

/** Deep link return after PayMongo / hosted checkout completes. */
export const SUBSCRIPTION_RETURN_URL = (
  process.env.EXPO_PUBLIC_SUBSCRIPTION_RETURN_URL || 'capstoneapp://subscription/callback'
).trim();

