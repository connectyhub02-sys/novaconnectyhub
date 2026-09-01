import { NextResponse, type NextRequest } from "next/server";
import {
  createPagBankThreeDSSession,
  ensurePagBankAccessToken,
  ensurePagBankCardPublicKey,
  loadPagBankPlatformBillingConfig,
} from "@/lib/sales-catalog/pagbank";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type PaymentSessionRow = {
  id: string;
  organization_id: string;
  provider: string | null;
  status: string | null;
  payment_owner_type?: string | null;
  metadata: JsonRecord | null;
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await context.params;
  const client = createServiceClient();
  const { data: session, error } = await client
    .from("sales_catalog_payment_sessions")
    .select("id, organization_id, provider, status, payment_owner_type, metadata")
    .eq("id", sessionId)
    .maybeSingle<PaymentSessionRow>();

  if (error || !session) {
    return NextResponse.json({ error: "Sessao de pagamento nao encontrada." }, { status: 404 });
  }

  if (session.provider !== "pagbank") {
    return NextResponse.json({ error: "Este checkout nao usa PagBank." }, { status: 409 });
  }

  if (session.status === "approved" || session.status === "refunded") {
    return NextResponse.json({ error: "Este pagamento ja foi finalizado." }, { status: 409 });
  }

  try {
    const owner = resolvePaymentOwner(session);
    const credentials = owner === "connectyhub"
      ? await loadPlatformCredentials(client)
      : await loadSellerCredentials(client, session.organization_id);
    const [{ publicKey, source }, threeDSSession] = await Promise.all([
      ensurePagBankCardPublicKey({
        accessToken: credentials.accessToken,
        mode: credentials.mode,
        apiBaseUrl: credentials.apiBaseUrl,
        configuredPublicKey: credentials.publicKey,
      }),
      createPagBankThreeDSSession({
        accessToken: credentials.accessToken,
        sessionUrl: credentials.threeDSSessionUrl,
      }),
    ]);

    await client.from("maintenance_audit_logs").insert({
      event_type: "pagbank.checkout.card_session.created",
      target_table: "sales_catalog_payment_sessions",
      target_id: session.id,
      metadata: {
        organization_id: session.organization_id,
        payment_owner: owner,
        public_key_source: source,
        sdk_environment: credentials.sdkEnvironment,
      },
    });

    return NextResponse.json({
      ok: true,
      provider: "pagbank",
      publicKey,
      threeDSSession,
      sdkEnvironment: credentials.sdkEnvironment,
      mode: credentials.mode,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Nao foi possivel preparar o cartao PagBank.",
    }, { status: 400 });
  }
}

async function loadPlatformCredentials(client: ReturnType<typeof createServiceClient>) {
  const config = await loadPagBankPlatformBillingConfig({ client });

  return {
    accessToken: config.accessToken,
    mode: config.mode,
    apiBaseUrl: config.apiBaseUrl,
    publicKey: config.publicKey,
    threeDSSessionUrl: config.threeDSSessionUrl,
    sdkEnvironment: config.sdkEnvironment,
  };
}

async function loadSellerCredentials(
  client: ReturnType<typeof createServiceClient>,
  organizationId: string,
) {
  const integration = await ensurePagBankAccessToken({ client, organizationId });
  const mode = integration.mode;

  return {
    accessToken: integration.accessToken,
    mode,
    apiBaseUrl: null,
    publicKey: null,
    threeDSSessionUrl: mode === "sandbox"
      ? "https://sandbox.sdk.pagseguro.com/checkout-sdk/sessions"
      : "https://sdk.pagseguro.com/checkout-sdk/sessions",
    sdkEnvironment: mode === "sandbox" ? "SANDBOX" as const : "PROD" as const,
  };
}

function resolvePaymentOwner(session: PaymentSessionRow) {
  const metadata = readRecord(session.metadata);
  const owner = readString(session.payment_owner_type)
    ?? readString(metadata.payment_owner)
    ?? readString(metadata.payment_receiver);

  return owner === "connectyhub" ? "connectyhub" : "seller";
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
