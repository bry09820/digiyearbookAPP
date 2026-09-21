import { Alert, Linking, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ALUMNI_TRACKER_URL, YEARBOOK_RETURN_URL } from '@/constants/config';

/**
 * Open the companion Alumni Tracker app (or web URL).
 * Yearbook can be reopened via YEARBOOK_RETURN_URL / capstoneapp:// deep links.
 */
export async function openAlumniTracker(): Promise<boolean> {
  const url = ALUMNI_TRACKER_URL;
  if (!url) {
    Alert.alert(
      'Alumni Tracker unavailable',
      'Set EXPO_PUBLIC_ALUMNI_TRACKER_URL in your .env to the Alumni Tracker deep link or web address.',
    );
    return false;
  }

  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // On Android, canOpenURL often returns false for custom schemes without
    // package queries — attempt openURL directly and fall back on failure.
    if (Platform.OS !== 'web') {
      const canOpen = await Linking.canOpenURL(url).catch(() => false);
      if (!canOpen && url.startsWith('http')) {
        Alert.alert(
          'Open Alumni Tracker',
          `Unable to open ${url}. Check EXPO_PUBLIC_ALUMNI_TRACKER_URL.\n\nReturn to Yearbook with: ${YEARBOOK_RETURN_URL}`,
        );
        return false;
      }
    }

    await Linking.openURL(url);
    return true;
  } catch {
    Alert.alert(
      'Open Alumni Tracker',
      `Could not open Alumni Tracker. Install the companion app or set EXPO_PUBLIC_ALUMNI_TRACKER_URL.\n\nTried: ${url}\nReturn: ${YEARBOOK_RETURN_URL}`,
    );
    return false;
  }
}

/** Open this Yearbook app from another app (used by bridge / docs). */
export function getYearbookReturnUrl(): string {
  return YEARBOOK_RETURN_URL;
}
