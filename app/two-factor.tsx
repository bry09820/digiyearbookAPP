import React, { useState } from 'react';
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
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { FontAwesome } from '@expo/vector-icons';
import { getApiErrorMessage } from '@/services/api';
import { authService } from '@/services/auth';

export default function TwoFactorPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    const trimmed = code.trim();

    if (!trimmed) {
      setError(
        useRecoveryCode
          ? 'Please enter a recovery code.'
          : 'Please enter your 6-digit authenticator code.',
      );
      return;
    }

    if (!useRecoveryCode && !/^\d{6}$/.test(trimmed)) {
      setError('Authenticator codes are 6 digits.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await authService.verifyTwoFactor(
        useRecoveryCode ? { recovery_code: trimmed } : { code: trimmed },
      );

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)/home');
    } catch (err) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(getApiErrorMessage(err, 'Invalid code. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: false,
          title: 'Two-Factor Authentication',
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
              <FontAwesome name="shield" size={32} color="#35408E" />
            </View>
            <Text style={styles.title}>Two-Factor Auth</Text>
            <Text style={styles.subtitle}>
              {useRecoveryCode
                ? 'Enter one of your recovery codes to finish signing in.'
                : 'Open Google Authenticator and enter the 6-digit code for your account.'}
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                {useRecoveryCode ? 'RECOVERY CODE' : 'AUTHENTICATION CODE'}
              </Text>
              <View style={[styles.inputWrapper, error ? styles.inputWrapperError : null]}>
                <FontAwesome
                  name={useRecoveryCode ? 'key' : 'mobile'}
                  size={20}
                  color="#8E8E93"
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder={useRecoveryCode ? 'xxxx-xxxx' : '123456'}
                  value={code}
                  onChangeText={(value) => {
                    setCode(useRecoveryCode ? value : value.replace(/\D/g, '').slice(0, 6));
                    if (error) setError(null);
                  }}
                  keyboardType={useRecoveryCode ? 'default' : 'number-pad'}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                  maxLength={useRecoveryCode ? 64 : 6}
                  placeholderTextColor="#C7C7CC"
                  onSubmitEditing={handleVerify}
                  returnKeyType="go"
                />
              </View>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, loading ? styles.buttonDisabled : null]}
              onPress={handleVerify}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#35408E" />
              ) : (
                <Text style={styles.buttonText}>Verify & Continue</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              disabled={loading}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setUseRecoveryCode((prev) => !prev);
                setCode('');
                setError(null);
              }}
            >
              <Text style={styles.secondaryButtonText}>
                {useRecoveryCode ? 'Use authenticator code' : 'Use a recovery code'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              disabled={loading}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.replace('/login');
              }}
            >
              <Text style={styles.footerLink}>Back to Sign In</Text>
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
    paddingHorizontal: 12,
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
    fontSize: 18,
    color: '#000000',
    letterSpacing: 4,
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
  secondaryButton: {
    marginTop: 20,
    alignItems: 'center',
    paddingVertical: 8,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#35408E',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 40,
  },
  footerLink: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#35408E',
  },
});
