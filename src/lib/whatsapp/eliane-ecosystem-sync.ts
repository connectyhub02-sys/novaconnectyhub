import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import {
  ensureElianeOperationalKnowledge,
  isElianeWhatsappAgentIdentity,
  type ElianeSectorContext,
} from "./eliane-agent";

type JsonRecord = Record<string, unknown>;

type ElianeAgentRow = {
  id: string;
  name: string;
  persona_name: string | null;
  prompt: string | null;
  sector_code: string | null;
  sector_name: string | null;
  metadata: JsonRecord | null;
};

type SectorRow = {
  id: string;
  sector_code: string;
  name: string;
  description: string | null;
};

type EcosystemAreaDefinition = {
  key: string;
  title: string;
  table: string;
  dateColumn: "created_at" | "updated_at";
};

type EcosystemAreaSnapshot = EcosystemAreaDefinition & {
  count: number | null;
  latestAt: string | null;
  latestId: string | null;
  changedRecently: boolean;
  error: string | null;
};

type AuditEventSnapshot = {
  eventType: string;
  targetTable: string | null;
  createdAt: string;
};

type EcosystemSnapshot = {
  checkedAt: string;
  lookbackSince: string;
  buildFingerprint: string | null;
  areas: EcosystemAreaSnapshot[];
  auditEvents: AuditEventSnapshot[];
  auditError: string | null;
};

export const elianeEcosystemSyncEventName = "connectyhub/eliane.ecosystem.sync.requested";
export const elianeEcosystemKnowledgeSource = "eliane_ecosystem_sync";
export const elianeEcosystemKnowledgeTitle = "Atualizacao viva do ecossistema ConnectyHub";

const ecosystemLookbackHours = 24;

const ecosystemAreas: EcosystemAreaDefinition[] = [
  { key: "client_companies", title: "Empresas e workspaces de clientes", table: "organizations", dateColumn: "updated_at" },
  { key: "agents", title: "Agentes de clientes e internos", table: "agent_registry", dateColumn: "updated_at" },
  { key: "internal_sectors", title: "Setores internos da ConnectyHub", table: "platform_whatsapp_sectors", dateColumn: "updated_at" },
  { key: "whatsapp_instances", title: "Conexoes WhatsApp", table: "whatsapp_instances", dateColumn: "updated_at" },
  { key: "voices", title: "Vozes clonadas e vozes premium", table: "customer_voices", dateColumn: "updated_at" },
  { key: "knowledge", title: "Conhecimentos, links e produtos em memoria", table: "intelligence_memory", dateColumn: "updated_at" },
  { key: "catalog_imports", title: "Importacao de catalogo por IA", table: "sales_catalog_import_jobs", dateColumn: "updated_at" },
  { key: "catalog_orders", title: "Pedidos, checkout e vendas pelo catalogo", table: "sales_catalog_orders", dateColumn: "updated_at" },
  { key: "platform_products", title: "Produtos ConnectyHub para importacao/comissao", table: "platform_products", dateColumn: "updated_at" },
  { key: "billing_plans", title: "Planos, creditos e limites", table: "billing_plans", dateColumn: "updated_at" },
  { key: "integrations", title: "Integracoes externas", table: "integration_providers", dateColumn: "updated_at" },
  { key: "audit", title: "Auditoria operacional do admin", table: "maintenance_audit_logs", dateColumn: "created_at" },
];

const panelSupportMap = [
  "Painel cliente: Dashboard, Minha Empresa, Atendimento, Catalogo de Vendas, Automacoes, Produtos, Integracoes, API WhatsApp, Planos e Minha Conta. Atendimento unifica Leads, Conversas, Agentes e CRM/Funil em uma central estilo WhatsApp com inbox, chat ao vivo, controle do lead, CRM, agente e historico. Indicadores de relatorios ficam no Dashboard. Campanhas fica dentro de Atendimento > Configurar agente > Grupos e campanhas, no fluxo Campanhas WhatsApp: buscar destinos, selecionar grupos/canais, criar mensagem, revisar e agendar.",
  "Painel admin: Dashboard, Agentes, WhatsApp Interno, Inteligencia, Criativos IA, Setores, CEO IA, Aprovacoes, Meta Ads, Google Ads, Visao Geral, Clientes, CRM Leads, Automacoes, Planos, Produtos CH, WhatsApp Clientes, Integracoes e API WhatsApp.",
  "Suporte esperado: orientar menu, aba, botao e proximo passo; quando uma tela tiver mudado e nao estiver clara, confirmar com humano antes de afirmar.",
  "Postura comercial da Eliane: autoatendimento guiado. O usuario faz cadastro, cria empresa, cria/configura agente, conecta WhatsApp e importa/cadastra produtos dentro do painel; a Eliane orienta e envia botao/link quando disponivel, sem prometer que a equipe fara por ele.",
  "Identificacao do contato: quando o telefone do WhatsApp bater com profiles.phone_normalized, Eliane pode reconhecer que ja existe cadastro e orientar login/proximo passo. Nome parecido e apenas possibilidade e precisa confirmacao.",
];

export async function syncElianeEcosystemKnowledge(input: {
  client?: SupabaseClient;
  now?: Date;
  triggerSource?: string | null;
} = {}) {
  const client = input.client ?? createServiceClient();
  const now = input.now ?? new Date();
  const checkedAt = now.toISOString();
  const agent = await findElianeAgent(client);

  if (!agent) {
    return {
      status: "skipped" as const,
      reason: "eliane_agent_not_found",
      checkedAt,
    };
  }

  const sector = await resolveElianeSector(client, agent);
  if (!sector) {
    return {
      status: "skipped" as const,
      reason: "eliane_sector_not_found",
      agentId: agent.id,
      checkedAt,
    };
  }

  await ensureElianeOperationalKnowledge({
    client,
    sector,
    agentId: agent.id,
  });

  const snapshot = await buildEcosystemSnapshot(client, now);
  const content = buildElianeEcosystemKnowledgeContent(snapshot);
  const memoryId = await upsertElianeEcosystemMemory(client, {
    agentId: agent.id,
    sector,
    content,
    snapshot,
    triggerSource: input.triggerSource ?? "inngest",
  });

  return {
    status: "synced" as const,
    agentId: agent.id,
    sectorId: sector.id,
    memoryId,
    checkedAt,
    changedAreas: snapshot.areas.filter((area) => area.changedRecently).map((area) => area.key),
    warnings: snapshot.areas.filter((area) => area.error).map((area) => ({ area: area.key, error: area.error })),
    auditError: snapshot.auditError,
  };
}

async function findElianeAgent(client: SupabaseClient) {
  const { data, error } = await client
    .from("agent_registry")
    .select("id, name, persona_name, prompt, sector_code, sector_name, metadata")
    .eq("scope", "platform")
    .is("organization_id", null)
    .neq("status", "archived")
    .contains("metadata", { admin_whatsapp: true, agent_kind: "whatsapp" })
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`Nao foi possivel localizar a Eliane: ${error.message}`);
  }

  return ((data ?? []) as ElianeAgentRow[]).find((agent) =>
    isElianeWhatsappAgentIdentity({
      name: agent.name,
      personaName: agent.persona_name,
      metadata: agent.metadata,
      prompt: agent.prompt,
    }),
  ) ?? null;
}

async function resolveElianeSector(client: SupabaseClient, agent: ElianeAgentRow): Promise<ElianeSectorContext | null> {
  const metadata = readRecord(agent.metadata);
  const sectorId = readString(metadata?.sector_id);

  if (sectorId) {
    const sector = await loadSectorBy(client, "id", sectorId);
    if (sector) return sector;
  }

  if (agent.sector_code) {
    const sector = await loadSectorBy(client, "sector_code", agent.sector_code);
    if (sector) return sector;
  }

  return null;
}

async function loadSectorBy(client: SupabaseClient, column: "id" | "sector_code", value: string) {
  const { data, error } = await client
    .from("platform_whatsapp_sectors")
    .select("id, sector_code, name, description")
    .eq(column, value)
    .neq("status", "archived")
    .maybeSingle<SectorRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar o setor da Eliane: ${error.message}`);
  }

  if (!data) return null;

  return {
    id: data.id,
    sectorCode: data.sector_code,
    name: data.name,
    description: data.description,
  };
}

async function buildEcosystemSnapshot(client: SupabaseClient, now: Date): Promise<EcosystemSnapshot> {
  const checkedAt = now.toISOString();
  const lookbackSince = new Date(now.getTime() - ecosystemLookbackHours * 60 * 60 * 1000).toISOString();
  const [areas, audit] = await Promise.all([
    Promise.all(ecosystemAreas.map((area) => loadAreaSnapshot(client, area, lookbackSince))),
    loadRecentAuditEvents(client, lookbackSince),
  ]);

  return {
    checkedAt,
    lookbackSince,
    buildFingerprint: resolveBuildFingerprint(),
    areas,
    auditEvents: audit.events,
    auditError: audit.error,
  };
}

async function loadAreaSnapshot(
  client: SupabaseClient,
  area: EcosystemAreaDefinition,
  lookbackSince: string,
): Promise<EcosystemAreaSnapshot> {
  const { data, count, error } = await client
    .from(area.table)
    .select(`id, ${area.dateColumn}`, { count: "exact" })
    .order(area.dateColumn, { ascending: false })
    .limit(1);

  if (error) {
    return {
      ...area,
      count: null,
      latestAt: null,
      latestId: null,
      changedRecently: false,
      error: error.message,
    };
  }

  const latest = readRecord((data ?? [])[0]);
  const latestAt = readString(latest?.[area.dateColumn]);

  return {
    ...area,
    count: count ?? 0,
    latestAt,
    latestId: readString(latest?.id),
    changedRecently: Boolean(latestAt && Date.parse(latestAt) >= Date.parse(lookbackSince)),
    error: null,
  };
}

async function loadRecentAuditEvents(client: SupabaseClient, lookbackSince: string) {
  const { data, error } = await client
    .from("maintenance_audit_logs")
    .select("event_type, target_table, created_at")
    .gte("created_at", lookbackSince)
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    return { events: [] as AuditEventSnapshot[], error: error.message };
  }

  return {
    events: ((data ?? []) as Array<Record<string, unknown>>).map((event) => ({
      eventType: readString(event.event_type) ?? "evento_operacional",
      targetTable: readString(event.target_table),
      createdAt: readString(event.created_at) ?? new Date().toISOString(),
    })),
    error: null,
  };
}

function buildElianeEcosystemKnowledgeContent(snapshot: EcosystemSnapshot) {
  const changedAreas = snapshot.areas.filter((area) => area.changedRecently && !area.error);
  const warningAreas = snapshot.areas.filter((area) => area.error);
  const stableAreas = snapshot.areas.filter((area) => !area.changedRecently && !area.error);
  const latestAreas = snapshot.areas
    .filter((area) => area.latestAt && !area.error)
    .sort((left, right) => Date.parse(right.latestAt ?? "") - Date.parse(left.latestAt ?? ""))
    .slice(0, 6);

  return [
    "MEMORIA VIVA DA ELIANE - ECOSSISTEMA CONNECTYHUB",
    `Ultima verificacao automatica: ${formatDateTime(snapshot.checkedAt)}. Janela monitorada: ultimas ${ecosystemLookbackHours} horas.`,
    `Deploy/commit detectado: ${snapshot.buildFingerprint ?? "nao informado no ambiente"}.`,
    changedAreas.length
      ? `Mudancas recentes: ${changedAreas.map((area) => area.title).join("; ")}.`
      : "Nenhuma area critica mudou nas ultimas 24 horas pelos sinais de banco/auditoria.",
    "Use isso como contexto fresco. Se uma area mudou recentemente e o lead pedir passo a passo, oriente com cuidado e confirme com humano antes de cravar detalhe de tela que nao esteja no manual.",
    "",
    "Areas mais recentes:",
    ...latestAreas.map((area) => `- ${area.title}: ${formatCount(area.count)} registro(s), ultimo sinal ${formatDateTime(area.latestAt)}.`),
    "",
    "Eventos admin recentes:",
    ...(snapshot.auditEvents.length
      ? snapshot.auditEvents.map((event) => `- ${event.eventType}${event.targetTable ? ` em ${event.targetTable}` : ""}, ${formatDateTime(event.createdAt)}.`)
      : ["- Sem evento de auditoria nas ultimas 24 horas."]),
    "",
    "Mapa rapido para suporte:",
    ...panelSupportMap,
    stableAreas.length ? `Areas sem mudanca recente detectada: ${stableAreas.map((area) => area.title).join("; ")}.` : "",
    warningAreas.length ? `Avisos tecnicos da sincronizacao: ${warningAreas.map((area) => `${area.title}: ${area.error}`).join("; ")}.` : "",
  ].filter(Boolean).join("\n");
}

async function upsertElianeEcosystemMemory(
  client: SupabaseClient,
  input: {
    agentId: string;
    sector: ElianeSectorContext;
    content: string;
    snapshot: EcosystemSnapshot;
    triggerSource: string;
  },
) {
  const metadata = {
    admin_whatsapp: true,
    sector_id: input.sector.id,
    sector_code: input.sector.sectorCode,
    sector_name: input.sector.name,
    agent_id: input.agentId,
    source: elianeEcosystemKnowledgeSource,
    managed_by: "connectyhub_eliane_ecosystem_sync",
    trigger_source: input.triggerSource,
    checked_at: input.snapshot.checkedAt,
    lookback_since: input.snapshot.lookbackSince,
    build_fingerprint: input.snapshot.buildFingerprint,
    changed_areas: input.snapshot.areas.filter((area) => area.changedRecently).map((area) => area.key),
    warning_areas: input.snapshot.areas.filter((area) => area.error).map((area) => area.key),
  };

  const { data: existing, error: lookupError } = await client
    .from("intelligence_memory")
    .select("id")
    .eq("scope", "platform")
    .is("organization_id", null)
    .eq("memory_type", "knowledge_file")
    .contains("metadata", { admin_whatsapp: true, sector_id: input.sector.id, source: elianeEcosystemKnowledgeSource })
    .maybeSingle<{ id: string }>();

  if (lookupError) {
    throw new Error(`Nao foi possivel validar memoria viva da Eliane: ${lookupError.message}`);
  }

  const payload = {
    title: elianeEcosystemKnowledgeTitle,
    content: input.content,
    importance: 0.96,
    tags: ["knowledge_base", "platform_whatsapp_sector", "whatsapp_agent", "eliane_ecosystem_sync"],
    created_by_agent_id: input.agentId,
    metadata,
  };

  if (existing?.id) {
    const { error } = await client
      .from("intelligence_memory")
      .update(payload)
      .eq("id", existing.id);

    if (error) {
      throw new Error(`Nao foi possivel atualizar memoria viva da Eliane: ${error.message}`);
    }

    return existing.id;
  }

  const { data, error } = await client
    .from("intelligence_memory")
    .insert({
      scope: "platform",
      organization_id: null,
      memory_type: "knowledge_file",
      ...payload,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel registrar memoria viva da Eliane.");
  }

  return data.id;
}

function resolveBuildFingerprint() {
  const value = [
    process.env.CONNECTYHUB_BUILD_SHA,
    process.env.NEXT_PUBLIC_CONNECTYHUB_BUILD_SHA,
    process.env.GITHUB_SHA,
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    process.env.RENDER_GIT_COMMIT,
  ].find((entry) => entry && entry.trim());

  return value ? value.trim().slice(0, 40) : null;
}

function formatCount(value: number | null) {
  return typeof value === "number" ? String(value) : "indisponivel";
}

function formatDateTime(value: string | null) {
  if (!value) return "sem data";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
