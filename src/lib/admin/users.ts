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
  storageUsedBytes: number;
  storageLimitBytes: number;
  storageAvailableBytes: number;
  storageUsedPercent: number;
  storageBillableFileCount: number;
  storageFileLimit: number;
  storageMonthlyCostBrl: number;
  storageUpdatedAt: string | null;
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
    storageUsedBytes: number;
    storageLimitBytes: number;
    storageMonthlyCostBrl: number;
    storageOrganizationsNearLimit: number;
  };
  warnings: string[];
};

export type AdminDeletePlatformUserResult = {
  deletedOrganizationId: string | null;
  deletedOrganizationName: string | null;
  deletedUserEmail: string | null;
  deletedUserId: string;
  message: string;
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

type DeleteProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  company_name: string | null;
  is_platform_admin: boolean | null;
};

type OrgInfo = {
  id: string;
  name: string;
  status: string;
  plan_code: string;
};

type DeleteOrgInfo = {
  id: string;
  name: string;
  owner_id: string | null;
  slug: string | null;
  status: string | null;
};

type RawMembership = {
  user_id: string;
  role: string;
  created_at: string | null;
  organizations: OrgInfo | OrgInfo[] | null;
};

type DeleteMembershipRow = {
  role: string;
  organizations: DeleteOrgInfo | DeleteOrgInfo[] | null;
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

type StorageUsageRow = {
  organization_id: string;
  used_bytes: number | string | null;
  billable_file_count: number | string | null;
  updated_at: string | null;
};

type StoragePlanRow = {
  plan_code: string;
  storage_limit_bytes: number | string | null;
  storage_file_limit: number | string | null;
};

type StorageAddonRow = {
  organization_id: string;
  package_code: string | null;
  quantity: number | string | null;
  status: string | null;
  current_period_end: string | null;
};

type StorageAddonPackageRow = {
  code: string;
  storage_bytes: number | string | null;
  file_limit: number | string | null;
  monthly_price_brl: number | string | null;
  status: string | null;
};

type OrganizationStorageInfo = {
  usedBytes: number;
  limitBytes: number;
  availableBytes: number;
  usedPercent: number;
  billableFileCount: number;
  fileLimit: number;
  monthlyCostBrl: number;
  updatedAt: string | null;
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

const R2_STANDARD_STORAGE_COST_USD_PER_GB_MONTH = 0.015;
const R2_ESTIMATED_USD_TO_BRL = 5.5;

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
      const planCode = subscription?.plan_code ?? membership?.planCode ?? null;
      const storage = membership?.organizationId
        ? buildOrganizationStorageInfo(membership.organizationId, planCode, organizationState)
        : emptyOrganizationStorageInfo();

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
        planCode,
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
        storageUsedBytes: storage.usedBytes,
        storageLimitBytes: storage.limitBytes,
        storageAvailableBytes: storage.availableBytes,
        storageUsedPercent: storage.usedPercent,
        storageBillableFileCount: storage.billableFileCount,
        storageFileLimit: storage.fileLimit,
        storageMonthlyCostBrl: storage.monthlyCostBrl,
        storageUpdatedAt: storage.updatedAt,
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

export async function deleteAdminPlatformUser(input: {
  actorUserId: string;
  confirmation: string | null;
  deleteOrganization?: boolean;
  organizationId?: string | null;
  reason?: string | null;
  userId: string;
  client?: ReturnType<typeof createServiceClient>;
}): Promise<AdminDeletePlatformUserResult> {
  const service = input.client ?? createServiceClient();
  const targetUserId = input.userId.trim();
  const deleteOrganization = input.deleteOrganization === true;
  const confirmation = input.confirmation?.trim().toUpperCase() ?? "";

  if (!targetUserId) {
    throw new Error("Informe o usuário que será excluído.");
  }

  if (targetUserId === input.actorUserId) {
    throw new Error("Você não pode excluir o próprio usuário administrador.");
  }

  if (confirmation !== "EXCLUIR") {
    throw new Error("Digite EXCLUIR para confirmar esta operação.");
  }

  const { data: authData, error: authError } = await service.auth.admin.getUserById(targetUserId);

  if (authError || !authData.user) {
    throw new Error(authError?.message ?? "Usuário não encontrado no Supabase Auth.");
  }

  const profile = await loadDeleteProfile(service, targetUserId);
  const targetEmail = profile?.email ?? authData.user.email ?? null;

  if (profile?.is_platform_admin) {
    throw new Error("Usuários administradores da plataforma não podem ser excluídos por este painel.");
  }

  const memberships = await loadDeleteMemberships(service, targetUserId);
  const requestedOrganizationId = input.organizationId?.trim() || null;
  const selectedMembership = requestedOrganizationId
    ? memberships.find((membership) => membership.organization?.id === requestedOrganizationId) ?? null
    : memberships[0] ?? null;
  let deletedOrganizationId: string | null = null;
  let deletedOrganizationName: string | null = null;

  if (deleteOrganization) {
    if (!selectedMembership?.organization) {
      throw new Error("Este usuário não possui cliente/workspace vinculado para excluir.");
    }

    if (selectedMembership.organization.owner_id && selectedMembership.organization.owner_id !== targetUserId && selectedMembership.role !== "owner") {
      throw new Error("Para excluir o cliente completo, selecione o usuário dono do workspace.");
    }

    const memberCount = await countOrganizationMembers(service, selectedMembership.organization.id);

    if (memberCount > 1) {
      throw new Error(`Este cliente possui ${memberCount} usuários vinculados. Remova os demais usuários antes de excluir o workspace completo.`);
    }

    const deleted = await deleteOrganizationRow(service, selectedMembership.organization.id);
    deletedOrganizationId = deleted.id;
    deletedOrganizationName = deleted.name;
  }

  const { error: deleteUserError } = await service.auth.admin.deleteUser(targetUserId);

  if (deleteUserError) {
    throw new Error(`Não foi possível excluir o usuário no Supabase Auth: ${deleteUserError.message}`);
  }

  await writeAdminUserDeleteAuditLog(service, {
    actorUserId: input.actorUserId,
    deleteOrganization,
    deletedOrganizationId,
    deletedOrganizationName,
    reason: input.reason,
    targetEmail,
    targetUserId,
  });

  return {
    deletedOrganizationId,
    deletedOrganizationName,
    deletedUserEmail: targetEmail,
    deletedUserId: targetUserId,
    message: deleteOrganization && deletedOrganizationName
      ? `Usuário e cliente ${deletedOrganizationName} excluídos.`
      : "Usuário excluído.",
  };
}

async function loadDeleteProfile(service: ReturnType<typeof createServiceClient>, userId: string) {
  const { data, error } = await service
    .from("profiles")
    .select("id, email, full_name, company_name, is_platform_admin")
    .eq("id", userId)
    .maybeSingle<DeleteProfileRow>();

  if (error) {
    throw new Error(`Não foi possível carregar o perfil do usuário: ${error.message}`);
  }

  return data ?? null;
}

async function loadDeleteMemberships(service: ReturnType<typeof createServiceClient>, userId: string) {
  const { data, error } = await service
    .from("organization_members")
    .select("role, organizations(id, name, slug, owner_id, status)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Não foi possível carregar os vínculos do usuário: ${error.message}`);
  }

  return ((data ?? []) as unknown as DeleteMembershipRow[])
    .map((membership) => ({
      organization: resolveDeleteOrg(membership.organizations),
      role: membership.role,
    }))
    .filter((membership) => Boolean(membership.organization));
}

function resolveDeleteOrg(raw: DeleteOrgInfo | DeleteOrgInfo[] | null): DeleteOrgInfo | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

async function countOrganizationMembers(service: ReturnType<typeof createServiceClient>, organizationId: string) {
  const { count, error } = await service
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  if (error) {
    throw new Error(`Não foi possível validar os usuários vinculados ao cliente: ${error.message}`);
  }

  return count ?? 0;
}

async function deleteOrganizationRow(service: ReturnType<typeof createServiceClient>, organizationId: string) {
  const { data, error } = await service
    .from("organizations")
    .delete()
    .eq("id", organizationId)
    .select("id, name")
    .maybeSingle<{ id: string; name: string }>();

  if (error) {
    throw new Error(`Não foi possível excluir o cliente/workspace: ${error.message}`);
  }

  if (!data) {
    throw new Error("Cliente/workspace não encontrado para exclusão.");
  }

  return data;
}

async function writeAdminUserDeleteAuditLog(
  service: ReturnType<typeof createServiceClient>,
  input: {
    actorUserId: string;
    deleteOrganization: boolean;
    deletedOrganizationId: string | null;
    deletedOrganizationName: string | null;
    reason: string | null | undefined;
    targetEmail: string | null;
    targetUserId: string;
  },
) {
  const metadata = {
    delete_organization: input.deleteOrganization,
    deleted_organization_id: input.deletedOrganizationId,
    deleted_organization_name: input.deletedOrganizationName,
    reason: input.reason?.trim() || null,
    target_email: input.targetEmail,
    target_user_id: input.targetUserId,
  };
  const { error } = await service.from("maintenance_audit_logs").insert({
    actor_id: input.actorUserId,
    event_type: input.deleteOrganization ? "admin.customer.deleted" : "admin.user.deleted",
    target_id: input.targetUserId,
    target_table: "auth.users",
    metadata,
  });

  if (error) {
    console.warn("[AdminUsers] Falha ao registrar auditoria de exclusão", error.message);
  }
}

async function loadOrganizationState(service: ReturnType<typeof createServiceClient>, organizationIds: string[]) {
  const [
    walletsResult,
    subscriptionsResult,
    limitsResult,
    cyclesResult,
    storageUsageResult,
    storagePlansResult,
    storageAddonsResult,
    storagePackagesResult,
  ] = await Promise.all([
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
    service
      .from("organization_storage_usage")
      .select("organization_id, used_bytes, billable_file_count, updated_at")
      .in("organization_id", organizationIds),
    service
      .from("billing_plans")
      .select("plan_code, storage_limit_bytes, storage_file_limit")
      .limit(100),
    service
      .from("organization_storage_addons")
      .select("organization_id, package_code, quantity, status, current_period_end")
      .in("organization_id", organizationIds)
      .limit(1000),
    service
      .from("storage_addon_packages")
      .select("code, storage_bytes, file_limit, monthly_price_brl, status")
      .limit(100),
  ]);

  const state = emptyOrganizationState();
  if (walletsResult.error) state.warnings.push(`credit_wallets: ${walletsResult.error.message}`);
  if (subscriptionsResult.error) state.warnings.push(`organization_subscriptions: ${subscriptionsResult.error.message}`);
  if (limitsResult.error) state.warnings.push(`organization_billing_limits: ${limitsResult.error.message}`);
  if (cyclesResult.error) state.warnings.push(`billing_cycles: ${cyclesResult.error.message}`);
  if (storageUsageResult.error) state.warnings.push(`organization_storage_usage: ${storageUsageResult.error.message}`);
  if (storagePlansResult.error) state.warnings.push(`billing_plans storage: ${storagePlansResult.error.message}`);
  if (storageAddonsResult.error) state.warnings.push(`organization_storage_addons: ${storageAddonsResult.error.message}`);
  if (storagePackagesResult.error) state.warnings.push(`storage_addon_packages: ${storagePackagesResult.error.message}`);

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

  for (const usage of (storageUsageResult.data ?? []) as StorageUsageRow[]) {
    state.storageUsage.set(usage.organization_id, usage);
  }

  for (const plan of (storagePlansResult.data ?? []) as StoragePlanRow[]) {
    state.storagePlans.set(plan.plan_code, plan);
  }

  for (const addon of (storageAddonsResult.data ?? []) as StorageAddonRow[]) {
    const current = state.storageAddons.get(addon.organization_id) ?? [];
    current.push(addon);
    state.storageAddons.set(addon.organization_id, current);
  }

  for (const addonPackage of (storagePackagesResult.data ?? []) as StorageAddonPackageRow[]) {
    state.storagePackages.set(addonPackage.code, addonPackage);
  }

  return state;
}

function emptyOrganizationState() {
  return {
    wallets: new Map<string, WalletRow>(),
    subscriptions: new Map<string, SubscriptionRow>(),
    limits: new Map<string, LimitsRow>(),
    trialCycles: new Map<string, CycleRow>(),
    storageUsage: new Map<string, StorageUsageRow>(),
    storagePlans: new Map<string, StoragePlanRow>(),
    storageAddons: new Map<string, StorageAddonRow[]>(),
    storagePackages: new Map<string, StorageAddonPackageRow>(),
    warnings: [] as string[],
  };
}

function buildSummary(users: AdminPlatformUser[]): AdminUsersSnapshot["summary"] {
  const linkedOrganizationIds = new Set(users.map((user) => user.organizationId).filter(Boolean));
  const organizations = getUniqueOrganizationUsers(users);

  return {
    totalUsers: users.length,
    platformAdmins: users.filter((user) => user.isPlatformAdmin).length,
    linkedOrganizations: linkedOrganizationIds.size,
    activeOrganizations: countOrganizationsByStatus(users, ["active"]),
    trialOrganizations: countOrganizationsByStatus(users, ["trial", "trial_pending"]),
    blockedOrganizations: countOrganizationsByStatus(users, ["inactive", "suspended", "blocked", "archived"]),
    storageUsedBytes: organizations.reduce((sum, user) => sum + user.storageUsedBytes, 0),
    storageLimitBytes: organizations.reduce((sum, user) => sum + user.storageLimitBytes, 0),
    storageMonthlyCostBrl: roundMoney(organizations.reduce((sum, user) => sum + user.storageMonthlyCostBrl, 0)),
    storageOrganizationsNearLimit: organizations.filter((user) => user.storageUsedPercent >= 80).length,
  };
}

function buildOrganizationStorageInfo(
  organizationId: string,
  planCode: string | null,
  state: ReturnType<typeof emptyOrganizationState>,
): OrganizationStorageInfo {
  const usage = state.storageUsage.get(organizationId);
  const plan = planCode ? state.storagePlans.get(planCode) : null;
  const activeAddons = (state.storageAddons.get(organizationId) ?? []).filter((addon) => isActiveStorageAddon(addon, state));
  const addonTotals = activeAddons.reduce(
    (totals, addon) => {
      const addonPackage = addon.package_code ? state.storagePackages.get(addon.package_code) : null;
      const quantity = Math.max(1, toNumber(addon.quantity, 1));

      totals.bytes += toNumber(addonPackage?.storage_bytes) * quantity;
      totals.files += toNumber(addonPackage?.file_limit) * quantity;
      return totals;
    },
    { bytes: 0, files: 0 },
  );
  const usedBytes = toNumber(usage?.used_bytes);
  const limitBytes = toNumber(plan?.storage_limit_bytes) + addonTotals.bytes;
  const billableFileCount = toNumber(usage?.billable_file_count);
  const fileLimit = toNumber(plan?.storage_file_limit) + addonTotals.files;

  return {
    usedBytes,
    limitBytes,
    availableBytes: Math.max(limitBytes - usedBytes, 0),
    usedPercent: calculateStoragePercent(usedBytes, limitBytes),
    billableFileCount,
    fileLimit,
    monthlyCostBrl: roundMoney(bytesToGb(usedBytes) * readR2FallbackCostPerGbMonthBrl()),
    updatedAt: usage?.updated_at ?? null,
  };
}

function emptyOrganizationStorageInfo(): OrganizationStorageInfo {
  return {
    usedBytes: 0,
    limitBytes: 0,
    availableBytes: 0,
    usedPercent: 0,
    billableFileCount: 0,
    fileLimit: 0,
    monthlyCostBrl: 0,
    updatedAt: null,
  };
}

function getUniqueOrganizationUsers(users: AdminPlatformUser[]) {
  const organizations = new Map<string, AdminPlatformUser>();

  for (const user of users) {
    if (user.organizationId && !organizations.has(user.organizationId)) {
      organizations.set(user.organizationId, user);
    }
  }

  return Array.from(organizations.values());
}

function isActiveStorageAddon(addon: StorageAddonRow, state: ReturnType<typeof emptyOrganizationState>) {
  if (addon.status !== "active" || !addon.package_code) {
    return false;
  }

  const addonPackage = state.storagePackages.get(addon.package_code);
  if (addonPackage?.status !== "active") {
    return false;
  }

  if (!addon.current_period_end) {
    return true;
  }

  const periodEnd = new Date(addon.current_period_end).getTime();
  return Number.isFinite(periodEnd) && periodEnd > Date.now();
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

function calculateStoragePercent(usedBytes: number, limitBytes: number) {
  if (limitBytes <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((usedBytes / limitBytes) * 100));
}

function bytesToGb(value: number) {
  return value / 1024 ** 3;
}

function readR2FallbackCostPerGbMonthBrl() {
  return R2_STANDARD_STORAGE_COST_USD_PER_GB_MONTH * R2_ESTIMATED_USD_TO_BRL;
}

function roundMoney(value: number) {
  return Math.round(value * 100000000) / 100000000;
}

function readErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "erro desconhecido";
}
