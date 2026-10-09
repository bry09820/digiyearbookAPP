import api, {
  ApiClientError,
  FACE_ENDPOINTS,
  apiPath,
  getApiErrorMessage,
  isNetworkOrTimeoutError,
} from '@/services/api';
import { getToken } from '@/services/tokenStorage';

export type FaceSyncPayload = {
  /** Raw JPEG base64 string (no `data:image/...` prefix). */
  image_base64: string;
  /** Student number / id — must match the authenticated account (unless admin). */
  student_id?: string;
  user_id?: number;
};

export type FaceSyncResponse = {
  success: boolean;
  message?: string;
  indexed?: boolean;
  user_id?: number;
  student_id?: string | null;
  profile_picture?: string | null;
  external_image_id?: string | null;
  face_records?: number;
  code?: string;
};

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
 * Face registration against Laravel `POST /api/face/sync` (auth:sanctum).
 * Explicitly attaches `Authorization: Bearer <token>` from SecureStore.
 */
export const faceService = {
  async registerFace(payload: FaceSyncPayload): Promise<FaceSyncResponse> {
    try {
      const token = (await getToken())?.trim() || null;
      if (!token) {
        throw new ApiClientError({
          message: 'You must be signed in to register your face. Please log in and try again.',
          kind: 'http',
          status: 401,
        });
      }

      const body: Record<string, string | number> = {
        image_base64: payload.image_base64,
      };
      if (payload.student_id?.trim()) {
        body.student_id = payload.student_id.trim();
      }
      if (payload.user_id != null) {
        body.user_id = payload.user_id;
      }

      if (__DEV__) {
        console.log('[face-sync] POST', FACE_ENDPOINTS.sync, {
          hasBearer: true,
          student_id: body.student_id ?? null,
          user_id: body.user_id ?? null,
        });
      }

      const { data } = await api.post<FaceSyncResponse>(apiPath(FACE_ENDPOINTS.sync), body, {
        timeout: 120_000,
        maxRedirects: 0,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!data?.success && data?.indexed !== true) {
        throw new ApiClientError({
          message: data?.message || 'Face could not be registered.',
          kind: 'http',
          data,
        });
      }

      return data;
    } catch (error) {
      rethrowAsSafeError(error, 'Unable to register face. Please try again.');
    }
  },
};

export default faceService;
