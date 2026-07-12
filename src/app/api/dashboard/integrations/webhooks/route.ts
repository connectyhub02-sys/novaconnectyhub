import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type WebhookEndpointRow = {
  id: string;
  organization_id: string;
  provider_id: string;
  label: string | null;
  status: string | null;
  url_path: string | null;
  events: string[] | null;
  received_count: number | null;
  last_received_at: string | null;
  last_error: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export async function GET(request: NextRequest) {
  const auth = await requireWorkspace();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const companyId = request.nextUrl.searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ error: "Informe a empresa." }, { status: 400 });
  }

  const client = createServiceClient();

  try {
    const company = await requireClientCompanyAccess({ userId: auth.workspace.user.id, companyId, client });
    const { data, error } = await client
      .from("integration_webhook_endpoints")
      .select("id, organization_id, provider_id, label, status, url_path, events, received_count, last_received_at, last_error, created_at, updated_at")
      .eq("organization_id", company.id)
      .order("created_at", { ascending: false });

    if (error) {
      return schemaError(error.message);
    }

    return NextResponse.json({
      endpoints: ((data ?? []) as WebhookEndpointRow[]).map((row) => mapEndpoint(row)),
    });
  } catch (error) {
    return NextResponse.json({ error: readErrorMessage(error, "Nao foi possivel carregar webhooks.") }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireWorkspace();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await readJson(request);
  const companyId = readString(body?.companyId);
  const label = readString(body?.label) ?? "Webhook Universal";
  const events = normalizeEvents(body?.events);

  if (!companyId) {
    return NextResponse.json({ error: "Informe a empresa." }, { status: 400 });
  }

  const client = createServiceClient();

  try {
    const company = await requireClientCompanyAccess({ userId: auth.workspace.user.id, companyId, client });

    if (!["owner", "admin"].includes(company.role)) {
      return NextResponse.json({ error: "Somente dono ou admin da empresa pode criar webhooks." }, { status: 403 });
    }

    const now = new Date().toISOString();
    const endpointId = randomUUID();
    const urlPath = `/api/webhooks/universal/${endpointId}`;
    const secret = createWebhookSecret();

    const providerResult = await client.from("integration_providers").upsert({
      id: "webhook-universal",
      name: "Webhook Universal",
      category: "webhooks",
      status: "active",
      mode: "hybrid",
      auth_type: "webhook_secret",
      headline: "Entrada e saida generica de eventos",
      description: "Endpoint assinado para receber leads externos e eventos customizados.",
      feature_flags: { inbound: true, outbound_future: true },
      updated_at: now,
    });

    if (providerResult.error) {
      return schemaError(providerResult.error.message);
    }

    const integrationResult = await client
      .from("organization_integrations")
      .upsert({
        organization_id: company.id,
        provider_id: "webhook-universal",
        status: "connected",
        connection_label: "Webhook Universal",
        auth_kind: "webhook_secret",
        connected_by: auth.workspace.user.id,
        connected_at: now,
        metadata: {
          source: "dashboard_integrations",
          last_endpoint_created_at: now,
        },
        updated_at: now,
      }, { onConflict: "organization_id,provider_id" })
      .select("id")
      .single<{ id: string }>();

    if (integrationResult.error || !integrationResult.data) {
      return schemaError(integrationResult.error?.message ?? "Nao foi possivel criar a conexao.");
    }

    const endpointResult = await client
      .from("integration_webhook_endpoints")
      .insert({
        id: endpointId,
        organization_id: company.id,
        organization_integration_id: integrationResult.data.id,
        provider_id: "webhook-universal",
        label,
        status: "active",
        url_path: urlPath,
        secret_hash: hashSecret(secret),
        events,
        metadata: {
          created_from: "dashboard_integrations",
        },
        created_by: auth.workspace.user.id,
      })
      .select("id, organization_id, provider_id, label, status, url_path, events, received_count, last_received_at, last_error, created_at, updated_at")
      .single<WebhookEndpointRow>();

    if (endpointResult.error || !endpointResult.data) {
      return schemaError(endpointResult.error?.message ?? "Nao foi possivel criar o endpoint.");
    }

    await client.from("integration_action_logs").insert({
      organization_id: company.id,
      organization_integration_id: integrationResult.data.id,
      provider_id: "webhook-universal",
      actor_id: auth.workspace.user.id,
      action: "webhook_endpoint.created",
      status: "success",
      metadata: {
        endpoint_id: endpointId,
        label,
      },
    });

    return NextResponse.json({
      endpoint: mapEndpoint(endpointResult.data),
      secret,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: readErrorMessage(error, "Nao foi possivel criar o Webhook Universal.") }, { status: 400 });
  }
}

async function requireWorkspace() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  return { workspace };
}

async function readJson(request: NextRequest): Promise<JsonRecord | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
  } catch {
    return null;
  }
}

function mapEndpoint(row: WebhookEndpointRow) {
  const urlPath = row.url_path ?? `/api/webhooks/universal/${row.id}`;
  const appBaseUrl = resolveAppBaseUrl();

  return {
    id: row.id,
    companyId: row.organization_id,
    providerId: row.provider_id,
    label: row.label ?? "Webhook Universal",
    status: normalizeWebhookStatus(row.status),
    urlPath,
    endpointUrl: appBaseUrl ? `${appBaseUrl}${urlPath}` : null,
    events: Array.isArray(row.events) ? row.events : [],
    receivedCount: typeof row.received_count === "number" ? row.received_count : 0,
    lastReceivedAt: row.last_received_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeWebhookStatus(status: string | null) {
  if (status === "paused" || status === "disabled") return status;
  return "active";
}

function normalizeEvents(value: unknown) {
  if (!Array.isArray(value)) {
    return ["lead.created", "order.updated", "payment.updated", "custom.event"];
  }

  const events = value
    .map((item) => readString(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 20);

  return events.length > 0 ? events : ["custom.event"];
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function createWebhookSecret() {
  const value = randomBytes(32).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `chwhsec_${value}`;
}

function hashSecret(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function resolveAppBaseUrl() {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "",
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    try {
      const url = new URL(candidate);
      return url.origin;
    } catch {
      continue;
    }
  }

  return null;
}

function schemaError(message: string) {
  return NextResponse.json({
    error: "A migration 0028_integration_hub.sql precisa ser aplicada no Supabase antes de usar Webhook Universal.",
    details: message,
  }, { status: 503 });
}

function readErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
