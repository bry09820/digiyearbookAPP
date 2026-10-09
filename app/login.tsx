import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { FontAwesome, MaterialIcons } from '@expo/vector-icons';
import { FaceLoginCameraModal } from '@/components/FaceLoginCameraModal';
import { getApiErrorMessage } from '@/services/api';
import { authService } from '@/services/auth';
import {
  biometricService,
  type BiometricAvailability,
} from '@/services/biometric';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [faceCameraVisible, setFaceCameraVisible] = useState(false);
  const [faceVerifying, setFaceVerifying] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometrics');
  const [biometricReady, setBiometricReady] = useState(false);

  const refreshBiometricState = useCallback(async () => {
    const availability: BiometricAvailability = await biometricService.getAvailability();
    const credentials = await biometricService.getStoredCredentials();
    setBiometricLabel(availability.label);
    setBiometricAvailable(availability.supported && availability.enrolled);
    setBiometricReady(
      availability.supported && availability.enrolled && credentials !== null,
    );

    if (credentials?.email) {
      setEmail((current) => current || credentials.email);
    }
  }, []);

  useEffect(() => {
    void refreshBiometricState();
  }, [refreshBiometricState]);

  const navigateAfterAuth = async (
    result: Awaited<ReturnType<typeof authService.login>>,
    trimmedEmail: string,
  ) => {
    if ('requires_otp' in result && result.requires_otp === true) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push({
        pathname: '/verify-otp',
        params: { email: result.email || trimmedEmail },
      });
      return;
    }

    if ('two_factor' in result && result.two_factor === true) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      router.push('/two-factor');
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/(tabs)/home');
  };

  const offerBiometricEnrollment = (
    loginEmail: string,
    loginPassword: string,
  ): Promise<void> => {
    if (Platform.OS === 'web' || !biometricAvailable) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      Alert.alert(
        `Enable ${biometricLabel}?`,
        `Use ${biometricLabel} for faster sign-in next time on this device.`,
        [
          {
            text: 'Not now',
            style: 'cancel',
            onPress: () => resolve(),
          },
          {
            text: 'Enable',
            onPress: () => {
              void (async () => {
                try {
                  const enrolled = await biometricService.enroll(loginEmail, loginPassword);
                  if (!enrolled.success) {
                    resolve();
                    return;
                  }
                  await refreshBiometricState();
                  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                } catch {
                  // LocalAuthentication errors should not interrupt login navigation.
                }
                resolve();
              })();
            },
          },
        ],
        { cancelable: true, onDismiss: () => resolve() },
      );
    });
  };

  const handleLogin = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const result = await authService.login({
        email: trimmedEmail,
        password,
      });

      const needsChallenge =
        ('requires_otp' in result && result.requires_otp === true) ||
        ('two_factor' in result && result.two_factor === true);

      if (!needsChallenge) {
        const alreadyEnabled = await biometricService.isEnabled();
        if (!alreadyEnabled && biometricAvailable) {
          await offerBiometricEnrollment(trimmedEmail, password);
        } else if (alreadyEnabled) {
          await biometricService.enable(trimmedEmail, password);
        }
      }

      await navigateAfterAuth(result, trimmedEmail);
    } catch (err) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(getApiErrorMessage(err, 'Unable to sign in. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  /** Enable Face ID / fingerprint with current form credentials, or sign in when already enrolled. */
  const handleBiometricPress = async () => {
    setError(null);
    setBiometricLoading(true);

    try {
      const existing = await biometricService.getStoredCredentials();

      if (!existing) {
        const trimmedEmail = email.trim();
        if (!trimmedEmail || !password) {
          setError(`Enter your email and password, then tap Enable ${biometricLabel}.`);
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          return;
        }

        let enrolled;
        try {
          enrolled = await biometricService.enroll(trimmedEmail, password);
        } catch {
          await Haptics.selectionAsync();
          return;
        }

        if (!enrolled.success) {
          await Haptics.selectionAsync();
          return;
        }

        await refreshBiometricState();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        try {
          const result = await authService.login({
            email: trimmedEmail,
            password,
          });
          await navigateAfterAuth(result, trimmedEmail);
        } catch (err) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setError(getApiErrorMessage(err, 'Unable to sign in. Please try again.'));
        }
        return;
      }

      let authResult;
      try {
        authResult = await biometricService.authenticate(`Sign in with ${biometricLabel}`);
      } catch {
        await Haptics.selectionAsync();
        return;
      }

      if (!authResult.success) {
        await Haptics.selectionAsync();
        return;
      }

      try {
        const result = await authService.login(existing);
        setEmail(existing.email);
        await navigateAfterAuth(result, existing.email);
      } catch (err) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError(getApiErrorMessage(err, 'Unable to sign in. Please try again.'));
      }
    } catch {
      await Haptics.selectionAsync();
    } finally {
      setBiometricLoading(false);
    }
  };

  const openFaceRecognition = () => {
    setError(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFaceCameraVisible(true);
  };

  const closeFaceRecognition = () => {
    if (faceVerifying) return;
    setFaceCameraVisible(false);
  };

  const handleFaceCapture = async (imageBase64: string) => {
    setFaceVerifying(true);
    setError(null);

    const userEmail = email.trim().toLowerCase();

    try {
      const result = await authService.loginWithFace({
        image_base64: imageBase64,
        email: userEmail || undefined,
      });

      setFaceCameraVisible(false);

      const resolvedEmail =
        userEmail ||
        ('user' in result && result.user?.email ? result.user.email : '');

      await navigateAfterAuth(result, resolvedEmail);
    } catch (err) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Face recognition failed',
        getApiErrorMessage(
          err,
          'Face not recognized. Please try again or sign in with email and password.',
        ),
        [
          { text: 'Try again', style: 'cancel' },
          {
            text: 'Back to Sign In',
            onPress: () => setFaceCameraVisible(false),
          },
        ],
      );
    } finally {
      setFaceVerifying(false);
    }
  };

  const busy = loading || biometricLoading;

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: false,
          title: 'Login',
        }}
      />
      <StatusBar style="dark" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <FontAwesome name="lock" size={32} color="#35408E" />
            </View>
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Enter your credentials to access your yearbook.</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>UNIVERSITY EMAIL</Text>
              <View style={[styles.inputWrapper, error ? styles.inputWrapperError : null]}>
                <FontAwesome name="envelope-o" size={18} color="#8E8E93" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="student@nu-lipa.edu.ph"
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    if (error) setError(null);
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!busy}
                  placeholderTextColor="#C7C7CC"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>PASSWORD</Text>
              <View style={[styles.inputWrapper, error ? styles.inputWrapperError : null]}>
                <FontAwesome name="lock" size={20} color="#8E8E93" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    if (error) setError(null);
                  }}
                  secureTextEntry
                  editable={!busy}
                  placeholderTextColor="#C7C7CC"
                  onSubmitEditing={() => void handleLogin()}
                  returnKeyType="go"
                />
              </View>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, busy ? styles.buttonDisabled : null]}
              onPress={() => void handleLogin()}
              disabled={busy}
            >
              {loading ? (
                <ActivityIndicator color="#35408E" />
              ) : (
                <Text style={styles.buttonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.faceRecognitionButton, busy ? styles.buttonDisabled : null]}
              onPress={openFaceRecognition}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Sign in with Face Recognition"
            >
              <MaterialIcons
                name="face"
                size={24}
                color="#35408E"
                style={styles.biometricIcon}
              />
              <Text style={styles.biometricButtonText}>Sign in with Face Recognition</Text>
            </TouchableOpacity>

            {biometricAvailable ? (
              <>
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>

                <TouchableOpacity
                  style={[styles.biometricButton, busy && styles.buttonDisabled]}
                  onPress={() => void handleBiometricPress()}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={
                    biometricReady
                      ? `Sign in with ${biometricLabel}`
                      : `Enable ${biometricLabel}`
                  }
                >
                  {biometricLoading ? (
                    <ActivityIndicator color="#35408E" />
                  ) : (
                    <>
                      <MaterialIcons
                        name={
                          biometricLabel.toLowerCase().includes('face')
                            ? 'face'
                            : 'fingerprint'
                        }
                        size={24}
                        color="#35408E"
                        style={styles.biometricIcon}
                      />
                      <Text style={styles.biometricButtonText}>
                        {biometricReady
                          ? `Sign in with ${biometricLabel}`
                          : `Enable ${biometricLabel}`}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : null}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don&apos;t have an account?</Text>
            <TouchableOpacity
              disabled={busy}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/signup');
              }}
            >
              <Text style={styles.footerLink}>Register</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            disabled={busy}
            style={styles.welcomeLink}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.replace('/');
            }}
          >
            <Text style={styles.welcomeLinkText}>Back to Welcome</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <FaceLoginCameraModal
        visible={faceCameraVisible}
        verifying={faceVerifying}
        onCapture={handleFaceCapture}
        onClose={closeFaceRecognition}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FB',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 30,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconContainer: {
    width: 80,
    height: 80,
    backgroundColor: '#F0F2F8',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  form: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    height: 60,
    paddingHorizontal: 16,
  },
  inputWrapperError: {
    borderColor: '#D14343',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#000000',
  },
  errorText: {
    color: '#D14343',
    fontSize: 14,
    marginBottom: 8,
    marginTop: -8,
  },
  button: {
    height: 60,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#35408E',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#35408E',
  },
  faceRecognitionButton: {
    height: 60,
    backgroundColor: '#F0F2F8',
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#D5DBF0',
    paddingHorizontal: 16,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
  },
  biometricButton: {
    height: 60,
    backgroundColor: '#F0F2F8',
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#D5DBF0',
    paddingHorizontal: 16,
  },
  biometricIcon: {
    marginRight: 10,
  },
  biometricButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#35408E',
    flexShrink: 1,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 40,
  },
  footerText: {
    fontSize: 14,
    color: '#8E8E93',
    marginRight: 4,
  },
  footerLink: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#35408E',
  },
  welcomeLink: {
    marginTop: 20,
    alignItems: 'center',
    paddingVertical: 8,
  },
  welcomeLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
  },
});
