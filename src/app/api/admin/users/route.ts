import { NextResponse } from "next/server";
import {
  readAuthUserAvatarSource,
  readAuthUserAvatarUrl,
  readAuthUserWhatsappAvatarStatus,
  readAuthUserWhatsappAvatarSyncedAt,
} from "@/lib/account/profile-avatar-sync";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

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

type JsonRecord = Record<string, unknown>;

type OrgInfo = { id: string; name: string; status: string; plan_code: string };

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

type RawMembership = {
  user_id: string;
  role: string;
  created_at: string | null;
  organizations: OrgInfo | OrgInfo[] | null;
};

function resolveOrg(raw: OrgInfo | OrgInfo[] | null): OrgInfo | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

export async function GET() {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const service = createServiceClient();

  const [authResult, profilesResult, membershipsResult] = await Promise.all([
    service.auth.admin.listUsers({ perPage: 1000 }),
    service.from("profiles").select("id, full_name, email, phone, phone_normalized, phone_whatsapp_exists, company_name, is_platform_admin"),
    service
      .from("organization_members")
      .select("user_id, role, created_at, organizations(id, name, status, plan_code)")
      .order("created_at", { ascending: true }),
  ]);

  if (authResult.error) {
    return NextResponse.json({ error: authResult.error.message }, { status: 500 });
  }

  const profileMap = new Map(
    ((profilesResult.data ?? []) as ProfileRow[]).map((p) => [p.id, p]),
  );

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
  const walletMap = new Map<string, WalletRow>();
  const subscriptionMap = new Map<string, SubscriptionRow>();
  const limitsMap = new Map<string, LimitsRow>();
  const trialCycleMap = new Map<string, CycleRow>();

  if (organizationIds.length > 0) {
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

    for (const wallet of (walletsResult.data ?? []) as WalletRow[]) {
      walletMap.set(wallet.organization_id, wallet);
    }

    for (const subscription of (subscriptionsResult.data ?? []) as SubscriptionRow[]) {
      if (!subscriptionMap.has(subscription.organization_id)) {
        subscriptionMap.set(subscription.organization_id, subscription);
      }
    }

    for (const limits of (limitsResult.data ?? []) as LimitsRow[]) {
      limitsMap.set(limits.organization_id, limits);
    }

    for (const cycle of (cyclesResult.data ?? []) as unknown as CycleRow[]) {
      const planCode = readRelationPlanCode(cycle.billing_plans);
      if (planCode === "trial" && !trialCycleMap.has(cycle.organization_id)) {
        trialCycleMap.set(cycle.organization_id, cycle);
      }
    }
  }

  const users = authResult.data.users
    .filter((u) => Boolean(u.email))
    .map((u) => {
      const profile = profileMap.get(u.id);
      const membership = membershipMap.get(u.id);
      const wallet = membership?.organizationId ? walletMap.get(membership.organizationId) : null;
      const subscription = membership?.organizationId ? subscriptionMap.get(membership.organizationId) : null;
      const limits = membership?.organizationId ? limitsMap.get(membership.organizationId) : null;
      const trialCycle = membership?.organizationId ? trialCycleMap.get(membership.organizationId) : null;
      const resourceOverrides = readResourceOverrides(limits?.metadata);

      return {
        id: u.id,
        email: u.email ?? null,
        fullName: profile?.full_name ?? null,
        phone: profile?.phone ?? null,
        phoneNormalized: profile?.phone_normalized ?? normalizeBrazilPhone(profile?.phone),
        phoneWhatsappExists: profile?.phone_whatsapp_exists ?? null,
        companyName: profile?.company_name ?? membership?.orgName ?? null,
        avatarUrl: readAuthUserAvatarUrl(u),
        avatarSource: readAuthUserAvatarSource(u),
        avatarSyncedAt: readAuthUserWhatsappAvatarSyncedAt(u),
        avatarSyncStatus: readAuthUserWhatsappAvatarStatus(u),
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
        createdAt: u.created_at ?? null,
        lastSignInAt: u.last_sign_in_at ?? null,
      };
    })
    .sort((a, b) => {
      const da = a.lastSignInAt ? new Date(a.lastSignInAt).getTime() : 0;
      const db = b.lastSignInAt ? new Date(b.lastSignInAt).getTime() : 0;
      return db - da;
    });

  return NextResponse.json({ users });
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
