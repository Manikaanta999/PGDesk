export const SUBSCRIPTIONS_ENABLED = false;

export type PlanTier = 'FREE' | 'STARTER' | 'GROWTH' | 'ENTERPRISE';

export type FeatureKey =
  | 'hostels'
  | 'beds'
  | 'students'
  | 'rent_records'
  | 'complaints'
  | 'notices'
  | 'public_listing';

export interface PlanEntitlement {
  label: string;
  maxProperties: number | null;
  maxBeds: number | null;
  priceInr: number;
  features: Record<FeatureKey, boolean>;
}

const ALL_BASIC_FEATURES: Record<FeatureKey, boolean> = {
  hostels: true,
  beds: true,
  students: true,
  rent_records: true,
  complaints: true,
  notices: true,
  public_listing: true,
};

export const FUTURE_PLAN_ENTITLEMENTS: Record<PlanTier, PlanEntitlement> = {
  FREE: {
    label: 'Free Access',
    maxProperties: null,
    maxBeds: null,
    priceInr: 0,
    features: ALL_BASIC_FEATURES,
  },
  STARTER: {
    label: 'Starter PG',
    maxProperties: 1,
    maxBeds: 35,
    priceInr: 999,
    features: ALL_BASIC_FEATURES,
  },
  GROWTH: {
    label: 'Growth Operator',
    maxProperties: 5,
    maxBeds: 200,
    priceInr: 2499,
    features: ALL_BASIC_FEATURES,
  },
  ENTERPRISE: {
    label: 'Enterprise Co-Living',
    maxProperties: null,
    maxBeds: null,
    priceInr: 5999,
    features: ALL_BASIC_FEATURES,
  },
};

export function getActiveEntitlement(
  planTier: string | null | undefined,
  subscriptionsEnabled: boolean = SUBSCRIPTIONS_ENABLED
): PlanEntitlement {
  if (!subscriptionsEnabled) {
    return FUTURE_PLAN_ENTITLEMENTS.FREE;
  }
  const key = (planTier?.toUpperCase() as PlanTier) || 'STARTER';
  return FUTURE_PLAN_ENTITLEMENTS[key] || FUTURE_PLAN_ENTITLEMENTS.STARTER;
}

export function isFeatureAvailable(
  feature: FeatureKey,
  planTier: string | null | undefined,
  subscriptionsEnabled: boolean = SUBSCRIPTIONS_ENABLED
): boolean {
  const entitlement = getActiveEntitlement(planTier, subscriptionsEnabled);
  return Boolean(entitlement.features[feature]);
}
