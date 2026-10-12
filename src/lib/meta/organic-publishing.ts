import "server-only";
import sharp from "sharp";
import { advanceOrganicDelivery, OrganicGraphRejected, type OrganicDelivery } from "./organic-publishing-runner";
import { listMetaGrantedPermissions } from "./oauth-permissions";
import { assertContractAccess } from "@/lib/billing/contract-access";

import { createHmac, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertOrganicPublishingAccess } from "./organic-publishing-access";
import {
  fetchMetaPageAccessToken,
  loadMetaGuidedOAuthConfig,
} from "@/lib/client-os/guided-oauth";
import type { ClientCompany } from "@/lib/client-os/companies";
import { requireMetaCompanyAccess as requireClientCompanyAccess } from "./company-access";
import { decryptCredentialValue } from "@/lib/security/credentials-crypto";
import { loadR2Config, putR2Object } from "@/lib/storage/r2";
import { assertStorageUploadAllowed, recordOrganizationStorageUsage } from "@/lib/storage/quotas";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getMetaOrganicSurfaceLabel,
  normalizeMetaOrganicDraft,
  normalizeOrganicFormat, normalizeOrganicMedia, validateOrganicComposition,
  type MetaOrganicFormat, type MetaOrganicMedia,
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
  status: string;
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
  | "scheduled"
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
  format: MetaOrganicFormat;
  media: MetaOrganicMedia[];
  deliveryStatus: { surface: MetaOrganicSurface; phase: string; id?: string }[];
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
  scheduledFor: string | null;
  audit: MetaOrganicAuditEntry[];
};

export type ClientMetaOrganicMediaAsset = {
  id: string;
  companyId: string;
  companyName: string;
  fileName: string;
  contentType: string;
  bytesSize: number;
  objectKey: string;
  storageUrl: string;
  createdAt: string | null;
};

export type ClientMetaOrganicOverview = {
  items: ClientMetaOrganicPost[];
  media: ClientMetaOrganicMediaAsset[];
  summary: {
    total: number;
    drafts: number;
    approved: number;
    scheduled: number;
    publishing: number;
    published: number;
    failed: number;
  };
};

export const metaOrganicContentType = "meta_organic_post";
export const metaOrganicMediaContentType = "meta_organic_media";

const metaOrganicSelect = "id, scope, organization_id, content_type, status, title, summary, body, scheduled_for, published_at, tags, metadata, created_at";
const maxOrganicMediaBytes = 100 * 1024 * 1024;
const allowedOrganicMediaTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["video/mp4", "mp4"],
]);

export async function getClientMetaOrganicOverview(input: {
  userId: string;
  organizationId: string;
  client?: SupabaseClient;
  limit?: number;
  from?: string;
  until?: string;
}): Promise<ClientMetaOrganicOverview> {
  const client = input.client ?? createServiceClient();
  const company = await requireClientCompanyAccess({
    userId: input.userId,
    companyId: input.organizationId,
    client,
  });
  const limit = Math.max(1, Math.min(input.limit ?? 40, 100));
  let postsQuery = client
      .from("content_pipeline_items")
      .select(metaOrganicSelect)
      .eq("scope", "organization")
      .eq("organization_id", company.id)
      .eq("content_type", metaOrganicContentType)
      .contains("metadata", { meta_organic: true })
      .order("created_at", { ascending: false });
  if (input.from && input.until) {
    const from = new Date(input.from).toISOString();
    const until = new Date(input.until).toISOString();
    if (Date.parse(until) <= Date.parse(from) || Date.parse(until) - Date.parse(from) > 32 * 86400000) throw new Error("Intervalo do calendário inválido.");
    postsQuery = postsQuery.or(`and(scheduled_for.gte.${from},scheduled_for.lt.${until}),and(scheduled_for.is.null,published_at.gte.${from},published_at.lt.${until})`);
  }
  // Range paging avoids truncating a busy month at PostgREST's row limit.
  const loadPosts = async () => {
    if (!input.from) return postsQuery.limit(limit);
    const rows: ContentPipelineRow[] = [];
    for (let start = 0; start < 10000; start += 500) {
      const result = await postsQuery.range(start, start + 499);
      if (result.error) return { data: null, error: result.error };
      rows.push(...(result.data ?? []) as ContentPipelineRow[]);
      if ((result.data?.length ?? 0) < 500) return { data: rows, error: null };
    }
    throw new Error("O mês excede 10 mil publicações. Reduza o período consultado.");
  };
  const [postsResult, mediaResult] = await Promise.all([
    loadPosts(),
    client
      .from("content_pipeline_items")
      .select(metaOrganicSelect)
      .eq("scope", "organization")
      .eq("organization_id", company.id)
      .eq("content_type", metaOrganicMediaContentType)
      .contains("metadata", { meta_organic_media: true })
      .order("created_at", { ascending: false })
      .limit(18),
  ]);

  if (postsResult.error) {
    throw new Error(`Nao foi possivel carregar publicacoes Meta: ${postsResult.error.message}`);
  }

  if (mediaResult.error) {
    throw new Error(`Nao foi possivel carregar midias Meta: ${mediaResult.error.message}`);
  }

  return buildOverview(
    ((postsResult.data ?? []) as ContentPipelineRow[]).map((row) => mapPost(row, company)),
    ((mediaResult.data ?? []) as ContentPipelineRow[]).map((row) => mapMediaAsset(row, company)),
  );
}

export async function createClientMetaOrganicDraft(input: {
  userId: string;
  organizationId: string;
  title?: unknown;
  caption?: unknown;
  mediaUrl?: unknown;
  media?: unknown;
  format?: unknown;
  linkUrl?: unknown;
  scheduledFor?: unknown;
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
    media_url: draft.media[0]?.url ?? draft.mediaUrl,
    media: draft.media,
    format: draft.format,
    link_url: draft.linkUrl,
    scheduled_for: draft.scheduledFor,
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
      scheduled_for: draft.scheduledFor,
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

export async function uploadClientMetaOrganicMedia(input: {
  userId: string;
  organizationId: string;
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const company = await requireClientCompanyAccess({
    userId: input.userId,
    companyId: input.organizationId,
    client,
  });
  let contentType = input.contentType.trim().toLowerCase();
  let bytes = input.bytes;
  const extension = allowedOrganicMediaTypes.get(contentType);

  if (!extension) {
    throw new Error("Use imagens JPG, PNG, WEBP ou vídeo MP4.");
  }

  if (input.bytes.byteLength <= 0 || input.bytes.byteLength > maxOrganicMediaBytes) {
    throw new Error("A mídia precisa ter até 100 MB.");
  }

  if (contentType.startsWith("image/")) {
    if (bytes.byteLength > 8 * 1024 * 1024) throw new Error("Imagens devem ter até 8 MB.");
    bytes = new Uint8Array(await sharp(bytes, { limitInputPixels: 40000000 }).rotate().jpeg({ quality: 90 }).toBuffer());
    contentType = "image/jpeg";
    if (bytes.byteLength > 8 * 1024 * 1024) throw new Error("A imagem convertida excedeu 8 MB. Reduza a resolução.");
  } else if (Buffer.from(bytes.slice(4, 8)).toString("ascii") !== "ftyp") {
    throw new Error("Arquivo MP4 inválido.");
  }

  await assertStorageUploadAllowed({
    client,
    organizationId: company.id,
    category: "other",
    files: [{
      fileName: input.fileName,
      contentType,
      sizeBytes: bytes.byteLength,
    }],
  });

  const configResult = await loadR2Config(client);

  if (!configResult.ok) {
    throw new Error(configResult.error);
  }

  const fileName = sanitizeFileName(contentType === "image/jpeg" ? `${input.fileName.replace(/\.[^.]+$/, "") || "imagem"}.jpg` : input.fileName || `meta-organic.${extension}`);
  const objectKey = `meta/organic/${company.id}/${Date.now()}-${randomUUID()}-${fileName}`;
  const uploadResult = await putR2Object(configResult.config, objectKey, bytes, contentType);

  if (!uploadResult.ok) {
    throw new Error(uploadResult.error);
  }

  await recordOrganizationStorageUsage({
    client,
    organizationId: company.id,
    category: "other",
    bytes: uploadResult.bytesSize,
    fileCount: 1,
    metadata: {
      source: "meta_organic_media_upload",
      object_key: uploadResult.objectKey,
      content_type: contentType,
    },
  });

  const uploadedAt = new Date().toISOString();
  const { data, error } = await client
    .from("content_pipeline_items")
    .insert({
      scope: "organization",
      organization_id: company.id,
      content_type: metaOrganicMediaContentType,
      status: "published",
      title: fileName,
      summary: `Midia Meta: ${fileName}`,
      body: uploadResult.publicUrl,
      published_at: uploadedAt,
      tags: ["meta", "organic", "media"],
      metadata: {
        meta_organic_media: true,
        storage_provider: "cloudflare-r2",
        storage_key: uploadResult.objectKey,
        storage_url: uploadResult.publicUrl,
        file_name: fileName,
        content_type: contentType,
        size: uploadResult.bytesSize,
        uploaded_at: uploadedAt,
        uploaded_by: input.userId,
      },
    })
    .select(metaOrganicSelect)
    .single<ContentPipelineRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel registrar midia Meta.");
  }

  return mapMediaAsset(data, company);
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

  if (item.status === "researching") throw new Error("A publicação está em processamento.");
  if (item.status === "published") {
    throw new Error("Publicacao Meta ja publicada.");
  }

  if (item.status === "archived") {
    throw new Error("Publicacao arquivada nao pode ser aprovada.");
  }

  if (metadata.publish_status === "failed") throw new Error("Use a tentativa de envio existente; ela preserva os resultados de cada rede.");
  if (item.scheduled_for && Date.parse(item.scheduled_for) <= Date.now()) throw new Error("O agendamento venceu. Crie um novo rascunho com data futura.");
  const approvedAt = new Date().toISOString();
  const scheduledFor = readFutureIso(item.scheduled_for ?? metadata.scheduled_for);
  const nextStatus = scheduledFor ? "scheduled" : "approved";
  const { data, error } = await client
    .from("content_pipeline_items")
    .update({
      status: nextStatus,
      metadata: appendMetaOrganicAudit({
        ...metadata,
        publish_status: nextStatus,
        approved_at: approvedAt,
        approved_by: input.userId,
        scheduled_for: scheduledFor,
      }, {
        at: approvedAt,
        actorId: input.userId,
        status: nextStatus,
        type: scheduledFor ? "post_scheduled" : "post_approved",
      }),
    })
    .eq("id", item.id)
    .eq("status", item.status!)
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
    .in("status", ["draft", "review", "approved", "scheduled"])
    .eq("status", item.status!)
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

  if (item.status === "researching") throw new Error("A publicação está em processamento.");
  if (item.status === "published") {
    throw new Error("Publicacao Meta ja publicada.");
  }

  if (
    item.status !== "approved"
    && item.status !== "scheduled"
    && !(item.status === "review" && readString(metadata.publish_status) === "failed" && metadata.publish_uncertain !== true)
  ) {
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
        publish_lease: randomUUID(),
        publish_lease_until: new Date(Date.now() + 10 * 60000).toISOString(),
        publish_attempt_count: readNumber(metadata.publish_attempt_count) + 1,
      }, {
        at: startedAt,
        actorId: input.userId,
        status: "publishing",
        type: "publish_started",
      }),
    })
    .eq("id", item.id)
    .in("status", ["approved", "review", "scheduled"])
    .eq("metadata", JSON.stringify(metadata))
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
    const failedMetadata = await latestMetadata(client, item.id);
    const { data } = await client
      .from("content_pipeline_items")
      .update({
        status: "review",
        metadata: appendMetaOrganicAudit({
          ...failedMetadata,
          publish_status: "failed",
          publish_uncertain: hasUncertainDelivery(failedMetadata),
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
      .eq("status", "researching")
      .contains("metadata", { publish_lease: claimed.metadata?.publish_lease })
      .select(metaOrganicSelect)
      .maybeSingle<ContentPipelineRow>();

    if (data) {
      return mapPost(data, company);
    }

    throw error;
  }
}

export async function processScheduledMetaOrganicPosts(input: {
  limit?: number;
  client?: SupabaseClient;
} = {}) {
  const client = input.client ?? createServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("content_pipeline_items")
    .select(metaOrganicSelect)
    .eq("scope", "organization")
    .eq("content_type", metaOrganicContentType)
    .in("status", ["scheduled", "researching"])
    .contains("metadata", { meta_organic: true })
    .or(`and(status.eq.scheduled,scheduled_for.lte.${now}),and(status.eq.researching,metadata->>publish_lease_until.lt.${now})`)
    .order("scheduled_for", { ascending: true })
    .limit(Math.min(Math.max(input.limit ?? 10, 1), 50));

  if (error) {
    throw new Error(`Nao foi possivel carregar publicacoes Meta agendadas: ${error.message}`);
  }

  const results = [];

  for (const item of (data ?? []) as ContentPipelineRow[]) {
    results.push(await processScheduledMetaOrganicItem(client, item));
  }

  return {
    processed: results.length,
    results,
  };
}

async function processScheduledMetaOrganicItem(client: SupabaseClient, item: ContentPipelineRow) {
  const metadata = readRecord(item.metadata) ?? {};
  const actorId = "system:inngest";
  const startedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await client
    .from("content_pipeline_items")
    .update({
      status: "researching",
      metadata: appendMetaOrganicAudit({
        ...metadata,
        publish_status: "publishing",
        publish_started_at: startedAt,
        publish_lease: randomUUID(),
        publish_lease_until: new Date(Date.now() + 10 * 60000).toISOString(),
        publish_attempt_count: readNumber(metadata.publish_attempt_count) + 1,
      }, {
        actorId,
        at: startedAt,
        status: "publishing",
        type: "scheduled_publish_started",
      }),
    })
    .eq("id", item.id)
    .eq("status", item.status!)
    .eq("metadata", JSON.stringify(metadata))
    .select(metaOrganicSelect)
    .maybeSingle<ContentPipelineRow>();

  if (claimError) {
    throw new Error(`Nao foi possivel reservar publicacao Meta agendada: ${claimError.message}`);
  }

  if (!claimed) {
    return { id: item.id, status: "skipped", reason: "already_claimed" };
  }

  try {
    const result = await publishClaimedMetaOrganicPost(client, claimed, actorId);
    return { id: item.id, status: result.status === "published" ? "published" : "processing" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao publicar conteudo Meta agendado.";
    const failedAt = new Date().toISOString();
    const failedMetadata = await latestMetadata(client, item.id);
    await client
      .from("content_pipeline_items")
      .update({
        status: "review",
        metadata: appendMetaOrganicAudit({
          ...failedMetadata,
          publish_status: "failed",
          publish_uncertain: hasUncertainDelivery(failedMetadata),
          publish_error: message,
          failed_at: failedAt,
        }, {
          actorId,
          at: failedAt,
          message,
          status: "failed",
          type: "scheduled_publish_failed",
        }),
      })
      .eq("id", item.id)
      .eq("status", "researching")
      .contains("metadata", { publish_lease: claimed.metadata?.publish_lease });

    return { id: item.id, status: "failed", error: message };
  }
}

async function publishClaimedMetaOrganicPost(
  client: SupabaseClient,
  item: ContentPipelineRow,
  actorId: string,
) {
  let metadata = readRecord(item.metadata) ?? {};
  const lease = metadata.publish_lease;
  const organizationId = item.organization_id!;
  await assertOrganicPublishingAccess(client, organizationId);
  const credentials = await loadMetaOrganicCredentials(client, organizationId);
  if (!credentials.accessToken) throw new Error("Conecte sua conta Meta em Integrações.");
  const grants = await listMetaGrantedPermissions({ accessToken: credentials.accessToken, config: credentials });
  const surfaces = readSurfaces(metadata.surfaces);
  const format = normalizeOrganicFormat(metadata.format);
  const media = normalizeOrganicMedia(metadata.media, metadata.media_url);
  validateOrganicComposition(format, media, surfaces);
  const deliveries = (Array.isArray(metadata.deliveries) ? metadata.deliveries : []) as OrganicDelivery[];
  const persist = async (extra: JsonRecord = {}, complete = false) => {
    metadata = { ...metadata, publish_lease_until: new Date(Date.now() + 10 * 60000).toISOString(), ...extra, deliveries, provider_ids: deliveries.map(d => d.id).filter(Boolean) };
    const { data, error } = await client.from("content_pipeline_items").update({
      metadata,
      ...(complete ? { status: "published", published_at: new Date().toISOString() } : {}),
    }).eq("id", item.id).eq("organization_id", organizationId).eq("status", "researching").contains("metadata", { publish_lease: lease }).select(metaOrganicSelect).single<ContentPipelineRow>();
    if (error || !data) throw new Error("Não foi possível salvar o progresso da publicação.");
    return data;
  };
  const graph = async (surface: MetaOrganicSurface, path: string, body: Record<string, string>, method: "GET" | "POST" = "POST") => {
    await assertContractAccess(organizationId, client);
    const token = surface === "facebook_page" ? credentials.pageAccessToken : credentials.accessToken;
    if (!token) throw new Error("Reconecte a Página em Integrações.");
    const result = await sendMetaOrganicGraphRequest({ credentials, token, endpointPath: path, body, method });
    if (!result.ok || readRecord(result.data)?.error) {
      const message = readGraphError(result.data) ?? `Meta retornou HTTP ${result.httpStatus}.`;
      if (result.httpStatus >= 500) throw new Error(message);
      throw new OrganicGraphRejected(message);
    }
    return readRecord(result.data) ?? {};
  };
  let pending = false;
  for (const surface of surfaces) {
    const scope = surface === "facebook_page" ? "pages_manage_posts" : "instagram_content_publish";
    if (!grants.includes(scope)) throw new Error(`Reconecte a Meta com a permissão ${scope}. O envio depende da autorização da Meta.`);
    const accountId = surface === "facebook_page" ? credentials.pageId : credentials.instagramBusinessId;
    if (!accountId) throw new Error("Selecione os ativos em Integrações antes de publicar.");
    let delivery = deliveries.find(d => d.surface === surface);
    if (delivery && delivery.accountId !== accountId) throw new Error("A conta conectada mudou. Reconecte o ativo original para concluir esta publicação.");
    if (!delivery) { delivery = { surface, accountId, phase: "preparing", children: [] }; deliveries.push(delivery); }
    if (delivery.phase === "published") continue;
    if (format === "story" && surface === "instagram_feed") {
      const profile = await graph(surface, `/${accountId}`, { fields: "account_type" }, "GET");
      if (profile.account_type !== "BUSINESS") throw new Error("Stories no Instagram exigem uma conta empresarial.");
    }
    if (Date.now() - Date.parse(String(metadata.processing_started_at ?? metadata.publish_started_at)) > 24 * 60 * 60000) throw new Error("O processamento excedeu 24 horas. Confira o resultado na Meta antes de reenviar.");
    const done = await advanceOrganicDelivery({ delivery, format, media, caption: item.body ?? "", linkUrl: readString(metadata.link_url), graph,
      save: async () => { await persist(); },
      upload: async (url, fileUrl) => {
        await assertContractAccess(organizationId, client);
        const target = new URL(url);
        if (target.protocol !== "https:" || target.hostname !== "rupload.facebook.com" || target.username || target.password) throw new Error("Upload Meta inválido.");
        const response = await fetch(target, { method: "POST", redirect: "error", headers: { Authorization: `OAuth ${credentials.pageAccessToken}`, file_url: fileUrl }, signal: AbortSignal.timeout(60000) });
        const data = await response.json().catch(() => null);
        if (!response.ok || data?.success !== true) throw new Error("O upload de vídeo não foi confirmado pela Meta. Confira antes de reenviar.");
      },
    });
    pending ||= !done;
  }
  if (pending) return persist({ processing_started_at: metadata.processing_started_at ?? metadata.publish_started_at, publish_lease_until: new Date(Date.now() + 60000).toISOString() });
  return persist({ publish_status: "published", publish_error: null, published_by: actorId, published_at: new Date().toISOString() }, true);
}

async function latestMetadata(client: SupabaseClient, id: string): Promise<JsonRecord> {
  const { data, error } = await client.from("content_pipeline_items").select("metadata").eq("id", id).single();
  if (error || !data) throw new Error("Não foi possível recuperar o estado do envio.");
  return readRecord(data.metadata) ?? {};
}
function hasUncertainDelivery(metadata: JsonRecord) {
  return Array.isArray(metadata.deliveries) && metadata.deliveries.some(d => readRecord(d)?.phase === "sending");
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
  if (!integration || integration.status !== "connected") throw new Error("Reconecte a integração Meta antes de publicar.");
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
    .select("id, status, metadata")
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
  method?: "GET" | "POST";
}): Promise<MetaOrganicGraphResult> {
  const url = new URL(`https://graph.facebook.com/${input.credentials.graphVersion}${input.endpointPath}`);

  url.searchParams.set("appsecret_proof", createHmac("sha256", input.credentials.appSecret).update(input.token).digest("hex"));
  if (input.method === "GET") for (const [key, value] of Object.entries(input.body)) url.searchParams.set(key, value);
  const response = await fetch(url.toString(), {
    body: input.method === "GET" ? undefined : new URLSearchParams(input.body),
    signal: AbortSignal.timeout(30000),
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: input.method ?? "POST",
  });
  const data = await response.json().catch(() => null) as unknown;

  return {
    data,
    endpoint: sanitizeGraphUrl(url),
    httpStatus: response.status,
    ok: response.ok,
  };
}

function buildOverview(
  items: ClientMetaOrganicPost[],
  media: ClientMetaOrganicMediaAsset[],
): ClientMetaOrganicOverview {
  return {
    items,
    media,
    summary: {
      total: items.length,
      drafts: items.filter((item) => item.status === "draft").length,
      approved: items.filter((item) => item.status === "approved").length,
      scheduled: items.filter((item) => item.status === "scheduled").length,
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
    format: normalizeOrganicFormat(metadata.format),
    media: normalizeOrganicMedia(metadata.media, metadata.media_url),
    deliveryStatus: Array.isArray(metadata.deliveries) ? (metadata.deliveries as OrganicDelivery[]).map(d => ({ surface: d.surface, phase: d.phase, id: d.id })) : [],
    providerIds: readStringArray(metadata.provider_ids),
    publishedAt: row.published_at ?? readString(metadata.published_at),
    retryable: status === "review" && readString(metadata.publish_status) === "failed" && metadata.publish_uncertain !== true,
    scheduledFor: row.scheduled_for ?? readString(metadata.scheduled_for),
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
  if (status === "scheduled") return "scheduled";
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
    case "scheduled":
      return "Agendado";
    case "publishing":
      return "Publicando";
    case "published":
      return "Publicado";
    case "archived":
      return "Arquivado";
  }
}

function mapMediaAsset(row: ContentPipelineRow, company: ClientCompany): ClientMetaOrganicMediaAsset {
  const metadata = readRecord(row.metadata) ?? {};

  return {
    id: row.id,
    bytesSize: readNumber(metadata.size),
    companyId: company.id,
    companyName: company.name,
    contentType: readString(metadata.content_type) ?? "image/jpeg",
    createdAt: row.created_at,
    fileName: readString(metadata.file_name) ?? row.title,
    objectKey: readString(metadata.storage_key) ?? "",
    storageUrl: readString(metadata.storage_url) ?? readString(row.body) ?? "",
  };
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

function readFutureIso(value: unknown) {
  const text = readString(value);

  if (!text) {
    return null;
  }

  const date = new Date(text);
  return Number.isFinite(date.getTime()) && date.getTime() > Date.now() ? date.toISOString() : null;
}

function preview(value: string, maxLength: number) {
  const text = value.trim().replace(/\s+/g, " ");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function sanitizeFileName(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);

  return normalized || "meta-organic.jpg";
}
