import "server-only";

import type { User } from "@supabase/supabase-js";
import { isSupabaseAuthConfigured } from "./env";
import { createClient } from "./server";
import { createServiceClient } from "./service";

export type CurrentProfile = {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  companyName: string | null;
  avatarUrl: string | null;
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
  is_platform_admin: boolean | null;
};

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

  if (workspace.organization) {
    return workspace.organization;
  }

  const supabase = await createWorkspaceDataClient();
  const name = workspace.profile.companyName || workspace.profile.fullName || workspace.profile.email || "Minha empresa";
  const slug = slugify(name);

  const { data: organization, error: orgError } = await supabase
    .from("organizations")
    .insert({
      name,
      slug,
      owner_id: workspace.user.id,
      plan_code: "trial",
      status: "trial",
    })
    .select("id, name, slug, plan_code, status")
    .single();

  if (orgError || !organization) {
    return null;
  }

  await supabase.from("organization_members").insert({
    organization_id: organization.id,
    user_id: workspace.user.id,
    role: "owner",
  });

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
  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, phone, company_name, is_platform_admin")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (data) {
    return mapProfile(data, user);
  }

  const metadata = user.user_metadata ?? {};
  const { data: inserted } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      email: user.email,
      full_name: typeof metadata.full_name === "string" ? metadata.full_name : null,
      phone: typeof metadata.phone === "string" ? metadata.phone : null,
      company_name: typeof metadata.company_name === "string" ? metadata.company_name : null,
    })
    .select("id, email, full_name, phone, company_name, is_platform_admin")
    .single<ProfileRow>();

  return inserted
    ? mapProfile(inserted, user)
    : {
        id: user.id,
        email: user.email ?? null,
        fullName: null,
        phone: null,
        companyName: null,
        avatarUrl: readAvatarUrl(user),
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
    isPlatformAdmin: Boolean(row.is_platform_admin),
  };
}

function readAvatarUrl(user: User) {
  const metadata = user.user_metadata ?? {};
  const value = typeof metadata.avatar_url === "string"
    ? metadata.avatar_url
    : typeof metadata.picture === "string"
      ? metadata.picture
      : null;

  if (!value || !/^https?:\/\//i.test(value)) {
    return null;
  }

  return value;
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
