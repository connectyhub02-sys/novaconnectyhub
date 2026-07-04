import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { defaultLeadQualificationConfig, leadQualificationConfigKey } from "@/lib/leads/qualification";
import { defaultWhatsappAgentPrompt, defaultWhatsappBehaviorConfig, defaultWhatsappCloneMemory, defaultWhatsappCloneProfile } from "@/lib/whatsapp/agent-behavior";
import { deleteUazapiProviderInstance } from "@/lib/whatsapp/uazapi-instance-cleanup";
import { loadUazapiCredentials } from "@/lib/whatsapp/uazapi-credentials";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { listClientCompanies, requireClientCompanyAccess, type ClientCompany } from "./companies";

type JsonRecord = Record<string, unknown>;

export type ClientAgent = {
  id: string;
  companyId: string;
  companyName: string;
  sectorCode: string;
  sectorName: string;
  agentCode: string;
  name: string;
  personaName: string;
  roleTitle: string;
  description: string | null;
  prompt: string;
  status: string;
  autonomyLevel: number;
  updatedAt: string | null;
  createdAt: string | null;
};

type AgentRow = {
  id: string;
  organization_id: string;
  sector_code: string;
  sector_name: string;
  agent_code: string;
  name: string;
  persona_name: string | null;
  role_title: string;
  description: string | null;
  prompt: string;
  status: string;
  autonomy_level: number;
  updated_at: string | null;
  created_at: string | null;
};

type AgentFullRow = AgentRow & {
  avatar_url: string | null;
  avatar_alt: string | null;
  profile_bio: string | null;
  llm_provider: string;
  model_id: string | null;
  requires_human_approval: boolean;
  tools: string[];
  triggers: string[];
  schedule_rrule: string | null;
  inngest_event_name: string | null;
  memory_access_level: string;
  monthly_budget_credits: number | null;
  metadata: JsonRecord | null;
};

type DeleteAgentRow = {
  id: string;
  organization_id: string;
};

type AgentWhatsappInstanceRow = {
  id: string;
  provider_instance_id: string | null;
  status: string | null;
  phone_number: string | null;
  instance_token_encrypted: string | null;
  metadata: JsonRecord | null;
};

const maxAgentNameLength = 80;
const maxSectorNameLength = 80;
const maxPromptLength = 8000;
const agentListSelectColumns = "id, organization_id, sector_code, sector_name, agent_code, name, persona_name, role_title, description, prompt, status, autonomy_level, updated_at, created_at";
const agentFullSelectColumns = `${agentListSelectColumns}, avatar_url, avatar_alt, profile_bio, llm_provider, model_id, requires_human_approval, tools, triggers, schedule_rrule, inngest_event_name, memory_access_level, monthly_budget_credits, metadata`;

export async function getClientAgentsWorkspace(userId: string, client: SupabaseClient = createServiceClient()) {
  const companies = await listClientCompanies(userId, client);
  const companyIds = companies.map((company) => company.id);

  if (companyIds.length === 0) {
    return { companies, agents: [] as ClientAgent[] };
  }

  const { data, error } = await client
    .from("agent_registry")
    .select(agentListSelectColumns)
    .eq("scope", "organization")
    .in("organization_id", companyIds)
    .contains("metadata", { client_created: true, agent_kind: "whatsapp" })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Nao foi possivel carregar os agentes: ${error.message}`);
  }

  const companyById = new Map(companies.map((company) => [company.id, company]));
  const agents = ((data ?? []) as AgentRow[]).map((agent) => mapAgent(agent, companyById));

  return { companies, agents };
}

export async function createClientAgent(input: {
  userId: string;
  companyId: string;
  name: string;
  sectorName?: string;
  roleTitle?: string;
  prompt?: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const company = await requireClientCompanyAccess({
    userId: input.userId,
    companyId: input.companyId,
    client,
  });
  const name = normalizeAgentName(input.name);
  const sectorName = normalizeSectorName(input.sectorName);
  const sectorCode = createSectorCode(sectorName);
  const roleTitle = normalizeRoleTitle(input.roleTitle);
  const prompt = normalizePrompt(input.prompt);
  const agentCode = createAgentCode(name);

  const { data, error } = await client
    .from("agent_registry")
    .insert({
      scope: "organization",
      organization_id: company.id,
      sector_code: sectorCode,
      sector_name: sectorName,
      agent_code: agentCode,
      name,
      persona_name: name,
      avatar_alt: `Agente ${name}`,
      profile_bio: "Agente de WhatsApp criado pelo cliente para atender leads desta empresa.",
      role_title: roleTitle,
      description: "Atende leads no WhatsApp, qualifica conversas e conduz proximos passos comerciais.",
      prompt,
      llm_provider: "gemini",
      status: "draft",
      autonomy_level: 50,
      requires_human_approval: true,
      tools: ["whatsapp", "lead_scoring", "conversation_review"],
      triggers: ["connectyhub/whatsapp.message.received"],
      memory_access_level: "organization",
      created_by: input.userId,
      metadata: {
        client_created: true,
        agent_kind: "whatsapp",
        company_id: company.id,
        company_name: company.name,
        sector_code: sectorCode,
        sector_name: sectorName,
        whatsapp_behavior_config: defaultWhatsappBehaviorConfig,
        whatsapp_clone_profile: defaultWhatsappCloneProfile,
        whatsapp_clone_memory: defaultWhatsappCloneMemory,
        [leadQualificationConfigKey]: defaultLeadQualificationConfig,
      },
    })
    .select(agentListSelectColumns)
    .single<AgentRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel criar o agente.");
  }

  return mapAgent(data, new Map([[company.id, company]]));
}

export async function updateClientAgent(input: {
  userId: string;
  agentId: string;
  companyId: string;
  name: string;
  sectorName?: string;
  roleTitle?: string;
  prompt?: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const { agent, companies } = await requireClientAgentAccess({
    userId: input.userId,
    agentId: input.agentId,
    client,
  });
  const targetCompany = await requireClientCompanyAccess({
    userId: input.userId,
    companyId: input.companyId || agent.organization_id,
    client,
  });
  const name = normalizeAgentName(input.name);
  const sectorName = normalizeSectorName(input.sectorName);
  const sectorCode = createSectorCode(sectorName);
  const roleTitle = normalizeRoleTitle(input.roleTitle);
  const prompt = normalizePrompt(input.prompt);
  const metadata = mergeAgentMetadata(agent.metadata, targetCompany, sectorCode, sectorName);

  const { data, error } = await client
    .from("agent_registry")
    .update({
      organization_id: targetCompany.id,
      sector_code: sectorCode,
      sector_name: sectorName,
      name,
      persona_name: name,
      avatar_alt: `Agente ${name}`,
      role_title: roleTitle,
      prompt,
      metadata,
    })
    .eq("id", agent.id)
    .eq("scope", "organization")
    .select(agentListSelectColumns)
    .single<AgentRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel editar o agente.");
  }

  const companyById = new Map(companies.map((company) => [company.id, company]));
  companyById.set(targetCompany.id, targetCompany);

  return mapAgent(data, companyById);
}

export async function cloneClientAgent(input: {
  userId: string;
  sourceAgentId: string;
  companyId: string;
  name?: string;
  sectorName?: string;
  roleTitle?: string;
  prompt?: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const { agent: sourceAgent, companies } = await requireClientAgentAccess({
    userId: input.userId,
    agentId: input.sourceAgentId,
    client,
  });
  const targetCompany = await requireClientCompanyAccess({
    userId: input.userId,
    companyId: input.companyId || sourceAgent.organization_id,
    client,
  });
  const name = normalizeAgentName(input.name || `Copia de ${sourceAgent.name}`);
  const sectorName = normalizeSectorName(input.sectorName || sourceAgent.sector_name);
  const sectorCode = createSectorCode(sectorName);
  const roleTitle = normalizeRoleTitle(input.roleTitle || sourceAgent.role_title);
  const prompt = normalizePrompt(input.prompt || sourceAgent.prompt);
  const metadata = mergeAgentMetadata(sourceAgent.metadata, targetCompany, sectorCode, sectorName, {
    cloned_from_agent_id: sourceAgent.id,
    cloned_from_agent_name: sourceAgent.name,
    cloned_at: new Date().toISOString(),
  });
  if (targetCompany.id !== sourceAgent.organization_id) {
    delete metadata.whatsapp_clone_memory;
  }

  const { data, error } = await client
    .from("agent_registry")
    .insert({
      scope: "organization",
      organization_id: targetCompany.id,
      sector_code: sectorCode,
      sector_name: sectorName,
      agent_code: createAgentCode(name),
      name,
      persona_name: name,
      avatar_url: sourceAgent.avatar_url,
      avatar_alt: sourceAgent.avatar_alt || `Agente ${name}`,
      profile_bio: sourceAgent.profile_bio,
      role_title: roleTitle,
      description: sourceAgent.description,
      prompt,
      llm_provider: sourceAgent.llm_provider,
      model_id: sourceAgent.model_id,
      status: "draft",
      autonomy_level: sourceAgent.autonomy_level,
      requires_human_approval: sourceAgent.requires_human_approval,
      tools: sourceAgent.tools,
      triggers: sourceAgent.triggers,
      schedule_rrule: sourceAgent.schedule_rrule,
      inngest_event_name: sourceAgent.inngest_event_name,
      memory_access_level: sourceAgent.memory_access_level,
      monthly_budget_credits: sourceAgent.monthly_budget_credits,
      created_by: input.userId,
      metadata,
    })
    .select(agentListSelectColumns)
    .single<AgentRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel clonar o agente.");
  }

  const companyById = new Map(companies.map((company) => [company.id, company]));
  companyById.set(targetCompany.id, targetCompany);

  return mapAgent(data, companyById);
}

export async function deleteClientAgent(input: {
  userId: string;
  agentId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const companies = await listClientCompanies(input.userId, client);
  const companyIds = new Set(companies.map((company) => company.id));

  if (companyIds.size === 0) {
    throw new Error("Nenhuma empresa cadastrada para excluir agentes.");
  }

  const { data: agent, error: agentError } = await client
    .from("agent_registry")
    .select("id, organization_id")
    .eq("id", input.agentId)
    .eq("scope", "organization")
    .contains("metadata", { client_created: true, agent_kind: "whatsapp" })
    .maybeSingle<DeleteAgentRow>();

  if (agentError) {
    throw new Error(`Nao foi possivel validar o agente: ${agentError.message}`);
  }

  if (!agent || !companyIds.has(agent.organization_id)) {
    throw new Error("Escolha um agente vinculado a sua conta.");
  }

  await deleteAgentWhatsappInstances(client, agent, input.userId);

  const { data: deleted, error } = await client
    .from("agent_registry")
    .delete()
    .eq("id", agent.id)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new Error(`Nao foi possivel excluir o agente: ${error.message}`);
  }

  if (!deleted) {
    throw new Error("Nao foi possivel confirmar a exclusao do agente.");
  }

  revalidatePath("/dashboard/agentes");
  revalidatePath("/dashboard/whatsapp");
  revalidatePath("/admin/clientes/whatsapp");

  return agent;
}

async function deleteAgentWhatsappInstances(
  client: SupabaseClient,
  agent: DeleteAgentRow,
  userId: string,
) {
  const credentials = await loadUazapiCredentials(client);
  const { data, error } = await client
    .from("whatsapp_instances")
    .select("id, provider_instance_id, status, phone_number, instance_token_encrypted, metadata")
    .eq("organization_id", agent.organization_id)
    .contains("metadata", { agent_id: agent.id })
    .neq("status", "archived")
    .returns<AgentWhatsappInstanceRow[]>();

  if (error) {
    throw new Error(`Nao foi possivel verificar instancias do agente: ${error.message}`);
  }

  const rowsToArchive = data ?? [];

  if (rowsToArchive.length === 0) {
    return;
  }

  const now = new Date().toISOString();

  for (const row of rowsToArchive) {
    const deleteResult = await deleteUazapiProviderInstance({
      credentials,
      providerInstanceId: row.provider_instance_id,
      token: decryptAgentInstanceToken(row),
    });

    if (!deleteResult.providerDeleted && !deleteResult.skipped) {
      throw new Error(`Nao foi possivel excluir a instancia WhatsApp ${row.id} na Uazapi. O agente nao foi excluido para evitar cobranca duplicada.`);
    }

    const { error: archiveError } = await client
      .from("whatsapp_instances")
      .update({
        status: "archived",
        qr_status: null,
        instance_token_preview: null,
        instance_token_encrypted: null,
        webhook_url: null,
        webhook_configured_at: null,
        disconnected_at: now,
        metadata: {
          ...(row.metadata ?? {}),
          archived_reason: "agent_deleted",
          archived_agent_id: agent.id,
          archived_at: now,
          archived_by: userId,
          provider_delete_ok: deleteResult.providerDeleted,
          provider_delete_status: deleteResult.providerStatus,
          provider_delete_response: deleteResult.providerResponse,
          provider_delete_refreshed_token_used: deleteResult.refreshedTokenUsed,
          provider_delete_skipped: deleteResult.skipped,
        },
      })
      .eq("id", row.id);

    if (archiveError) {
      throw new Error(`Nao foi possivel arquivar a instancia ${row.id}: ${archiveError.message}`);
    }
  }
}

function decryptAgentInstanceToken(instance: AgentWhatsappInstanceRow) {
  if (!instance.instance_token_encrypted) {
    return null;
  }

  try {
    return decryptCredentialValue(instance.instance_token_encrypted);
  } catch {
    return null;
  }
}

async function requireClientAgentAccess(input: {
  userId: string;
  agentId: string;
  client: SupabaseClient;
}) {
  const companies = await listClientCompanies(input.userId, input.client);
  const companyIds = new Set(companies.map((company) => company.id));

  if (companyIds.size === 0) {
    throw new Error("Nenhuma empresa cadastrada para gerenciar agentes.");
  }

  const { data: agent, error } = await input.client
    .from("agent_registry")
    .select(agentFullSelectColumns)
    .eq("id", input.agentId)
    .eq("scope", "organization")
    .contains("metadata", { client_created: true, agent_kind: "whatsapp" })
    .maybeSingle<AgentFullRow>();

  if (error) {
    throw new Error(`Nao foi possivel validar o agente: ${error.message}`);
  }

  if (!agent || !companyIds.has(agent.organization_id)) {
    throw new Error("Escolha um agente vinculado a sua conta.");
  }

  return { agent, companies };
}

function mapAgent(agent: AgentRow, companyById: Map<string, ClientCompany>) {
  const company = companyById.get(agent.organization_id);

  return {
    id: agent.id,
    companyId: agent.organization_id,
    companyName: company?.name ?? "Empresa",
    sectorCode: agent.sector_code,
    sectorName: agent.sector_name,
    agentCode: agent.agent_code,
    name: agent.name,
    personaName: agent.persona_name ?? agent.name,
    roleTitle: agent.role_title,
    description: agent.description,
    prompt: agent.prompt,
    status: agent.status,
    autonomyLevel: agent.autonomy_level,
    updatedAt: agent.updated_at,
    createdAt: agent.created_at,
  } satisfies ClientAgent;
}

function mergeAgentMetadata(
  metadata: JsonRecord | null,
  company: ClientCompany,
  sectorCode: string,
  sectorName: string,
  extra: JsonRecord = {},
): JsonRecord {
  return {
    ...(metadata ?? {}),
    client_created: true,
    agent_kind: "whatsapp",
    company_id: company.id,
    company_name: company.name,
    sector_code: sectorCode,
    sector_name: sectorName,
    ...extra,
  };
}

function normalizeAgentName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");

  if (name.length < 2) {
    throw new Error("Informe o nome do agente.");
  }

  if (name.length > maxAgentNameLength) {
    throw new Error(`O nome do agente pode ter no maximo ${maxAgentNameLength} caracteres.`);
  }

  return name;
}

function normalizeRoleTitle(value: string | undefined) {
  const roleTitle = value?.trim().replace(/\s+/g, " ");
  return roleTitle || "Agente de WhatsApp";
}

function normalizeSectorName(value: string | undefined) {
  const sectorName = value?.trim().replace(/\s+/g, " ") || "Atendimento WhatsApp";

  if (sectorName.length < 2) {
    throw new Error("Informe o nome do setor.");
  }

  if (sectorName.length > maxSectorNameLength) {
    throw new Error(`O setor pode ter no maximo ${maxSectorNameLength} caracteres.`);
  }

  return sectorName;
}

function normalizePrompt(value: string | undefined) {
  const prompt = value?.trim() || defaultWhatsappAgentPrompt;

  if (prompt.length > maxPromptLength) {
    throw new Error(`O prompt pode ter no maximo ${maxPromptLength} caracteres.`);
  }

  return prompt;
}

function createSectorCode(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);

  return slug || "atendimento";
}

function createAgentCode(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);

  return `cliente-whatsapp-${slug || "agente"}-${Date.now().toString(36)}`;
}
