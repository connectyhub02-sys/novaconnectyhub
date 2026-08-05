import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mediaAnalysisFeatureCode, meterGeminiGenerationUsage } from "@/lib/billing/gemini-metering";
import { assertBillableAccess } from "@/lib/billing/trial";
import { loadGeminiCredentials, normalizeGeminiModel, type GeminiCredentials } from "@/lib/gemini/credentials";
import { inngest } from "@/lib/inngest/client";
import { loadR2Config, putR2Object } from "@/lib/storage/r2";
import {
  assertStorageUploadAllowed,
  recordOrganizationStorageUsage,
} from "@/lib/storage/quotas";
import { createServiceClient } from "@/lib/supabase/service";
import type { WhatsappBehaviorConfig } from "./agent-behavior";

type JsonRecord = Record<string, unknown>;

type VisualIdentityScope = "client" | "platform";

type AgentRow = {
  id: string;
  scope: string;
  organization_id: string | null;
  name: string;
  persona_name: string | null;
  model_id: string | null;
  metadata: JsonRecord | null;
};

type VisualIdentityReferenceRow = {
  id: string;
  organization_id: string | null;
  agent_id: string;
  whatsapp_instance_id: string | null;
  source: string;
  status: VisualIdentityReferenceStatus;
  file_name: string;
  content_type: string;
  size_bytes: number | string | null;
  storage_key: string;
  storage_url: string;
  descriptor: JsonRecord | null;
  processing_error: string | null;
  processed_at: string | null;
  archived_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type VisualIdentityReferenceStatus = "queued" | "processing" | "ready" | "failed" | "archived";
export type VisualIdentityMatchStatus = "disabled" | "no_reference" | "high_confidence" | "possible" | "no_match" | "failed";

export type ClientVisualIdentityReference = {
  id: string;
  source: string;
  status: VisualIdentityReferenceStatus;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storageUrl: string;
  descriptorSummary: string | null;
  processingError: string | null;
  processedAt: string | null;
  createdAt: string | null;
};

export type ClientWhatsappVisualIdentityState = {
  enabled: boolean;
  selfPhotoReply: boolean;
  conservativeMatch: boolean;
  minConfidence: number;
  readyCount: number;
  queuedCount: number;
  failedCount: number;
  lastProcessedAt: string | null;
  references: ClientVisualIdentityReference[];
};

export type VisualIdentityMatchResult = {
  status: VisualIdentityMatchStatus;
  confidence: number | null;
  matchedReferenceId: string | null;
  summary: string | null;
  instruction: string | null;
};

export const whatsappVisualIdentityReferenceProcessEventName = "connectyhub/whatsapp.visual_identity.reference.process";

export type WhatsappVisualIdentityReferenceProcessEventData = {
  referenceId: string;
  requestedBy: string | null;
};

const maxReferenceBytes = 12 * 1024 * 1024;
const referenceSelectColumns = [
  "id",
  "organization_id",
  "agent_id",
  "whatsapp_instance_id",
  "source",
  "status",
  "file_name",
  "content_type",
  "size_bytes",
  "storage_key",
  "storage_url",
  "descriptor",
  "processing_error",
  "processed_at",
  "archived_at",
  "created_at",
  "updated_at",
].join(", ");

export function normalizeVisualIdentityContentType(fileName: string, contentType?: string | null) {
  const type = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (type.startsWith("image/")) return type;

  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".avif")) return "image/avif";
  return type || "application/octet-stream";
}

export function isVisualIdentityImageContentType(contentType: string) {
  return ["image/png", "image/jpeg", "image/webp", "image/avif"].includes(contentType);
}

export async function createAgentVisualIdentityReference(input: {
  scope: VisualIdentityScope;
  organizationId?: string | null;
  agentId: string;
  whatsappInstanceId?: string | null;
  userId?: string | null;
  source?: "manual_upload" | "whatsapp_profile" | "admin_upload" | "imported";
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const contentType = normalizeVisualIdentityContentType(input.fileName, input.contentType);
  const fileName = sanitizeFileName(input.fileName || "referencia-visual");

  if (!isVisualIdentityImageContentType(contentType)) {
    throw new Error("Use uma imagem PNG, JPG, JPEG, WebP ou AVIF para treinar a identidade visual.");
  }

  if (input.bytes.byteLength <= 0 || input.bytes.byteLength > maxReferenceBytes) {
    throw new Error("A referencia visual precisa ter ate 12 MB.");
  }

  const agent = await requireScopedAgent(client, {
    scope: input.scope,
    agentId: input.agentId,
    organizationId: input.organizationId ?? null,
  });

  if (input.scope === "client" && input.organizationId) {
    await assertBillableAccess({ organizationId: input.organizationId, client });
    await assertStorageUploadAllowed({
      client,
      organizationId: input.organizationId,
      category: "other",
      files: [{
        fileName,
        contentType,
        sizeBytes: input.bytes.byteLength,
      }],
    });
  }

  const configResult = await loadR2Config(client);

  if (!configResult.ok) {
    throw new Error(configResult.error);
  }

  const storageScope = input.scope === "platform"
    ? `platform/agents/${agent.id}`
    : `organizations/${input.organizationId}/agents/${agent.id}`;
  const objectKey = `${storageScope}/visual-identity/${Date.now()}-${randomUUID()}-${fileName}`;
  const uploadResult = await putR2Object(configResult.config, objectKey, input.bytes, contentType);

  if (!uploadResult.ok) {
    throw new Error(uploadResult.error);
  }

  if (input.scope === "client" && input.organizationId) {
    await recordOrganizationStorageUsage({
      client,
      organizationId: input.organizationId,
      category: "other",
      bytes: uploadResult.bytesSize,
      fileCount: 1,
      metadata: {
        source: "agent_visual_identity_reference",
        object_key: uploadResult.objectKey,
        content_type: contentType,
        agent_id: agent.id,
      },
    });
  }

  const { data, error } = await client
    .from("agent_visual_identity_references")
    .insert({
      organization_id: input.scope === "client" ? input.organizationId ?? agent.organization_id : null,
      agent_id: agent.id,
      whatsapp_instance_id: input.whatsappInstanceId ?? null,
      source: input.source ?? (input.scope === "platform" ? "admin_upload" : "manual_upload"),
      status: "queued",
      file_name: fileName,
      content_type: contentType,
      size_bytes: uploadResult.bytesSize,
      storage_provider: "cloudflare-r2",
      storage_key: uploadResult.objectKey,
      storage_url: uploadResult.publicUrl,
      descriptor: {
        status: "queued",
        agentName: agent.persona_name?.trim() || agent.name,
      },
      created_by: input.userId ?? null,
    })
    .select(referenceSelectColumns)
    .single<VisualIdentityReferenceRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel registrar a referencia visual.");
  }

  await enqueueWhatsappVisualIdentityReferenceProcessing({
    referenceId: data.id,
    requestedBy: input.userId ?? null,
  });

  return mapReference(data);
}

export async function listAgentVisualIdentityReferences(input: {
  client?: SupabaseClient;
  agentId: string;
  includeArchived?: boolean;
}) {
  const client = input.client ?? createServiceClient();
  let query = client
    .from("agent_visual_identity_references")
    .select(referenceSelectColumns)
    .eq("agent_id", input.agentId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!input.includeArchived) {
    query = query.neq("status", "archived");
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Nao foi possivel carregar referencias visuais: ${error.message}`);
  }

  return ((data ?? []) as unknown as VisualIdentityReferenceRow[]).map(mapReference);
}

export function buildClientWhatsappVisualIdentityState(input: {
  behavior: WhatsappBehaviorConfig;
  references: ClientVisualIdentityReference[];
}): ClientWhatsappVisualIdentityState {
  const references = input.references.filter((item) => item.status !== "archived");
  const readyReferences = references.filter((item) => item.status === "ready");
  const queuedReferences = references.filter((item) => item.status === "queued" || item.status === "processing");
  const failedReferences = references.filter((item) => item.status === "failed");
  const lastProcessedAt = readyReferences
    .map((item) => item.processedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  return {
    enabled: input.behavior.visualIdentity,
    selfPhotoReply: input.behavior.visualIdentitySelfPhotoReply,
    conservativeMatch: input.behavior.visualIdentityConservativeMatch,
    minConfidence: input.behavior.visualIdentityMinConfidence,
    readyCount: readyReferences.length,
    queuedCount: queuedReferences.length,
    failedCount: failedReferences.length,
    lastProcessedAt,
    references,
  };
}

export async function archiveAgentVisualIdentityReference(input: {
  client?: SupabaseClient;
  scope: VisualIdentityScope;
  organizationId?: string | null;
  agentId: string;
  referenceId: string;
}) {
  const client = input.client ?? createServiceClient();
  await requireScopedAgent(client, {
    scope: input.scope,
    agentId: input.agentId,
    organizationId: input.organizationId ?? null,
  });

  const now = new Date().toISOString();
  const { data, error } = await client
    .from("agent_visual_identity_references")
    .update({
      status: "archived",
      archived_at: now,
    })
    .eq("id", input.referenceId)
    .eq("agent_id", input.agentId)
    .select(referenceSelectColumns)
    .single<VisualIdentityReferenceRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Nao foi possivel arquivar a referencia visual.");
  }

  return mapReference(data);
}

export async function enqueueWhatsappVisualIdentityReferenceProcessing(input: {
  referenceId: string;
  requestedBy?: string | null;
}) {
  const data: WhatsappVisualIdentityReferenceProcessEventData = {
    referenceId: input.referenceId,
    requestedBy: input.requestedBy ?? null,
  };

  await inngest.send({
    name: whatsappVisualIdentityReferenceProcessEventName,
    data,
  });
}

export async function processWhatsappVisualIdentityReference(input: {
  data: WhatsappVisualIdentityReferenceProcessEventData;
  client?: SupabaseClient;
}) {
  const client = input.client ?? createServiceClient();
  const startedAt = new Date().toISOString();

  const reference = await loadReference(client, input.data.referenceId);
  if (!reference) {
    return { status: "skipped", reason: "missing_reference" };
  }

  if (reference.status === "archived") {
    return { status: "skipped", reason: "archived_reference" };
  }

  await client
    .from("agent_visual_identity_references")
    .update({
      status: "processing",
      processing_error: null,
      descriptor: {
        ...(reference.descriptor ?? {}),
        status: "processing",
        startedAt,
      },
    })
    .eq("id", reference.id);

  try {
    const [agent, credentials] = await Promise.all([
      requireAgentById(client, reference.agent_id),
      loadGeminiCredentials(client),
    ]);
    const descriptor = await generateReferenceDescriptor({
      credentials,
      model: agent.model_id || credentials.model,
      agentName: agent.persona_name?.trim() || agent.name,
      fileUrl: reference.storage_url,
      mimeType: reference.content_type,
    });
    const processedAt = new Date().toISOString();

    await client
      .from("agent_visual_identity_references")
      .update({
        status: "ready",
        descriptor: {
          ...descriptor.descriptor,
          status: "ready",
          processedAt,
          promptVersion: "visual_identity_reference_v1",
        },
        processing_error: null,
        processed_at: processedAt,
      })
      .eq("id", reference.id);

    await meterGeminiGenerationUsage({
      client,
      organizationId: reference.organization_id,
      userId: input.data.requestedBy,
      featureCode: mediaAnalysisFeatureCode("image"),
      modelId: descriptor.modelId,
      agentId: reference.agent_id,
      agentScope: agent.scope === "platform" ? "platform" : "customer",
      billingMode: agent.scope === "platform" ? "internal_shadow" : undefined,
      promptText: descriptor.prompt,
      outputText: descriptor.outputText,
      responseData: descriptor.responseData,
      media: 1,
      megabytes: bytesToMegabytes(descriptor.byteLength),
      requestId: `whatsapp-visual-identity-reference:${reference.id}`,
      debitDescription: "Processamento de identidade visual do agente",
      metadata: {
        source: "agent_visual_identity_reference",
        referenceId: reference.id,
        storageKey: reference.storage_key,
      },
    }).catch(() => null);

    return {
      status: "processed",
      referenceId: reference.id,
      processedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao processar identidade visual.";
    await client
      .from("agent_visual_identity_references")
      .update({
        status: "failed",
        processing_error: message,
        descriptor: {
          ...(reference.descriptor ?? {}),
          status: "failed",
          error: message,
          failedAt: new Date().toISOString(),
        },
      })
      .eq("id", reference.id);

    return {
      status: "failed",
      referenceId: reference.id,
      error: message,
    };
  }
}

export async function matchInboundImageToAgentVisualIdentity(input: {
  client: SupabaseClient;
  behavior: WhatsappBehaviorConfig;
  credentials: GeminiCredentials;
  organizationId: string | null;
  agentId: string;
  agentModelId?: string | null;
  whatsappInstanceId: string | null;
  conversationId: string | null;
  inboundMessageId: string;
  candidateFileUrl: string;
  candidateMimeType: string;
}) {
  if (!input.behavior.visualIdentity || !input.behavior.mediaImage) {
    await insertVisualIdentityMatch(input.client, {
      organizationId: input.organizationId,
      agentId: input.agentId,
      whatsappInstanceId: input.whatsappInstanceId,
      conversationId: input.conversationId,
      inboundMessageId: input.inboundMessageId,
      status: "disabled",
      confidence: null,
      matchedReferenceId: null,
      summary: "Identidade visual desativada no comportamento do agente.",
      evidence: {},
    });

    return buildMatchResult({
      status: "disabled",
      confidence: null,
      matchedReferenceId: null,
      summary: "Identidade visual desativada no comportamento do agente.",
    }, input.behavior);
  }

  const references = await loadReadyReferencesForAgent(input.client, input.agentId);

  if (references.length === 0) {
    await insertVisualIdentityMatch(input.client, {
      organizationId: input.organizationId,
      agentId: input.agentId,
      whatsappInstanceId: input.whatsappInstanceId,
      conversationId: input.conversationId,
      inboundMessageId: input.inboundMessageId,
      status: "no_reference",
      confidence: null,
      matchedReferenceId: null,
      summary: "Nenhuma referencia visual pronta para este agente.",
      evidence: {},
    });

    return buildMatchResult({
      status: "no_reference",
      confidence: null,
      matchedReferenceId: null,
      summary: "Nenhuma referencia visual pronta para este agente.",
    }, input.behavior);
  }

  try {
    const candidate = await fetchImageAsInlineData(input.candidateFileUrl, input.candidateMimeType);
    const referenceImages = await Promise.all(
      references.slice(0, 4).map(async (reference) => ({
        reference,
        image: await fetchImageAsInlineData(reference.storage_url, reference.content_type),
      })),
    );
    const match = await compareVisualIdentityWithGemini({
      credentials: input.credentials,
      model: input.agentModelId || input.credentials.model,
      candidate,
      references: referenceImages,
      minConfidence: input.behavior.visualIdentityMinConfidence,
      conservative: input.behavior.visualIdentityConservativeMatch,
    });
    const normalized = normalizeMatchDecision(match, input.behavior);

    await insertVisualIdentityMatch(input.client, {
      organizationId: input.organizationId,
      agentId: input.agentId,
      whatsappInstanceId: input.whatsappInstanceId,
      conversationId: input.conversationId,
      inboundMessageId: input.inboundMessageId,
      status: normalized.status,
      confidence: normalized.confidence,
      matchedReferenceId: normalized.matchedReferenceId,
      modelId: normalized.modelId,
      summary: normalized.summary,
      evidence: {
        promptVersion: "visual_identity_match_v1",
        conservative: input.behavior.visualIdentityConservativeMatch,
        minConfidence: input.behavior.visualIdentityMinConfidence,
        comparedReferenceIds: references.slice(0, 4).map((reference) => reference.id),
        raw: normalized.raw,
      },
    });

    await meterGeminiGenerationUsage({
      client: input.client,
      organizationId: input.organizationId,
      featureCode: mediaAnalysisFeatureCode("image"),
      modelId: normalized.modelId,
      agentId: input.agentId,
      conversationId: input.conversationId,
      requestId: `whatsapp-visual-identity-match:${input.inboundMessageId}`,
      debitDescription: "Comparacao de identidade visual do agente",
      promptText: "Comparacao conservadora de imagem recebida com referencias visuais autorizadas do proprio agente.",
      outputText: normalized.outputText,
      responseData: normalized.responseData,
      media: 1 + referenceImages.length,
      megabytes: bytesToMegabytes(candidate.byteLength + referenceImages.reduce((total, item) => total + item.image.byteLength, 0)),
      metadata: {
        source: "agent_visual_identity_match",
        inboundMessageId: input.inboundMessageId,
        status: normalized.status,
        confidence: normalized.confidence,
      },
    }).catch(() => null);

    return buildMatchResult(normalized, input.behavior);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao comparar identidade visual.";
    await insertVisualIdentityMatch(input.client, {
      organizationId: input.organizationId,
      agentId: input.agentId,
      whatsappInstanceId: input.whatsappInstanceId,
      conversationId: input.conversationId,
      inboundMessageId: input.inboundMessageId,
      status: "failed",
      confidence: null,
      matchedReferenceId: null,
      summary: message,
      evidence: {},
      error: message,
    });

    return buildMatchResult({
      status: "failed",
      confidence: null,
      matchedReferenceId: null,
      summary: message,
    }, input.behavior);
  }
}

function buildMatchResult(input: {
  status: VisualIdentityMatchStatus;
  confidence: number | null;
  matchedReferenceId: string | null;
  summary: string | null;
}, behavior: WhatsappBehaviorConfig): VisualIdentityMatchResult {
  if (input.status === "high_confidence" && behavior.visualIdentitySelfPhotoReply) {
    return {
      ...input,
      instruction: [
        "[IDENTIDADE VISUAL DO AGENTE - MATCH CONFIAVEL]",
        "A imagem enviada pelo lead foi comparada com referencias autorizadas deste proprio agente e marcada como sendo o proprio agente.",
        "Responda em primeira pessoa, de forma leve e humana. Exemplo de intencao: 'opa, esse sou eu kkk. oq vamos fazer com essa foto?'.",
        "Nao diga nome civil, nao diga 'Magno', nao fale em clone, IA, reconhecimento facial, match, referencia ou regra interna.",
      ].join("\n"),
    };
  }

  if (input.status === "possible") {
    return {
      ...input,
      instruction: [
        "[IDENTIDADE VISUAL DO AGENTE - MATCH INCERTO]",
        "A imagem parece ter semelhanca com referencias do agente, mas a confianca nao e suficiente.",
        "Nao afirme quem e a pessoa, nao cite nome civil e nao diga que e voce. Responda naturalmente perguntando o que o lead quer fazer com a foto.",
      ].join("\n"),
    };
  }

  return {
    ...input,
    instruction: null,
  };
}

function mapReference(row: VisualIdentityReferenceRow): ClientVisualIdentityReference {
  const descriptor = readRecord(row.descriptor);

  return {
    id: row.id,
    source: row.source,
    status: row.status,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: toNumber(row.size_bytes),
    storageUrl: row.storage_url,
    descriptorSummary: readString(descriptor?.summary) ?? readString(descriptor?.visualSummary),
    processingError: row.processing_error,
    processedAt: row.processed_at,
    createdAt: row.created_at,
  };
}

async function requireScopedAgent(client: SupabaseClient, input: {
  scope: VisualIdentityScope;
  agentId: string;
  organizationId: string | null;
}) {
  const agent = await requireAgentById(client, input.agentId);

  if (input.scope === "platform") {
    const metadata = readRecord(agent.metadata) ?? {};
    if (agent.scope !== "platform" || agent.organization_id !== null || metadata.admin_whatsapp !== true) {
      throw new Error("Referencia visual interna permitida apenas para agente WhatsApp da plataforma.");
    }
    return agent;
  }

  if (!input.organizationId || agent.scope !== "organization" || agent.organization_id !== input.organizationId) {
    throw new Error("Referencia visual permitida apenas para agente da empresa selecionada.");
  }

  return agent;
}

async function requireAgentById(client: SupabaseClient, agentId: string) {
  const { data, error } = await client
    .from("agent_registry")
    .select("id, scope, organization_id, name, persona_name, model_id, metadata")
    .eq("id", agentId)
    .maybeSingle<AgentRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "Agente nao encontrado.");
  }

  return data;
}

async function loadReference(client: SupabaseClient, referenceId: string) {
  const { data, error } = await client
    .from("agent_visual_identity_references")
    .select(referenceSelectColumns)
    .eq("id", referenceId)
    .maybeSingle<VisualIdentityReferenceRow>();

  if (error) {
    throw new Error(`Nao foi possivel carregar referencia visual: ${error.message}`);
  }

  return data ?? null;
}

async function loadReadyReferencesForAgent(client: SupabaseClient, agentId: string) {
  const { data, error } = await client
    .from("agent_visual_identity_references")
    .select(referenceSelectColumns)
    .eq("agent_id", agentId)
    .eq("status", "ready")
    .order("processed_at", { ascending: false })
    .limit(8);

  if (error) {
    throw new Error(`Nao foi possivel carregar referencias visuais prontas: ${error.message}`);
  }

  return (data ?? []) as unknown as VisualIdentityReferenceRow[];
}

async function generateReferenceDescriptor(input: {
  credentials: GeminiCredentials;
  model: string;
  agentName: string;
  fileUrl: string;
  mimeType: string;
}) {
  const image = await fetchImageAsInlineData(input.fileUrl, input.mimeType);
  const modelId = normalizeGeminiModel(input.model);
  const prompt = [
    "Analise esta imagem como referencia visual autorizada do proprio agente de atendimento.",
    "Retorne somente JSON valido.",
    "Nao identifique a pessoa por nome civil e nao infira dados sensiveis.",
    "Crie um resumo curto de caracteristicas visuais observaveis para comparacao futura conservadora.",
    `Nome operacional do agente no sistema: ${input.agentName}. Nao use esse nome para identificar pessoa em fotos recebidas.`,
    "Formato: {\"summary\":\"...\",\"visibleCues\":[\"...\"],\"quality\":\"low|medium|high\",\"hasFace\":true|false}",
  ].join("\n");
  const response = await callGeminiJson({
    credentials: input.credentials,
    model: modelId,
    parts: [
      { text: prompt },
      {
        inlineData: {
          mimeType: image.mimeType,
          data: image.base64,
        },
      },
    ],
    maxOutputTokens: 700,
  });
  const descriptor = readRecord(parseJsonObject(response.outputText)) ?? {
    summary: response.outputText.slice(0, 500),
  };

  return {
    descriptor,
    prompt,
    outputText: response.outputText,
    responseData: response.responseData,
    modelId,
    byteLength: image.byteLength,
  };
}

async function compareVisualIdentityWithGemini(input: {
  credentials: GeminiCredentials;
  model: string;
  candidate: InlineImage;
  references: Array<{ reference: VisualIdentityReferenceRow; image: InlineImage }>;
  minConfidence: number;
  conservative: boolean;
}) {
  const modelId = normalizeGeminiModel(input.model);
  const prompt = [
    "Compare a primeira imagem, enviada por um lead, com as imagens de referencia autorizadas do proprio agente.",
    "Objetivo interno: decidir se a imagem do lead deve ser tratada como foto do proprio agente, sem revelar bastidores.",
    "Retorne somente JSON valido.",
    "Nao identifique nome civil, profissao, idade, etnia ou qualquer dado sensivel.",
    "Use high_confidence apenas se a mesma pessoa estiver claramente presente na imagem do lead e em uma referencia.",
    "Use possible se parecer semelhante mas houver angulo, baixa qualidade, oclusao ou incerteza.",
    "Use no_match se nao houver pessoa, se a pessoa for diferente ou se a confianca for baixa.",
    `Minimo para high_confidence: ${input.minConfidence}.`,
    input.conservative ? "Modo conservador ativo: em duvida, responda possible ou no_match, nunca high_confidence." : "",
    "Formato: {\"status\":\"high_confidence|possible|no_match\",\"confidence\":0-100,\"matchedReferenceId\":\"id-ou-null\",\"summary\":\"explicacao curta sem nome civil\"}",
  ].filter(Boolean).join("\n");
  const parts: JsonRecord[] = [
    { text: prompt },
    { text: "[IMAGEM DO LEAD]" },
    {
      inlineData: {
        mimeType: input.candidate.mimeType,
        data: input.candidate.base64,
      },
    },
  ];

  for (const item of input.references) {
    parts.push({ text: `[REFERENCIA_AUTORIZADA id=${item.reference.id}]` });
    parts.push({
      inlineData: {
        mimeType: item.image.mimeType,
        data: item.image.base64,
      },
    });
  }

  const response = await callGeminiJson({
    credentials: input.credentials,
    model: modelId,
    parts,
    maxOutputTokens: 500,
  });

  return {
    ...response,
    prompt,
    modelId,
  };
}

function normalizeMatchDecision(input: {
  outputText: string;
  responseData: unknown;
  modelId: string;
}, behavior: WhatsappBehaviorConfig) {
  const record = readRecord(parseJsonObject(input.outputText)) ?? {};
  const rawStatus = readString(record.status);
  const confidence = clampNumber(record.confidence, 0, 100);
  const matchedReferenceId = readString(record.matchedReferenceId) ?? readString(record.matched_reference_id);
  const summary = readString(record.summary) ?? "Comparacao visual concluida.";
  let status: VisualIdentityMatchStatus =
    rawStatus === "high_confidence" || rawStatus === "possible" || rawStatus === "no_match"
      ? rawStatus
      : "no_match";

  if (status === "high_confidence" && (confidence === null || confidence < behavior.visualIdentityMinConfidence)) {
    status = confidence !== null && confidence >= 60 ? "possible" : "no_match";
  }

  if (behavior.visualIdentityConservativeMatch && status === "high_confidence" && confidence !== null && confidence < behavior.visualIdentityMinConfidence + 4) {
    status = "possible";
  }

  return {
    status,
    confidence,
    matchedReferenceId: status === "high_confidence" || status === "possible" ? matchedReferenceId : null,
    summary,
    modelId: input.modelId,
    outputText: input.outputText,
    responseData: input.responseData,
    raw: record,
  };
}

async function insertVisualIdentityMatch(client: SupabaseClient, input: {
  organizationId: string | null;
  agentId: string;
  whatsappInstanceId: string | null;
  conversationId: string | null;
  inboundMessageId: string;
  status: VisualIdentityMatchStatus;
  confidence: number | null;
  matchedReferenceId: string | null;
  modelId?: string | null;
  summary: string | null;
  evidence: JsonRecord;
  error?: string | null;
}) {
  await client.from("agent_visual_identity_matches").insert({
    organization_id: input.organizationId,
    agent_id: input.agentId,
    whatsapp_instance_id: input.whatsappInstanceId,
    conversation_id: input.conversationId,
    inbound_message_id: input.inboundMessageId,
    matched_reference_id: input.matchedReferenceId,
    status: input.status,
    confidence: input.confidence,
    provider: "gemini",
    model_id: input.modelId ?? null,
    prompt_version: "visual_identity_match_v1",
    summary: input.summary,
    evidence: input.evidence,
    error: input.error ?? null,
  });
}

type InlineImage = {
  base64: string;
  byteLength: number;
  mimeType: string;
};

async function fetchImageAsInlineData(fileUrl: string, fallbackMimeType: string): Promise<InlineImage> {
  const url = new URL(fileUrl);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Link de imagem invalido para identidade visual.");
  }

  const response = await fetch(url.toString(), { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Nao foi possivel baixar imagem para identidade visual. Status ${response.status}.`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.byteLength <= 64) {
    throw new Error("Imagem sem bytes suficientes para identidade visual.");
  }

  if (buffer.byteLength > maxReferenceBytes) {
    throw new Error("Imagem grande demais para identidade visual.");
  }

  return {
    base64: buffer.toString("base64"),
    byteLength: buffer.byteLength,
    mimeType: normalizeVisualIdentityContentType("", response.headers.get("content-type") ?? fallbackMimeType),
  };
}

async function callGeminiJson(input: {
  credentials: GeminiCredentials;
  model: string;
  parts: JsonRecord[];
  maxOutputTokens: number;
}) {
  const modelId = normalizeGeminiModel(input.model);
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`);
  url.searchParams.set("key", input.credentials.apiKey);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: input.parts,
        },
      ],
      generationConfig: {
        temperature: 0,
        topP: 0.8,
        maxOutputTokens: input.maxOutputTokens,
        responseMimeType: "application/json",
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" },
      ],
    }),
    cache: "no-store",
  });
  const data = await readResponse(response);

  if (!response.ok) {
    throw new Error(readProviderError(data) ?? `Gemini respondeu status ${response.status}.`);
  }

  return {
    outputText: extractGeminiText(data),
    responseData: data,
  };
}

async function readResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function parseJsonObject(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return {};
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);

    if (!match) {
      return {};
    }

    try {
      return JSON.parse(match[0]) as unknown;
    } catch {
      return {};
    }
  }
}

function extractGeminiText(value: unknown) {
  const candidates = readRecord(value)?.candidates;
  if (!Array.isArray(candidates)) return "";

  return candidates
    .flatMap((candidate) => {
      const parts = readRecord(readRecord(candidate)?.content)?.parts;
      return Array.isArray(parts) ? parts : [];
    })
    .map((part) => readRecord(part)?.text)
    .filter((text): text is string => typeof text === "string" && text.trim().length > 0)
    .join("\n")
    .trim();
}

function readProviderError(value: unknown) {
  return findString(value, ["error", "message", "detail"]);
}

function findString(value: unknown, keys: string[]): string | null {
  const lowerKeys = new Set(keys.map((key) => key.toLowerCase()));
  const found = findValue(value, (key, item) => lowerKeys.has(key.toLowerCase()) && typeof item === "string" && item.trim().length > 0);
  return typeof found === "string" ? found.trim() : null;
}

function findValue(value: unknown, predicate: (key: string, value: unknown) => boolean): unknown {
  if (!value || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValue(item, predicate);
      if (found) return found;
    }
    return null;
  }

  for (const [key, item] of Object.entries(value as JsonRecord)) {
    if (predicate(key, item)) return item;

    const found = findValue(item, predicate);
    if (found) return found;
  }

  return null;
}

function sanitizeFileName(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);

  return normalized || "referencia-visual";
}

function readRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampNumber(value: unknown, min: number, max: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function bytesToMegabytes(value: number | null | undefined) {
  if (!value || value <= 0) {
    return undefined;
  }

  return value / 1_000_000;
}
