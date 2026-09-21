import { Platform, StatusBar } from 'react-native';

/** Fallback top inset when SafeAreaView / insets are unavailable. */
export function fallbackTopInset(): number {
  if (Platform.OS === 'android') {
    return StatusBar.currentHeight ?? 24;
  }
  return 44;
}
