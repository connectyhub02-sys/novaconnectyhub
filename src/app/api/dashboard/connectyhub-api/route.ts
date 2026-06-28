import { NextResponse, type NextRequest } from "next/server";
import {
  createClientApiKey,
  createClientWebhookEndpoint,
  deleteClientGatewayInstance,
  ensureClientApiClient,
  formatGatewayError,
  getClientGatewayState,
  retryClientWebhookDelivery,
  revokeClientApiKey,
  testClientWebhookEndpoint,
  updateClientWebhookEndpointStatus,
} from "@/lib/connectyhub-api/gateway";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureStarterOrganization, getCurrentWorkspace, type CurrentOrganization } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ActionBody = {
  action?: unknown;
  clientId?: unknown;
  keyId?: unknown;
  webhookId?: unknown;
  deliveryId?: unknown;
  instanceId?: unknown;
  name?: unknown;
  url?: unknown;
  description?: unknown;
  events?: unknown;
  status?: unknown;
};

type WorkspaceContext = {
  userId: string;
  email: string | null;
  organization: CurrentOrganization;
  canManage: boolean;
};

export async function GET() {
  const context = await requireWorkspaceContext();

  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const client = createServiceClient();
    await ensureClientApiClient({
      organizationId: context.organization.id,
      organizationName: context.organization.name,
      organizationSlug: context.organization.slug,
      contactEmail: context.email,
      actorId: context.userId,
      client,
    });

    const state = await getClientGatewayState({
      organizationId: context.organization.id,
      client,
    });

    return NextResponse.json({ ok: true, state, canManage: context.canManage });
  } catch (error) {
    const formatted = formatGatewayError(error);
    return NextResponse.json(formatted.body, { status: formatted.status });
  }
}

export async function POST(request: NextRequest) {
  const context = await requireWorkspaceContext();

  if (context instanceof NextResponse) {
    return context;
  }

  if (!context.canManage) {
    return NextResponse.json(
      { ok: false, error: { code: "workspace_admin_required", message: "Apenas owner/admin do workspace pode alterar a API WhatsApp." } },
      { status: 403 },
    );
  }

  const body = await readJson<ActionBody>(request);
  const action = asString(body?.action);
  const client = createServiceClient();

  try {
    if (action === "ensure_client") {
      const apiClient = await ensureClientApiClient({
        organizationId: context.organization.id,
        organizationName: context.organization.name,
        organizationSlug: context.organization.slug,
        contactEmail: context.email,
        actorId: context.userId,
        client,
      });

      return NextResponse.json({ ok: true, apiClient });
    }

    if (action === "create_key") {
      const apiClient = await ensureApiClientForAction({
        context,
        client,
        requestedClientId: asString(body?.clientId),
      });
      const result = await createClientApiKey({
        organizationId: context.organization.id,
        clientId: apiClient.id,
        name: asString(body?.name) ?? "Producao",
        actorId: context.userId,
        client,
      });

      return NextResponse.json({ ok: true, apiKey: result.apiKey, secret: result.secret });
    }

    if (action === "revoke_key") {
      const apiKey = await revokeClientApiKey({
        organizationId: context.organization.id,
        keyId: asString(body?.keyId) ?? "",
        client,
      });

      return NextResponse.json({ ok: true, apiKey });
    }

    if (action === "create_webhook") {
      const apiClient = await ensureApiClientForAction({
        context,
        client,
        requestedClientId: asString(body?.clientId),
      });
      const result = await createClientWebhookEndpoint({
        organizationId: context.organization.id,
        clientId: apiClient.id,
        url: asString(body?.url) ?? "",
        description: asString(body?.description),
        events: parseEvents(body?.events),
        actorId: context.userId,
        client,
      });

      return NextResponse.json({ ok: true, endpoint: result.endpoint, secret: result.secret });
    }

    if (action === "set_webhook_status") {
      const status = asWebhookStatus(body?.status);
      const endpoint = await updateClientWebhookEndpointStatus({
        organizationId: context.organization.id,
        webhookId: asString(body?.webhookId) ?? "",
        status,
        client,
      });

      return NextResponse.json({ ok: true, endpoint });
    }

    if (action === "test_webhook") {
      const result = await testClientWebhookEndpoint({
        organizationId: context.organization.id,
        webhookId: asString(body?.webhookId) ?? "",
        actorId: context.userId,
        client,
      });

      return NextResponse.json({ ok: true, result });
    }

    if (action === "retry_delivery") {
      const result = await retryClientWebhookDelivery({
        organizationId: context.organization.id,
        deliveryId: asString(body?.deliveryId) ?? "",
        client,
      });

      return NextResponse.json({ ok: true, result });
    }

    if (action === "delete_instance") {
      const result = await deleteClientGatewayInstance({
        organizationId: context.organization.id,
        instanceId: asString(body?.instanceId) ?? "",
        actorId: context.userId,
        client,
      });

      return NextResponse.json({ ok: true, result }, { status: result.providerDeleted ? 200 : 202 });
    }

    return NextResponse.json({ ok: false, error: { code: "invalid_action", message: "Acao invalida." } }, { status: 422 });
  } catch (error) {
    const formatted = formatGatewayError(error);
    return NextResponse.json(formatted.body, { status: formatted.status });
  }
}

async function requireWorkspaceContext(): Promise<WorkspaceContext | NextResponse> {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ ok: false, error: { code: "unauthenticated", message: "Faca login para acessar a API WhatsApp." } }, { status: 401 });
  }

  const organization = workspace.organization ?? await ensureStarterOrganization();

  if (!organization) {
    return NextResponse.json(
      { ok: false, error: { code: "missing_workspace", message: "Cadastre uma empresa antes de ativar a API WhatsApp." } },
      { status: 422 },
    );
  }

  return {
    userId: workspace.user.id,
    email: workspace.profile.email,
    organization,
    canManage: workspace.profile.isPlatformAdmin || isOrganizationManager(organization.role),
  };
}

async function ensureApiClientForAction(input: {
  context: WorkspaceContext;
  client: ReturnType<typeof createServiceClient>;
  requestedClientId: string | null;
}) {
  if (input.requestedClientId) {
    return {
      id: input.requestedClientId,
    };
  }

  return ensureClientApiClient({
    organizationId: input.context.organization.id,
    organizationName: input.context.organization.name,
    organizationSlug: input.context.organization.slug,
    contactEmail: input.context.email,
    actorId: input.context.userId,
    client: input.client,
  });
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

function parseEvents(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return undefined;
}

function asWebhookStatus(value: unknown): "active" | "paused" | "archived" {
  if (value === "active" || value === "paused" || value === "archived") {
    return value;
  }

  return "paused";
}

function isOrganizationManager(role: string) {
  return role === "owner" || role === "admin";
}
