import { AUTH_TOKEN_KEY, TEMP_SESSION_KEY } from '@/constants/config';
import {
  deleteSecureItem,
  getSecureItem,
  setSecureItem,
} from '@/services/secureStorage';

export async function saveToken(token: string): Promise<void> {
  await setSecureItem(AUTH_TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return getSecureItem(AUTH_TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  await deleteSecureItem(AUTH_TOKEN_KEY);
}

/** Temporary ID used by some Laravel 2FA + Sanctum mobile flows. */
export async function saveTempSession(sessionId: string): Promise<void> {
  await setSecureItem(TEMP_SESSION_KEY, sessionId);
}

export async function getTempSession(): Promise<string | null> {
  return getSecureItem(TEMP_SESSION_KEY);
}

export async function clearTempSession(): Promise<void> {
  await deleteSecureItem(TEMP_SESSION_KEY);
}

export async function clearAuthStorage(): Promise<void> {
  await Promise.all([clearToken(), clearTempSession()]);
}
