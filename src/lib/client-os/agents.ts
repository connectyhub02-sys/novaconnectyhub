import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultWhatsappAgentPrompt, defaultWhatsappBehaviorConfig } from "@/lib/whatsapp/agent-behavior";
import { createServiceClient } from "@/lib/supabase/service";
import { listClientCompanies, requireClientCompanyAccess, type ClientCompany } from "./companies";

export type ClientAgent = {
  id: string;
  companyId: string;
  companyName: string;
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

type DeleteAgentRow = {
  id: string;
  organization_id: string;
};

const maxAgentNameLength = 80;
const maxPromptLength = 24000;

export async function getClientAgentsWorkspace(userId: string, client: SupabaseClient = createServiceClient()) {
  const companies = await listClientCompanies(userId, client);
  const companyIds = companies.map((company) => company.id);

  if (companyIds.length === 0) {
    return { companies, agents: [] as ClientAgent[] };
  }

  const { data, error } = await client
    .from("agent_registry")
    .select("id, organization_id, agent_code, name, persona_name, role_title, description, prompt, status, autonomy_level, updated_at, created_at")
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
  const roleTitle = normalizeRoleTitle(input.roleTitle);
  const prompt = normalizePrompt(input.prompt);
  const agentCode = createAgentCode(name);

  const { data, error } = await client
    .from("agent_registry")
    .insert({
      scope: "organization",
      organization_id: company.id,
      sector_code: "atendimento",
      sector_name: "Atendimento WhatsApp",
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
        whatsapp_behavior_config: defaultWhatsappBehaviorConfig,
      },
    })
    .select("id, organization_id, agent_code, name, persona_name, role_title, description, prompt, status, autonomy_level, updated_at, created_at")
    .single<AgentRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel criar o agente.");
  }

  return mapAgent(data, new Map([[company.id, company]]));
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

  return agent;
}

function mapAgent(agent: AgentRow, companyById: Map<string, ClientCompany>) {
  const company = companyById.get(agent.organization_id);

  return {
    id: agent.id,
    companyId: agent.organization_id,
    companyName: company?.name ?? "Empresa",
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

function normalizePrompt(value: string | undefined) {
  const prompt = value?.trim() || defaultWhatsappAgentPrompt;

  if (prompt.length > maxPromptLength) {
    throw new Error(`O prompt pode ter no maximo ${maxPromptLength} caracteres.`);
  }

  return prompt;
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
