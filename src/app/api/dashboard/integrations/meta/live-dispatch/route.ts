import { NextResponse, type NextRequest } from "next/server";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { logIntegrationAction } from "@/lib/client-os/guided-oauth";
import {
  buildMetaSocialDispatchLiveActivation,
  metaSocialDispatchLiveChannels,
  type MetaSocialDispatchLiveChannelDraft,
} from "@/lib/meta/social-dispatch-policy";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

type IntegrationRow = {
  id: string;
  organization_id: string;
  status: string | null;
  connection_label: string | null;
  external_account_label: string | null;
  scopes: string[] | null;
  metadata: JsonRecord | null;
};

export async function POST(request: NextRequest) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    return NextResponse.json({ error: "Sessao obrigatoria." }, { status: 401 });
  }

  const body = await readJson(request);
  const companyId = readString(body?.companyId);

  if (!companyId) {
    return NextResponse.json({ error: "Informe a empresa." }, { status: 400 });
  }

  const client = createServiceClient();

  try {
    const company = await requireClientCompanyAccess({
      userId: workspace.user.id,
      companyId,
      client,
    });

    if (!["owner", "admin"].includes(company.role)) {
      return NextResponse.json({ error: "Somente dono ou admin da empresa pode ativar envio live Meta." }, { status: 403 });
    }

    const { data: integration, error: integrationError } = await client
      .from("organization_integrations")
      .select("id, organization_id, status, connection_label, external_account_label, scopes, metadata")
      .eq("organization_id", company.id)
      .eq("provider_id", "meta-ads")
      .maybeSingle<IntegrationRow>();

    if (integrationError) {
      throw new Error(integrationError.message);
    }

    if (!integration || integration.status !== "connected") {
      return NextResponse.json({ error: "Conecte a integracao Meta antes de ativar envio live." }, { status: 404 });
    }

    const metadata = readRecord(integration.metadata);
    const now = new Date().toISOString();
    const activation = buildMetaSocialDispatchLiveActivation({
      appLiveModeConfirmed: readOptionalBoolean(body?.appLiveModeConfirmed ?? body?.app_live_mode_confirmed),
      channels: readChannelDraft(body?.channels),
      metadata,
      scopes: integration.scopes,
      updatedAt: now,
      updatedBy: workspace.user.id,
    });
    const nextMetadata = {
      ...metadata,
      meta_social_dispatch_activation: activation,
    };
    const lastError = activation.blockedChannels > 0
      ? `Ativacao social Meta com ${activation.blockedChannels} canal(is) bloqueado(s).`
      : null;

    const { error: updateError } = await client
      .from("organization_integrations")
      .update({
        last_error: lastError,
        last_sync_at: now,
        last_test_at: now,
        metadata: nextMetadata,
        status: "connected",
        updated_at: now,
      })
      .eq("id", integration.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    await logIntegrationAction({
      client,
      organizationId: company.id,
      organizationIntegrationId: integration.id,
      providerId: "meta-ads",
      actorId: workspace.user.id,
      action: "meta.social_dispatch.live_activation.updated",
      status: activation.blockedChannels > 0 ? "warning" : "success",
      metadata: {
        activation,
        enabled_channels: activation.enabledChannels,
        ready_channels: activation.readyChannels,
        blocked_channels: activation.blockedChannels,
      },
    });

    return NextResponse.json({
      activation,
      connection: {
        providerId: "meta-ads",
        companyId: company.id,
        companyName: company.name,
        status: "connected",
        label: integration.connection_label ?? "Meta conectado",
        detail: buildConnectionDetail(activation.status, now),
        accountLabel: integration.external_account_label,
        lastSyncAt: now,
        lastError,
        managementHref: null,
        metadata: nextMetadata,
      },
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Nao foi possivel salvar a ativacao live Meta.",
    }, { status: readErrorStatus(error) });
  }
}

async function readJson(request: NextRequest): Promise<JsonRecord | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
  } catch {
    return null;
  }
}

function readChannelDraft(value: unknown): MetaSocialDispatchLiveChannelDraft {
  const record = readRecord(value);
  const draft: MetaSocialDispatchLiveChannelDraft = {};

  for (const channel of metaSocialDispatchLiveChannels) {
    if (record && Object.prototype.hasOwnProperty.call(record, channel)) {
      draft[channel] = record[channel] === true;
    }
  }

  return draft;
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function buildConnectionDetail(status: string, now: string) {
  const label = status === "ready"
    ? "envio live pronto"
    : status === "partially_ready"
      ? "envio live parcial"
      : status === "blocked"
        ? "envio live bloqueado"
        : "envio live desligado";

  return `Meta ${label} em ${formatDateTime(now)}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function readErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.startsWith("Somente dono ou admin")) {
    return 403;
  }

  return 400;
}
