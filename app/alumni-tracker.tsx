import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fallbackTopInset } from '@/utils/safeArea';
import { openAlumniTracker, getYearbookReturnUrl } from '@/services/alumniLink';
import { ALUMNI_TRACKER_URL } from '@/constants/config';

/**
 * Cross-navigation hub between Yearbook ↔ Alumni Tracker.
 * Opening Alumni Tracker uses the configured deep link / URL; returning uses capstoneapp://.
 */
export default function AlumniTrackerBridgeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topPad = Math.max(insets.top, fallbackTopInset());
  const returnUrl = getYearbookReturnUrl();

  const handleOpenAlumni = () => {
    void openAlumniTracker();
  };

  const handleCopyReturnHint = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      'Return to Yearbook',
      `Alumni Tracker can deep-link back with:\n\n${returnUrl}\n\nYearbook scheme: capstoneapp://`,
    );
  };

  const handleOpenReturn = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const can = await Linking.canOpenURL(returnUrl);
      if (can) {
        await Linking.openURL(returnUrl);
      } else {
        router.replace('/(tabs)/home');
      }
    } catch {
      router.replace('/(tabs)/home');
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      <View style={[styles.topBar, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)/home');
          }}
        >
          <FontAwesome name="chevron-left" size={18} color="#FFC800" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Alumni Tracker</Text>
        <View style={styles.backButtonPlaceholder} />
      </View>

      <View style={styles.content}>
        <View style={styles.heroIcon}>
          <FontAwesome name="exchange" size={36} color="#35408E" />
        </View>
        <Text style={styles.title}>Cross-app navigation</Text>
        <Text style={styles.body}>
          Jump to the Alumni Tracker companion app, then return here with the Yearbook deep link.
        </Text>

        <View style={styles.linkCard}>
          <Text style={styles.linkLabel}>ALUMNI TRACKER</Text>
          <Text style={styles.linkValue} numberOfLines={2}>
            {ALUMNI_TRACKER_URL}
          </Text>
        </View>

        <View style={styles.linkCard}>
          <Text style={styles.linkLabel}>YEARBOOK RETURN</Text>
          <Text style={styles.linkValue} numberOfLines={2}>
            {returnUrl}
          </Text>
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={handleOpenAlumni}>
          <FontAwesome name="external-link" size={16} color="#FFFFFF" style={styles.btnIcon} />
          <Text style={styles.primaryText}>Open Alumni Tracker</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={() => void handleOpenReturn()}>
          <FontAwesome name="home" size={16} color="#35408E" style={styles.btnIcon} />
          <Text style={styles.secondaryText}>Return to Yearbook Home</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleCopyReturnHint}>
          <Text style={styles.hintLink}>How return deep links work</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FB',
  },
  topBar: {
    backgroundColor: '#35408E',
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 72,
  },
  backButtonPlaceholder: {
    minWidth: 72,
  },
  backText: {
    color: '#FFC800',
    fontWeight: '600',
    marginLeft: 6,
    fontSize: 15,
  },
  topTitle: {
    color: '#FFC800',
    fontSize: 17,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    alignItems: 'center',
  },
  heroIcon: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: '#E8EFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 10,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  linkCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    marginBottom: 12,
  },
  linkLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  linkValue: {
    fontSize: 13,
    color: '#35408E',
    fontWeight: '600',
  },
  primaryButton: {
    marginTop: 16,
    width: '100%',
    height: 54,
    borderRadius: 14,
    backgroundColor: '#35408E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  secondaryButton: {
    marginTop: 12,
    width: '100%',
    height: 54,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#35408E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: '#35408E',
    fontWeight: 'bold',
    fontSize: 15,
  },
  btnIcon: {
    marginRight: 10,
  },
  hintLink: {
    marginTop: 20,
    color: '#35408E',
    fontWeight: '600',
    fontSize: 13,
  },
});
