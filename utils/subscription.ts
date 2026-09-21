import { asText, firstText } from '@/utils/text';

export type SubscriptionTier = 'free' | 'standard' | 'premium' | string;

export type SubscriptionSnapshot = {
  isSubscribed: boolean;
  isPremium: boolean;
  tier: SubscriptionTier;
  plan: string;
  status: string;
  /** e.g. "Premium Active", "Standard Active", "Free" */
  label: string;
};

function titleCase(value: string): string {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function resolveStatus(user: Record<string, unknown>): string {
  const nested = user.subscription;
  const nestedStatus =
    nested && typeof nested === 'object'
      ? asText((nested as Record<string, unknown>).status)
      : '';

  return (
    firstText(
      user.subscription_status,
      user.sub_status,
      nestedStatus,
      user.is_subscribed === true || user.is_premium === true ? 'active' : '',
    ).toLowerCase() || 'inactive'
  );
}

/** Human-readable badge text for profile UI. */
export function formatSubscriptionLabel(input: {
  isSubscribed: boolean;
  isPremium: boolean;
  tier: string;
  plan: string;
  status: string;
}): string {
  if (!input.isSubscribed) {
    return 'Free';
  }

  const tierKey = (input.isPremium ? 'premium' : input.tier || input.plan || 'standard').toLowerCase();
  const tierName =
    tierKey === 'premium'
      ? 'Premium'
      : tierKey === 'standard'
        ? 'Standard'
        : tierKey === 'pro'
          ? 'Pro'
          : titleCase(tierKey);

  const status = (input.status || 'active').toLowerCase();
  if (status === 'active' || status === 'trialing') {
    return `${tierName} Active`;
  }
  if (status === 'canceled' || status === 'cancelled') {
    return `${tierName} Canceled`;
  }
  if (status === 'past_due') {
    return `${tierName} Past Due`;
  }
  if (status === 'expired') {
    return `${tierName} Expired`;
  }

  return `${tierName} Active`;
}

/** Normalize subscription fields returned by `/auth/me` or nested user payloads. */
export function resolveSubscription(user: Record<string, unknown> | null | undefined): SubscriptionSnapshot {
  if (!user) {
    return {
      isSubscribed: false,
      isPremium: false,
      tier: 'free',
      plan: 'free',
      status: 'inactive',
      label: 'Free',
    };
  }

  const tierRaw = firstText(
    user.tier,
    user.subscription_tier,
    user.plan,
    (user.subscription as Record<string, unknown> | undefined)?.tier,
    (user.subscription as Record<string, unknown> | undefined)?.plan,
  ).toLowerCase();

  const plan =
    firstText(user.plan, user.subscription_plan, tierRaw, 'free').toLowerCase() || 'free';
  const tier = (tierRaw || plan || 'free') as SubscriptionTier;
  const status = resolveStatus(user);

  const explicitSubscribed =
    user.is_subscribed === true ||
    user.subscribed === true ||
    user.has_subscription === true ||
    status === 'active' ||
    status === 'trialing';

  const explicitPremium =
    user.is_premium === true ||
    user.premium === true ||
    tier === 'premium' ||
    plan === 'premium';

  const paidTier = new Set(['standard', 'premium', 'pro', 'paid']);
  const isSubscribed =
    explicitSubscribed || explicitPremium || paidTier.has(tier) || paidTier.has(plan);

  const resolvedTier = (isSubscribed ? tier || 'standard' : 'free') as SubscriptionTier;
  const resolvedPlan = isSubscribed ? plan || 'standard' : 'free';
  const resolvedStatus = isSubscribed ? status || 'active' : 'inactive';

  return {
    isSubscribed,
    isPremium: explicitPremium,
    tier: resolvedTier,
    plan: resolvedPlan,
    status: resolvedStatus,
    label: formatSubscriptionLabel({
      isSubscribed,
      isPremium: explicitPremium,
      tier: resolvedTier,
      plan: resolvedPlan,
      status: resolvedStatus,
    }),
  };
}

export function isRestrictedProfilePayload(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const row = data as Record<string, unknown>;
  return (
    row.restricted === true ||
    row.subscription_required === true ||
    row.requires_subscription === true ||
    asText(row.status).toLowerCase() === 'restricted'
  );
}
