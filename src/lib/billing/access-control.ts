import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AccountCompletionRequiredError,
  assertAccountComplete,
  assertOrganizationOwnerAccountComplete,
  formatAccountCompletionError,
  statusForAccountCompletionError,
} from "@/lib/account/signup-completion";
import {
  resolvePlanFeatureEntitlement,
  type PlanFeatureCode,
  type PlanFeatureEntitlement,
} from "@/lib/billing/plan-entitlements";
import {
  assertBillableAccess,
  BillingAccessError,
  formatBillingAccessError,
  getOrganizationBillingAccess,
  statusForBillingAccessError,
  type BillingAccessStatus,
} from "@/lib/billing/trial";
import { createServiceClient } from "@/lib/supabase/service";

export class PlanFeatureAccessError extends Error {
  entitlement: PlanFeatureEntitlement;
  billingAccess: BillingAccessStatus;

  constructor(entitlement: PlanFeatureEntitlement, billingAccess: BillingAccessStatus) {
    super(entitlement.description);
    this.name = "PlanFeatureAccessError";
    this.entitlement = entitlement;
    this.billingAccess = billingAccess;
  }
}

export async function assertUserAccountComplete(input: {
  userId: string;
  client?: SupabaseClient;
}) {
  return assertAccountComplete(input);
}

export async function assertOrganizationOperationalAccess(input: {
  organizationId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  await assertOrganizationOwnerAccountComplete({ organizationId: input.organizationId, client });
  return assertBillableAccess({ organizationId: input.organizationId, client });
}

export async function assertOrganizationFeatureAccess(input: {
  organizationId: string;
  featureCode: PlanFeatureCode;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  await assertOrganizationOwnerAccountComplete({ organizationId: input.organizationId, client });

  const billingAccess = await getOrganizationBillingAccess({
    organizationId: input.organizationId,
    client,
  });
  const entitlement = resolvePlanFeatureEntitlement(input.featureCode, {
    planCode: billingAccess.planCode,
    organizationStatus: billingAccess.organizationStatus,
    billingState: billingAccess.state,
  });

  if (!entitlement.allowed) {
    throw new PlanFeatureAccessError(entitlement, billingAccess);
  }

  return { billingAccess, entitlement };
}

export async function assertUserFeatureAccess(input: {
  userId: string;
  organizationId: string;
  featureCode: PlanFeatureCode;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  await assertUserAccountComplete({ userId: input.userId, client });
  return assertOrganizationFeatureAccess({
    organizationId: input.organizationId,
    featureCode: input.featureCode,
    client,
  });
}

export function formatAccessControlError(error: unknown, fallback: string) {
  if (error instanceof AccountCompletionRequiredError) {
    return formatAccountCompletionError(error);
  }

  if (error instanceof BillingAccessError) {
    return formatBillingAccessError(error, fallback);
  }

  if (error instanceof PlanFeatureAccessError) {
    return {
      error: error.message,
      billingAccess: error.billingAccess,
      entitlement: error.entitlement,
    };
  }

  return {
    error: error instanceof Error ? error.message : fallback,
  };
}

export function statusForAccessControlError(error: unknown, fallback: number) {
  const accountStatus = statusForAccountCompletionError(error, fallback);

  if (accountStatus !== fallback) {
    return accountStatus;
  }

  const billingStatus = statusForBillingAccessError(error, fallback);

  if (billingStatus !== fallback) {
    return billingStatus;
  }

  if (error instanceof PlanFeatureAccessError) {
    return error.entitlement.reason === "billing_blocked" ? 402 : 403;
  }

  return fallback;
}
