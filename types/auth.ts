export type ProfileVisibility = 'public' | 'batchmates' | 'private' | 'alumni_only';

export type User = {
  id: number;
  name?: string;
  first_name?: string;
  last_name?: string;
  email: string;
  student_id?: string;
  course?: string;
  graduation_year?: number;
  batch?: string;
  motto?: string;
  bio?: string;
  role?: string;
  profile_visibility?: ProfileVisibility;
  email_verified?: boolean;
  email_verified_at?: string | null;
  consent_accepted?: boolean;
  two_factor_enabled?: boolean;
  two_factor_confirmed_at?: string | null;
  /** Subscription / tier fields from `/auth/me`. */
  is_subscribed?: boolean;
  is_premium?: boolean;
  subscribed?: boolean;
  has_subscription?: boolean;
  tier?: string;
  plan?: string;
  subscription_tier?: string;
  subscription_plan?: string;
  subscription?: {
    tier?: string;
    plan?: string;
    status?: string;
    [key: string]: unknown;
  };
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
};

export type LoginCredentials = {
  email: string;
  password: string;
};

/** Payload for camera-based face recognition sign-in. */
export type FaceLoginPayload = {
  /** Raw JPEG base64 string (no `data:image/...` prefix). */
  image_base64: string;
  /** Optional email hint when the user already filled the login form. */
  email?: string;
  /** Optional student number when known (login form / prior session). */
  student_id?: string;
};

/** Matches Laravel AuthController@register validation rules. */
export type RegisterPayload = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  password_confirmation: string;
  student_id: string;
  course: string;
  graduation_year: number;
  batch?: string;
  consent_accepted: boolean | 1 | '1' | true;
  intent?: 'graduate' | 'browse';
};

export type TwoFactorChallengePayload = {
  code?: string;
  recovery_code?: string;
};

export type VerifyOtpPayload = {
  email: string;
  otp: string;
};

/** Successful auth with a Sanctum token. */
export type AuthSuccessResponse = {
  two_factor?: false;
  requires_otp?: false;
  token?: string;
  access_token?: string;
  auth_token?: string;
  user?: User;
  message?: string;
  requires_consent?: boolean;
  is_graduate?: boolean;
};

/** Email OTP challenge (Sinag-Bughaw login/register flow). */
export type OtpRequiredResponse = {
  requires_otp: true;
  email: string;
  message?: string;
  user?: User;
  email_send_failed?: boolean;
  requires_consent?: boolean;
  is_graduate?: boolean;
};

/** Legacy Google Authenticator / Fortify-style challenge. */
export type TwoFactorRequiredResponse = {
  two_factor: true;
  message?: string;
};

export type AuthResponse =
  | AuthSuccessResponse
  | OtpRequiredResponse
  | TwoFactorRequiredResponse;

export type ApiErrorBody = {
  message?: string;
  errors?: Record<string, string[]>;
};
