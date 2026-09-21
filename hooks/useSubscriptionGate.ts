import { useCallback, useState } from 'react';
import * as Haptics from 'expo-haptics';
import {
  getSubscriptionStatus,
  type LockedFeature,
} from '@/services/subscription';
import type { SubscriptionSnapshot } from '@/utils/subscription';

type GateOptions = {
  /** When set, free users may proceed if this id matches `/auth/me`. */
  allowOwnerId?: string | number | null;
};

type GateResult = {
  allowed: boolean;
  subscription: SubscriptionSnapshot | null;
  isOwner: boolean;
};

/**
 * Checks `/auth/me` (and optional payment status) before allowing a premium action.
 * When blocked, exposes state for the UpgradePrompt modal.
 */
export function useSubscriptionGate() {
  const [promptVisible, setPromptVisible] = useState(false);
  const [lockedFeature, setLockedFeature] = useState<LockedFeature>('premium');
  const [checking, setChecking] = useState(false);
  const [lastSubscription, setLastSubscription] = useState<SubscriptionSnapshot | null>(null);

  const closePrompt = useCallback(() => {
    setPromptVisible(false);
  }, []);

  const requireSubscription = useCallback(
    async (
      feature: LockedFeature = 'premium',
      options: GateOptions = {},
    ): Promise<GateResult> => {
      setChecking(true);
      setLockedFeature(feature);
      try {
        const status = await getSubscriptionStatus();
        setLastSubscription(status);

        const viewerId = status.user?.id;
        const isOwner =
          options.allowOwnerId != null &&
          viewerId != null &&
          String(viewerId) === String(options.allowOwnerId);

        if (status.isSubscribed || isOwner) {
          return { allowed: true, subscription: status, isOwner };
        }

        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setPromptVisible(true);
        return { allowed: false, subscription: status, isOwner: false };
      } catch {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setPromptVisible(true);
        return { allowed: false, subscription: lastSubscription, isOwner: false };
      } finally {
        setChecking(false);
      }
    },
    [lastSubscription],
  );

  const refreshAfterUpgrade = useCallback(async (): Promise<boolean> => {
    try {
      const status = await getSubscriptionStatus();
      setLastSubscription(status);
      return status.isSubscribed;
    } catch {
      return false;
    }
  }, []);

  return {
    promptVisible,
    lockedFeature,
    checking,
    lastSubscription,
    requireSubscription,
    closePrompt,
    refreshAfterUpgrade,
    setPromptVisible,
  };
}
