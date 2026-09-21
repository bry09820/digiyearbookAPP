import api, {
  AUTH_ENDPOINTS,
  ApiClientError,
  extractAuthToken,
  getApiErrorMessage,
  isNetworkOrTimeoutError,
} from '@/services/api';
import { API_BASE_URL } from '@/constants/config';
import {
  clearAuthStorage,
  clearTempSession,
  saveToken,
} from '@/services/tokenStorage';
import type {
  AuthResponse,
  AuthSuccessResponse,
  LoginCredentials,
  OtpRequiredResponse,
  RegisterPayload,
  TwoFactorChallengePayload,
  User,
  VerifyOtpPayload,
} from '@/types/auth';

function isOtpRequired(data: AuthResponse): data is OtpRequiredResponse {
  return (data as OtpRequiredResponse).requires_otp === true;
}

function isTwoFactorRequired(
  data: AuthResponse,
): data is { two_factor: true; message?: string } {
  return (data as { two_factor?: boolean }).two_factor === true;
}

async function persistTokenFromResponse(
  data: AuthSuccessResponse,
  headers?: Record<string, unknown>,
): Promise<string | null> {
  const headerToken =
    (typeof headers?.['auth-token'] === 'string' && headers['auth-token']) ||
    (typeof headers?.['Auth-Token'] === 'string' && headers['Auth-Token']) ||
    null;

  const token = extractAuthToken(data) ?? headerToken;
  if (token) {
    await saveToken(token);
    await clearTempSession();
  }
  return token;
}

function rethrowAsSafeError(error: unknown, fallback: string): never {
  const message = getApiErrorMessage(error, fallback);
  if (error instanceof ApiClientError) {
    throw error;
  }
  throw new ApiClientError({
    message,
    kind: isNetworkOrTimeoutError(error) ? 'network' : 'unknown',
    original: error,
  });
}

/**
 * Auth endpoints for the Sinag-Bughaw Laravel API (`routes/api.php`).
 *
 * Registration URL:
 *   {API_BASE_URL}/auth/register
 *   e.g. http://192.168.8.42:8000/api/auth/register
 */
export const authService = {
  registerUrl: `${API_BASE_URL}${AUTH_ENDPOINTS.register}`,

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await api.post<AuthResponse>(AUTH_ENDPOINTS.login, {
        email: credentials.email.trim().toLowerCase(),
        password: credentials.password,
      });
      const { data, headers } = response;

      if (isOtpRequired(data) || isTwoFactorRequired(data)) {
        return data;
      }

      const token = await persistTokenFromResponse(data, headers as Record<string, unknown>);
      if (!token) {
        throw new ApiClientError({
          message: 'Login succeeded but no auth token was returned by the API.',
          kind: 'unknown',
        });
      }

      return data;
    } catch (error) {
      rethrowAsSafeError(error, 'Unable to sign in. Please try again.');
    }
  },

  async register(payload: RegisterPayload): Promise<AuthResponse> {
    try {
      const body = {
        first_name: payload.first_name.trim(),
        last_name: payload.last_name.trim(),
        email: payload.email.trim().toLowerCase(),
        password: payload.password,
        password_confirmation: payload.password_confirmation,
        student_id: payload.student_id.trim(),
        course: payload.course.trim(),
        graduation_year: Number(payload.graduation_year),
        batch: payload.batch ?? String(payload.graduation_year),
        consent_accepted: Boolean(payload.consent_accepted),
        intent: payload.intent,
      };

      const response = await api.post<AuthResponse>(AUTH_ENDPOINTS.register, body);
      const { data, headers } = response;

      // Backend creates the user then requires email OTP before issuing a token.
      if (isOtpRequired(data) || isTwoFactorRequired(data)) {
        return data;
      }

      const token = await persistTokenFromResponse(data, headers as Record<string, unknown>);
      if (!token) {
        throw new ApiClientError({
          message: 'Registration succeeded but no auth token was returned by the API.',
          kind: 'unknown',
        });
      }

      return data;
    } catch (error: unknown) {
      // Interceptor already logged details; keep a concise register-specific trace.
      if (__DEV__) {
        console.warn('Register failed:', {
          endpoint: authService.registerUrl,
          message: getApiErrorMessage(error),
          kind: error instanceof ApiClientError ? error.kind : 'unknown',
        });
      }
      rethrowAsSafeError(error, 'Unable to register. Please try again.');
    }
  },

  async verifyStudent(payload: {
    student_no: string;
    first_name: string;
    last_name: string;
  }): Promise<{ found: boolean; student?: Record<string, unknown>; message?: string }> {
    try {
      const { data } = await api.post(AUTH_ENDPOINTS.verifyStudent, payload);
      return data;
    } catch (error) {
      rethrowAsSafeError(error, 'Unable to verify student record.');
    }
  },

  async sendOtp(email: string): Promise<{ message?: string }> {
    try {
      const { data } = await api.post(AUTH_ENDPOINTS.sendOtp, {
        email: email.trim().toLowerCase(),
      });
      return data;
    } catch (error) {
      rethrowAsSafeError(error, 'Could not send verification code.');
    }
  },

  /**
   * Verify email OTP after login/register. Issues and stores the Sanctum token.
   */
  async verifyOtp(payload: VerifyOtpPayload): Promise<AuthSuccessResponse> {
    try {
      const response = await api.post<AuthSuccessResponse>(AUTH_ENDPOINTS.verifyOtp, {
        email: payload.email.trim().toLowerCase(),
        otp: payload.otp.trim(),
      });
      const { data, headers } = response;

      const token = await persistTokenFromResponse(data, headers as Record<string, unknown>);
      if (!token) {
        throw new ApiClientError({
          message: 'OTP verified but no auth token was returned by the API.',
          kind: 'unknown',
        });
      }

      return data;
    } catch (error) {
      rethrowAsSafeError(error, 'Invalid or expired OTP.');
    }
  },

  async verifyTwoFactor(payload: TwoFactorChallengePayload): Promise<AuthSuccessResponse> {
    try {
      const response = await api.post<AuthSuccessResponse>('/auth/login/totp', {
        ...payload,
      });
      const { data, headers } = response;

      const token = await persistTokenFromResponse(data, headers as Record<string, unknown>);
      if (!token) {
        throw new ApiClientError({
          message: '2FA succeeded but no auth token was returned by the API.',
          kind: 'unknown',
        });
      }

      return data;
    } catch (error) {
      rethrowAsSafeError(error, 'Invalid authenticator code.');
    }
  },

  async logout(): Promise<void> {
    try {
      await api.post(AUTH_ENDPOINTS.logout);
    } catch {
      // Always clear local session even if the network call fails.
    } finally {
      await clearAuthStorage();
    }
  },

  async getUser(): Promise<User> {
    try {
      const { data } = await api.get<User | { user: User }>(AUTH_ENDPOINTS.me);
      if (data && typeof data === 'object' && 'user' in data && data.user) {
        return data.user as User;
      }
      return data as User;
    } catch (error) {
      rethrowAsSafeError(error, 'Unable to load your profile.');
    }
  },
};

export default authService;
