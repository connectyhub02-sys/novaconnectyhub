import "server-only";

import type { User } from "@supabase/supabase-js";
import { readAuthUserAvatarUrl } from "@/lib/account/profile-avatar-sync";
import { isSupabaseAuthConfigured } from "./env";
import { createClient } from "./server";
import { createServiceClient } from "./service";
import { isAccountSignupComplete } from "@/lib/account/signup-completion";
import { grantTrialCredits, scheduleTrialConversionMessages, TRIAL_PLAN_CODE } from "@/lib/billing/trial";
import { sendTrialStartedNotification } from "@/lib/billing/trial-notifications";
import { ensureClientApiClient } from "@/lib/connectyhub-api/gateway";

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
  } | null;
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
    || await isAccountSignupComplete({ userId: workspace.user.id, client: supabase }).catch(() => true);

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

  const name = workspace.profile.companyName || workspace.profile.fullName || workspace.profile.email || "Minha empresa";
  const slug = slugify(name);

  const { data: organization, error: orgError } = await supabase
    .from("organizations")
    .insert({
      name,
      slug,
      owner_id: workspace.user.id,
      plan_code: "trial",
      status: signupComplete ? "trial" : "trial_pending",
    })
    .select("id, name, slug, plan_code, status")
    .single();

  if (orgError || !organization) {
    return null;
  }

  await ensureOwnerMembership({
    client: supabase,
    organizationId: organization.id,
    userId: workspace.user.id,
  });

  if (!workspace.profile.isPlatformAdmin) {
    await ensureClientApiClient({
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      contactEmail: workspace.profile.email,
      actorId: workspace.user.id,
      client: supabase,
    });

    if (signupComplete) {
      await ensureTrialSetup({
        organizationId: organization.id,
        userId: workspace.user.id,
        optIn: workspace.profile.trialWhatsappOptIn,
        client: supabase,
      });
    }
  }

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    planCode: organization.plan_code,
    status: organization.status,
    role: "owner",
  };
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
    ?? organizations[0]
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

  await input.client.from("organization_members").insert({
    organization_id: input.organizationId,
    user_id: input.userId,
    role: "owner",
  });
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
    .limit(1)
    .maybeSingle<OrganizationMembershipRow>();

  if (!data?.organizations) {
    return null;
  }

  return {
    id: data.organizations.id,
    name: data.organizations.name,
    slug: data.organizations.slug,
    planCode: data.organizations.plan_code,
    status: data.organizations.status,
    role: data.role,
  };
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

function slugify(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);

  return slug ? `${slug}-${Date.now().toString(36)}` : `workspace-${Date.now().toString(36)}`;
}
