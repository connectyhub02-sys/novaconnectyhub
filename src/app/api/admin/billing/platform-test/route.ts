import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPlatformBillingOperationalTest } from "@/lib/billing/platform-billing-webhook";
import { loadMercadoPagoPlatformBillingConfig } from "@/lib/sales-catalog/mercado-pago";
import { loadPagBankPlatformBillingConfig } from "@/lib/sales-catalog/pagbank";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { loadUazapiCredentials } from "@/lib/whatsapp/uazapi-credentials";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type OperationalCheck = {
  key: string;
  label: string;
  status: "ok" | "warning" | "error";
  detail: string;
};

type PlatformBillingSettingsRow = {
  billing_whatsapp_agent_id: string | null;
  notification_whatsapp_enabled: boolean | null;
  pix_automatic_required: boolean | null;
  checkout_mode: string | null;
  recurring_provider: string | null;
};

type WhatsappInstanceRow = {
  id: string;
  status: string | null;
  phone_number: string | null;
  display_name: string | null;
};

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = readRecord(await request.json().catch(() => null));
  const action = readString(body?.action) ?? "health";
  const client = createServiceClient();

  if (action === "health") {
    const result = await getPlatformBillingOperationalHealth(client);

    await client.from("maintenance_audit_logs").insert({
      actor_id: auth.userId,
      event_type: "billing.platform_test.health",
      target_table: "platform_billing_settings",
      target_id: null,
      metadata: {
        ready: result.ready,
        checks: result.checks.map((check) => ({
          key: check.key,
          status: check.status,
        })),
      },
    });

    return NextResponse.json(result);
  }

  if (action === "notification") {
    const organizationId = readUuid(body?.organizationId);

    if (!organizationId) {
      return NextResponse.json({ error: "Escolha um cliente valido para receber a mensagem de teste." }, { status: 400 });
    }

    const result = await sendPlatformBillingOperationalTest(client, {
      organizationId,
      actorId: auth.userId,
    });

    await client.from("maintenance_audit_logs").insert({
      actor_id: auth.userId,
      event_type: "billing.platform_test.notification",
      target_table: "billing_notification_events",
      target_id: result.notificationId,
      metadata: {
        organizationId,
        status: result.status,
        selectedAgentId: result.selectedAgentId,
      },
    });

    revalidatePath("/admin/financeiro");

    return NextResponse.json({
      result,
      ok: result.status === "sent",
    });
  }

  return NextResponse.json({ error: "Acao de teste invalida." }, { status: 400 });
}

async function getPlatformBillingOperationalHealth(client: SupabaseClient) {
  const checks: OperationalCheck[] = [];
  const [settingsResult, pendingPaymentsResult, notificationEventsResult] = await Promise.all([
    client
      .from("platform_billing_settings")
      .select("billing_whatsapp_agent_id, notification_whatsapp_enabled, pix_automatic_required, checkout_mode, recurring_provider")
      .eq("setting_key", "default")
      .maybeSingle<PlatformBillingSettingsRow>(),
    client
      .from("billing_payments")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "in_process"]),
    client
      .from("billing_notification_events")
      .select("id", { count: "exact", head: true }),
  ]);

  if (settingsResult.error) {
    checks.push({
      key: "settings",
      label: "Configuracao de cobranca",
      status: "error",
      detail: settingsResult.error.message,
    });
  } else if (!settingsResult.data) {
    checks.push({
      key: "settings",
      label: "Configuracao de cobranca",
      status: "warning",
      detail: "Settings ainda nao foram salvas no painel financeiro.",
    });
  } else {
    checks.push({
      key: "settings",
      label: "Configuracao de cobranca",
      status: "ok",
      detail: `Checkout ${settingsResult.data.checkout_mode ?? "subscription"} com Pix Automatico ${settingsResult.data.pix_automatic_required === false ? "opcional" : "obrigatorio"}.`,
    });
  }

  const settings = settingsResult.data ?? null;
  const selectedAgentId = settings?.billing_whatsapp_agent_id ?? null;

  if (!selectedAgentId) {
    checks.push({
      key: "billing_agent",
      label: "Agente de cobranca",
      status: "warning",
      detail: "Nenhum agente foi escolhido para avisos de pagamento.",
    });
  } else {
    const instanceCheck = await loadSelectedAgentInstance(client, selectedAgentId);

    if (!instanceCheck.ok) {
      checks.push({
        key: "billing_agent",
        label: "Agente de cobranca",
        status: "error",
        detail: instanceCheck.error,
      });
    } else if (!instanceCheck.instance) {
      checks.push({
        key: "billing_agent",
        label: "Agente de cobranca",
        status: "error",
        detail: "Agente escolhido nao tem WhatsApp conectado.",
      });
    } else {
      checks.push({
        key: "billing_agent",
        label: "Agente de cobranca",
        status: "ok",
        detail: `${instanceCheck.instance.display_name ?? "Agente"} conectado${instanceCheck.instance.phone_number ? ` em ${maskPhone(instanceCheck.instance.phone_number)}` : ""}.`,
      });
    }
  }

  const billingProvider = settings?.recurring_provider === "mercado_pago" ? "mercado_pago" : "pagbank";

  try {
    const config = billingProvider === "pagbank"
      ? await loadPagBankPlatformBillingConfig({ client })
      : await loadMercadoPagoPlatformBillingConfig({ client });
    const providerLabel = billingProvider === "pagbank" ? "PagBank" : "Mercado Pago";
    checks.push({
      key: billingProvider,
      label: `${providerLabel} billing`,
      status: "ok",
      detail: `Credenciais carregadas em modo ${config.mode}.`,
    });
  } catch (error) {
    const providerLabel = billingProvider === "pagbank" ? "PagBank" : "Mercado Pago";
    checks.push({
      key: billingProvider,
      label: `${providerLabel} billing`,
      status: "error",
      detail: readErrorMessage(error, `Credenciais de cobranca ${providerLabel} incompletas.`),
    });
  }

  try {
    await loadUazapiCredentials(client);

    checks.push({
      key: "uazapi",
      label: "Envio WhatsApp",
      status: settings?.notification_whatsapp_enabled === false ? "warning" : "ok",
      detail: settings?.notification_whatsapp_enabled === false
        ? "Uazapi configurado, mas avisos de billing estao desativados."
        : "Uazapi configurado para enviar mensagens.",
    });
  } catch (error) {
    checks.push({
      key: "uazapi",
      label: "Envio WhatsApp",
      status: "error",
      detail: readErrorMessage(error, "Credenciais Uazapi incompletas."),
    });
  }

  checks.push({
    key: "pending_payments",
    label: "Checkouts pendentes",
    status: pendingPaymentsResult.error ? "error" : "ok",
    detail: pendingPaymentsResult.error
      ? pendingPaymentsResult.error.message
      : `${pendingPaymentsResult.count ?? 0} pagamento(s) aguardando webhook.`,
  });

  checks.push({
    key: "notification_queue",
    label: "Fila de notificacoes",
    status: notificationEventsResult.error ? "error" : "ok",
    detail: notificationEventsResult.error
      ? notificationEventsResult.error.message
      : `${notificationEventsResult.count ?? 0} evento(s) registrados na fila.`,
  });

  return {
    ready: checks.every((check) => check.status === "ok"),
    checks,
  };
}

async function loadSelectedAgentInstance(client: SupabaseClient, agentId: string) {
  const { data, error } = await client
    .from("whatsapp_instances")
    .select("id, status, phone_number, display_name")
    .eq("status", "connected")
    .contains("metadata", { admin_whatsapp: true, platform_whatsapp: true, agent_id: agentId })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<WhatsappInstanceRow>();

  if (error) {
    return {
      ok: false as const,
      error: `Nao foi possivel validar WhatsApp do agente: ${error.message}`,
    };
  }

  return { ok: true as const, instance: data ?? null };
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readUuid(value: unknown) {
  const text = readString(value);

  return text && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function readErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message.trim() : fallback;
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length <= 4) {
    return "****";
  }

  return `****${digits.slice(-4)}`;
}
