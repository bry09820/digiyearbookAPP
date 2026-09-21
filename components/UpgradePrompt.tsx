import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  featureCopy,
  openPayMongoCheckout,
  type BillingPlan,
  type LockedFeature,
} from '@/services/subscription';
import { getApiErrorMessage } from '@/services/api';

export type UpgradePromptProps = {
  visible: boolean;
  feature?: LockedFeature;
  title?: string;
  message?: string;
  onClose: () => void;
  /** Called after checkout returns and subscription should be re-checked. */
  onUpgraded?: () => void;
};

/**
 * Paywall modal shown when a free-tier user taps a locked feature.
 * Opens PayMongo hosted checkout (via Laravel) or the web billing portal.
 */
export function UpgradePrompt({
  visible,
  feature = 'premium',
  title,
  message,
  onClose,
  onUpgraded,
}: UpgradePromptProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = featureCopy(feature);

  const handleUpgrade = async (plan: BillingPlan) => {
    setBusy(true);
    setError(null);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const result = await openPayMongoCheckout(plan);
      if (result === 'success') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onUpgraded?.();
        onClose();
        return;
      }
      // cancel / dismiss — leave modal open so the user can retry or close.
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to open PayMongo checkout.'));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.iconCircle}>
            <FontAwesome name="lock" size={22} color="#35408E" />
          </View>

          <Text style={styles.title}>{title || copy.title}</Text>
          <Text style={styles.body}>{message || copy.body}</Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryButton, busy && styles.buttonDisabled]}
            disabled={busy}
            onPress={() => void handleUpgrade('premium_monthly')}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <FontAwesome name="credit-card" size={14} color="#FFFFFF" style={styles.btnIcon} />
                <Text style={styles.primaryText}>Premium Monthly · ₱199</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, busy && styles.buttonDisabled]}
            disabled={busy}
            onPress={() => void handleUpgrade('premium_yearly')}
          >
            <Text style={styles.secondaryText}>Premium Yearly · ₱1,499</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dismissButton}
            disabled={busy}
            onPress={() => {
              void Haptics.selectionAsync();
              onClose();
            }}
          >
            <Text style={styles.dismissText}>Not now</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 20, 45, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: 'center',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EEF1FB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1C1C1E',
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
  },
  error: {
    fontSize: 13,
    color: '#FF3B30',
    textAlign: 'center',
    marginBottom: 12,
  },
  primaryButton: {
    width: '100%',
    height: 50,
    borderRadius: 12,
    backgroundColor: '#35408E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  secondaryButton: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#35408E',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  btnIcon: {
    marginRight: 8,
  },
  primaryText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  secondaryText: {
    color: '#35408E',
    fontWeight: 'bold',
    fontSize: 14,
  },
  dismissButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  dismissText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default UpgradePrompt;
