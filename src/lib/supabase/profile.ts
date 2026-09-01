import "server-only";

import type { User } from "@supabase/supabase-js";
import { readAuthUserAvatarUrl } from "@/lib/account/profile-avatar-sync";
import { isSupabaseAuthConfigured } from "./env";
import { createClient } from "./server";
import { createServiceClient } from "./service";
import { isAccountSignupComplete } from "@/lib/account/signup-completion";
import { grantTrialCredits, scheduleTrialConversionMessages, TRIAL_PLAN_CODE } from "@/lib/billing/trial";
import { sendTrialStartedNotification } from "@/lib/billing/trial-notifications";

export type CurrentProfile = {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  companyName: string | null;
  avatarUrl: string | null;
  trialWhatsappOptIn: boolean;
  trialWhatsappOptInAt: string | null;
  isPlatformAdmin: boolean;
};

export type CurrentOrganization = {
  id: string;
  name: string;
  slug: string | null;
  role: string;
  planCode: string;
  status: string;
};

export type CurrentWorkspace = {
  user: User;
  profile: CurrentProfile;
  organization: CurrentOrganization | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  company_name: string | null;
  trial_whatsapp_opt_in: boolean | null;
  trial_whatsapp_opt_in_at: string | null;
  is_platform_admin: boolean | null;
};

type LegacyProfileRow = Omit<ProfileRow, "trial_whatsapp_opt_in" | "trial_whatsapp_opt_in_at">;

type OrganizationMembershipRow = {
  role: string;
  organizations: {
    id: string;
    name: string;
    slug: string | null;
    plan_code: string;
    status: string;
  } | Array<{
    id: string;
    name: string;
    slug: string | null;
    plan_code: string;
    status: string;
  }> | null;
};

type OwnedOrganizationRow = {
  id: string;
  name: string;
  slug: string | null;
  plan_code: string;
  status: string;
  created_at: string | null;
};

export async function getCurrentWorkspace(): Promise<CurrentWorkspace | null> {
  if (!isSupabaseAuthConfigured()) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const profile = await getOrCreateProfile(user);
  const organization = await getPrimaryOrganization(user.id);

  return {
    user,
    profile,
    organization,
  };
}

export async function ensureStarterOrganization() {
  if (!isSupabaseAuthConfigured()) {
    return null;
  }

  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return null;
  }

  const supabase = await createWorkspaceDataClient();
  const signupComplete = workspace.profile.isPlatformAdmin
    || await isAccountSignupComplete({ userId: workspace.user.id, client: supabase }).catch(() => false);

  if (workspace.organization) {
    if (!workspace.profile.isPlatformAdmin && workspace.organization.planCode === TRIAL_PLAN_CODE && signupComplete) {
      if (workspace.organization.status === "trial_pending") {
        await supabase
          .from("organizations")
          .update({ status: "trial", updated_at: new Date().toISOString() })
          .eq("id", workspace.organization.id);
      }

      await ensureTrialSetup({
        organizationId: workspace.organization.id,
        userId: workspace.user.id,
        optIn: workspace.profile.trialWhatsappOptIn,
        client: supabase,
      });
    }

    return workspace.organization;
  }

  if (workspace.profile.isPlatformAdmin) {
    return null;
  }

  const existingOrganization = await findExistingOwnedOrganization(supabase, workspace.user.id);

  if (existingOrganization) {
    await ensureOwnerMembership({
      client: supabase,
      organizationId: existingOrganization.id,
      userId: workspace.user.id,
    });

    if (existingOrganization.plan_code === TRIAL_PLAN_CODE && signupComplete) {
      if (existingOrganization.status === "trial_pending") {
        await supabase
          .from("organizations")
          .update({ status: "trial", updated_at: new Date().toISOString() })
          .eq("id", existingOrganization.id);
        existingOrganization.status = "trial";
      }

      await ensureTrialSetup({
        organizationId: existingOrganization.id,
        userId: workspace.user.id,
        optIn: workspace.profile.trialWhatsappOptIn,
        client: supabase,
      });
    }

    return mapOwnedOrganization(existingOrganization);
  }

  if (!signupComplete) {
    return null;
  }

  const starterOrganization = await createStarterOrganization({
    client: supabase,
    profile: workspace.profile,
    user: workspace.user,
  });

  await ensureTrialSetup({
    organizationId: starterOrganization.id,
    userId: workspace.user.id,
    optIn: workspace.profile.trialWhatsappOptIn,
    client: supabase,
  });

  return mapOwnedOrganization(starterOrganization);
}

async function createStarterOrganization(input: {
  client: Awaited<ReturnType<typeof createWorkspaceDataClient>>;
  profile: CurrentProfile;
  user: User;
}): Promise<OwnedOrganizationRow> {
  const { data: organization, error } = await input.client
    .from("organizations")
    .insert({
      name: buildStarterOrganizationName(input.profile, input.user),
      slug: createStarterOrganizationSlug(input.profile, input.user),
      owner_id: input.user.id,
      plan_code: TRIAL_PLAN_CODE,
      status: "trial",
    })
    .select("id, name, slug, plan_code, status, created_at")
    .single<OwnedOrganizationRow>();

  if (organization) {
    await ensureOwnerMembership({
      client: input.client,
      organizationId: organization.id,
      userId: input.user.id,
    });

    return organization;
  }

  const existingOrganization = await findExistingOwnedOrganization(input.client, input.user.id);
  if (existingOrganization) {
    return existingOrganization;
  }

  throw new Error(error?.message ?? "Nao foi possivel criar o workspace inicial.");
}

function buildStarterOrganizationName(profile: CurrentProfile, user: User) {
  const rawName = [
    profile.companyName,
    profile.fullName,
    profile.email,
    user.email,
  ].find((value) => typeof value === "string" && value.trim());
  const name = (rawName ?? "Workspace ConnectyHub").trim().replace(/\s+/g, " ");

  return name.slice(0, 96).trim() || "Workspace ConnectyHub";
}

function createStarterOrganizationSlug(profile: CurrentProfile, user: User) {
  const rawBase = profile.companyName ?? profile.fullName ?? profile.email ?? user.email ?? "cliente";
  const base = rawBase
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  const userSuffix = user.id.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 10);
  const timeSuffix = Date.now().toString(36);

  return `workspace-${base || "cliente"}-${userSuffix || timeSuffix}-${timeSuffix}`;
}

async function findExistingOwnedOrganization(
  client: Awaited<ReturnType<typeof createWorkspaceDataClient>>,
  userId: string,
) {
  const { data } = await client
    .from("organizations")
    .select("id, name, slug, plan_code, status, created_at")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(50);

  const organizations = ((data ?? []) as OwnedOrganizationRow[])
    .filter((organization) => organization.plan_code !== "internal");

  return organizations.find((organization) => !isInactiveOrganizationStatus(organization.status))
    ?? null;
}

async function ensureOwnerMembership(input: {
  client: Awaited<ReturnType<typeof createWorkspaceDataClient>>;
  organizationId: string;
  userId: string;
}) {
  const { data } = await input.client
    .from("organization_members")
    .select("organization_id")
    .eq("organization_id", input.organizationId)
    .eq("user_id", input.userId)
    .maybeSingle<{ organization_id: string }>();

  if (data) {
    return;
  }

  const { error } = await input.client.from("organization_members").insert({
    organization_id: input.organizationId,
    user_id: input.userId,
    role: "owner",
  });

  if (error && error.code !== "23505") {
    throw new Error(`Nao foi possivel vincular o usuario ao workspace: ${error.message}`);
  }
}

function mapOwnedOrganization(organization: OwnedOrganizationRow): CurrentOrganization {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    planCode: organization.plan_code,
    status: organization.status,
    role: "owner",
  };
}

async function getOrCreateProfile(user: User): Promise<CurrentProfile> {
  const supabase = await createWorkspaceDataClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, phone, company_name, trial_whatsapp_opt_in, trial_whatsapp_opt_in_at, is_platform_admin")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (data) {
    return mapProfile(data, user);
  }

  if (error) {
    const { data: legacyData } = await supabase
      .from("profiles")
      .select("id, email, full_name, phone, company_name, is_platform_admin")
      .eq("id", user.id)
      .maybeSingle<LegacyProfileRow>();

    if (legacyData) {
      return mapLegacyProfile(legacyData, user);
    }
  }

  const metadata = user.user_metadata ?? {};
  const { data: inserted, error: insertError } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      email: user.email,
      full_name: typeof metadata.full_name === "string" ? metadata.full_name : null,
      phone: typeof metadata.phone === "string" ? metadata.phone : null,
      company_name: typeof metadata.company_name === "string" ? metadata.company_name : null,
      trial_whatsapp_opt_in: readBoolean(metadata.trial_whatsapp_opt_in),
      trial_whatsapp_opt_in_at: typeof metadata.trial_whatsapp_opt_in_at === "string" ? metadata.trial_whatsapp_opt_in_at : null,
      trial_whatsapp_opt_in_source: typeof metadata.trial_whatsapp_opt_in_source === "string" ? metadata.trial_whatsapp_opt_in_source : null,
    })
    .select("id, email, full_name, phone, company_name, trial_whatsapp_opt_in, trial_whatsapp_opt_in_at, is_platform_admin")
    .single<ProfileRow>();

  if (!inserted && insertError) {
    const { data: legacyInserted } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        email: user.email,
        full_name: typeof metadata.full_name === "string" ? metadata.full_name : null,
        phone: typeof metadata.phone === "string" ? metadata.phone : null,
        company_name: typeof metadata.company_name === "string" ? metadata.company_name : null,
      })
      .select("id, email, full_name, phone, company_name, is_platform_admin")
      .single<LegacyProfileRow>();

    if (legacyInserted) {
      return mapLegacyProfile(legacyInserted, user);
    }
  }

  return inserted
    ? mapProfile(inserted, user)
    : {
        id: user.id,
        email: user.email ?? null,
        fullName: null,
        phone: null,
        companyName: null,
        avatarUrl: readAvatarUrl(user),
        trialWhatsappOptIn: readBoolean(metadata.trial_whatsapp_opt_in),
        trialWhatsappOptInAt: typeof metadata.trial_whatsapp_opt_in_at === "string" ? metadata.trial_whatsapp_opt_in_at : null,
        isPlatformAdmin: false,
      };
}

async function getPrimaryOrganization(userId: string): Promise<CurrentOrganization | null> {
  const supabase = await createWorkspaceDataClient();
  const { data } = await supabase
    .from("organization_members")
    .select("role, organizations(id, name, slug, plan_code, status)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(50)
    .returns<OrganizationMembershipRow[]>();

  const membership = (data ?? []).find((row) => {
    const organization = readMembershipOrganization(row.organizations);
    return organization && !isInactiveOrganizationStatus(organization.status);
  });
  const organization = membership ? readMembershipOrganization(membership.organizations) : null;

  if (!membership || !organization) {
    return null;
  }

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    planCode: organization.plan_code,
    status: organization.status,
    role: membership.role,
  };
}

function readMembershipOrganization(organization: OrganizationMembershipRow["organizations"]) {
  return Array.isArray(organization) ? organization[0] ?? null : organization;
}

function mapProfile(row: ProfileRow, user: User): CurrentProfile {
  return {
    id: row.id,
    email: row.email ?? user.email ?? null,
    fullName: row.full_name,
    phone: row.phone,
    companyName: row.company_name,
    avatarUrl: readAvatarUrl(user),
    trialWhatsappOptIn: Boolean(row.trial_whatsapp_opt_in),
    trialWhatsappOptInAt: row.trial_whatsapp_opt_in_at,
    isPlatformAdmin: Boolean(row.is_platform_admin),
  };
}

function mapLegacyProfile(row: LegacyProfileRow, user: User): CurrentProfile {
  return mapProfile({
    ...row,
    trial_whatsapp_opt_in: readBoolean(user.user_metadata?.trial_whatsapp_opt_in),
    trial_whatsapp_opt_in_at: typeof user.user_metadata?.trial_whatsapp_opt_in_at === "string"
      ? user.user_metadata.trial_whatsapp_opt_in_at
      : null,
  }, user);
}

async function ensureTrialSetup(input: {
  organizationId: string;
  userId: string;
  optIn: boolean;
  client: Awaited<ReturnType<typeof createWorkspaceDataClient>>;
}) {
  try {
    await grantTrialCredits({
      organizationId: input.organizationId,
      userId: input.userId,
      externalReference: `trial:${input.organizationId}`,
      client: input.client,
    });
  } catch (error) {
    console.warn("Nao foi possivel preparar creditos de teste.", error);
    return;
  }

  await scheduleTrialConversionMessages({
    organizationId: input.organizationId,
    userId: input.userId,
    optIn: input.optIn,
    client: input.client,
  }).catch(() => 0);

  if (input.optIn) {
    await sendTrialStartedNotification({
      organizationId: input.organizationId,
      client: input.client,
    }).catch(() => null);
  }
}

function readAvatarUrl(user: User) {
  return readAuthUserAvatarUrl(user);
}

function readBoolean(value: unknown) {
  return value === true || value === "true";
}

function isInactiveOrganizationStatus(status: string | null | undefined) {
  return ["archived", "blocked", "cancelled", "canceled"].includes(status ?? "");
}

async function createWorkspaceDataClient() {
  try {
    return createServiceClient();
  } catch {
    return createClient();
  }
}
