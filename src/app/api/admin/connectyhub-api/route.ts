import { NextResponse, type NextRequest } from "next/server";
import {
  adoptAdminProviderInstance,
  createAdminApiClient,
  createAdminApiKey,
  createAdminWebhookEndpoint,
  deleteAdminGatewayInstance,
  formatGatewayError,
  getAdminGatewayState,
  getAdminGatewayMigrationCredential,
  type GatewayMigrationCredentialKind,
  retryAdminWebhookDelivery,
  testAdminWebhookEndpoint,
} from "@/lib/connectyhub-api/gateway";
import { requirePlatformAdmin } from "@/lib/supabase/admin-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ActionBody = {
  action?: unknown;
  organizationId?: unknown;
  clientId?: unknown;
  name?: unknown;
  contactEmail?: unknown;
  planCode?: unknown;
  providerInstanceId?: unknown;
  instanceId?: unknown;
  webhookId?: unknown;
  deliveryId?: unknown;
  url?: unknown;
  description?: unknown;
  events?: unknown;
  scopes?: unknown;
  credential?: unknown;
};

export async function GET() {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  try {
    const state = await getAdminGatewayState(createServiceClient());
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    const formatted = formatGatewayError(error);
    return NextResponse.json(formatted.body, { status: formatted.status });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin();

  if (auth instanceof NextResponse) {
    return auth;
  }

  const body = await readJson<ActionBody>(request);
  const action = asString(body?.action);
  const client = createServiceClient();

  try {
    if (action === "create_client") {
      const apiClient = await createAdminApiClient({
        organizationId: asString(body?.organizationId) ?? "",
        name: asString(body?.name) ?? "",
        contactEmail: asString(body?.contactEmail),
        planCode: asString(body?.planCode),
        actorId: auth.userId,
        client,
      });

      return NextResponse.json({ ok: true, apiClient });
    }

    if (action === "create_key") {
      const result = await createAdminApiKey({
        clientId: asString(body?.clientId) ?? "",
        name: asString(body?.name) ?? "Chave principal",
        scopes: Array.isArray(body?.scopes) ? body.scopes.filter((item): item is string => typeof item === "string") : undefined,
        actorId: auth.userId,
        client,
      });

      return NextResponse.json({ ok: true, apiKey: result.apiKey, secret: result.secret });
    }

    if (action === "create_webhook") {
      const result = await createAdminWebhookEndpoint({
        clientId: asString(body?.clientId) ?? "",
        url: asString(body?.url) ?? "",
        description: asString(body?.description),
        events: Array.isArray(body?.events) ? body.events.filter((item): item is string => typeof item === "string") : undefined,
        actorId: auth.userId,
        client,
      });

      return NextResponse.json({ ok: true, endpoint: result.endpoint, secret: result.secret });
    }

    if (action === "adopt_instance") {
      const instance = await adoptAdminProviderInstance({
        clientId: asString(body?.clientId) ?? "",
        providerInstanceId: asString(body?.providerInstanceId) ?? "",
        actorId: auth.userId,
        client,
      });

      return NextResponse.json({ ok: true, instance });
    }

    if (action === "test_webhook") {
      const result = await testAdminWebhookEndpoint({
        clientId: asString(body?.clientId) ?? "",
        webhookId: asString(body?.webhookId) ?? "",
        actorId: auth.userId,
        client,
      });

      return NextResponse.json({ ok: true, result });
    }

    if (action === "retry_delivery") {
      const result = await retryAdminWebhookDelivery({
        deliveryId: asString(body?.deliveryId) ?? "",
        client,
      });

      return NextResponse.json({ ok: true, result });
    }

    if (action === "delete_instance") {
      const result = await deleteAdminGatewayInstance({
        instanceId: asString(body?.instanceId) ?? "",
        actorId: auth.userId,
        client,
      });

      return NextResponse.json({ ok: true, result }, { status: result.providerDeleted ? 200 : 202 });
    }

    if (action === "copy_migration_credential") {
      const credential = asMigrationCredentialKind(body?.credential);

      if (!credential) {
        return NextResponse.json({ ok: false, error: { code: "invalid_credential", message: "Credencial de migracao invalida." } }, { status: 422 });
      }

      const result = await getAdminGatewayMigrationCredential({
        instanceId: asString(body?.instanceId) ?? "",
        actorId: auth.userId,
        credential,
        client,
      });

      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ ok: false, error: { code: "invalid_action", message: "Acao invalida." } }, { status: 422 });
  } catch (error) {
    const formatted = formatGatewayError(error);
    return NextResponse.json(formatted.body, { status: formatted.status });
  }
}

async function readJson<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asMigrationCredentialKind(value: unknown): GatewayMigrationCredentialKind | null {
  if (value === "serverUrl" || value === "instanceToken") {
    return value;
  }

  return null;
}
