import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyMercadoPagoWebhookSignature } from "@/lib/sales-catalog/mercado-pago";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type BillingWebhookCredentialRow = {
  encrypted_value: string | null;
};

export async function POST(request: NextRequest) {
  const client = createServiceClient();
  const payload = readRecord(await request.json().catch(() => null));
  const dataRecord = readRecord(payload.data);
  const dataId = request.nextUrl.searchParams.get("data.id")
    ?? readString(dataRecord.id)
    ?? request.nextUrl.searchParams.get("id");
  const eventType = readString(payload.type) ?? request.nextUrl.searchParams.get("type");
  const action = readString(payload.action);
  const providerEventId = readString(payload.id);
  const signatureHeader = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");
  const webhookSecret = await loadBillingWebhookSecret(client);

  const signature = verifyMercadoPagoWebhookSignature({
    signatureHeader,
    requestId,
    dataId,
    secret: webhookSecret,
  });

  if (!signature.ok) {
    await recordBillingWebhookAudit(client, {
      providerEventId,
      dataId,
      eventType,
      action,
      requestId,
      processingStatus: "failed",
      errorMessage: "Assinatura Mercado Pago billing invalida.",
      payload,
    });

    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  await recordBillingWebhookAudit(client, {
    providerEventId,
    dataId,
    eventType,
    action,
    requestId,
    processingStatus: "received",
    errorMessage: signature.skipped ? "Assinatura nao configurada; evento aceito para auditoria." : null,
    payload,
  });

  return NextResponse.json({
    ok: true,
    received: true,
    processing: "platform_billing_pipeline_pending",
  });
}

async function loadBillingWebhookSecret(client: SupabaseClient) {
  const { data } = await client
    .from("integration_credentials")
    .select("encrypted_value")
    .eq("scope", "platform")
    .eq("integration_id", "mercado-pago-billing")
    .is("organization_id", null)
    .eq("env_name", "MERCADO_PAGO_BILLING_WEBHOOK_SECRET")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<BillingWebhookCredentialRow>();

  if (data?.encrypted_value) {
    try {
      const decrypted = decryptCredentialValue(data.encrypted_value);

      if (decrypted.trim()) {
        return decrypted.trim();
      }
    } catch {
      // If the vault cannot be decrypted in this runtime, fall back to env vars below.
    }
  }

  return process.env.MERCADO_PAGO_BILLING_WEBHOOK_SECRET?.trim() || null;
}

async function recordBillingWebhookAudit(
  client: SupabaseClient,
  input: {
    providerEventId: string | null;
    dataId: string | null;
    eventType: string | null;
    action: string | null;
    requestId: string | null;
    processingStatus: "received" | "failed";
    errorMessage: string | null;
    payload: JsonRecord;
  },
) {
  await client.from("maintenance_audit_logs").insert({
    event_type: "billing.mercado_pago.webhook",
    target_table: "billing_payments",
    metadata: {
      provider: "mercado_pago",
      providerEventId: input.providerEventId,
      dataId: input.dataId,
      eventType: input.eventType,
      action: input.action,
      requestId: input.requestId,
      processingStatus: input.processingStatus,
      errorMessage: input.errorMessage,
      payload: input.payload,
    },
  });
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
