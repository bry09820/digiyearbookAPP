import React, { useMemo, useState } from 'react';
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
  Switch,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { FontAwesome } from '@expo/vector-icons';
import { getApiErrorMessage } from '@/services/api';
import { authService } from '@/services/auth';

const CURRENT_YEAR = new Date().getFullYear();

export default function SignupPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [email, setEmail] = useState('');
  const [course, setCourse] = useState('');
  const [graduationYear, setGraduationYear] = useState(String(CURRENT_YEAR));
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(
    () =>
      Boolean(
        firstName.trim() &&
          lastName.trim() &&
          studentId.trim() &&
          email.trim() &&
          course.trim() &&
          graduationYear.trim() &&
          password &&
          confirmPassword &&
          consentAccepted,
      ),
    [
      firstName,
      lastName,
      studentId,
      email,
      course,
      graduationYear,
      password,
      confirmPassword,
      consentAccepted,
    ],
  );

  const clearErrorOnChange = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    if (error) setError(null);
  };

  const handleRegister = async () => {
    const payload = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      student_id: studentId.trim(),
      email: email.trim(),
      course: course.trim(),
      graduation_year: Number(graduationYear),
      password,
      password_confirmation: confirmPassword,
      consent_accepted: true as const,
      batch: graduationYear.trim(),
    };

    if (!canSubmit) {
      setError('Please complete all required fields and accept the privacy policy.');
      return;
    }

    if (Number.isNaN(payload.graduation_year) || payload.graduation_year < 1990 || payload.graduation_year > 2100) {
      setError('Graduation year must be between 1990 and 2100.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const result = await authService.register(payload);

      if ('requires_otp' in result && result.requires_otp === true) {
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
          // Ignore haptics failures on unsupported devices.
        }
        router.push({
          pathname: '/verify-otp',
          params: { email: result.email || payload.email },
        });
        return;
      }

      if ('two_factor' in result && result.two_factor === true) {
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } catch {
          // Ignore haptics failures.
        }
        router.push('/two-factor');
        return;
      }

      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // Ignore haptics failures.
      }
      router.replace('/(tabs)/home');
    } catch (err) {
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {
        // Ignore haptics failures.
      }
      setError(getApiErrorMessage(err, 'Unable to register. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: false,
          title: 'Register',
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
              <FontAwesome name="user-plus" size={32} color="#35408E" />
            </View>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>
              Register with the same details as the Sinag-Bughaw yearbook system.
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.row}>
              <View style={[styles.inputGroup, styles.half]}>
                <Text style={styles.label}>FIRST NAME</Text>
                <View style={[styles.inputWrapper, error ? styles.inputWrapperError : null]}>
                  <TextInput
                    style={styles.input}
                    placeholder="Alex"
                    value={firstName}
                    onChangeText={clearErrorOnChange(setFirstName)}
                    autoCapitalize="words"
                    editable={!loading}
                    placeholderTextColor="#C7C7CC"
                  />
                </View>
              </View>
              <View style={[styles.inputGroup, styles.half]}>
                <Text style={styles.label}>LAST NAME</Text>
                <View style={[styles.inputWrapper, error ? styles.inputWrapperError : null]}>
                  <TextInput
                    style={styles.input}
                    placeholder="De La Cruz"
                    value={lastName}
                    onChangeText={clearErrorOnChange(setLastName)}
                    autoCapitalize="words"
                    editable={!loading}
                    placeholderTextColor="#C7C7CC"
                  />
                </View>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>STUDENT ID</Text>
              <View style={[styles.inputWrapper, error ? styles.inputWrapperError : null]}>
                <FontAwesome name="id-card-o" size={18} color="#8E8E93" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="2021-123456"
                  value={studentId}
                  onChangeText={clearErrorOnChange(setStudentId)}
                  autoCapitalize="none"
                  editable={!loading}
                  placeholderTextColor="#C7C7CC"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>EMAIL ADDRESS</Text>
              <View style={[styles.inputWrapper, error ? styles.inputWrapperError : null]}>
                <FontAwesome name="envelope-o" size={18} color="#8E8E93" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="student@nu-lipa.edu.ph"
                  value={email}
                  onChangeText={clearErrorOnChange(setEmail)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                  placeholderTextColor="#C7C7CC"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>COURSE</Text>
              <View style={[styles.inputWrapper, error ? styles.inputWrapperError : null]}>
                <FontAwesome name="graduation-cap" size={18} color="#8E8E93" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Bachelor of Science in Information Technology"
                  value={course}
                  onChangeText={clearErrorOnChange(setCourse)}
                  editable={!loading}
                  placeholderTextColor="#C7C7CC"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>GRADUATION YEAR</Text>
              <View style={[styles.inputWrapper, error ? styles.inputWrapperError : null]}>
                <FontAwesome name="calendar" size={18} color="#8E8E93" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder={String(CURRENT_YEAR)}
                  value={graduationYear}
                  onChangeText={clearErrorOnChange(setGraduationYear)}
                  keyboardType="number-pad"
                  maxLength={4}
                  editable={!loading}
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
                  onChangeText={clearErrorOnChange(setPassword)}
                  secureTextEntry
                  editable={!loading}
                  placeholderTextColor="#C7C7CC"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>CONFIRM PASSWORD</Text>
              <View style={[styles.inputWrapper, error ? styles.inputWrapperError : null]}>
                <FontAwesome name="lock" size={20} color="#8E8E93" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChangeText={clearErrorOnChange(setConfirmPassword)}
                  secureTextEntry
                  editable={!loading}
                  placeholderTextColor="#C7C7CC"
                />
              </View>
            </View>

            <View style={styles.consentRow}>
              <Switch
                value={consentAccepted}
                onValueChange={(value) => {
                  setConsentAccepted(value);
                  if (error) setError(null);
                }}
                disabled={loading}
                trackColor={{ false: '#E5E7EB', true: '#A5B4FC' }}
                thumbColor={consentAccepted ? '#35408E' : '#f4f3f4'}
              />
              <Text style={styles.consentText}>
                I accept the privacy policy and consent to processing my yearbook data.
              </Text>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, loading || !canSubmit ? styles.buttonDisabled : null]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#35408E" />
              ) : (
                <Text style={styles.buttonText}>Sign Up</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have account?</Text>
            <TouchableOpacity
              disabled={loading}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/login');
              }}
            >
              <Text style={styles.footerLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
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
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  form: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  half: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: 16,
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
    height: 56,
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
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  consentText: {
    flex: 1,
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
  },
  errorText: {
    color: '#D14343',
    fontSize: 14,
    marginBottom: 8,
  },
  button: {
    height: 60,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 32,
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
});
