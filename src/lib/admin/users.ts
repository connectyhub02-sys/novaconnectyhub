import "server-only";

import {
  readAuthUserAvatarSource,
  readAuthUserAvatarUrl,
  readAuthUserWhatsappAvatarStatus,
  readAuthUserWhatsappAvatarSyncedAt,
} from "@/lib/account/profile-avatar-sync";
import { mapBillingPlanRow, type BillingPlanRow } from "@/lib/billing/plans";
import { createServiceClient } from "@/lib/supabase/service";

type JsonRecord = Record<string, unknown>;

export type AdminPlatformUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  phoneWhatsappExists: boolean | null;
  companyName: string | null;
  avatarUrl: string | null;
  avatarSource: string | null;
  avatarSyncedAt: string | null;
  avatarSyncStatus: string | null;
  isPlatformAdmin: boolean;
  organizationId: string | null;
  orgName: string | null;
  orgRole: string | null;
  orgStatus: string | null;
  planCode: string | null;
  balanceCredits: number;
  lifetimePurchasedCredits: number;
  lifetimeUsedCredits: number;
  walletStatus: string | null;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  subscriptionPlanCode: string | null;
  currentPeriodEnd: string | null;
  nextBillingAt: string | null;
  trialEndsAt: string | null;
  trialDaysRemaining: number | null;
  monthlyCreditLimit: number | null;
  dailyCreditLimit: number | null;
  allowOverage: boolean;
  overageLimitCredits: number;
  hardBlockWhenEmpty: boolean;
  alertThresholdPercent: number;
  manualAgentLimit: number | null;
  manualWhatsappInstanceLimit: number | null;
  manualUserLimit: number | null;
  createdAt: string | null;
  lastSignInAt: string | null;
};

export type AdminBillingPlanOption = {
  id: string;
  planCode: string;
  name: string;
  status: string;
  monthlyPriceBrl: number;
  includedCredits: number;
  trialDays: number;
  agentLimit: number | null;
  whatsappInstanceLimit: number | null;
  userLimit: number | null;
};

export type AdminUsersSnapshot = {
  generatedAt: string;
  users: AdminPlatformUser[];
  plans: AdminBillingPlanOption[];
  summary: {
    totalUsers: number;
    platformAdmins: number;
    linkedOrganizations: number;
    activeOrganizations: number;
    trialOrganizations: number;
    blockedOrganizations: number;
  };
  warnings: string[];
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  phone_normalized: string | null;
  phone_whatsapp_exists: boolean | null;
  company_name: string | null;
  is_platform_admin: boolean | null;
};

type OrgInfo = {
  id: string;
  name: string;
  status: string;
  plan_code: string;
};

type RawMembership = {
  user_id: string;
  role: string;
  created_at: string | null;
  organizations: OrgInfo | OrgInfo[] | null;
};

type WalletRow = {
  organization_id: string;
  balance_credits: number | string | null;
  lifetime_purchased_credits: number | string | null;
  lifetime_used_credits: number | string | null;
  status: string | null;
};

type SubscriptionRow = {
  id: string;
  organization_id: string;
  plan_code: string | null;
  status: string | null;
  current_period_end: string | null;
  next_billing_at: string | null;
  created_at: string | null;
};

type LimitsRow = {
  organization_id: string;
  monthly_credit_limit: number | string | null;
  daily_credit_limit: number | string | null;
  allow_overage: boolean | null;
  overage_limit_credits: number | string | null;
  hard_block_when_empty: boolean | null;
  alert_threshold_percent: number | string | null;
  metadata: JsonRecord | null;
};

type CycleRow = {
  organization_id: string;
  cycle_end: string | null;
  status: string | null;
  billing_plans: { plan_code: string | null } | Array<{ plan_code: string | null }> | null;
};

const PLAN_SELECT = [
  "id",
  "plan_code",
  "name",
  "short_description",
  "status",
  "sort_order",
  "highlighted",
  "monthly_price_brl",
  "included_credits",
  "overage_credit_price_brl",
  "auto_recharge_min_credits",
  "overage_limit_credits",
  "trial_days",
  "agent_limit",
  "whatsapp_instance_limit",
  "user_limit",
  "module_codes",
  "mercado_pago_preapproval_plan_id",
  "created_at",
  "updated_at",
].join(", ");

export async function getAdminUsersSnapshot(): Promise<AdminUsersSnapshot> {
  const service = createServiceClient();
  const [usersResult, plansResult] = await Promise.allSettled([
    getAdminPlatformUsers(service),
    getAdminBillingPlanOptions(service),
  ]);
  const users = usersResult.status === "fulfilled" ? usersResult.value.users : [];
  const plans = plansResult.status === "fulfilled" ? plansResult.value.plans : [];
  const warnings = [
    ...(usersResult.status === "fulfilled" ? usersResult.value.warnings : [`auth.users: ${readErrorMessage(usersResult.reason)}`]),
    ...(plansResult.status === "fulfilled" ? plansResult.value.warnings : [`billing_plans: ${readErrorMessage(plansResult.reason)}`]),
  ];

  return {
    generatedAt: new Date().toISOString(),
    users,
    plans,
    summary: buildSummary(users),
    warnings,
  };
}

export async function getAdminPlatformUsers(
  service = createServiceClient(),
): Promise<{ users: AdminPlatformUser[]; warnings: string[] }> {
  const warnings: string[] = [];
  const [authResult, profilesResult, membershipsResult] = await Promise.all([
    service.auth.admin.listUsers({ perPage: 1000 }),
    service.from("profiles").select("id, full_name, email, phone, phone_normalized, phone_whatsapp_exists, company_name, is_platform_admin"),
    service
      .from("organization_members")
      .select("user_id, role, created_at, organizations(id, name, status, plan_code)")
      .order("created_at", { ascending: true }),
  ]);

  if (authResult.error) {
    throw new Error(authResult.error.message);
  }

  if (profilesResult.error) warnings.push(`profiles: ${profilesResult.error.message}`);
  if (membershipsResult.error) warnings.push(`organization_members: ${membershipsResult.error.message}`);

  const profileMap = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]));
  const membershipMap = new Map<string, { organizationId: string; orgName: string; role: string; status: string; planCode: string }>();

  for (const raw of (membershipsResult.data ?? []) as unknown as RawMembership[]) {
    const org = resolveOrg(raw.organizations);

    if (raw.user_id && org && !membershipMap.has(raw.user_id)) {
      membershipMap.set(raw.user_id, {
        organizationId: org.id,
        orgName: org.name,
        role: raw.role,
        status: org.status,
        planCode: org.plan_code,
      });
    }
  }

  const organizationIds = Array.from(new Set(Array.from(membershipMap.values()).map((item) => item.organizationId)));
  const organizationState = organizationIds.length ? await loadOrganizationState(service, organizationIds) : emptyOrganizationState();
  warnings.push(...organizationState.warnings);

  const users = authResult.data.users
    .filter((user) => Boolean(user.email))
    .map((user) => {
      const profile = profileMap.get(user.id);
      const membership = membershipMap.get(user.id);
      const wallet = membership?.organizationId ? organizationState.wallets.get(membership.organizationId) : null;
      const subscription = membership?.organizationId ? organizationState.subscriptions.get(membership.organizationId) : null;
      const limits = membership?.organizationId ? organizationState.limits.get(membership.organizationId) : null;
      const trialCycle = membership?.organizationId ? organizationState.trialCycles.get(membership.organizationId) : null;
      const resourceOverrides = readResourceOverrides(limits?.metadata);

      return {
        id: user.id,
        email: user.email ?? null,
        fullName: profile?.full_name ?? null,
        phone: profile?.phone ?? null,
        phoneNormalized: profile?.phone_normalized ?? normalizeBrazilPhone(profile?.phone),
        phoneWhatsappExists: profile?.phone_whatsapp_exists ?? null,
        companyName: profile?.company_name ?? membership?.orgName ?? null,
        avatarUrl: readAuthUserAvatarUrl(user),
        avatarSource: readAuthUserAvatarSource(user),
        avatarSyncedAt: readAuthUserWhatsappAvatarSyncedAt(user),
        avatarSyncStatus: readAuthUserWhatsappAvatarStatus(user),
        isPlatformAdmin: Boolean(profile?.is_platform_admin),
        organizationId: membership?.organizationId ?? null,
        orgName: membership?.orgName ?? null,
        orgRole: membership?.role ?? null,
        orgStatus: membership?.status ?? null,
        planCode: membership?.planCode ?? null,
        balanceCredits: toNumber(wallet?.balance_credits),
        lifetimePurchasedCredits: toNumber(wallet?.lifetime_purchased_credits),
        lifetimeUsedCredits: toNumber(wallet?.lifetime_used_credits),
        walletStatus: wallet?.status ?? null,
        subscriptionId: subscription?.id ?? null,
        subscriptionStatus: subscription?.status ?? null,
        subscriptionPlanCode: subscription?.plan_code ?? null,
        currentPeriodEnd: subscription?.current_period_end ?? null,
        nextBillingAt: subscription?.next_billing_at ?? null,
        trialEndsAt: trialCycle?.cycle_end ?? null,
        trialDaysRemaining: trialCycle?.cycle_end ? daysRemaining(trialCycle.cycle_end) : null,
        monthlyCreditLimit: toNullableNumber(limits?.monthly_credit_limit),
        dailyCreditLimit: toNullableNumber(limits?.daily_credit_limit),
        allowOverage: Boolean(limits?.allow_overage),
        overageLimitCredits: toNumber(limits?.overage_limit_credits),
        hardBlockWhenEmpty: limits?.hard_block_when_empty !== false,
        alertThresholdPercent: toNumber(limits?.alert_threshold_percent, 80),
        manualAgentLimit: resourceOverrides.agentLimit,
        manualWhatsappInstanceLimit: resourceOverrides.whatsappInstanceLimit,
        manualUserLimit: resourceOverrides.userLimit,
        createdAt: user.created_at ?? null,
        lastSignInAt: user.last_sign_in_at ?? null,
      };
    })
    .sort((a, b) => {
      const left = a.lastSignInAt ? new Date(a.lastSignInAt).getTime() : 0;
      const right = b.lastSignInAt ? new Date(b.lastSignInAt).getTime() : 0;
      return right - left;
    });

  return { users, warnings };
}

export async function getAdminBillingPlanOptions(
  service = createServiceClient(),
): Promise<{ plans: AdminBillingPlanOption[]; warnings: string[] }> {
  const { data, error } = await service
    .from("billing_plans")
    .select(PLAN_SELECT)
    .order("sort_order", { ascending: true })
    .order("monthly_price_brl", { ascending: true })
    .limit(100);

  if (error) {
    return { plans: [], warnings: [`billing_plans: ${error.message}`] };
  }

  return {
    plans: ((data ?? []) as unknown as BillingPlanRow[])
      .map(mapBillingPlanRow)
      .map((plan) => ({
        id: plan.id,
        planCode: plan.planCode,
        name: plan.name,
        status: plan.status,
        monthlyPriceBrl: plan.monthlyPriceBrl,
        includedCredits: plan.includedCredits,
        trialDays: plan.trialDays,
        agentLimit: plan.agentLimit,
        whatsappInstanceLimit: plan.whatsappInstanceLimit,
        userLimit: plan.userLimit,
      })),
    warnings: [],
  };
}

async function loadOrganizationState(service: ReturnType<typeof createServiceClient>, organizationIds: string[]) {
  const [walletsResult, subscriptionsResult, limitsResult, cyclesResult] = await Promise.all([
    service
      .from("credit_wallets")
      .select("organization_id, balance_credits, lifetime_purchased_credits, lifetime_used_credits, status")
      .in("organization_id", organizationIds),
    service
      .from("organization_subscriptions")
      .select("id, organization_id, plan_code, status, current_period_end, next_billing_at, created_at")
      .in("organization_id", organizationIds)
      .order("created_at", { ascending: false })
      .limit(1000),
    service
      .from("organization_billing_limits")
      .select("organization_id, monthly_credit_limit, daily_credit_limit, allow_overage, overage_limit_credits, hard_block_when_empty, alert_threshold_percent, metadata")
      .in("organization_id", organizationIds),
    service
      .from("billing_cycles")
      .select("organization_id, cycle_end, status, billing_plans(plan_code)")
      .in("organization_id", organizationIds)
      .eq("status", "open")
      .order("cycle_end", { ascending: false })
      .limit(1000),
  ]);

  const state = emptyOrganizationState();
  if (walletsResult.error) state.warnings.push(`credit_wallets: ${walletsResult.error.message}`);
  if (subscriptionsResult.error) state.warnings.push(`organization_subscriptions: ${subscriptionsResult.error.message}`);
  if (limitsResult.error) state.warnings.push(`organization_billing_limits: ${limitsResult.error.message}`);
  if (cyclesResult.error) state.warnings.push(`billing_cycles: ${cyclesResult.error.message}`);

  for (const wallet of (walletsResult.data ?? []) as WalletRow[]) {
    state.wallets.set(wallet.organization_id, wallet);
  }

  for (const subscription of (subscriptionsResult.data ?? []) as SubscriptionRow[]) {
    if (!state.subscriptions.has(subscription.organization_id)) {
      state.subscriptions.set(subscription.organization_id, subscription);
    }
  }

  for (const limits of (limitsResult.data ?? []) as LimitsRow[]) {
    state.limits.set(limits.organization_id, limits);
  }

  for (const cycle of (cyclesResult.data ?? []) as unknown as CycleRow[]) {
    const planCode = readRelationPlanCode(cycle.billing_plans);
    if (planCode === "trial" && !state.trialCycles.has(cycle.organization_id)) {
      state.trialCycles.set(cycle.organization_id, cycle);
    }
  }

  return state;
}

function emptyOrganizationState() {
  return {
    wallets: new Map<string, WalletRow>(),
    subscriptions: new Map<string, SubscriptionRow>(),
    limits: new Map<string, LimitsRow>(),
    trialCycles: new Map<string, CycleRow>(),
    warnings: [] as string[],
  };
}

function buildSummary(users: AdminPlatformUser[]): AdminUsersSnapshot["summary"] {
  const linkedOrganizationIds = new Set(users.map((user) => user.organizationId).filter(Boolean));

  return {
    totalUsers: users.length,
    platformAdmins: users.filter((user) => user.isPlatformAdmin).length,
    linkedOrganizations: linkedOrganizationIds.size,
    activeOrganizations: countOrganizationsByStatus(users, ["active"]),
    trialOrganizations: countOrganizationsByStatus(users, ["trial", "trial_pending"]),
    blockedOrganizations: countOrganizationsByStatus(users, ["inactive", "suspended", "blocked", "archived"]),
  };
}

function countOrganizationsByStatus(users: AdminPlatformUser[], statuses: string[]) {
  const ids = new Set<string>();
  const statusSet = new Set(statuses);

  for (const user of users) {
    if (user.organizationId && user.orgStatus && statusSet.has(user.orgStatus)) {
      ids.add(user.organizationId);
    }
  }

  return ids.size;
}

function resolveOrg(raw: OrgInfo | OrgInfo[] | null): OrgInfo | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

function readRelationPlanCode(relation: CycleRow["billing_plans"]) {
  const plan = Array.isArray(relation) ? relation[0] : relation;
  return plan?.plan_code ?? null;
}

function readResourceOverrides(metadata: JsonRecord | null | undefined) {
  const raw = metadata?.resource_overrides;
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as JsonRecord : {};

  return {
    agentLimit: toNullableNumber(record.agent_limit),
    whatsappInstanceLimit: toNullableNumber(record.whatsapp_instance_limit),
    userLimit: toNullableNumber(record.user_limit),
  };
}

function normalizeBrazilPhone(value: string | null | undefined) {
  let digits = String(value ?? "").replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }

  return digits.startsWith("55") && (digits.length === 12 || digits.length === 13) ? digits : null;
}

function daysRemaining(value: string) {
  const time = new Date(value).getTime();

  if (!Number.isFinite(time)) {
    return null;
  }

  return Math.max(Math.ceil((time - Date.now()) / 86_400_000), 0);
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = toNumber(value);
  return parsed >= 0 ? parsed : null;
}

function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "erro desconhecido";
}
