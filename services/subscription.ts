import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import api, { ApiClientError, AUTH_ENDPOINTS, unwrap } from '@/services/api';
import { BILLING_URL, SUBSCRIPTION_RETURN_URL } from '@/constants/config';
import {
  resolveSubscription,
  type SubscriptionSnapshot,
} from '@/utils/subscription';
import type { User } from '@/types/auth';

WebBrowser.maybeCompleteAuthSession();

export type LockedFeature = 'profile' | 'flipbook' | 'pdf' | 'premium';

/**
 * Plan keys accepted by Laravel `BillingController` / `PaymentController`:
 * `in:standard_monthly,standard_yearly,premium_monthly,premium_yearly`
 */
export type BillingPlan =
  | 'standard_monthly'
  | 'standard_yearly'
  | 'premium_monthly'
  | 'premium_yearly';

export type SubscriptionStatus = SubscriptionSnapshot & {
  user: User | null;
  raw: Record<string, unknown> | null;
};

/** Prefer the canonical Laravel billing route first. */
const CHECKOUT_PATHS = [
  '/billing/checkout',
  '/payments/create-intent',
  '/payments/checkout',
  '/subscription/checkout',
  '/paymongo/checkout',
] as const;

const STATUS_PATHS = ['/payments/status', '/subscription/status', '/billing/status'] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function extractCheckoutUrl(payload: unknown): string | null {
  const root = asRecord(payload);
  if (!root) return null;

  const nestedData = asRecord(root.data);
  const nestedAttrs = asRecord(nestedData?.attributes);
  const nestedCheckout = asRecord(root.checkout);
  const nestedSubscription = asRecord(root.subscription);

  const candidates = [
    root.checkout_url,
    root.checkoutUrl,
    root.url,
    root.redirect_url,
    root.payment_url,
    nestedCheckout?.url,
    nestedCheckout?.checkout_url,
    nestedSubscription?.checkout_url,
    nestedData?.checkout_url,
    nestedData?.url,
    nestedAttrs?.checkout_url,
    nestedAttrs?.url,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function fetchMeUser(): Promise<{ user: User | null; raw: Record<string, unknown> | null }> {
  const { data } = await api.get<User | { user: User }>(AUTH_ENDPOINTS.me);
  const root = asRecord(data);
  if (root && 'user' in root && root.user && typeof root.user === 'object') {
    return { user: root.user as User, raw: root };
  }
  return { user: (data as User) ?? null, raw: root };
}

/**
 * Prefer `/auth/me` subscription fields; optionally enrich from a payment status endpoint.
 */
export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  const { user, raw } = await fetchMeUser();
  const userRecord = asRecord(user) ?? {};
  let snapshot = resolveSubscription(userRecord);

  if (!snapshot.isSubscribed) {
    for (const path of STATUS_PATHS) {
      try {
        const { data } = await api.get(path);
        const payload = asRecord(unwrap(data)) ?? asRecord(data);
        if (!payload) continue;
        const merged = resolveSubscription({ ...userRecord, ...payload });
        if (merged.isSubscribed) {
          snapshot = merged;
          break;
        }
      } catch (error) {
        if (error instanceof ApiClientError && (error.status === 404 || error.status === 405)) {
          continue;
        }
        // Non-404 failures: keep /auth/me result.
        break;
      }
    }
  }

  return {
    ...snapshot,
    user,
    raw,
  };
}

/**
 * Ask Laravel to create a PayMongo hosted checkout session.
 * Body matches BillingController validation: plan, success_url, cancel_url, redirect.
 * Falls back to the web billing portal when checkout endpoints are unavailable.
 */
export async function resolveCheckoutUrl(
  plan: BillingPlan = 'premium_monthly',
): Promise<string> {
  const body = {
    plan,
    redirect: false,
    success_url: SUBSCRIPTION_RETURN_URL,
    cancel_url: SUBSCRIPTION_RETURN_URL,
  };

  for (const path of CHECKOUT_PATHS) {
    try {
      const { data } = await api.post(path, body);
      const url = extractCheckoutUrl(data) ?? extractCheckoutUrl(unwrap(data));
      if (url) return url;
    } catch (error) {
      if (error instanceof ApiClientError && (error.status === 404 || error.status === 405)) {
        continue;
      }
      // Keep trying alternate paths on server errors.
      if (error instanceof ApiClientError && error.status && error.status >= 500) {
        continue;
      }
      // Validation errors (422) should surface — wrong plan name, etc.
      throw error;
    }
  }

  const billing = BILLING_URL.includes('?')
    ? `${BILLING_URL}&plan=${encodeURIComponent(plan)}`
    : `${BILLING_URL}?plan=${encodeURIComponent(plan)}`;
  return billing;
}

export async function openPayMongoCheckout(
  plan: BillingPlan = 'premium_monthly',
): Promise<'success' | 'cancel' | 'dismiss'> {
  const checkoutUrl = await resolveCheckoutUrl(plan);
  const returnUrl = Linking.createURL('subscription/callback');

  const result = await WebBrowser.openAuthSessionAsync(checkoutUrl, returnUrl);

  if (result.type === 'success') {
    return 'success';
  }
  if (result.type === 'cancel') {
    return 'cancel';
  }
  return 'dismiss';
}

export function featureCopy(feature: LockedFeature): { title: string; body: string } {
  switch (feature) {
    case 'profile':
      return {
        title: 'Unlock full profiles',
        body: 'Free accounts can browse the directory, but full student profiles — photos, bio, contact details, and achievements — require a Standard or Premium subscription.',
      };
    case 'flipbook':
    case 'pdf':
      return {
        title: 'Unlock yearbook flipbooks',
        body: 'Generating and opening flipbooks or PDF yearbooks is a subscriber feature. Upgrade with PayMongo to unlock digital yearbook exports.',
      };
    default:
      return {
        title: 'Subscription required',
        body: 'This feature is available on Standard and Premium plans. Upgrade via PayMongo to continue.',
      };
  }
}

export const subscriptionService = {
  getStatus: getSubscriptionStatus,
  resolveCheckoutUrl,
  openCheckout: openPayMongoCheckout,
  featureCopy,
};

export default subscriptionService;
