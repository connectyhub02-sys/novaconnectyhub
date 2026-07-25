import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizePlatformBillingMessageTemplates,
  type PlatformBillingMessageTemplates,
} from "@/lib/billing/platform-billing-messages";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type SettingsPayload = {
  billingWhatsappAgentId: string | null;
  notificationWhatsappEnabled: boolean;
  pixAutomaticRequired: boolean;
  checkoutMode: "subscription" | "manual_review";
  billingMessageTemplates: PlatformBillingMessageTemplates | null;
};

export async function PATCH(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const parsed = parseSettingsPayload(await request.json().catch(() => null));

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const client = createServiceClient();

  if (parsed.settings.billingWhatsappAgentId) {
    const agentCheck = await validateConnectedBillingAgent(client, parsed.settings.billingWhatsappAgentId);

    if (!agentCheck.ok) {
      return NextResponse.json({ error: agentCheck.error }, { status: 422 });
    }
  }

  const currentMetadata = await loadCurrentSettingsMetadata(client);
  const billingMessageTemplates = parsed.settings.billingMessageTemplates
    ?? normalizePlatformBillingMessageTemplates(currentMetadata.billing_message_templates);
  const { data, error } = await client
    .from("platform_billing_settings")
    .upsert(
      {
        setting_key: "default",
        billing_whatsapp_agent_id: parsed.settings.billingWhatsappAgentId,
        notification_whatsapp_enabled: parsed.settings.notificationWhatsappEnabled,
        pix_automatic_required: parsed.settings.pixAutomaticRequired,
        checkout_mode: parsed.settings.checkoutMode,
        recurring_provider: "mercado_pago",
        updated_by: auth.userId,
        metadata: {
          ...currentMetadata,
          billing_message_templates: billingMessageTemplates,
          source: "admin_billing_phase_1",
          updated_from: "platform_settings_route",
        },
      },
      { onConflict: "setting_key" },
    )
    .select("setting_key, billing_whatsapp_agent_id, notification_whatsapp_enabled, pix_automatic_required, checkout_mode, recurring_provider, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await client.from("maintenance_audit_logs").insert({
    actor_id: auth.userId,
    event_type: "billing.platform_settings.updated",
    target_table: "platform_billing_settings",
    target_id: null,
    metadata: {
      billingWhatsappAgentId: parsed.settings.billingWhatsappAgentId,
      notificationWhatsappEnabled: parsed.settings.notificationWhatsappEnabled,
      pixAutomaticRequired: parsed.settings.pixAutomaticRequired,
      checkoutMode: parsed.settings.checkoutMode,
      billingMessageTemplatesUpdated: Boolean(parsed.settings.billingMessageTemplates),
    },
  });

  revalidatePath("/admin/financeiro");

  return NextResponse.json({ settings: data });
}

function parseSettingsPayload(body: unknown):
  | { ok: true; settings: SettingsPayload }
  | { ok: false; error: string } {
  const record = readRecord(body);

  if (!record) {
    return { ok: false, error: "Payload invalido." };
  }

  const billingWhatsappAgentId = readNullableUuid(record.billingWhatsappAgentId);
  const checkoutMode = record.checkoutMode === "manual_review" ? "manual_review" : "subscription";
  const billingMessageTemplates = Object.prototype.hasOwnProperty.call(record, "billingMessageTemplates")
    ? normalizePlatformBillingMessageTemplates(record.billingMessageTemplates)
    : null;

  if (record.billingWhatsappAgentId !== null && record.billingWhatsappAgentId !== undefined && !billingWhatsappAgentId) {
    return { ok: false, error: "Escolha um agente valido." };
  }

  return {
    ok: true,
    settings: {
      billingWhatsappAgentId,
      notificationWhatsappEnabled: record.notificationWhatsappEnabled !== false,
      pixAutomaticRequired: record.pixAutomaticRequired !== false,
      checkoutMode,
      billingMessageTemplates,
    },
  };
}

async function validateConnectedBillingAgent(client: SupabaseClient, agentId: string):
  Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: agent, error: agentError } = await client
    .from("agent_registry")
    .select("id")
    .eq("id", agentId)
    .eq("scope", "platform")
    .is("organization_id", null)
    .neq("status", "archived")
    .contains("metadata", { admin_whatsapp: true, agent_kind: "whatsapp" })
    .maybeSingle<{ id: string }>();

  if (agentError) {
    return { ok: false, error: `Nao foi possivel validar o agente: ${agentError.message}` };
  }

  if (!agent) {
    return { ok: false, error: "Escolha um agente WhatsApp interno da ConnectyHub." };
  }

  const { data: instance, error: instanceError } = await client
    .from("whatsapp_instances")
    .select("id")
    .eq("status", "connected")
    .contains("metadata", { admin_whatsapp: true, platform_whatsapp: true, agent_id: agentId })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (instanceError) {
    return { ok: false, error: `Nao foi possivel validar o WhatsApp do agente: ${instanceError.message}` };
  }

  if (!instance) {
    return { ok: false, error: "Escolha um agente com WhatsApp conectado para enviar mensagens de cobranca." };
  }

  return { ok: true };
}

async function loadCurrentSettingsMetadata(client: SupabaseClient) {
  const { data } = await client
    .from("platform_billing_settings")
    .select("metadata")
    .eq("setting_key", "default")
    .maybeSingle<{ metadata: JsonRecord | null }>();

  return data?.metadata ?? {};
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function readNullableUuid(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const input = value.trim();

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input)
    ? input
    : null;
}
