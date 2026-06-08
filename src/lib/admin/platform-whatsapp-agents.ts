import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultLeadQualificationConfig, leadQualificationConfigKey } from "@/lib/leads/qualification";
import { defaultWhatsappBehaviorConfig } from "@/lib/whatsapp/agent-behavior";
import { createServiceClient } from "@/lib/supabase/service";

type JsonRecord = Record<string, unknown>;

export type PlatformWhatsappSector = {
  id: string;
  sectorCode: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string | null;
};

export type PlatformWhatsappAgent = {
  id: string;
  sectorId: string | null;
  sectorCode: string;
  sectorName: string;
  agentCode: string;
  name: string;
  personaName: string;
  roleTitle: string;
  description: string | null;
  prompt: string;
  promptPreview: string;
  status: string;
  autonomyLevel: number;
  updatedAt: string | null;
  createdAt: string | null;
};

export type PlatformWhatsappAgentsWorkspace = {
  sectors: PlatformWhatsappSector[];
  agents: PlatformWhatsappAgent[];
};

type SectorRow = {
  id: string;
  sector_code: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string | null;
};

type AgentRow = {
  id: string;
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
  metadata: JsonRecord | null;
  updated_at: string | null;
  created_at: string | null;
};

const maxSectorNameLength = 80;
const maxSectorDescriptionLength = 280;
const maxAgentNameLength = 80;
const maxPromptLength = 8000;

export async function getPlatformWhatsappAgentsWorkspace(client: SupabaseClient = createServiceClient()) {
  const [sectorsResult, agentsResult] = await Promise.all([
    client
      .from("platform_whatsapp_sectors")
      .select("id, sector_code, name, description, status, created_at")
      .neq("status", "archived")
      .order("created_at", { ascending: true }),
    client
      .from("agent_registry")
      .select("id, sector_code, sector_name, agent_code, name, persona_name, role_title, description, prompt, status, autonomy_level, metadata, updated_at, created_at")
      .eq("scope", "platform")
      .is("organization_id", null)
      .contains("metadata", { admin_whatsapp: true, agent_kind: "whatsapp" })
      .order("created_at", { ascending: false }),
  ]);

  if (sectorsResult.error) {
    throw new Error(formatSectorTableError(`Nao foi possivel carregar os setores: ${sectorsResult.error.message}`));
  }

  if (agentsResult.error) {
    throw new Error(`Nao foi possivel carregar os agentes WhatsApp internos: ${agentsResult.error.message}`);
  }

  return {
    sectors: ((sectorsResult.data ?? []) as SectorRow[]).map(mapSector),
    agents: ((agentsResult.data ?? []) as AgentRow[]).map(mapAgent),
  } satisfies PlatformWhatsappAgentsWorkspace;
}

export async function createPlatformWhatsappSector(input: {
  name: string;
  description?: string;
  userId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const name = normalizeSectorName(input.name);
  const description = normalizeSectorDescription(input.description);
  const sectorCode = createSectorCode(name);

  const { data, error } = await client
    .from("platform_whatsapp_sectors")
    .insert({
      sector_code: sectorCode,
      name,
      description,
      status: "active",
      created_by: input.userId,
      metadata: {
        admin_created: true,
        connectyhub_internal: true,
      },
    })
    .select("id, sector_code, name, description, status, created_at")
    .single<SectorRow>();

  if (error || !data) {
    throw new Error(formatSectorTableError(error?.message ?? "Nao foi possivel criar o setor."));
  }

  return mapSector(data);
}

export async function createPlatformWhatsappAgent(input: {
  sectorId: string;
  name: string;
  roleTitle?: string;
  prompt?: string;
  userId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const sector = await requireActiveSector(client, input.sectorId);
  const name = normalizeAgentName(input.name);
  const roleTitle = normalizeRoleTitle(input.roleTitle);
  const prompt = normalizePrompt(input.prompt, sector);
  const agentCode = createAgentCode(name, sector.sectorCode);

  const { data, error } = await client
    .from("agent_registry")
    .insert({
      scope: "platform",
      organization_id: null,
      sector_code: sector.sectorCode,
      sector_name: sector.name,
      agent_code: agentCode,
      name,
      persona_name: name,
      avatar_alt: `Agente ${name}`,
      profile_bio: `Agente WhatsApp da ConnectyHub para o setor ${sector.name}.`,
      role_title: roleTitle,
      description: "Atende leads da ConnectyHub no WhatsApp, qualifica intencao e conduz o proximo passo comercial.",
      prompt,
      llm_provider: "gemini",
      model_id: "gemini-2.5-flash",
      status: "draft",
      autonomy_level: 50,
      requires_human_approval: true,
      tools: ["whatsapp", "lead_scoring", "conversation_review", "crm"],
      triggers: ["connectyhub/whatsapp.message.received"],
      inngest_event_name: "connectyhub/whatsapp.message.received",
      memory_access_level: "sector",
      created_by: input.userId,
      metadata: {
        admin_created: true,
        admin_whatsapp: true,
        agent_kind: "whatsapp",
        agent_type: "whatsapp_attendant",
        lead_facing: true,
        connectyhub_internal: true,
        company_name: "ConnectyHub",
        sector_id: sector.id,
        sector_code: sector.sectorCode,
        sector_name: sector.name,
        whatsapp_behavior_config: defaultWhatsappBehaviorConfig,
        [leadQualificationConfigKey]: defaultLeadQualificationConfig,
      },
    })
    .select("id, sector_code, sector_name, agent_code, name, persona_name, role_title, description, prompt, status, autonomy_level, metadata, updated_at, created_at")
    .single<AgentRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel criar o agente.");
  }

  return mapAgent(data);
}

export async function deletePlatformWhatsappAgent(input: {
  agentId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const agentId = normalizeUuid(input.agentId, "Escolha um agente valido.");

  const { data: agent, error: lookupError } = await client
    .from("agent_registry")
    .select("id, metadata")
    .eq("id", agentId)
    .eq("scope", "platform")
    .is("organization_id", null)
    .contains("metadata", { admin_whatsapp: true, agent_kind: "whatsapp" })
    .maybeSingle<{ id: string; metadata: JsonRecord | null }>();

  if (lookupError) {
    throw new Error(`Nao foi possivel validar o agente: ${lookupError.message}`);
  }

  if (!agent) {
    throw new Error("Escolha um agente WhatsApp interno da ConnectyHub.");
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

  return deleted;
}

export async function deletePlatformWhatsappSector(input: {
  sectorId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const sector = await requireActiveSector(client, input.sectorId);

  const { count: linkedAgents, error: linkedAgentsError } = await client
    .from("agent_registry")
    .select("id", { count: "exact", head: true })
    .eq("scope", "platform")
    .is("organization_id", null)
    .eq("sector_code", sector.sectorCode)
    .contains("metadata", { admin_whatsapp: true, agent_kind: "whatsapp" });

  if (linkedAgentsError) {
    throw new Error(`Nao foi possivel validar os agentes do setor: ${linkedAgentsError.message}`);
  }

  if ((linkedAgents ?? 0) > 0) {
    throw new Error("Exclua os agentes vinculados a este setor antes de remover o setor.");
  }

  const { error: memoryError } = await client
    .from("intelligence_memory")
    .delete()
    .eq("scope", "platform")
    .is("organization_id", null)
    .contains("metadata", { admin_whatsapp: true, sector_id: sector.id });

  if (memoryError) {
    throw new Error(`Nao foi possivel limpar os arquivos e links do setor: ${memoryError.message}`);
  }

  const { data: deleted, error } = await client
    .from("platform_whatsapp_sectors")
    .delete()
    .eq("id", sector.id)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new Error(`Nao foi possivel excluir o setor: ${error.message}`);
  }

  if (!deleted) {
    throw new Error("Nao foi possivel confirmar a exclusao do setor.");
  }

  return deleted;
}

async function requireActiveSector(client: SupabaseClient, sectorId: string) {
  const id = normalizeUuid(sectorId, "Escolha um setor da ConnectyHub.");
  const { data, error } = await client
    .from("platform_whatsapp_sectors")
    .select("id, sector_code, name, description, status, created_at")
    .eq("id", id)
    .neq("status", "archived")
    .maybeSingle<SectorRow>();

  if (error) {
    throw new Error(formatSectorTableError(`Nao foi possivel validar o setor: ${error.message}`));
  }

  if (!data) {
    throw new Error("Crie ou escolha um setor antes de criar o agente.");
  }

  return mapSector(data);
}

function mapSector(row: SectorRow): PlatformWhatsappSector {
  return {
    id: row.id,
    sectorCode: row.sector_code,
    name: row.name,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapAgent(row: AgentRow): PlatformWhatsappAgent {
  const metadata = readRecord(row.metadata) ?? {};
  const sectorId = readString(metadata.sector_id);

  return {
    id: row.id,
    sectorId,
    sectorCode: row.sector_code,
    sectorName: row.sector_name,
    agentCode: row.agent_code,
    name: row.name,
    personaName: row.persona_name?.trim() || row.name,
    roleTitle: row.role_title,
    description: row.description,
    prompt: row.prompt,
    promptPreview: preview(row.prompt),
    status: row.status,
    autonomyLevel: row.autonomy_level,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function normalizeSectorName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");

  if (name.length < 2) {
    throw new Error("Informe o nome do setor.");
  }

  if (name.length > maxSectorNameLength) {
    throw new Error(`O setor pode ter no maximo ${maxSectorNameLength} caracteres.`);
  }

  return name;
}

function normalizeSectorDescription(value: string | undefined) {
  const description = value?.trim().replace(/\s+/g, " ") ?? "";

  if (description.length > maxSectorDescriptionLength) {
    throw new Error(`A descricao pode ter no maximo ${maxSectorDescriptionLength} caracteres.`);
  }

  return description || null;
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
  return roleTitle || "Agente WhatsApp da ConnectyHub";
}

function normalizePrompt(value: string | undefined, sector: PlatformWhatsappSector) {
  const prompt = value?.trim() || defaultAdminWhatsappPrompt(sector);

  if (prompt.length > maxPromptLength) {
    throw new Error(`O prompt pode ter no maximo ${maxPromptLength} caracteres.`);
  }

  return prompt;
}

function defaultAdminWhatsappPrompt(sector: PlatformWhatsappSector) {
  return [
    `Voce e o agente comercial de WhatsApp da ConnectyHub para o setor ${sector.name}.`,
    "Atenda leads da propria ConnectyHub com clareza, contexto e postura consultiva.",
    "Descubra o objetivo do lead, tamanho da operacao, canal principal, urgencia, objecoes e proximo passo.",
    "Conduza para demonstracao, proposta, atendimento humano ou onboarding quando fizer sentido.",
    "Nunca prometa recursos, precos, prazos ou integracoes sem contexto confirmado pela ConnectyHub.",
    sector.description ? `Contexto do setor: ${sector.description}` : "",
  ].filter(Boolean).join("\n\n");
}

function createSectorCode(value: string) {
  const slug = slugify(value).slice(0, 42);
  return `whatsapp-${slug || "setor"}-${Date.now().toString(36)}`;
}

function createAgentCode(value: string, sectorCode: string) {
  const slug = slugify(value).slice(0, 32);
  return `connectyhub-whatsapp-${sectorCode.slice(0, 24)}-${slug || "agente"}-${Date.now().toString(36)}`;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeUuid(value: string, message: string) {
  const input = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input)) {
    throw new Error(message);
  }
  return input;
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function preview(value: string | null | undefined) {
  const cleaned = (value ?? "").replace(/\s+/g, " ").trim();
  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned;
}

function formatSectorTableError(message: string) {
  if (message.includes("platform_whatsapp_sectors") || message.includes("schema cache")) {
    return "A tabela de setores internos ainda nao existe no Supabase. Aplique a migration supabase/migrations/0011_admin_whatsapp_sectors.sql e atualize a pagina para cadastrar setores.";
  }

  return message;
}
