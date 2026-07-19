import "server-only";

import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchMetaPageAccessToken,
  loadMetaGuidedOAuthConfig,
} from "@/lib/client-os/guided-oauth";
import { requireClientCompanyAccess, type ClientCompany } from "@/lib/client-os/companies";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getMetaOrganicSurfaceLabel,
  normalizeMetaOrganicDraft,
  resolveMetaOrganicPublishTargets,
  type MetaOrganicSurface,
} from "./organic-publishing-policy";

type JsonRecord = Record<string, unknown>;

type ContentPipelineRow = {
  id: string;
  scope: "platform" | "organization";
  organization_id: string | null;
  content_type: string;
  status: string | null;
  title: string;
  summary: string | null;
  body: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  tags: string[] | null;
  metadata: JsonRecord | null;
  created_at: string | null;
};

type CredentialRow = {
  env_name: string | null;
  encrypted_value: string | null;
};

type OrganizationIntegrationRow = {
  id: string;
  metadata: JsonRecord | null;
};

type MetaOrganicCredentials = {
  accessToken: string | null;
  pageAccessToken: string | null;
  pageId: string | null;
  instagramBusinessId: string | null;
  graphVersion: string;
  appSecret: string;
};

type MetaOrganicGraphResult = {
  data: unknown;
  endpoint: string;
  httpStatus: number;
  ok: boolean;
};

export type MetaOrganicAuditEntry = {
  at: string;
  type: string;
  actorId?: string;
  message?: string;
  providerId?: string;
  status?: string;
  surface?: MetaOrganicSurface;
};

export type ClientMetaOrganicPostStatus =
  | "draft"
  | "review"
  | "approved"
  | "publishing"
  | "published"
  | "archived";

export type ClientMetaOrganicPost = {
  id: string;
  companyId: string;
  companyName: string;
  status: ClientMetaOrganicPostStatus;
  statusLabel: string;
  title: string;
  caption: string;
  mediaUrl: string | null;
  linkUrl: string | null;
  surfaces: MetaOrganicSurface[];
  surfaceLabels: string[];
  providerIds: string[];
  lastError: string | null;
  retryable: boolean;
  approvedAt: string | null;
  createdAt: string | null;
  failedAt: string | null;
  publishedAt: string | null;
  audit: MetaOrganicAuditEntry[];
};

export type ClientMetaOrganicOverview = {
  items: ClientMetaOrganicPost[];
  summary: {
    total: number;
    drafts: number;
    approved: number;
    publishing: number;
    published: number;
    failed: number;
  };
};

export const metaOrganicContentType = "meta_organic_post";

const metaOrganicSelect = "id, scope, organization_id, content_type, status, title, summary, body, scheduled_for, published_at, tags, metadata, created_at";

export async function getClientMetaOrganicOverview(input: {
  userId: string;
  organizationId: string;
  client?: SupabaseClient;
  limit?: number;
}): Promise<ClientMetaOrganicOverview> {
  const client = input.client ?? createServiceClient();
  const company = await requireClientCompanyAccess({
    userId: input.userId,
    companyId: input.organizationId,
    client,
  });
  const limit = Math.max(1, Math.min(input.limit ?? 40, 100));
  const { data, error } = await client
    .from("content_pipeline_items")
    .select(metaOrganicSelect)
    .eq("scope", "organization")
    .eq("organization_id", company.id)
    .eq("content_type", metaOrganicContentType)
    .contains("metadata", { meta_organic: true })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Nao foi possivel carregar publicacoes Meta: ${error.message}`);
  }

  return buildOverview(((data ?? []) as ContentPipelineRow[]).map((row) => mapPost(row, company)));
}

export async function createClientMetaOrganicDraft(input: {
  userId: string;
  organizationId: string;
  title?: unknown;
  caption?: unknown;
  mediaUrl?: unknown;
  linkUrl?: unknown;
  surfaces?: unknown;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const company = await requireClientCompanyAccess({
    userId: input.userId,
    companyId: input.organizationId,
    client,
  });
  const draft = normalizeMetaOrganicDraft(input);
  const createdAt = new Date().toISOString();
  const metadata = appendMetaOrganicAudit({
    meta_organic: true,
    media_url: draft.mediaUrl,
    link_url: draft.linkUrl,
    surfaces: draft.surfaces,
    publish_status: "draft",
    created_by: input.userId,
  }, {
    at: createdAt,
    actorId: input.userId,
    status: "draft",
    type: "draft_created",
  });

  const { data, error } = await client
    .from("content_pipeline_items")
    .insert({
      scope: "organization",
      organization_id: company.id,
      content_type: metaOrganicContentType,
      status: "draft",
      title: draft.title,
      summary: preview(draft.caption, 180),
      body: draft.caption,
      tags: ["meta", "organic", ...draft.surfaces],
      metadata,
    })
    .select(metaOrganicSelect)
    .single<ContentPipelineRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel criar rascunho Meta.");
  }

  return mapPost(data, company);
}

export async function approveClientMetaOrganicPost(input: {
  userId: string;
  organizationId: string;
  itemId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const { item, company } = await loadClientMetaOrganicItem(client, input);
  const metadata = readRecord(item.metadata) ?? {};

  if (item.status === "published") {
    throw new Error("Publicacao Meta ja publicada.");
  }

  if (item.status === "archived") {
    throw new Error("Publicacao arquivada nao pode ser aprovada.");
  }

  const approvedAt = new Date().toISOString();
  const { data, error } = await client
    .from("content_pipeline_items")
    .update({
      status: "approved",
      metadata: appendMetaOrganicAudit({
        ...metadata,
        publish_status: "approved",
        approved_at: approvedAt,
        approved_by: input.userId,
      }, {
        at: approvedAt,
        actorId: input.userId,
        status: "approved",
        type: "post_approved",
      }),
    })
    .eq("id", item.id)
    .select(metaOrganicSelect)
    .single<ContentPipelineRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel aprovar publicacao Meta.");
  }

  return mapPost(data, company);
}

export async function archiveClientMetaOrganicPost(input: {
  userId: string;
  organizationId: string;
  itemId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const { item, company } = await loadClientMetaOrganicItem(client, input);
  const metadata = readRecord(item.metadata) ?? {};
  const archivedAt = new Date().toISOString();
  const { data, error } = await client
    .from("content_pipeline_items")
    .update({
      status: "archived",
      metadata: appendMetaOrganicAudit({
        ...metadata,
        publish_status: "archived",
        archived_at: archivedAt,
        archived_by: input.userId,
      }, {
        at: archivedAt,
        actorId: input.userId,
        status: "archived",
        type: "post_archived",
      }),
    })
    .eq("id", item.id)
    .neq("status", "published")
    .select(metaOrganicSelect)
    .maybeSingle<ContentPipelineRow>();

  if (error) {
    throw new Error(`Nao foi possivel arquivar publicacao Meta: ${error.message}`);
  }

  if (!data) {
    throw new Error("Publicacao publicada nao pode ser arquivada nesta fase.");
  }

  return mapPost(data, company);
}

export async function publishClientMetaOrganicPost(input: {
  userId: string;
  organizationId: string;
  itemId: string;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const { item, company } = await loadClientMetaOrganicItem(client, input);
  const metadata = readRecord(item.metadata) ?? {};

  if (item.status === "published") {
    throw new Error("Publicacao Meta ja publicada.");
  }

  if (item.status !== "approved" && !(item.status === "review" && readString(metadata.publish_status) === "failed")) {
    throw new Error("Aprove a publicacao antes de enviar para a Meta.");
  }

  const startedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await client
    .from("content_pipeline_items")
    .update({
      status: "researching",
      metadata: appendMetaOrganicAudit({
        ...metadata,
        publish_status: "publishing",
        publish_started_at: startedAt,
        publish_attempt_count: readNumber(metadata.publish_attempt_count) + 1,
      }, {
        at: startedAt,
        actorId: input.userId,
        status: "publishing",
        type: "publish_started",
      }),
    })
    .eq("id", item.id)
    .in("status", ["approved", "review"])
    .select(metaOrganicSelect)
    .maybeSingle<ContentPipelineRow>();

  if (claimError) {
    throw new Error(`Nao foi possivel iniciar publicacao Meta: ${claimError.message}`);
  }

  if (!claimed) {
    throw new Error("Publicacao Meta ja esta em processamento.");
  }

  try {
    const published = await publishClaimedMetaOrganicPost(client, claimed, input.userId);
    return mapPost(published, company);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao publicar conteudo Meta.";
    const failedAt = new Date().toISOString();
    const failedMetadata = readRecord(claimed.metadata) ?? metadata;
    const { data } = await client
      .from("content_pipeline_items")
      .update({
        status: "review",
        metadata: appendMetaOrganicAudit({
          ...failedMetadata,
          publish_status: "failed",
          publish_error: message,
          failed_at: failedAt,
        }, {
          at: failedAt,
          actorId: input.userId,
          message,
          status: "failed",
          type: "publish_failed",
        }),
      })
      .eq("id", item.id)
      .select(metaOrganicSelect)
      .maybeSingle<ContentPipelineRow>();

    if (data) {
      return mapPost(data, company);
    }

    throw error;
  }
}

async function publishClaimedMetaOrganicPost(
  client: SupabaseClient,
  item: ContentPipelineRow,
  actorId: string,
) {
  const metadata = readRecord(item.metadata) ?? {};
  const caption = readString(item.body) ?? readString(item.summary) ?? "";
  const surfaces = readSurfaces(metadata.surfaces);
  const credentials = await loadMetaOrganicCredentials(client, item.organization_id ?? "");
  const targets = resolveMetaOrganicPublishTargets({
    caption,
    linkUrl: readString(metadata.link_url),
    mediaUrl: readString(metadata.media_url),
    pageId: credentials.pageId,
    instagramBusinessId: credentials.instagramBusinessId,
    surfaces,
  });
  const providerResults: JsonRecord[] = [];

  for (const target of targets) {
    if (target.surface === "facebook_page") {
      const token = credentials.pageAccessToken ?? credentials.accessToken;

      if (!token) {
        throw new Error("Token Meta ausente para publicar no Facebook.");
      }

      const graph = await sendMetaOrganicGraphRequest({
        body: target.body,
        credentials,
        endpointPath: target.endpointPath,
        token,
      });

      if (!graph.ok) {
        throw new Error(readGraphError(graph.data) ?? `Meta Graph API retornou HTTP ${graph.httpStatus}.`);
      }

      providerResults.push({
        endpoint: graph.endpoint,
        httpStatus: graph.httpStatus,
        id: readProviderId(graph.data),
        kind: target.kind,
        surface: target.surface,
      });
    } else {
      const token = credentials.accessToken;

      if (!token) {
        throw new Error("Token Meta ausente para publicar no Instagram.");
      }

      const create = await sendMetaOrganicGraphRequest({
        body: target.createBody,
        credentials,
        endpointPath: target.createEndpointPath,
        token,
      });

      if (!create.ok) {
        throw new Error(readGraphError(create.data) ?? `Meta Graph API retornou HTTP ${create.httpStatus}.`);
      }

      const creationId = readProviderId(create.data);

      if (!creationId) {
        throw new Error("Meta nao retornou o creation_id do container Instagram.");
      }

      const publish = await sendMetaOrganicGraphRequest({
        body: { creation_id: creationId },
        credentials,
        endpointPath: target.publishEndpointPath,
        token,
      });

      if (!publish.ok) {
        throw new Error(readGraphError(publish.data) ?? `Meta Graph API retornou HTTP ${publish.httpStatus}.`);
      }

      providerResults.push({
        creationId,
        endpoint: publish.endpoint,
        httpStatus: publish.httpStatus,
        id: readProviderId(publish.data),
        kind: target.kind,
        surface: target.surface,
      });
    }
  }

  const publishedAt = new Date().toISOString();
  const { data, error } = await client
    .from("content_pipeline_items")
    .update({
      status: "published",
      published_at: publishedAt,
      metadata: appendMetaOrganicAudit({
        ...metadata,
        publish_status: "published",
        published_at: publishedAt,
        published_by: actorId,
        provider_results: providerResults,
        provider_ids: providerResults.map((result) => readString(result.id)).filter(Boolean),
      }, {
        at: publishedAt,
        actorId,
        providerId: providerResults.map((result) => readString(result.id)).filter(Boolean).join(", "),
        status: "published",
        type: "publish_completed",
      }),
    })
    .eq("id", item.id)
    .select(metaOrganicSelect)
    .single<ContentPipelineRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel registrar publicacao Meta.");
  }

  return data;
}

async function loadClientMetaOrganicItem(
  client: SupabaseClient,
  input: {
    userId: string;
    organizationId: string;
    itemId: string;
  },
) {
  const company = await requireClientCompanyAccess({
    userId: input.userId,
    companyId: input.organizationId,
    client,
  });
  const { data, error } = await client
    .from("content_pipeline_items")
    .select(metaOrganicSelect)
    .eq("id", input.itemId)
    .eq("scope", "organization")
    .eq("organization_id", company.id)
    .eq("content_type", metaOrganicContentType)
    .contains("metadata", { meta_organic: true })
    .maybeSingle<ContentPipelineRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar publicacao Meta: ${error.message}`);
  }

  if (!data) {
    throw new Error("Publicacao Meta nao encontrada.");
  }

  return { company, item: data };
}

async function loadMetaOrganicCredentials(
  client: SupabaseClient,
  organizationId: string,
): Promise<MetaOrganicCredentials> {
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
    appSecret: config.appSecret,
    graphVersion: config.graphVersion,
    instagramBusinessId,
    pageAccessToken,
    pageId,
  };
}

async function loadMetaIntegration(client: SupabaseClient, organizationId: string) {
  const { data, error } = await client
    .from("organization_integrations")
    .select("id, metadata")
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

async function sendMetaOrganicGraphRequest(input: {
  body: Record<string, string>;
  credentials: MetaOrganicCredentials;
  endpointPath: string;
  token: string;
}): Promise<MetaOrganicGraphResult> {
  const url = new URL(`https://graph.facebook.com/${input.credentials.graphVersion}${input.endpointPath}`);
  url.searchParams.set("access_token", input.token);
  url.searchParams.set("appsecret_proof", createHmac("sha256", input.credentials.appSecret).update(input.token).digest("hex"));
  const response = await fetch(url.toString(), {
    body: new URLSearchParams(input.body),
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });
  const data = await response.json().catch(() => null) as unknown;

  return {
    data,
    endpoint: sanitizeGraphUrl(url),
    httpStatus: response.status,
    ok: response.ok,
  };
}

function buildOverview(items: ClientMetaOrganicPost[]): ClientMetaOrganicOverview {
  return {
    items,
    summary: {
      total: items.length,
      drafts: items.filter((item) => item.status === "draft").length,
      approved: items.filter((item) => item.status === "approved").length,
      publishing: items.filter((item) => item.status === "publishing").length,
      published: items.filter((item) => item.status === "published").length,
      failed: items.filter((item) => item.lastError).length,
    },
  };
}

function mapPost(row: ContentPipelineRow, company: ClientCompany): ClientMetaOrganicPost {
  const metadata = readRecord(row.metadata) ?? {};
  const status = readPostStatus(row.status, metadata);
  const surfaces = readSurfaces(metadata.surfaces);

  return {
    id: row.id,
    approvedAt: readString(metadata.approved_at),
    audit: readMetaOrganicAudit(metadata.meta_organic_audit).slice(-6).reverse(),
    caption: readString(row.body) ?? "",
    companyId: company.id,
    companyName: company.name,
    createdAt: row.created_at,
    failedAt: readString(metadata.failed_at),
    lastError: readString(metadata.publish_error),
    linkUrl: readString(metadata.link_url),
    mediaUrl: readString(metadata.media_url),
    providerIds: readStringArray(metadata.provider_ids),
    publishedAt: row.published_at ?? readString(metadata.published_at),
    retryable: status === "review" && readString(metadata.publish_status) === "failed",
    status,
    statusLabel: getStatusLabel(status, metadata),
    surfaceLabels: surfaces.map(getMetaOrganicSurfaceLabel),
    surfaces,
    title: row.title,
  };
}

function readPostStatus(status: string | null, metadata: JsonRecord): ClientMetaOrganicPostStatus {
  const publishStatus = readString(metadata.publish_status);

  if (publishStatus === "publishing" || status === "researching") return "publishing";
  if (status === "published") return "published";
  if (status === "approved") return "approved";
  if (status === "archived") return "archived";
  if (status === "review") return "review";
  return "draft";
}

function getStatusLabel(status: ClientMetaOrganicPostStatus, metadata: JsonRecord) {
  if (status === "review" && readString(metadata.publish_status) === "failed") {
    return "Falhou";
  }

  switch (status) {
    case "draft":
      return "Rascunho";
    case "review":
      return "Revisao";
    case "approved":
      return "Aprovado";
    case "publishing":
      return "Publicando";
    case "published":
      return "Publicado";
    case "archived":
      return "Arquivado";
  }
}

function appendMetaOrganicAudit(
  metadata: JsonRecord,
  entry: Omit<MetaOrganicAuditEntry, "at"> & { at?: string | null },
): JsonRecord {
  const audit = readMetaOrganicAudit(metadata.meta_organic_audit);

  return {
    ...metadata,
    meta_organic_audit: [...audit, {
      at: readString(entry.at) ?? new Date().toISOString(),
      type: entry.type,
      ...(entry.actorId ? { actorId: entry.actorId } : {}),
      ...(entry.message ? { message: entry.message } : {}),
      ...(entry.providerId ? { providerId: entry.providerId } : {}),
      ...(entry.status ? { status: entry.status } : {}),
      ...(entry.surface ? { surface: entry.surface } : {}),
    }].slice(-12),
  };
}

function readMetaOrganicAudit(value: unknown): MetaOrganicAuditEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = readRecord(item);
      const type = readString(record?.type);

      if (!record || !type) {
        return null;
      }

      return {
        at: readString(record.at) ?? new Date(0).toISOString(),
        type,
        ...(readString(record.actorId) ? { actorId: readString(record.actorId)! } : {}),
        ...(readString(record.message) ? { message: readString(record.message)! } : {}),
        ...(readString(record.providerId) ? { providerId: readString(record.providerId)! } : {}),
        ...(readString(record.status) ? { status: readString(record.status)! } : {}),
        ...(isSurface(record.surface) ? { surface: record.surface } : {}),
      };
    })
    .filter((item): item is MetaOrganicAuditEntry => Boolean(item));
}

function readSurfaces(value: unknown): MetaOrganicSurface[] {
  const raw = Array.isArray(value) ? value : ["facebook_page", "instagram_feed"];
  const surfaces = Array.from(new Set(raw.filter(isSurface)));
  return surfaces.length ? surfaces : ["facebook_page"];
}

function isSurface(value: unknown): value is MetaOrganicSurface {
  return value === "facebook_page" || value === "instagram_feed";
}

function readGraphError(data: unknown) {
  const error = readRecord(readRecord(data)?.error);
  return readString(error?.message)
    ?? readString(error?.error_user_msg)
    ?? readString(error?.error_user_title);
}

function readProviderId(data: unknown) {
  const record = readRecord(data);
  return readString(record?.post_id)
    ?? readString(record?.id)
    ?? readString(readRecord(record?.data)?.id);
}

function sanitizeGraphUrl(url: URL) {
  const safe = new URL(url.toString());
  safe.searchParams.delete("access_token");
  safe.searchParams.delete("appsecret_proof");
  return safe.toString();
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

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function preview(value: string, maxLength: number) {
  const text = value.trim().replace(/\s+/g, " ");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}
