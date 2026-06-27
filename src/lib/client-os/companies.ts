import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureClientApiClient } from "@/lib/connectyhub-api/gateway";
import { createServiceClient } from "@/lib/supabase/service";

export type ClientCompany = {
  id: string;
  name: string;
  slug: string | null;
  planCode: string;
  status: string;
  role: string;
  createdAt: string | null;
};

type OrganizationRow = {
  id: string;
  name: string;
  slug: string | null;
  plan_code: string;
  status: string;
  created_at: string | null;
};

type MembershipRow = {
  role: string;
  organizations: OrganizationRow | OrganizationRow[] | null;
};

const maxCompanyNameLength = 96;
const clientCompanySlugPrefix = "empresa-cliente-";

export async function listClientCompanies(userId: string, client: SupabaseClient = createServiceClient()) {
  const { data, error } = await client
    .from("organization_members")
    .select("role, organizations(id, name, slug, plan_code, status, created_at)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Nao foi possivel carregar as empresas: ${error.message}`);
  }

  return ((data ?? []) as MembershipRow[])
    .map((row) => mapCompany(row))
    .filter((company): company is ClientCompany => Boolean(company))
    .filter((company) => isClientCreatedCompany(company));
}

export async function createClientCompany(input: {
  userId: string;
  name: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const name = normalizeCompanyName(input.name);

  const { data: organization, error: organizationError } = await client
    .from("organizations")
    .insert({
      name,
      slug: createCompanySlug(name),
      owner_id: input.userId,
      plan_code: "trial",
      status: "trial",
    })
    .select("id, name, slug, plan_code, status, created_at")
    .single<OrganizationRow>();

  if (organizationError || !organization) {
    throw new Error(organizationError?.message ?? "Nao foi possivel cadastrar a empresa.");
  }

  const { error: memberError } = await client.from("organization_members").insert({
    organization_id: organization.id,
    user_id: input.userId,
    role: "owner",
  });

  if (memberError) {
    throw new Error(`Empresa criada, mas nao foi possivel vincular o usuario: ${memberError.message}`);
  }

  await ensureClientApiClient({
    organizationId: organization.id,
    organizationName: organization.name,
    organizationSlug: organization.slug,
    actorId: input.userId,
    client,
  });

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    planCode: organization.plan_code,
    status: organization.status,
    role: "owner",
    createdAt: organization.created_at,
  } satisfies ClientCompany;
}

export async function deleteClientCompany(input: {
  userId: string;
  companyId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const company = await requireClientCompanyAccess({
    userId: input.userId,
    companyId: input.companyId,
    client,
  });

  const { data, error } = await client
    .from("organizations")
    .delete()
    .eq("id", company.id)
    .eq("owner_id", input.userId)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new Error(`Nao foi possivel excluir a empresa: ${error.message}`);
  }

  if (!data) {
    throw new Error("Somente o dono da empresa pode excluir este cadastro.");
  }

  return company;
}

export async function updateClientCompany(input: {
  userId: string;
  companyId: string;
  name: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const company = await requireClientCompanyAccess({
    userId: input.userId,
    companyId: input.companyId,
    client,
  });
  const name = normalizeCompanyName(input.name);

  const { data, error } = await client
    .from("organizations")
    .update({ name })
    .eq("id", company.id)
    .eq("owner_id", input.userId)
    .select("id, name, slug, plan_code, status, created_at")
    .maybeSingle<OrganizationRow>();

  if (error) {
    throw new Error(`Nao foi possivel atualizar a empresa: ${error.message}`);
  }

  if (!data) {
    throw new Error("Somente o dono da empresa pode editar este cadastro.");
  }

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    planCode: data.plan_code,
    status: data.status,
    role: company.role,
    createdAt: data.created_at,
  } satisfies ClientCompany;
}

export async function requireClientCompanyAccess(input: {
  userId: string;
  companyId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const { data, error } = await client
    .from("organization_members")
    .select("role, organizations(id, name, slug, plan_code, status, created_at)")
    .eq("user_id", input.userId)
    .eq("organization_id", input.companyId)
    .maybeSingle<MembershipRow>();

  if (error) {
    throw new Error(`Nao foi possivel validar a empresa: ${error.message}`);
  }

  const company = data ? mapCompany(data) : null;

  if (!company || !isClientCreatedCompany(company)) {
    throw new Error("Escolha uma empresa vinculada a sua conta.");
  }

  return company;
}

function mapCompany(row: MembershipRow) {
  const organization = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;

  if (!organization) {
    return null;
  }

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    planCode: organization.plan_code,
    status: organization.status,
    role: row.role,
    createdAt: organization.created_at,
  } satisfies ClientCompany;
}

function normalizeCompanyName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");

  if (name.length < 2) {
    throw new Error("Informe o nome da empresa.");
  }

  if (name.length > maxCompanyNameLength) {
    throw new Error(`O nome da empresa pode ter no maximo ${maxCompanyNameLength} caracteres.`);
  }

  return name;
}

function createCompanySlug(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);

  return `${clientCompanySlugPrefix}${slug || "empresa"}-${Date.now().toString(36)}`;
}

function isClientCreatedCompany(company: ClientCompany) {
  return Boolean(company.slug?.startsWith(clientCompanySlugPrefix));
}
