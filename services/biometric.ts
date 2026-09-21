import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import {
  BIOMETRIC_EMAIL_KEY,
  BIOMETRIC_ENABLED_KEY,
  BIOMETRIC_PASSWORD_KEY,
} from '@/constants/config';

export type BiometricAvailability = {
  supported: boolean;
  enrolled: boolean;
  label: string;
};

export type BiometricAuthResult =
  | { success: true }
  | { success: false; reason: 'unavailable' | 'cancelled' | 'failed'; message: string };

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

function biometricLabel(types: LocalAuthentication.AuthenticationType[]): string {
  if (Platform.OS === 'ios') {
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return 'Face ID';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return 'Touch ID';
    }
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return 'Face Unlock';
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return 'Fingerprint';
  }
  return 'Biometrics';
}

async function setCredentialItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
    return;
  }
  await SecureStore.setItemAsync(key, value, SECURE_OPTIONS);
}

async function getCredentialItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return null;
  }
  return SecureStore.getItemAsync(key, SECURE_OPTIONS);
}

async function deleteCredentialItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
    return;
  }
  await SecureStore.deleteItemAsync(key, SECURE_OPTIONS);
}

export const biometricService = {
  async getAvailability(): Promise<BiometricAvailability> {
    if (Platform.OS === 'web') {
      return { supported: false, enrolled: false, label: 'Biometrics' };
    }

    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = compatible ? await LocalAuthentication.isEnrolledAsync() : false;
      const types = compatible
        ? await LocalAuthentication.supportedAuthenticationTypesAsync()
        : [];

      return {
        supported: compatible,
        enrolled,
        label: biometricLabel(types),
      };
    } catch {
      return { supported: false, enrolled: false, label: 'Biometrics' };
    }
  },

  async isEnabled(): Promise<boolean> {
    const flag = await getCredentialItem(BIOMETRIC_ENABLED_KEY);
    return flag === '1';
  },

  async getStoredCredentials(): Promise<{ email: string; password: string } | null> {
    const [enabled, email, password] = await Promise.all([
      getCredentialItem(BIOMETRIC_ENABLED_KEY),
      getCredentialItem(BIOMETRIC_EMAIL_KEY),
      getCredentialItem(BIOMETRIC_PASSWORD_KEY),
    ]);

    if (enabled !== '1' || !email || !password) {
      return null;
    }

    return { email, password };
  },

  /**
   * Confirm device biometrics, then persist email/password in SecureStore
   * for future biometric sign-in.
   */
  async enroll(email: string, password: string): Promise<BiometricAuthResult> {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      return {
        success: false,
        reason: 'failed',
        message: 'Enter your email and password before enabling biometrics.',
      };
    }

    const availability = await this.getAvailability();
    if (!availability.supported || !availability.enrolled) {
      return {
        success: false,
        reason: 'unavailable',
        message: `${availability.label} is not available on this device.`,
      };
    }

    const auth = await this.authenticate(
      `Confirm ${availability.label} to enable quick login`,
    );
    if (!auth.success) {
      return auth;
    }

    await Promise.all([
      setCredentialItem(BIOMETRIC_ENABLED_KEY, '1'),
      setCredentialItem(BIOMETRIC_EMAIL_KEY, trimmedEmail),
      setCredentialItem(BIOMETRIC_PASSWORD_KEY, password),
    ]);

    return { success: true };
  },

  async enable(email: string, password: string): Promise<void> {
    await Promise.all([
      setCredentialItem(BIOMETRIC_ENABLED_KEY, '1'),
      setCredentialItem(BIOMETRIC_EMAIL_KEY, email.trim().toLowerCase()),
      setCredentialItem(BIOMETRIC_PASSWORD_KEY, password),
    ]);
  },

  async disable(): Promise<void> {
    await Promise.all([
      deleteCredentialItem(BIOMETRIC_ENABLED_KEY),
      deleteCredentialItem(BIOMETRIC_EMAIL_KEY),
      deleteCredentialItem(BIOMETRIC_PASSWORD_KEY),
    ]);
  },

  async authenticate(promptMessage?: string): Promise<BiometricAuthResult> {
    const availability = await this.getAvailability();
    if (!availability.supported || !availability.enrolled) {
      return {
        success: false,
        reason: 'unavailable',
        message: `${availability.label} is not available on this device.`,
      };
    }

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: promptMessage || `Sign in with ${availability.label}`,
        cancelLabel: 'Cancel',
      });

      if (result.success) {
        return { success: true };
      }

      const errorCode = 'error' in result ? String(result.error ?? '') : '';
      const cancelled =
        errorCode === 'user_cancel' ||
        errorCode === 'system_cancel' ||
        errorCode === 'app_cancel';

      return {
        success: false,
        reason: cancelled ? 'cancelled' : 'failed',
        message: cancelled
          ? `${availability.label} was cancelled.`
          : `${availability.label} authentication failed. Please try again.`,
      };
    } catch {
      return {
        success: false,
        reason: 'failed',
        message: `Unable to use ${availability.label} right now.`,
      };
    }
  },
};

export default biometricService;
