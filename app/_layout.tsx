import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getToken } from '@/services/tokenStorage';

/** Public / pre-auth screens (landing lives at `index`). */
const AUTH_ROUTES = new Set(['index', 'login', 'signup', 'verify-otp', 'two-factor']);

const PROTECTED_ROOTS = new Set([
  '(tabs)',
  'student',
  'generate-yearbook',
  'alumni-tracker',
  'profile-settings',
]);

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const token = (await getToken())?.trim() || null;
        if (cancelled) return;

        const root = segments[0] ? String(segments[0]) : 'index';
        const inAuthGroup = AUTH_ROUTES.has(root);
        const inProtected = PROTECTED_ROOTS.has(root);
        const inOtpFlow = root === 'verify-otp' || root === 'two-factor';

        if (token) {
          // Signed in: leave auth/landing screens for the dashboard
          // (OTP / 2FA flows may still need to finish).
          if (inAuthGroup && !inOtpFlow) {
            router.replace('/(tabs)/home');
          }
        } else if (inProtected) {
          // Signed out on a protected route → Welcome / Landing first.
          router.replace('/');
        }
        // Signed out on index / login / signup / otp → stay put.
      } catch {
        // Stay on public routes if token read fails.
      } finally {
        if (!cancelled) {
          setBootstrapped(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [segments, router]);

  if (!bootstrapped) {
    return (
      <View style={styles.boot}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color="#35408E" />
      </View>
    );
  }

  return (
    <Stack
      initialRouteName="index"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="verify-otp" />
      <Stack.Screen name="two-factor" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="student/[id]" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="generate-yearbook" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="alumni-tracker" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="profile-settings" options={{ headerShown: false, presentation: 'card' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FB',
  },
});
