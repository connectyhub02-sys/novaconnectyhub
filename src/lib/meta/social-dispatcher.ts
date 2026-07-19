import "server-only";

import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchMetaPageAccessToken,
  loadMetaGuidedOAuthConfig,
} from "@/lib/client-os/guided-oauth";
import { inngest } from "@/lib/inngest/client";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { appendMetaDispatchAudit } from "./social-dispatch-audit";
import {
  evaluateMetaSocialDispatchReadiness,
  resolveMetaSocialDispatchTarget,
  resolveMetaSocialDispatchMode,
  type MetaSocialDispatchTarget,
} from "./social-dispatch-policy";
import { isMetaSocialChannel, type MetaSocialChannel } from "./social-agent-policy";

type JsonRecord = Record<string, unknown>;

type AgentRunRow = {
  id: string;
  agent_id: string;
  organization_id: string | null;
  run_status: string | null;
  trigger_source: string | null;
  input_summary: string | null;
  output_summary: string | null;
  metadata: JsonRecord | null;
  created_at: string | null;
};

type CredentialRow = {
  env_name: string | null;
  encrypted_value: string | null;
};

type OrganizationIntegrationRow = {
  id: string;
  scopes: string[] | null;
  metadata: JsonRecord | null;
};

type MetaDispatchCredentials = {
  accessToken: string | null;
  pageAccessToken: string | null;
  pageId: string | null;
  instagramBusinessId: string | null;
  graphVersion: string;
  appSecret: string;
  integrationId: string | null;
  credentialSource: "page_token" | "user_token" | "missing";
  grantedPermissions: string[];
};

type GraphSendResult = {
  ok: boolean;
  httpStatus: number;
  data: unknown;
  endpoint: string;
  targetKind: MetaSocialDispatchTarget["kind"];
};

export const metaSocialDispatchRequestedEventName = "connectyhub/meta.social.dispatch.requested" as const;

const dispatchableMetaStatuses = new Set(["pending_adapter", "failed"]);

export async function enqueueApprovedMetaSocialDispatch(input: {
  client: SupabaseClient;
  runId: string;
  metadata: JsonRecord;
}) {
  await inngest.send({
    name: metaSocialDispatchRequestedEventName,
    data: {
      runId: input.runId,
    },
  }).catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : "Falha ao disparar Inngest.";
    await input.client
      .from("agent_runs")
      .update({
        metadata: appendMetaDispatchAudit({
          ...input.metadata,
          meta_dispatch_inngest_error: message,
          meta_dispatch_inngest_failed_at: new Date().toISOString(),
        }, {
          type: "dispatch_enqueue_failed",
          status: readString(input.metadata.meta_dispatch_status) ?? "pending_adapter",
          message,
        }),
      })
      .eq("id", input.runId);
  });
}

export async function processApprovedMetaSocialDispatch(input: {
  runId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const run = await loadAgentRun(client, input.runId);

  if (!run) {
    return { status: "skipped", reason: "missing_run", runId: input.runId };
  }

  const metadata = readRecord(run.metadata) ?? {};
  const dispatchStatus = readString(metadata.meta_dispatch_status);

  if (dispatchStatus === "sent") {
    return { status: "skipped", reason: "already_sent", runId: run.id };
  }

  if (run.run_status !== "completed" || metadata.ready_for_meta_dispatch !== true) {
    return { status: "skipped", reason: "not_ready", runId: run.id };
  }

  if (dispatchStatus && !dispatchableMetaStatuses.has(dispatchStatus)) {
    return { status: "skipped", reason: `dispatch_${dispatchStatus}`, runId: run.id };
  }

  const channel = readMetaSocialChannel(metadata.channel);
  const organizationId = run.organization_id;
  const approvedText = readString(metadata.social_approved_reply_text);

  if (!organizationId || !channel || !approvedText) {
    await markDispatchFailed(client, run, "Run Meta aprovado sem organizacao, canal ou texto.");
    return { status: "failed", reason: "missing_dispatch_context", runId: run.id };
  }

  const startedAt = new Date().toISOString();
  const workingMetadata = appendMetaDispatchAudit({
    ...metadata,
    meta_dispatch_status: "sending",
    meta_dispatch_started_at: startedAt,
    meta_dispatch_attempt_count: readNumber(metadata.meta_dispatch_attempt_count) + 1,
  }, {
    at: startedAt,
    type: "dispatch_started",
    status: "sending",
  });

  await client
    .from("agent_runs")
    .update({ metadata: workingMetadata })
    .eq("id", run.id);

  try {
    const credentials = await loadMetaDispatchCredentials(client, organizationId);
    const channelConfig = readRecord(metadata.channel_config) ?? {};
    const fallbackExternalAccountId = readString(metadata.externalAccountId);
    const fallbackPageId = channel.startsWith("facebook") ? fallbackExternalAccountId : null;
    const fallbackInstagramBusinessId = channel.startsWith("instagram") ? fallbackExternalAccountId : null;
    const target = resolveMetaSocialDispatchTarget({
      channel,
      pageId: credentials.pageId ?? fallbackPageId,
      instagramBusinessId: credentials.instagramBusinessId ?? fallbackInstagramBusinessId,
      externalUserId: readString(metadata.externalUserId),
      sourceCommentId: readString(metadata.sourceCommentId),
      text: approvedText,
      allowPrivateReplies: readBoolean(channelConfig.allowPrivateReplies ?? channelConfig.allow_private_replies),
      allowPublicReplies: readBoolean(channelConfig.allowPublicReplies ?? channelConfig.allow_public_replies),
    });
    const dispatchMode = resolveMetaSocialDispatchMode();
    const readiness = evaluateMetaSocialDispatchReadiness({
      channel,
      target,
      mode: dispatchMode,
      grantedPermissions: credentials.grantedPermissions,
      occurredAt: readString(metadata.occurredAt),
    });

    if (!readiness.ok) {
      await markDispatchBlocked(client, {
        run,
        metadata: workingMetadata,
        readiness,
        target,
      });

      return {
        status: "blocked",
        runId: run.id,
        channel,
        targetKind: target.kind,
        reason: readiness.reason,
      };
    }

    const token = credentials.pageAccessToken ?? credentials.accessToken;

    if (!token) {
      throw new Error("Token Meta ausente para envio social.");
    }

    const graph = await sendMetaGraphRequest({
      credentials,
      target,
      token,
    });

    if (!graph.ok) {
      throw new Error(readGraphError(graph.data) ?? `Meta Graph API retornou HTTP ${graph.httpStatus}.`);
    }

    const providerMessageId = readProviderMessageId(graph.data) ?? `meta:${target.kind}:${run.id}`;
    const outboundMessage = await insertOutboundMessage(client, {
      organizationId,
      conversationId: readString(metadata.conversationId),
      leadId: readString(metadata.leadId),
      providerChatId: readString(metadata.providerChatId),
      providerMessageId,
      text: approvedText,
      runId: run.id,
      target,
      graph,
    });

    await updateConversationAfterDispatch(client, {
      conversationId: readString(metadata.conversationId),
      text: approvedText,
      occurredAt: outboundMessage.occurredAt,
    });

    const sentAt = new Date().toISOString();
    await client
      .from("agent_runs")
      .update({
        error_message: null,
        metadata: appendMetaDispatchAudit({
          ...workingMetadata,
          meta_dispatch_status: "sent",
          meta_dispatched_at: sentAt,
          meta_dispatch_endpoint: graph.endpoint,
          meta_dispatch_target_kind: target.kind,
          meta_dispatch_http_status: graph.httpStatus,
          meta_dispatch_provider_message_id: providerMessageId,
          meta_dispatch_credential_source: credentials.credentialSource,
          outbound_conversation_message_id: outboundMessage.id,
          graph_response: sanitizeGraphResponse(graph.data),
          ready_for_meta_dispatch: false,
        }, {
          at: sentAt,
          type: "dispatch_sent",
          status: "sent",
          httpStatus: graph.httpStatus,
          providerMessageId,
          targetKind: target.kind,
        }),
      })
      .eq("id", run.id);

    return {
      status: "sent",
      runId: run.id,
      channel,
      targetKind: target.kind,
      providerMessageId,
      outboundMessageId: outboundMessage.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao enviar resposta Meta.";
    await markDispatchFailed(client, {
      ...run,
      metadata: workingMetadata,
    }, message);

    return {
      status: "failed",
      runId: run.id,
      reason: message,
    };
  }
}

export async function processPendingApprovedMetaSocialDispatches(input: {
  limit?: number;
  client?: SupabaseClient;
} = {}) {
  const client = input.client ?? createServiceClient();
  const limit = Math.max(1, Math.min(input.limit ?? 10, 50));
  const { data, error } = await client
    .from("agent_runs")
    .select("id")
    .eq("run_status", "completed")
    .contains("metadata", {
      ready_for_meta_dispatch: true,
      meta_dispatch_status: "pending_adapter",
    })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Nao foi possivel consultar envios sociais Meta: ${error.message}`);
  }

  const results = [];

  for (const row of data ?? []) {
    results.push(await processApprovedMetaSocialDispatch({ client, runId: row.id }));
  }

  return {
    status: "swept",
    checked: data?.length ?? 0,
    results,
  };
}

async function loadAgentRun(client: SupabaseClient, runId: string) {
  const { data, error } = await client
    .from("agent_runs")
    .select("id, agent_id, organization_id, run_status, trigger_source, input_summary, output_summary, metadata, created_at")
    .eq("id", runId)
    .maybeSingle<AgentRunRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar envio social Meta: ${error.message}`);
  }

  return data ?? null;
}

async function loadMetaDispatchCredentials(
  client: SupabaseClient,
  organizationId: string,
): Promise<MetaDispatchCredentials> {
  const [config, integration, credentials] = await Promise.all([
    loadMetaGuidedOAuthConfig({ client }),
    loadMetaIntegration(client, organizationId),
    loadOrganizationMetaCredentialMap(client, organizationId),
  ]);
  const metadata = readRecord(integration?.metadata) ?? {};
  const accessToken = credentials.get("META_ACCESS_TOKEN") ?? null;
  const pageId = credentials.get("FACEBOOK_PAGE_ID")
    ?? readString(metadata.selected_facebook_page_id)
    ?? readString(metadata.facebook_page_id);
  const instagramBusinessId = credentials.get("INSTAGRAM_BUSINESS_ACCOUNT_ID")
    ?? readString(metadata.selected_instagram_business_id)
    ?? readString(metadata.instagram_business_id);
  let pageAccessToken = credentials.get("FACEBOOK_PAGE_ACCESS_TOKEN") ?? null;

  if (!pageAccessToken && accessToken && pageId) {
    pageAccessToken = await fetchMetaPageAccessToken({
      accessToken,
      config,
      pageId,
    });
  }

  return {
    accessToken,
    pageAccessToken,
    pageId,
    instagramBusinessId,
    graphVersion: config.graphVersion,
    appSecret: config.appSecret,
    integrationId: integration?.id ?? null,
    credentialSource: pageAccessToken ? "page_token" : accessToken ? "user_token" : "missing",
    grantedPermissions: readGrantedMetaPermissions({
      metadata,
      scopes: integration?.scopes,
    }),
  };
}

async function loadMetaIntegration(client: SupabaseClient, organizationId: string) {
  const { data, error } = await client
    .from("organization_integrations")
    .select("id, scopes, metadata")
    .eq("organization_id", organizationId)
    .eq("provider_id", "meta-ads")
    .maybeSingle<OrganizationIntegrationRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar integracao Meta: ${error.message}`);
  }

  return data ?? null;
}

async function loadOrganizationMetaCredentialMap(client: SupabaseClient, organizationId: string) {
  const { data, error } = await client
    .from("integration_credentials")
    .select("env_name, encrypted_value")
    .eq("scope", "organization")
    .eq("organization_id", organizationId)
    .eq("integration_id", "meta")
    .in("env_name", [
      "META_ACCESS_TOKEN",
      "FACEBOOK_PAGE_ID",
      "FACEBOOK_PAGE_ACCESS_TOKEN",
      "INSTAGRAM_BUSINESS_ACCOUNT_ID",
    ]);

  if (error) {
    throw new Error(`Nao foi possivel carregar credenciais Meta: ${error.message}`);
  }

  const credentials = new Map<string, string>();

  for (const row of (data ?? []) as CredentialRow[]) {
    if (!row.env_name || !row.encrypted_value) {
      continue;
    }

    credentials.set(row.env_name, decryptCredentialValue(row.encrypted_value));
  }

  return credentials;
}

async function sendMetaGraphRequest(input: {
  credentials: MetaDispatchCredentials;
  target: MetaSocialDispatchTarget;
  token: string;
}): Promise<GraphSendResult> {
  const url = new URL(`https://graph.facebook.com/${input.credentials.graphVersion}${input.target.endpointPath}`);
  url.searchParams.set("access_token", input.token);
  url.searchParams.set("appsecret_proof", createHmac("sha256", input.credentials.appSecret).update(input.token).digest("hex"));

  const headers = new Headers({ Accept: "application/json" });
  let body: BodyInit;

  if (input.target.contentType === "json") {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(input.target.body);
  } else {
    headers.set("Content-Type", "application/x-www-form-urlencoded");
    body = new URLSearchParams(input.target.body);
  }

  const response = await fetch(url.toString(), {
    body,
    cache: "no-store",
    headers,
    method: "POST",
  });
  const data = await response.json().catch(() => null) as unknown;

  return {
    ok: response.ok,
    httpStatus: response.status,
    data,
    endpoint: sanitizeGraphUrl(url),
    targetKind: input.target.kind,
  };
}

async function insertOutboundMessage(
  client: SupabaseClient,
  input: {
    organizationId: string;
    conversationId: string | null;
    leadId: string | null;
    providerChatId: string | null;
    providerMessageId: string;
    text: string;
    runId: string;
    target: MetaSocialDispatchTarget;
    graph: GraphSendResult;
  },
) {
  const occurredAt = new Date().toISOString();
  const { data, error } = await client
    .from("conversation_messages")
    .insert({
      organization_id: input.organizationId,
      conversation_id: input.conversationId,
      lead_id: input.leadId,
      whatsapp_instance_id: null,
      provider: "meta",
      provider_message_id: input.providerMessageId,
      provider_chat_id: input.providerChatId,
      direction: "outbound",
      message_type: input.target.kind,
      text_content: input.text,
      payload: {
        agent_run_id: input.runId,
        dispatch_target_kind: input.target.kind,
        dispatch_endpoint: input.graph.endpoint,
        graph_response: sanitizeGraphResponse(input.graph.data),
      },
      occurred_at: occurredAt,
    })
    .select("id, occurred_at")
    .single<{ id: string; occurred_at: string }>();

  if (!error && data) {
    return {
      id: data.id,
      occurredAt: data.occurred_at,
    };
  }

  if (error?.code === "23505") {
    const { data: existing } = await client
      .from("conversation_messages")
      .select("id, occurred_at")
      .eq("provider", "meta")
      .eq("provider_message_id", input.providerMessageId)
      .maybeSingle<{ id: string; occurred_at: string }>();

    if (existing) {
      return {
        id: existing.id,
        occurredAt: existing.occurred_at,
      };
    }
  }

  throw new Error(error?.message ?? "Nao foi possivel registrar mensagem enviada pela Meta.");
}

async function updateConversationAfterDispatch(
  client: SupabaseClient,
  input: {
    conversationId: string | null;
    text: string;
    occurredAt: string;
  },
) {
  if (!input.conversationId) {
    return;
  }

  const { data } = await client
    .from("conversations")
    .select("metadata")
    .eq("id", input.conversationId)
    .maybeSingle<{ metadata: JsonRecord | null }>();
  const metadata = readRecord(data?.metadata) ?? {};

  await client
    .from("conversations")
    .update({
      status: "open",
      last_message_preview: input.text,
      last_message_at: input.occurredAt,
      metadata: {
        ...metadata,
        last_meta_outbound_at: input.occurredAt,
      },
    })
    .eq("id", input.conversationId);
}

async function markDispatchFailed(client: SupabaseClient, run: AgentRunRow, message: string) {
  const metadata = readRecord(run.metadata) ?? {};
  const failedAt = new Date().toISOString();

  await client
    .from("agent_runs")
    .update({
      error_message: message,
      metadata: appendMetaDispatchAudit({
        ...metadata,
        meta_dispatch_status: "failed",
        meta_dispatch_error: message,
        meta_dispatch_failed_at: failedAt,
        ready_for_meta_dispatch: true,
      }, {
        at: failedAt,
        type: "dispatch_failed",
        status: "failed",
        message,
      }),
    })
    .eq("id", run.id);
}

async function markDispatchBlocked(
  client: SupabaseClient,
  input: {
    run: AgentRunRow;
    metadata: JsonRecord;
    readiness: ReturnType<typeof evaluateMetaSocialDispatchReadiness>;
    target: MetaSocialDispatchTarget;
  },
) {
  const blockedAt = new Date().toISOString();

  await client
    .from("agent_runs")
    .update({
      error_message: null,
      metadata: appendMetaDispatchAudit({
        ...input.metadata,
        meta_dispatch_status: "blocked_pending_meta",
        meta_dispatch_blocked_at: blockedAt,
        meta_dispatch_block_reason: input.readiness.reason,
        meta_dispatch_block_detail: input.readiness.detail,
        meta_dispatch_mode: input.readiness.mode,
        meta_dispatch_required_permissions: input.readiness.requiredPermissions,
        meta_dispatch_missing_permissions: input.readiness.missingPermissions,
        meta_dispatch_warnings: input.readiness.warnings,
        meta_dispatch_target_kind: input.target.kind,
        meta_dispatch_endpoint: input.target.endpointPath,
        ready_for_meta_dispatch: true,
      }, {
        at: blockedAt,
        type: "dispatch_blocked",
        status: "blocked_pending_meta",
        message: input.readiness.detail,
        targetKind: input.target.kind,
      }),
    })
    .eq("id", input.run.id);
}

function readProviderMessageId(data: unknown): string | null {
  const record = readRecord(data);
  return readString(record?.message_id)
    ?? readString(record?.id)
    ?? readString(readRecord(record?.data)?.id);
}

function readGraphError(data: unknown) {
  const error = readRecord(readRecord(data)?.error);
  return readString(error?.message)
    ?? readString(error?.error_user_msg)
    ?? readString(error?.error_user_title);
}

function sanitizeGraphResponse(data: unknown): JsonRecord {
  const record = readRecord(data);

  if (!record) {
    return {};
  }

  const error = readRecord(record.error);

  if (error) {
    return {
      error: {
        message: readString(error.message),
        type: readString(error.type),
        code: readString(error.code),
        subcode: readString(error.error_subcode),
        traceId: readString(error.fbtrace_id),
      },
    };
  }

  return {
    id: readString(record.id),
    message_id: readString(record.message_id),
    recipient_id: readString(record.recipient_id),
    success: typeof record.success === "boolean" ? record.success : undefined,
  };
}

function sanitizeGraphUrl(url: URL) {
  const safe = new URL(url.toString());
  safe.searchParams.delete("access_token");
  safe.searchParams.delete("appsecret_proof");
  return safe.toString();
}

function readMetaSocialChannel(value: unknown): MetaSocialChannel | null {
  return isMetaSocialChannel(value) ? value : null;
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

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readGrantedMetaPermissions(input: {
  metadata: JsonRecord | null;
  scopes?: string[] | null;
}) {
  const permissions = new Set<string>();

  for (const scope of input.scopes ?? []) {
    if (scope.trim()) permissions.add(scope.trim());
  }

  const reviewTest = readRecord(input.metadata?.review_test);

  for (const result of readArray(reviewTest?.results)) {
    const record = readRecord(result);

    if (record?.ok !== true) {
      continue;
    }

    for (const permission of readStringArray(record.permissions)) {
      permissions.add(permission);
    }
  }

  return Array.from(permissions).sort();
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}
