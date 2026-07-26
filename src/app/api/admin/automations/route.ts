import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getDefaultAutomationTemplate,
  getPlatformAutomationsCatalog,
  normalizeAutomationMessageTemplate,
  PLATFORM_AUTOMATION_EVENT_DEFINITIONS,
  validateConnectedPlatformAutomationAgent,
  type PlatformAutomationAudience,
  type PlatformAutomationChannel,
  type PlatformAutomationStatus,
} from "@/lib/automations/platform-automations";
import { createServiceClient } from "@/lib/supabase/service";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type AutomationPayload = {
  id?: string;
  name: string;
  description: string;
  eventType: string;
  channel: PlatformAutomationChannel;
  status: PlatformAutomationStatus;
  selectedAgentId: string | null;
  fallbackToBillingAgent: boolean;
  audienceType: PlatformAutomationAudience;
  conditions: JsonRecord;
  triggerConfig: JsonRecord;
  messageTemplate: string;
  delayMinutes: number;
  cooldownMinutes: number;
  maxSendsPerContact: number;
  priority: number;
  labels: string[];
};

export async function GET() {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  return NextResponse.json({ catalog: await getPlatformAutomationsCatalog() });
}

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const parsed = parseAutomationPayload(await request.json().catch(() => null), { requireId: false });

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const client = createServiceClient();
  const agentCheck = await validateAutomationAgentSelection(client, parsed.automation);

  if (!agentCheck.ok) {
    return NextResponse.json({ error: agentCheck.error }, { status: 422 });
  }

  const flowKey = buildCustomFlowKey(parsed.automation.name, parsed.automation.eventType);
  const { data, error } = await client
    .from("platform_automation_flows")
    .insert({
      flow_key: flowKey,
      name: parsed.automation.name,
      description: parsed.automation.description,
      event_type: parsed.automation.eventType,
      channel: parsed.automation.channel,
      status: parsed.automation.status,
      selected_agent_id: parsed.automation.selectedAgentId,
      fallback_to_billing_agent: parsed.automation.fallbackToBillingAgent,
      audience_type: parsed.automation.audienceType,
      conditions: parsed.automation.conditions,
      trigger_config: parsed.automation.triggerConfig,
      message_template: parsed.automation.messageTemplate,
      delay_minutes: parsed.automation.delayMinutes,
      cooldown_minutes: parsed.automation.cooldownMinutes,
      max_sends_per_contact: parsed.automation.maxSendsPerContact,
      priority: parsed.automation.priority,
      labels: parsed.automation.labels,
      created_by: auth.userId,
      updated_by: auth.userId,
      metadata: {
        source: "admin_automation_builder",
        custom: true,
      },
    })
    .select("id, flow_key")
    .single<{ id: string; flow_key: string }>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAutomationAudit(client, {
    actorId: auth.userId,
    eventType: "automation.platform_flow.created",
    targetId: data.id,
    metadata: {
      flowKey: data.flow_key,
      eventType: parsed.automation.eventType,
      selectedAgentId: parsed.automation.selectedAgentId,
      status: parsed.automation.status,
    },
  });

  revalidateAutomationPaths();

  return NextResponse.json({ flow: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const parsed = parseAutomationPayload(await request.json().catch(() => null), { requireId: true });

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const client = createServiceClient();
  const agentCheck = await validateAutomationAgentSelection(client, parsed.automation);

  if (!agentCheck.ok) {
    return NextResponse.json({ error: agentCheck.error }, { status: 422 });
  }

  const { data, error } = await client
    .from("platform_automation_flows")
    .update({
      name: parsed.automation.name,
      description: parsed.automation.description,
      event_type: parsed.automation.eventType,
      channel: parsed.automation.channel,
      status: parsed.automation.status,
      selected_agent_id: parsed.automation.selectedAgentId,
      fallback_to_billing_agent: parsed.automation.fallbackToBillingAgent,
      audience_type: parsed.automation.audienceType,
      conditions: parsed.automation.conditions,
      trigger_config: parsed.automation.triggerConfig,
      message_template: parsed.automation.messageTemplate,
      delay_minutes: parsed.automation.delayMinutes,
      cooldown_minutes: parsed.automation.cooldownMinutes,
      max_sends_per_contact: parsed.automation.maxSendsPerContact,
      priority: parsed.automation.priority,
      labels: parsed.automation.labels,
      updated_by: auth.userId,
    })
    .eq("id", parsed.automation.id)
    .select("id, flow_key")
    .maybeSingle<{ id: string; flow_key: string }>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Automacao nao encontrada." }, { status: 404 });
  }

  await writeAutomationAudit(client, {
    actorId: auth.userId,
    eventType: "automation.platform_flow.updated",
    targetId: data.id,
    metadata: {
      flowKey: data.flow_key,
      eventType: parsed.automation.eventType,
      selectedAgentId: parsed.automation.selectedAgentId,
      status: parsed.automation.status,
    },
  });

  revalidateAutomationPaths();

  return NextResponse.json({ flow: data });
}

function parseAutomationPayload(
  body: unknown,
  options: { requireId: boolean },
): { ok: true; automation: AutomationPayload } | { ok: false; error: string } {
  const record = readRecord(body);

  if (!record) {
    return { ok: false, error: "Payload invalido." };
  }

  const id = options.requireId ? readUuid(record.id) : undefined;

  if (options.requireId && !id) {
    return { ok: false, error: "Automacao invalida." };
  }

  const eventType = readEventType(record.eventType);

  if (!eventType) {
    return { ok: false, error: "Escolha um evento valido para a automacao." };
  }

  const name = readString(record.name)?.slice(0, 120) ?? "";

  if (name.length < 3) {
    return { ok: false, error: "Informe um nome para a automacao." };
  }

  const selectedAgentId = readNullableUuid(record.selectedAgentId);

  if (record.selectedAgentId !== null && record.selectedAgentId !== undefined && !selectedAgentId) {
    return { ok: false, error: "Escolha um agente valido." };
  }

  const status = readAutomationStatus(record.status);
  const fallbackToBillingAgent = record.fallbackToBillingAgent !== false;

  if (status === "active" && !selectedAgentId && !fallbackToBillingAgent) {
    return { ok: false, error: "Fluxo ativo precisa de agente escolhido ou fallback para agente global." };
  }

  return {
    ok: true,
    automation: {
      id: id ?? undefined,
      name,
      description: readString(record.description)?.slice(0, 400) ?? "",
      eventType,
      channel: record.channel === "in_app" ? "in_app" : "whatsapp",
      status,
      selectedAgentId,
      fallbackToBillingAgent,
      audienceType: readAudience(record.audienceType),
      conditions: normalizeConditions(record.conditions),
      triggerConfig: readRecord(record.triggerConfig) ?? {},
      messageTemplate: normalizeAutomationMessageTemplate(
        record.messageTemplate,
        getDefaultAutomationTemplate(eventType),
      ),
      delayMinutes: clampInteger(record.delayMinutes, 0, 43200, 0),
      cooldownMinutes: clampInteger(record.cooldownMinutes, 0, 43200, 0),
      maxSendsPerContact: clampInteger(record.maxSendsPerContact, 0, 100, 1),
      priority: clampInteger(record.priority, 0, 10000, 100),
      labels: readStringList(record.labels).slice(0, 12),
    },
  };
}

async function validateAutomationAgentSelection(client: SupabaseClient, payload: AutomationPayload) {
  if (!payload.selectedAgentId) {
    return { ok: true as const };
  }

  return validateConnectedPlatformAutomationAgent(client, payload.selectedAgentId);
}

async function writeAutomationAudit(
  client: SupabaseClient,
  input: {
    actorId: string;
    eventType: string;
    targetId: string;
    metadata: JsonRecord;
  },
) {
  await client.from("maintenance_audit_logs").insert({
    actor_id: input.actorId,
    event_type: input.eventType,
    target_table: "platform_automation_flows",
    target_id: input.targetId,
    metadata: input.metadata,
  });
}

function revalidateAutomationPaths() {
  revalidatePath("/admin/automacoes");
  revalidatePath("/admin/financeiro");
}

function normalizeConditions(value: unknown) {
  const record = readRecord(value) ?? {};
  const conditions: JsonRecord = {};
  const planCodes = readStringList(record.plan_codes ?? record.planCodes);

  if (planCodes.length > 0) {
    conditions.plan_codes = planCodes;
  }

  for (const key of [
    "min_balance_credits",
    "max_balance_credits",
    "min_used_credits",
    "max_used_credits",
    "min_milestone_credits",
    "max_milestone_credits",
    "milestone_step_credits",
  ]) {
    const valueForKey = clampOptionalInteger(record[key], 0, 1_000_000_000);

    if (valueForKey !== null) {
      conditions[key] = valueForKey;
    }
  }

  return conditions;
}

function readEventType(value: unknown) {
  const eventType = readString(value);

  if (!eventType) {
    return null;
  }

  return PLATFORM_AUTOMATION_EVENT_DEFINITIONS.some((definition) => definition.eventType === eventType)
    ? eventType
    : null;
}

function readAutomationStatus(value: unknown): PlatformAutomationStatus {
  return value === "active" || value === "paused" || value === "draft" || value === "archived"
    ? value
    : "draft";
}

function readAudience(value: unknown): PlatformAutomationAudience {
  return value === "trial_users" || value === "paid_users" || value === "custom"
    ? value
    : "all_clients";
}

function buildCustomFlowKey(name: string, eventType: string) {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "automacao";
  return `custom_${eventType}_${slug}_${randomUUID().slice(0, 8)}`;
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readUuid(value: unknown) {
  return typeof value === "string" && isUuid(value.trim()) ? value.trim() : null;
}

function readNullableUuid(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return readUuid(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function clampOptionalInteger(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.min(max, Math.max(min, Math.trunc(number)));
}
