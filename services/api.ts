import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { router } from 'expo-router';
import { API_BASE_URL, API_TIMEOUT_MS, STORAGE_BASE_URL } from '@/constants/config';
import {
  clearAuthStorage,
  getTempSession,
  getToken,
  saveTempSession,
} from '@/services/tokenStorage';
import type { ApiErrorBody } from '@/types/auth';

let handlingUnauthorized = false;

async function handleUnauthorized(): Promise<void> {
  if (handlingUnauthorized) return;
  handlingUnauthorized = true;
  try {
    await clearAuthStorage();
    router.replace('/login');
  } catch {
    // Ignore redirect / storage failures.
  } finally {
    setTimeout(() => {
      handlingUnauthorized = false;
    }, 1500);
  }
}

/** Auth routes under the Laravel `/api` prefix. */
export const AUTH_ENDPOINTS = {
  login: '/auth/login',
  register: '/auth/register',
  verifyStudent: '/auth/verify-student',
  sendOtp: '/auth/otp/send',
  verifyOtp: '/auth/otp/verify',
  logout: '/auth/logout',
  me: '/auth/me',
} as const;

export type ApiErrorKind = 'timeout' | 'network' | 'http' | 'unknown';

/**
 * Normalized API failure — safe to show in UI; never crashes the app.
 */
export class ApiClientError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly url?: string;
  readonly baseURL?: string;
  readonly data?: unknown;
  readonly original?: unknown;

  constructor(options: {
    message: string;
    kind: ApiErrorKind;
    status?: number;
    url?: string;
    baseURL?: string;
    data?: unknown;
    original?: unknown;
  }) {
    super(options.message);
    this.name = 'ApiClientError';
    this.kind = options.kind;
    this.status = options.status;
    this.url = options.url;
    this.baseURL = options.baseURL;
    this.data = options.data;
    this.original = options.original;
  }
}

function resolveRequestUrl(config?: InternalAxiosRequestConfig): string {
  const base = (config?.baseURL || API_BASE_URL || '').replace(/\/$/, '');
  const path = config?.url || '';
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  return `${base}/${path.replace(/^\//, '')}`;
}

export function classifyAxiosError(error: AxiosError<ApiErrorBody>): ApiClientError {
  const status = error.response?.status;
  const data = error.response?.data;
  const url = resolveRequestUrl(error.config);
  const baseURL = error.config?.baseURL || API_BASE_URL;

  const isTimeout =
    error.code === 'ECONNABORTED' ||
    error.code === 'ETIMEDOUT' ||
    /timeout/i.test(error.message || '');

  if (isTimeout) {
    return new ApiClientError({
      message:
        `Connection timed out while reaching ${url}. ` +
        'Make sure Laravel is running (`php artisan serve --host=0.0.0.0 --port=8000`) ' +
        'and this device is on the same Wi‑Fi.',
      kind: 'timeout',
      status,
      url,
      baseURL,
      data,
      original: error,
    });
  }

  if (!error.response) {
    return new ApiClientError({
      message:
        `Cannot reach the API at ${baseURL}. ` +
        'Check Wi‑Fi, firewall, and that the server accepts LAN connections.',
      kind: 'network',
      url,
      baseURL,
      original: error,
    });
  }

  const bodyMessage =
    (typeof data?.message === 'string' && data.message) ||
    (data?.errors &&
      Object.values(data.errors)
        .flat()
        .map((item) => (typeof item === 'string' ? item : null))
        .find(Boolean)) ||
    null;

  return new ApiClientError({
    message: bodyMessage || `Request failed (${status}) for ${url}.`,
    kind: 'http',
    status,
    url,
    baseURL,
    data,
    original: error,
  });
}

/**
 * Shared Axios client for the Laravel backend.
 * Base URL should look like: http://<LAN-IP>:8000/api
 * Registration posts to: {baseURL}/auth/register
 */
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
  // Avoid throwing on non-2xx so we can normalize uniformly in the interceptor.
  validateStatus: (status) => status >= 200 && status < 300,
});

api.interceptors.request.use(async (config) => {
  try {
    const token = await getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const tempSession = await getTempSession();
    if (tempSession) {
      config.headers['Temporary-Session-ID'] = tempSession;
    }

    // Let RN/axios set multipart boundary for FormData uploads.
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      if (config.headers && typeof config.headers === 'object') {
        delete (config.headers as Record<string, unknown>)['Content-Type'];
        delete (config.headers as Record<string, unknown>)['content-type'];
      }
    }
  } catch {
    // Token read failures must not block the request.
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    try {
      const tempSessionHeader =
        response.headers['temporary-session-id'] ??
        response.headers['Temporary-Session-ID'];

      if (typeof tempSessionHeader === 'string' && tempSessionHeader.length > 0) {
        void saveTempSession(tempSessionHeader);
      }
    } catch {
      // Ignore session header persistence errors.
    }

    return response;
  },
  async (error: unknown) => {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        await handleUnauthorized();
      }

      const normalized = classifyAxiosError(error);
      if (__DEV__) {
        console.warn('[API]', normalized.kind, normalized.status, normalized.url, normalized.message);
      }
      return Promise.reject(normalized);
    }

    const fallback = new ApiClientError({
      message: error instanceof Error ? error.message : 'Unexpected API error.',
      kind: 'unknown',
      original: error,
    });
    if (__DEV__) {
      console.warn('[API]', fallback.message);
    }
    return Promise.reject(fallback);
  },
);

export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof ApiClientError) {
    return error.message || fallback;
  }

  if (axios.isAxiosError(error)) {
    return classifyAxiosError(error).message || fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export function isNetworkOrTimeoutError(error: unknown): boolean {
  if (error instanceof ApiClientError) {
    return error.kind === 'network' || error.kind === 'timeout';
  }
  if (!axios.isAxiosError(error)) return false;
  return (
    !error.response ||
    error.code === 'ECONNABORTED' ||
    error.code === 'ETIMEDOUT' ||
    /timeout/i.test(error.message || '') ||
    error.message === 'Network Error'
  );
}

export function extractAuthToken(payload: {
  token?: string;
  access_token?: string;
  auth_token?: string;
}): string | null {
  return payload.token ?? payload.access_token ?? payload.auth_token ?? null;
}

/** Normalize Laravel `{ data }` / paginated / bare payloads. */
export function unwrap<T = unknown>(payload: unknown): T {
  if (payload == null) return [] as T;
  if (typeof payload !== 'object') return payload as T;
  const obj = payload as Record<string, unknown>;
  if ('data' in obj && obj.data !== undefined) {
    return obj.data as T;
  }
  return payload as T;
}

export function asArray<T = unknown>(payload: unknown): T[] {
  const value = unwrap(payload);
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)) {
    return (value as { data: T[] }).data;
  }
  return [];
}

/** Resolve Laravel storage / Cloudinary / absolute media URLs. */
export function imageUrl(path: unknown): string | null {
  if (!path) return null;
  if (typeof path === 'number') return null;
  if (typeof path === 'object') {
    const obj = path as Record<string, unknown>;
    return imageUrl(
      obj.uri ||
        obj.url ||
        obj.file_path ||
        obj.media_url ||
        obj.thumbnail_url ||
        obj.preview_url ||
        obj.image_url ||
        obj.photo_url ||
        obj.profile_picture ||
        obj.path ||
        obj.src,
    );
  }
  if (typeof path !== 'string') return null;
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('data:') ||
    path.startsWith('file:') ||
    path.startsWith('content:') ||
    path.startsWith('blob:')
  ) {
    return path;
  }
  const cleanPath = path.replace(/^\/+/, '');
  if (cleanPath.startsWith('storage/')) {
    return `${STORAGE_BASE_URL}/${cleanPath}`;
  }
  return `${STORAGE_BASE_URL}/storage/${cleanPath}`;
}

export default api;
