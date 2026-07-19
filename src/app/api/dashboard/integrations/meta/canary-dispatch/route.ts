import { NextResponse, type NextRequest } from "next/server";
import { requireClientCompanyAccess } from "@/lib/client-os/companies";
import { logIntegrationAction } from "@/lib/client-os/guided-oauth";
import {
  buildMetaSocialCanaryProviderChatId,
  normalizeMetaSocialCanaryDraft,
} from "@/lib/meta/social-dispatch-canary-policy";
import { readMetaDispatchAudit } from "@/lib/meta/social-dispatch-audit";
import { processApprovedMetaSocialDispatch } from "@/lib/meta/social-dispatcher";
import {
  isMetaCommentChannel,
  resolveMetaSocialQueueDecision,
  resolveMetaSocialTrigger,
  type MetaSocialChannel,
} from "@/lib/meta/social-agent-policy";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

type IntegrationRow = {
  id: string;
  status: string | null;
  external_account_label: string | null;
  metadata: JsonRecord | null;
};

type AgentRow = {
  id: string;
  name: string | null;
  persona_name: string | null;
  requires_human_approval: boolean | null;
  metadata: JsonRecord | null;
};

type AgentRunRow = {
  id: string;
  run_status: string | null;
  error_message: string | null;
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
      return NextResponse.json({ error: "Somente dono ou admin da empresa pode executar canario Meta." }, { status: 403 });
    }

    const integration = await loadMetaIntegration(client, company.id);

    if (!integration || integration.status !== "connected") {
      return NextResponse.json({ error: "Conecte a integracao Meta antes de executar o canario." }, { status: 404 });
    }

    const canary = normalizeMetaSocialCanaryDraft({
      channel: body?.channel,
      occurredAt: body?.occurredAt ?? body?.occurred_at,
      replyMode: body?.replyMode ?? body?.reply_mode,
      targetId: body?.targetId ?? body?.target_id,
      text: body?.text,
    });
    const agent = await findOrganizationMultichannelAgent(client, {
      channel: canary.channel,
      organizationId: company.id,
    });

    if (!agent) {
      return NextResponse.json({ error: "Crie um agente multicanal da empresa antes de executar o canario Meta." }, { status: 404 });
    }

    const runId = await createCanaryRun(client, {
      actorId: workspace.user.id,
      agent,
      canary,
      integration,
      organizationId: company.id,
    });
    const dispatch = await processApprovedMetaSocialDispatch({ client, runId });
    const run = await loadCanaryRun(client, runId);
    const snapshot = buildCanarySnapshot({
      agent,
      canary,
      dispatch,
      run,
    });

    await saveCanarySnapshot(client, {
      integration,
      organizationId: company.id,
      snapshot,
      userId: workspace.user.id,
    });

    return NextResponse.json({
      canary: snapshot,
      connection: {
        providerId: "meta-ads",
        companyId: company.id,
        companyName: company.name,
        status: "connected",
        label: "Meta conectado",
        detail: snapshot.detail,
        accountLabel: integration.external_account_label,
        lastSyncAt: snapshot.ranAt,
        lastError: snapshot.status === "failed" ? snapshot.detail : null,
        managementHref: null,
        metadata: {
          ...(integration.metadata ?? {}),
          meta_social_dispatch_canary: snapshot,
        },
      },
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Nao foi possivel executar o canario Meta.",
    }, { status: readErrorStatus(error) });
  }
}

async function loadMetaIntegration(client: ReturnType<typeof createServiceClient>, organizationId: string) {
  const { data, error } = await client
    .from("organization_integrations")
    .select("id, status, external_account_label, metadata")
    .eq("organization_id", organizationId)
    .eq("provider_id", "meta-ads")
    .maybeSingle<IntegrationRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar integracao Meta: ${error.message}`);
  }

  return data ?? null;
}

async function findOrganizationMultichannelAgent(
  client: ReturnType<typeof createServiceClient>,
  input: {
    organizationId: string;
    channel: MetaSocialChannel;
  },
) {
  const { data, error } = await client
    .from("agent_registry")
    .select("id, name, persona_name, requires_human_approval, metadata")
    .eq("scope", "organization")
    .eq("organization_id", input.organizationId)
    .contains("metadata", { client_created: true, agent_kind: "whatsapp" })
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(`Nao foi possivel consultar agente multicanal: ${error.message}`);
  }

  const agents = (data ?? []) as AgentRow[];
  return agents.find((agent) => {
    const decision = resolveMetaSocialQueueDecision({
      channel: input.channel,
      config: readRecord(agent.metadata)?.multichannel_config,
      agentRequiresHumanApproval: agent.requires_human_approval !== false,
    });

    return decision.shouldQueue;
  }) ?? agents[0] ?? null;
}

async function createCanaryRun(
  client: ReturnType<typeof createServiceClient>,
  input: {
    actorId: string;
    agent: AgentRow;
    canary: ReturnType<typeof normalizeMetaSocialCanaryDraft>;
    integration: IntegrationRow;
    organizationId: string;
  },
) {
  const now = new Date().toISOString();
  const integrationMetadata = readRecord(input.integration.metadata) ?? {};
  const externalAccountId = resolveExternalAccountId(integrationMetadata, input.canary.channel);
  const triggerSource = resolveMetaSocialTrigger(input.canary.channel);
  const providerChatId = buildMetaSocialCanaryProviderChatId({
    channel: input.canary.channel,
    externalAccountId,
    targetId: input.canary.targetId,
  });
  const targetLabel = isMetaCommentChannel(input.canary.channel) ? "comentario" : "lead";
  const metadata = {
    provider: "meta",
    channel: input.canary.channel,
    triggerSource,
    organizationIntegrationId: input.integration.id,
    providerChatId,
    providerMessageId: `canary:${input.canary.channel}:${Date.now()}`,
    externalAccountId,
    externalUserId: input.canary.externalUserId,
    sourceCommentId: input.canary.sourceCommentId,
    direction: "outbound",
    messageType: "text",
    textContentPreview: input.canary.text,
    occurredAt: input.canary.occurredAt,
    social_agent_phase: "meta_social_canary",
    social_agent_status: "canary_prepared",
    meta_canary: true,
    meta_canary_target_label: targetLabel,
    meta_canary_reply_mode: input.canary.replyMode,
    meta_canary_requested_at: now,
    meta_canary_requested_by: input.actorId,
    channel_config: {
      allowPrivateReplies: input.canary.allowPrivateReplies,
      allowPublicReplies: input.canary.allowPublicReplies,
    },
    social_approval_status: "approved",
    social_approved_at: now,
    social_approved_by: input.actorId,
    social_approved_reply_text: input.canary.text,
    ready_for_meta_dispatch: true,
    meta_dispatch_status: "pending_adapter",
    meta_dispatch_audit: [{
      at: now,
      type: "canary_created",
      status: "pending_adapter",
      actorId: input.actorId,
      message: "Canario Meta criado no painel de integracoes.",
    }],
  };

  const { data, error } = await client
    .from("agent_runs")
    .insert({
      agent_id: input.agent.id,
      organization_id: input.organizationId,
      run_status: "completed",
      trigger_source: triggerSource,
      input_summary: `Canario Meta ${channelLabel(input.canary.channel)} para ${targetLabel}.`,
      output_summary: input.canary.text,
      cost_credits: 0,
      started_at: now,
      finished_at: now,
      metadata,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel criar execucao canario Meta.");
  }

  return data.id;
}

async function loadCanaryRun(client: ReturnType<typeof createServiceClient>, runId: string) {
  const { data, error } = await client
    .from("agent_runs")
    .select("id, run_status, error_message, metadata")
    .eq("id", runId)
    .maybeSingle<AgentRunRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar resultado do canario Meta: ${error.message}`);
  }

  return data ?? null;
}

async function saveCanarySnapshot(
  client: ReturnType<typeof createServiceClient>,
  input: {
    integration: IntegrationRow;
    organizationId: string;
    snapshot: ReturnType<typeof buildCanarySnapshot>;
    userId: string;
  },
) {
  const metadata = {
    ...(input.integration.metadata ?? {}),
    meta_social_dispatch_canary: input.snapshot,
  };
  const lastError = input.snapshot.status === "failed" ? input.snapshot.detail : null;

  await client
    .from("organization_integrations")
    .update({
      last_error: lastError,
      last_sync_at: input.snapshot.ranAt,
      last_test_at: input.snapshot.ranAt,
      metadata,
      updated_at: input.snapshot.ranAt,
    })
    .eq("id", input.integration.id);

  await logIntegrationAction({
    client,
    organizationId: input.organizationId,
    organizationIntegrationId: input.integration.id,
    providerId: "meta-ads",
    actorId: input.userId,
    action: "meta.social_dispatch.canary",
    status: input.snapshot.status === "sent"
      ? "success"
      : input.snapshot.status === "blocked" || input.snapshot.status === "skipped"
        ? "warning"
        : "error",
    metadata: input.snapshot,
  });
}

function buildCanarySnapshot(input: {
  agent: AgentRow;
  canary: ReturnType<typeof normalizeMetaSocialCanaryDraft>;
  dispatch: Awaited<ReturnType<typeof processApprovedMetaSocialDispatch>>;
  run: AgentRunRow | null;
}) {
  const metadata = readRecord(input.run?.metadata) ?? {};
  const dispatchStatus = readString(metadata.meta_dispatch_status) ?? "unknown";
  const status = normalizeCanaryStatus(input.dispatch.status, dispatchStatus);
  const ranAt = readString(metadata.meta_dispatched_at)
    ?? readString(metadata.meta_dispatch_blocked_at)
    ?? readString(metadata.meta_dispatch_failed_at)
    ?? new Date().toISOString();
  const detail = status === "sent"
    ? "Canario Meta enviado pela Graph API."
    : readString(metadata.meta_dispatch_block_detail)
      ?? readString(metadata.meta_dispatch_error)
      ?? readString(input.run?.error_message)
      ?? (status === "blocked" ? "Canario bloqueado pelas travas Meta." : "Canario Meta processado sem envio.");

  return {
    runId: input.run?.id ?? ("runId" in input.dispatch ? input.dispatch.runId : null),
    status,
    dispatchStatus,
    detail,
    channel: input.canary.channel,
    channelLabel: channelLabel(input.canary.channel),
    replyMode: input.canary.replyMode,
    targetId: input.canary.targetId,
    targetKind: readString(metadata.meta_dispatch_target_kind),
    endpoint: readString(metadata.meta_dispatch_endpoint),
    httpStatus: readNumber(metadata.meta_dispatch_http_status),
    providerMessageId: readString(metadata.meta_dispatch_provider_message_id),
    agentName: input.agent.persona_name ?? input.agent.name ?? "Agente multicanal",
    ranAt,
    audit: readMetaDispatchAudit(metadata.meta_dispatch_audit).slice(-5).reverse(),
  };
}

function normalizeCanaryStatus(processStatus: string, dispatchStatus: string) {
  if (processStatus === "sent" || dispatchStatus === "sent") return "sent";
  if (processStatus === "blocked" || dispatchStatus === "blocked_pending_meta") return "blocked";
  if (processStatus === "failed" || dispatchStatus === "failed") return "failed";
  return "skipped";
}

async function readJson(request: NextRequest): Promise<JsonRecord | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
  } catch {
    return null;
  }
}

function resolveExternalAccountId(metadata: JsonRecord, channel: MetaSocialChannel) {
  return channel.startsWith("instagram")
    ? readString(metadata.selected_instagram_business_id) ?? readString(metadata.instagram_business_id)
    : readString(metadata.selected_facebook_page_id) ?? readString(metadata.facebook_page_id);
}

function channelLabel(channel: MetaSocialChannel) {
  switch (channel) {
    case "instagram_direct":
      return "Instagram Direct";
    case "instagram_comments":
      return "Comentarios Instagram";
    case "facebook_messenger":
      return "Facebook Messenger";
    case "facebook_comments":
      return "Comentarios Facebook";
  }
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function readString(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.startsWith("Somente dono ou admin")) {
    return 403;
  }

  return 400;
}
