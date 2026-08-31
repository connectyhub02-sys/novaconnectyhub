import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getOrganizationSalesCatalogSettings,
  mapSalesCatalogItem,
} from "@/lib/client-os/sales-catalog";
import { normalizeCurrencyAmount } from "@/lib/sales-catalog/mercado-pago";
import {
  isSalesCatalogDisplayableProduct,
  type ClientSalesCatalogItem,
  type ClientSalesCatalogSettings,
  type SalesCatalogCommerceAgentSurface,
} from "@/lib/sales-catalog/shared";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyOrganizationTrackingToken } from "@/lib/tracking/organization-attribution";
import { resolveLeadTrackingContext } from "@/lib/tracking/lead-context";
import { meterGeminiGenerationUsage } from "@/lib/billing/gemini-metering";
import { loadGeminiCredentials, normalizeGeminiModel, type GeminiCredentials } from "@/lib/gemini/credentials";
import { defaultWhatsappAgentPrompt, defaultWhatsappGlobalPrompt } from "@/lib/whatsapp/agent-behavior";
import {
  buildAgentPromptFromTemplate,
  normalizeAgentPromptBuilderConfig,
  promptBuilderMetadataKey,
} from "@/lib/whatsapp/agent-prompt-templates";
import { readWhatsappInstanceProfileImageUrl } from "@/lib/whatsapp/instance-profile-image";
import { resolveLeadPersonalName } from "@/lib/whatsapp/lead-names";

type JsonRecord = Record<string, unknown>;

type CommerceAgentBody = {
  organization_id?: unknown;
  tracking_token?: unknown;
  lead_id?: unknown;
  lead_phone?: unknown;
  conversation_id?: unknown;
  agent_id?: unknown;
  agentId?: unknown;
  tracking_link_id?: unknown;
  order_id?: unknown;
  payment_session_id?: unknown;
  product_id?: unknown;
  catalog_item_id?: unknown;
  visitor_cookie_id?: unknown;
  session_cookie_id?: unknown;
  commerce_session_id?: unknown;
  surface?: unknown;
  page_path?: unknown;
  page_url?: unknown;
  page_title?: unknown;
  referrer?: unknown;
  message?: unknown;
  action_type?: unknown;
  actionType?: unknown;
  status?: unknown;
  request_payload?: unknown;
  requestPayload?: unknown;
  result_payload?: unknown;
  resultPayload?: unknown;
  reason?: unknown;
};

type OrganizationRow = {
  id: string;
  name: string;
  metadata: JsonRecord | null;
};

type LeadRow = {
  id: string;
  display_name: string | null;
  phone_number: string | null;
  metadata: JsonRecord | null;
};

type AgentRow = {
  id: string;
  name: string | null;
  persona_name: string | null;
  prompt: string | null;
  model_id: string | null;
  avatar_url: string | null;
  avatar_alt: string | null;
  metadata: JsonRecord | null;
};

type WhatsappRow = {
  phone_number: string | null;
  metadata: JsonRecord | null;
};

type CommerceSessionRow = {
  id: string;
};

type CommerceSessionContextRow = {
  id: string;
  lead_id: string | null;
  conversation_id: string | null;
  tracking_link_id: string | null;
  order_id: string | null;
  payment_session_id: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  metadata: JsonRecord | null;
};

type CommerceAgentMessageRow = {
  id: string;
  role: "lead" | "assistant" | "system" | "tool";
  content: string;
  metadata: JsonRecord | null;
  created_at: string;
};

type WhatsappConversationMessageRow = {
  id: string;
  direction: "inbound" | "outbound" | "system" | "unknown";
  message_type: string | null;
  text_content: string | null;
  payload: JsonRecord | null;
  occurred_at: string;
};

type CommerceTrackingEventRow = {
  event_type: string;
  title: string | null;
  summary: string | null;
  payload: JsonRecord | null;
  created_at: string | null;
};

type CommerceOrderItem = {
  title: string;
  quantity: number;
  totalLabel: string | null;
  catalogItemId: string | null;
  skuCode: string | null;
};

type OfferProduct = {
  id: string;
  title: string;
  category: string | null;
  description: string | null;
  tag: string | null;
  priceLabel: string | null;
};

type CommerceAgentPromptContext = {
  currentProduct: OfferProduct | null;
  contextualOffer: OfferProduct | null;
  orderItems: CommerceOrderItem[];
  commerceMessages: CommerceAgentMessageRow[];
  whatsappMessages: WhatsappConversationMessageRow[];
  recentEvents: CommerceTrackingEventRow[];
  catalogProducts: OfferProduct[];
};

const geminiSafetySettings = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" },
];

const commerceAgentResponseTimeoutMs = 45000;
const commerceAgentMaxOutputTokens = 520;
const commerceAgentAssistantMaxLength = 1600;

export type CommerceAgentResolvedContext =
  | {
      ok: false;
      status: number;
      error: string;
    }
  | {
      ok: true;
      client: SupabaseClient;
      organization: OrganizationRow;
      settings: ClientSalesCatalogSettings;
      lead: LeadRow | null;
      leadId: string | null;
      leadName: string | null;
      leadPhone: string | null;
      conversationId: string | null;
      surface: SalesCatalogCommerceAgentSurface | "unknown";
      commerceSessionId: string | null;
      visitorId: string | null;
      sessionId: string | null;
      trackingLinkId: string | null;
      orderId: string | null;
      paymentSessionId: string | null;
      productId: string | null;
      pagePath: string | null;
      pageUrl: string | null;
      agentId: string | null;
      agentName: string;
      agentPrompt: string | null;
      agentModelId: string | null;
      agentMetadata: JsonRecord | null;
      globalAgentPrompt: string | null;
      agentAvatarUrl: string | null;
      agentAvatarAlt: string | null;
      whatsappHref: string | null;
    };

export type CommerceAgentSessionPayload = {
  enabled: boolean;
  commerceSessionId: string | null;
  mode: ClientSalesCatalogSettings["commerceAgent"]["mode"];
  surface: SalesCatalogCommerceAgentSurface | "unknown";
  checkoutQuietMode: boolean;
  dockLabel: string;
  agentId: string | null;
  agentName: string;
  agentAvatarUrl: string | null;
  agentAvatarAlt: string | null;
  leadName: string | null;
  welcomeMessage: string | null;
  whisperMessage: string | null;
  whatsappHref: string | null;
  quickActions: Array<{
    id: string;
    label: string;
    message: string;
  }>;
  messages: Array<{
    id: string;
    role: "lead" | "assistant" | "system";
    content: string;
  }>;
};

export async function resolveCommerceAgentContext(body: CommerceAgentBody): Promise<CommerceAgentResolvedContext> {
  const organizationId = readUuid(body.organization_id);
  const trackingToken = readString(body.tracking_token);
  const surface = normalizeSurface(readString(body.surface) ?? inferSurface(readString(body.page_path)));
  const requestedCommerceSessionId = readUuid(body.commerce_session_id);
  const requestedOrderId = readUuid(body.order_id);
  const requestedPaymentSessionId = readUuid(body.payment_session_id);
  const requestedTrackingLinkId = readUuid(body.tracking_link_id);
  const visitorId = readString(body.visitor_cookie_id);
  const sessionId = readString(body.session_cookie_id);
  const client = createServiceClient();

  if (!organizationId) {
    return { ok: false, status: 403, error: "Contexto da loja nao autorizado." };
  }

  const hydratedSession = await findCommerceSessionContext(client, organizationId, {
    commerceSessionId: requestedCommerceSessionId,
    visitorId,
    sessionId,
  }).catch(() => null);
  const hasValidTrackingToken = verifyOrganizationTrackingToken(organizationId, trackingToken);
  const hasValidCheckoutContext = hasValidTrackingToken
    ? false
    : await validateCheckoutCommerceAgentContext(client, {
        organizationId,
        surface,
        orderId: requestedOrderId,
        paymentSessionId: requestedPaymentSessionId,
      }).catch(() => false);
  const hasValidTrackedLinkContext = hasValidTrackingToken || hasValidCheckoutContext
    ? false
    : await validateTrackedLinkCommerceAgentContext(client, {
        organizationId,
        trackingLinkId: requestedTrackingLinkId,
      }).catch(() => false);
  const hasValidHydratedSessionContext = Boolean(
    hydratedSession?.id
      && (hydratedSession.lead_id || hydratedSession.conversation_id || hydratedSession.tracking_link_id || hydratedSession.order_id || hydratedSession.payment_session_id),
  );

  if (!hasValidTrackingToken && !hasValidCheckoutContext && !hasValidTrackedLinkContext && !hasValidHydratedSessionContext) {
    return { ok: false, status: 403, error: "Contexto da loja nao autorizado." };
  }

  const { data: organization, error: organizationError } = await client
    .from("organizations")
    .select("id, name, metadata")
    .eq("id", organizationId)
    .maybeSingle<OrganizationRow>();

  if (organizationError || !organization) {
    return { ok: false, status: 404, error: "Loja nao encontrada." };
  }

  const settings = await getOrganizationSalesCatalogSettings(client, organization.id);
  const commerceAgent = settings?.commerceAgent;

  if (!settings || !commerceAgent?.enabled || !commerceAgent.surfaces.includes(surface as SalesCatalogCommerceAgentSurface)) {
    return { ok: false, status: 200, error: "Agente da loja inativo." };
  }

  const hydratedSessionMetadata = readRecord(hydratedSession?.metadata);
  const trackingLinkId = requestedTrackingLinkId ?? readUuid(hydratedSession?.tracking_link_id);
  const orderId = requestedOrderId ?? readUuid(hydratedSession?.order_id);
  const paymentSessionId = requestedPaymentSessionId ?? readUuid(hydratedSession?.payment_session_id);
  const leadContext = await resolveLeadTrackingContext(client, {
    organizationId: organization.id,
    leadId: readString(body.lead_id) ?? readString(hydratedSession?.lead_id),
    conversationId: readString(body.conversation_id) ?? readString(hydratedSession?.conversation_id),
    leadPhone: readString(body.lead_phone) ?? readString(hydratedSession?.lead_phone),
  });
  const lead = leadContext.leadId
    ? await loadLead(client, organization.id, leadContext.leadId)
    : null;
  const leadName = (lead
    ? resolveLeadPersonalName({ displayName: lead.display_name, metadata: lead.metadata })
    : null) ?? readString(hydratedSession?.lead_name);
  const requestedAgentId = readUuid(body.agent_id)
    ?? readUuid(body.agentId)
    ?? readUuid(hydratedSessionMetadata?.agent_id);
  let agent = await loadCommerceAgent(
    client,
    organization.id,
    requestedAgentId ?? settings.automationSettings.defaultAgentId,
  );

  if (!agent && requestedAgentId) {
    agent = await loadCommerceAgent(client, organization.id, settings.automationSettings.defaultAgentId);
  }

  const globalAgent = await loadGlobalCommerceAgent(client, organization.id).catch(() => null);
  const agentName = readString(agent?.persona_name) ?? readString(agent?.name) ?? "Agente ConnectyHub";
  const agentWhatsappInstance = await loadAgentWhatsappInstance(client, organization.id, agent?.id ?? null);
  const fallbackWhatsappInstance = agentWhatsappInstance
    ? null
    : await loadFallbackWhatsappInstance(client, organization.id);
  const whatsappInstance = agentWhatsappInstance ?? fallbackWhatsappInstance;
  const whatsappHref = buildWhatsappHref({
    organizationName: organization.name,
    instance: whatsappInstance,
    agentName,
    leadName,
  });
  const agentAvatarUrl = readWhatsappInstanceProfileImageUrl(whatsappInstance?.metadata)
    ?? readString(agent?.avatar_url);
  const context = {
    ok: true,
    client,
    organization,
    settings,
    lead,
    leadId: leadContext.leadId,
    leadName,
    leadPhone: leadContext.leadPhone
      ?? normalizePhone(readString(lead?.phone_number))
      ?? normalizePhone(readString(hydratedSession?.lead_phone)),
    conversationId: leadContext.conversationId,
    surface,
    commerceSessionId: requestedCommerceSessionId ?? hydratedSession?.id ?? null,
    visitorId,
    sessionId,
    trackingLinkId,
    orderId,
    paymentSessionId,
    productId: readUuid(body.product_id) ?? readUuid(body.catalog_item_id),
    pagePath: readString(body.page_path),
    pageUrl: readString(body.page_url),
    agentId: agent?.id ?? null,
    agentName,
    agentPrompt: readString(agent?.prompt),
    agentModelId: readString(agent?.model_id),
    agentMetadata: readRecord(agent?.metadata),
    globalAgentPrompt: readString(globalAgent?.prompt),
    agentAvatarUrl,
    agentAvatarAlt: readString(agent?.avatar_alt) ?? agentName,
    whatsappHref,
  } satisfies Extract<CommerceAgentResolvedContext, { ok: true }>;

  const commerceSessionId = await ensureCommerceSession(context).catch(() => context.commerceSessionId);

  return {
    ...context,
    commerceSessionId,
  };
}

export async function buildCommerceAgentSessionPayload(
  context: Extract<CommerceAgentResolvedContext, { ok: true }>,
): Promise<CommerceAgentSessionPayload> {
  const promptContext = await loadCommerceAgentPromptContext(context, { includeMessages: false }).catch(() => emptyPromptContext());
  await recordCommerceAgentPageContext(context, promptContext).catch(() => undefined);
  const messages = await loadRecentMessages(context).catch(() => []);
  const visibleMessages = messages.filter((message) => message.role === "lead" || message.role === "assistant");
  const welcomeMessage = buildWelcomeMessage(context, promptContext);

  return {
    enabled: true,
    commerceSessionId: context.commerceSessionId,
    mode: context.settings.commerceAgent.mode,
    surface: context.surface,
    checkoutQuietMode: context.settings.commerceAgent.checkoutQuietMode,
    dockLabel: context.settings.commerceAgent.agentDockLabel ?? "Estou por aqui",
    agentId: context.agentId,
    agentName: context.agentName,
    agentAvatarUrl: context.agentAvatarUrl,
    agentAvatarAlt: context.agentAvatarAlt,
    leadName: context.leadName,
    welcomeMessage,
    whisperMessage: buildWhisperMessage(context, promptContext),
    whatsappHref: context.whatsappHref,
    quickActions: buildQuickActions(context),
    messages: visibleMessages.map((message) => ({
      id: message.id,
      role: message.role === "lead" || message.role === "assistant" ? message.role : "system",
      content: message.content,
    })),
  };
}

export async function persistCommerceAgentMessage(input: {
  context: Extract<CommerceAgentResolvedContext, { ok: true }>;
  role: "lead" | "assistant" | "system";
  content: string;
}) {
  if (!input.context.commerceSessionId) {
    return null;
  }

  const { data } = await input.context.client
    .from("commerce_agent_messages")
    .insert({
      organization_id: input.context.organization.id,
      commerce_session_id: input.context.commerceSessionId,
      lead_id: input.context.leadId,
      conversation_id: input.context.conversationId,
      role: input.role,
      channel: input.context.surface === "unknown" ? "storefront" : input.context.surface,
      surface: input.context.surface,
      content: input.content.slice(0, 4000),
      metadata: {
        agent_id: input.context.agentId,
        agent_name: input.context.agentName,
        page_path: input.context.pagePath,
        page_url: input.context.pageUrl,
      },
    })
    .select("id, role, content, created_at")
    .single<CommerceAgentMessageRow>();

  return data ?? null;
}

export async function recordCommerceAgentAction(input: {
  context: Extract<CommerceAgentResolvedContext, { ok: true }>;
  actionType: string;
  status: string;
  requestPayload?: JsonRecord;
  resultPayload?: JsonRecord;
  reason?: string | null;
}) {
  if (!input.context.commerceSessionId) {
    return;
  }

  await input.context.client.from("commerce_agent_actions").insert({
    organization_id: input.context.organization.id,
    commerce_session_id: input.context.commerceSessionId,
    lead_id: input.context.leadId,
    conversation_id: input.context.conversationId,
    created_by_agent_id: input.context.agentId,
    action_type: input.actionType,
    status: input.status,
    surface: input.context.surface,
    catalog_item_id: input.context.productId,
    order_id: input.context.orderId,
    payment_session_id: input.context.paymentSessionId,
    request_payload: input.requestPayload ?? {},
    result_payload: input.resultPayload ?? {},
    reason: input.reason ?? null,
    applied_at: input.status === "applied" ? new Date().toISOString() : null,
    metadata: {
      agent_id: input.context.agentId,
      agent_name: input.context.agentName,
      page_path: input.context.pagePath,
      page_url: input.context.pageUrl,
    },
  });
}

export async function buildCommerceAgentReply(input: {
  context: Extract<CommerceAgentResolvedContext, { ok: true }>;
  message: string;
}) {
  const generated = await generateCommerceAgentReply(input).catch(() => null);

  if (generated) {
    return generated;
  }

  return buildFallbackCommerceAgentReply(input);
}

async function generateCommerceAgentReply(input: {
  context: Extract<CommerceAgentResolvedContext, { ok: true }>;
  message: string;
}) {
  const promptContext = await loadCommerceAgentPromptContext(input.context);
  const credentials = await loadGeminiCredentials(input.context.client);
  const modelId = normalizeGeminiModel(input.context.agentModelId || credentials.model);
  const systemInstruction = buildCommerceAgentSystemInstruction(input.context, promptContext);
  const turnPrompt = buildCommerceAgentTurnPrompt(input.context, input.message, promptContext);
  const data = await callGeminiCommerceAgent({
    credentials,
    modelId,
    systemInstruction,
    turnPrompt,
  });
  const text = normalizeCommerceAssistantText(extractGeminiText(data));

  if (!text) {
    const blockReason = extractGeminiBlockReason(data);
    throw new Error(blockReason ? `Gemini bloqueou a resposta: ${blockReason}.` : "Gemini nao retornou resposta.");
  }

  await meterGeminiGenerationUsage({
    client: input.context.client,
    organizationId: input.context.organization.id,
    featureCode: "chat_completion",
    modelId,
    agentId: input.context.agentId,
    conversationId: input.context.conversationId,
    leadId: input.context.leadId,
    promptText: [systemInstruction, turnPrompt],
    outputText: text,
    responseData: data,
    requestId: buildCommerceAgentRequestId(input.context, input.message),
    debitDescription: "Atendimento do agente na loja",
    metadata: {
      source: "commerce_agent",
      channel: "storefront",
      surface: input.context.surface,
      commerce_session_id: input.context.commerceSessionId,
      tracking_link_id: input.context.trackingLinkId,
    },
  }).catch(() => null);

  return text;
}

async function callGeminiCommerceAgent(input: {
  credentials: GeminiCredentials;
  modelId: string;
  systemInstruction: string;
  turnPrompt: string;
}) {
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.modelId)}:generateContent`);
  url.searchParams.set("key", input.credentials.apiKey);

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: input.systemInstruction }],
      },
      contents: [{
        role: "user",
        parts: [{ text: input.turnPrompt }],
      }],
      generationConfig: {
        temperature: 0.62,
        topP: 0.9,
        maxOutputTokens: commerceAgentMaxOutputTokens,
      },
      safetySettings: geminiSafetySettings,
    }),
    cache: "no-store",
  }, commerceAgentResponseTimeoutMs, "Gemini commerce agent");
  const data = await withTimeout(readProviderResponse(response), commerceAgentResponseTimeoutMs, "leitura Gemini commerce agent");

  if (!response.ok) {
    throw new Error(readProviderError(data) ?? `Gemini respondeu status ${response.status}.`);
  }

  return data;
}

async function buildFallbackCommerceAgentReply(input: {
  context: Extract<CommerceAgentResolvedContext, { ok: true }>;
  message: string;
}) {
  const text = input.message.toLowerCase();
  const promptContext = await loadCommerceAgentPromptContext(input.context, { includeMessages: false }).catch(() => emptyPromptContext());
  const offer = promptContext.contextualOffer ?? await resolveContextualOffer(input.context).catch(() => null);

  if (text.includes("whatsapp")) {
    return input.context.whatsappHref
      ? "Claro. Se quiser, voce pode voltar para o WhatsApp pelo atalho daqui, e eu continuo com o contexto desta compra."
      : "Posso continuar por aqui. Seu atendimento permanece conectado ao pedido.";
  }

  if (text.includes("carrinho") || text.includes("pedido") || text.includes("revisar")) {
    return offer
      ? `Seu pedido esta no caminho certo. Tambem posso sugerir ${offer.title}, que combina com essa compra. Quer que eu te mostre?`
      : "Posso revisar seu pedido com voce antes de finalizar. Se quiser, me diga o que esta em duvida.";
  }

  if (text.includes("sugest") || text.includes("combina") || text.includes("oferta") || text.includes("adicionar")) {
    return offer
      ? `A melhor sugestao agora e ${offer.title}${offer.priceLabel ? ` (${offer.priceLabel})` : ""}. Ela faz sentido como complemento para esta compra.`
      : buildNoOfferMessage(input.context);
  }

  if (input.context.surface === "checkout") {
    const orderLine = formatOrderItemsForSentence(promptContext.orderItems);

    return offer
      ? `${orderLine ? `Seu pedido esta com ${orderLine}. ` : ""}Antes de pagar, ${offer.title} pode ser uma boa adicao se fizer sentido pra voce.`
      : "Estou aqui para ajudar na finalizacao. Se algo travar no pagamento ou no pedido, me chama por aqui.";
  }

  return offer
    ? `Posso te ajudar com essa escolha. Pelo contexto, ${offer.title} parece uma boa opcao complementar.`
    : "Estou acompanhando sua compra por aqui. Me diga sua duvida e eu te ajudo a escolher ou finalizar.";
}

async function ensureCommerceSession(context: Extract<CommerceAgentResolvedContext, { ok: true }>) {
  const now = new Date().toISOString();
  const currentSession = context.commerceSessionId
    ? await loadCommerceSessionById(context.client, context.organization.id, context.commerceSessionId)
    : await findCommerceSession(context);
  const payload = {
    organization_id: context.organization.id,
    lead_id: context.leadId,
    conversation_id: context.conversationId,
    visitor_cookie_id: context.visitorId,
    session_cookie_id: context.sessionId,
    tracking_link_id: context.trackingLinkId,
    order_id: context.orderId,
    payment_session_id: context.paymentSessionId,
    status: "active",
    current_url: context.pageUrl,
    current_path: context.pagePath,
    last_surface: context.surface,
    lead_name: context.leadName,
    lead_phone: context.leadPhone,
    metadata: {
      source: "commerce_agent_session",
      agent_id: context.agentId,
      agent_name: context.agentName,
      product_id: context.productId,
    },
    last_seen_at: now,
  };

  await upsertLeadWebIdentities(context, now);

  if (currentSession) {
    await context.client.from("commerce_sessions").update(payload).eq("id", currentSession.id);
    return currentSession.id;
  }

  const { data } = await context.client
    .from("commerce_sessions")
    .insert({
      ...payload,
      landing_url: context.pageUrl,
      first_seen_at: now,
    })
    .select("id")
    .single<CommerceSessionRow>();

  return data?.id ?? null;
}

async function upsertLeadWebIdentities(
  context: Extract<CommerceAgentResolvedContext, { ok: true }>,
  now: string,
) {
  const rows = [
    context.visitorId ? { identity_type: "visitor_cookie", identity_value: context.visitorId } : null,
    context.sessionId ? { identity_type: "session_cookie", identity_value: context.sessionId } : null,
    context.trackingLinkId ? { identity_type: "tracking_link", identity_value: context.trackingLinkId } : null,
  ].filter((row): row is { identity_type: string; identity_value: string } => Boolean(row));

  if (rows.length === 0) {
    return;
  }

  await context.client.from("lead_web_identities").upsert(
    rows.map((row) => ({
      organization_id: context.organization.id,
      lead_id: context.leadId,
      conversation_id: context.conversationId,
      identity_type: row.identity_type,
      identity_value: row.identity_value,
      confidence: context.leadId ? 0.95 : 0.65,
      last_seen_at: now,
      metadata: {
        source: "commerce_agent",
        agent_id: context.agentId,
        agent_name: context.agentName,
        page_path: context.pagePath,
      },
    })),
    { onConflict: "organization_id,identity_type,identity_value" },
  );
}

async function loadCommerceAgentPromptContext(
  context: Extract<CommerceAgentResolvedContext, { ok: true }>,
  options: { includeMessages?: boolean } = {},
): Promise<CommerceAgentPromptContext> {
  const includeMessages = options.includeMessages !== false;
  const [
    currentProduct,
    contextualOffer,
    orderItems,
    commerceMessages,
    whatsappMessages,
    recentEvents,
    catalogProducts,
  ] = await Promise.all([
    loadCurrentProduct(context),
    resolveContextualOffer(context).catch(() => null),
    loadCurrentOrderItems(context).catch(() => []),
    includeMessages ? loadRecentMessages(context).catch(() => []) : Promise.resolve([]),
    includeMessages ? loadWhatsappConversationMessages(context).catch(() => []) : Promise.resolve([]),
    loadRecentCommerceEvents(context).catch(() => []),
    loadCatalogProducts(context.client, context.organization.id).catch(() => []),
  ]);

  return {
    currentProduct,
    contextualOffer,
    orderItems,
    commerceMessages,
    whatsappMessages,
    recentEvents,
    catalogProducts,
  };
}

function emptyPromptContext(): CommerceAgentPromptContext {
  return {
    currentProduct: null,
    contextualOffer: null,
    orderItems: [],
    commerceMessages: [],
    whatsappMessages: [],
    recentEvents: [],
    catalogProducts: [],
  };
}

async function recordCommerceAgentPageContext(
  context: Extract<CommerceAgentResolvedContext, { ok: true }>,
  promptContext: CommerceAgentPromptContext,
) {
  if (!context.commerceSessionId) {
    return;
  }

  const pageKey = buildPageContextKey(context);
  const { data: existing } = await context.client
    .from("commerce_agent_messages")
    .select("id")
    .eq("organization_id", context.organization.id)
    .eq("commerce_session_id", context.commerceSessionId)
    .eq("role", "system")
    .filter("metadata->>event_type", "eq", "page_context")
    .filter("metadata->>page_key", "eq", pageKey)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (existing) {
    return;
  }

  const content = buildPageContextMessage(context, promptContext);

  await context.client.from("commerce_agent_messages").insert({
    organization_id: context.organization.id,
    commerce_session_id: context.commerceSessionId,
    lead_id: context.leadId,
    conversation_id: context.conversationId,
    role: "system",
    channel: context.surface === "unknown" ? "storefront" : context.surface,
    surface: context.surface,
    content,
    metadata: {
      event_type: "page_context",
      page_key: pageKey,
      agent_id: context.agentId,
      agent_name: context.agentName,
      page_path: context.pagePath,
      page_url: context.pageUrl,
      surface: context.surface,
      product_id: context.productId,
      current_product_title: promptContext.currentProduct?.title ?? null,
      order_item_titles: promptContext.orderItems.map((item) => item.title).slice(0, 8),
    },
  });
}

function buildPageContextKey(context: Extract<CommerceAgentResolvedContext, { ok: true }>) {
  return [
    context.surface,
    context.pagePath,
    context.productId,
    context.orderId,
    context.paymentSessionId,
  ].filter(Boolean).join(":").slice(0, 700);
}

function buildPageContextMessage(
  context: Extract<CommerceAgentResolvedContext, { ok: true }>,
  promptContext: CommerceAgentPromptContext,
) {
  if (context.surface === "product" && promptContext.currentProduct) {
    return `O lead abriu a pagina do produto ${promptContext.currentProduct.title}${promptContext.currentProduct.priceLabel ? ` (${promptContext.currentProduct.priceLabel})` : ""}.`;
  }

  if (context.surface === "checkout") {
    const order = formatOrderItemsForSentence(promptContext.orderItems);
    return order
      ? `O lead chegou ao checkout com ${order}.`
      : "O lead chegou ao checkout.";
  }

  if (context.surface === "cart") {
    const order = formatOrderItemsForSentence(promptContext.orderItems);
    return order
      ? `O lead abriu o carrinho com ${order}.`
      : "O lead abriu o carrinho da loja.";
  }

  if (context.surface === "store") {
    return "O lead abriu a loja publica e esta navegando pelo catalogo.";
  }

  return "O lead mudou de pagina dentro da loja.";
}

async function loadCommerceSessionById(client: SupabaseClient, organizationId: string, sessionId: string) {
  const { data } = await client
    .from("commerce_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("organization_id", organizationId)
    .maybeSingle<CommerceSessionRow>();

  return data ?? null;
}

async function findCommerceSessionContext(
  client: SupabaseClient,
  organizationId: string,
  input: {
    commerceSessionId: string | null;
    visitorId: string | null;
    sessionId: string | null;
  },
) {
  const select = "id, lead_id, conversation_id, tracking_link_id, order_id, payment_session_id, lead_name, lead_phone, metadata";

  if (input.commerceSessionId) {
    const { data } = await client
      .from("commerce_sessions")
      .select(select)
      .eq("id", input.commerceSessionId)
      .eq("organization_id", organizationId)
      .maybeSingle<CommerceSessionContextRow>();

    if (data) return data;
  }

  if (input.sessionId) {
    const { data } = await client
      .from("commerce_sessions")
      .select(select)
      .eq("organization_id", organizationId)
      .eq("session_cookie_id", input.sessionId)
      .eq("status", "active")
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle<CommerceSessionContextRow>();

    if (data) return data;
  }

  if (!input.visitorId) {
    return null;
  }

  const { data } = await client
    .from("commerce_sessions")
    .select(select)
    .eq("organization_id", organizationId)
    .eq("visitor_cookie_id", input.visitorId)
    .eq("status", "active")
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle<CommerceSessionContextRow>();

  return data ?? null;
}

async function findCommerceSession(context: Extract<CommerceAgentResolvedContext, { ok: true }>) {
  if (context.sessionId) {
    const { data } = await context.client
      .from("commerce_sessions")
      .select("id")
      .eq("organization_id", context.organization.id)
      .eq("session_cookie_id", context.sessionId)
      .eq("status", "active")
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle<CommerceSessionRow>();

    if (data) return data;
  }

  if (!context.visitorId) {
    return null;
  }

  const { data } = await context.client
    .from("commerce_sessions")
    .select("id")
    .eq("organization_id", context.organization.id)
    .eq("visitor_cookie_id", context.visitorId)
    .eq("status", "active")
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle<CommerceSessionRow>();

  return data ?? null;
}

async function loadRecentMessages(context: Extract<CommerceAgentResolvedContext, { ok: true }>) {
  if (!context.commerceSessionId) {
    return [];
  }

  const { data } = await context.client
    .from("commerce_agent_messages")
    .select("id, role, content, metadata, created_at")
    .eq("organization_id", context.organization.id)
    .eq("commerce_session_id", context.commerceSessionId)
    .order("created_at", { ascending: false })
    .limit(24)
    .returns<CommerceAgentMessageRow[]>();

  return (data ?? []).reverse();
}

async function loadLead(client: SupabaseClient, organizationId: string, leadId: string) {
  const { data } = await client
    .from("leads")
    .select("id, display_name, phone_number, metadata")
    .eq("id", leadId)
    .eq("organization_id", organizationId)
    .maybeSingle<LeadRow>();

  return data ?? null;
}

async function loadWhatsappConversationMessages(context: Extract<CommerceAgentResolvedContext, { ok: true }>) {
  if (!context.conversationId) {
    return [];
  }

  const { data } = await context.client
    .from("conversation_messages")
    .select("id, direction, message_type, text_content, payload, occurred_at")
    .eq("organization_id", context.organization.id)
    .eq("conversation_id", context.conversationId)
    .order("occurred_at", { ascending: false })
    .limit(18)
    .returns<WhatsappConversationMessageRow[]>();

  return (data ?? []).reverse();
}

async function loadRecentCommerceEvents(context: Extract<CommerceAgentResolvedContext, { ok: true }>) {
  if (!context.visitorId) {
    return [];
  }

  const { data } = await context.client
    .from("intelligence_events")
    .select("event_type, title, summary, payload, created_at")
    .eq("organization_id", context.organization.id)
    .eq("source_id", context.visitorId)
    .contains("tags", ["commerce_tracking"])
    .order("created_at", { ascending: false })
    .limit(14)
    .returns<CommerceTrackingEventRow[]>();

  return (data ?? []).reverse();
}

async function loadCurrentProduct(context: Extract<CommerceAgentResolvedContext, { ok: true }>) {
  if (!context.productId) {
    return null;
  }

  return (await loadOfferProducts(context.client, context.organization.id, [context.productId]))[0] ?? null;
}

async function loadCurrentOrderItems(context: Extract<CommerceAgentResolvedContext, { ok: true }>) {
  const orderId = context.orderId ?? await loadOrderIdFromPaymentSession(context);

  if (!orderId) {
    return [];
  }

  const { data } = await context.client
    .from("sales_catalog_order_items")
    .select("catalog_item_id, sku_code, title, quantity, total")
    .eq("organization_id", context.organization.id)
    .eq("order_id", orderId)
    .order("created_at", { ascending: true })
    .returns<Array<{
      catalog_item_id: string | null;
      sku_code: string | null;
      title: string;
      quantity: number | string | null;
      total: number | string | null;
    }>>();

  return (data ?? []).map((item) => ({
    title: item.title,
    quantity: normalizeQuantity(item.quantity),
    totalLabel: formatNullableCurrency(readNumber(item.total)),
    catalogItemId: item.catalog_item_id,
    skuCode: item.sku_code,
  }));
}

async function loadOrderIdFromPaymentSession(context: Extract<CommerceAgentResolvedContext, { ok: true }>) {
  if (!context.paymentSessionId) {
    return null;
  }

  const { data } = await context.client
    .from("sales_catalog_payment_sessions")
    .select("order_id")
    .eq("organization_id", context.organization.id)
    .eq("id", context.paymentSessionId)
    .maybeSingle<{ order_id: string | null }>();

  return data?.order_id ?? null;
}

async function validateCheckoutCommerceAgentContext(
  client: SupabaseClient,
  input: {
    organizationId: string;
    surface: SalesCatalogCommerceAgentSurface | "unknown";
    orderId: string | null;
    paymentSessionId: string | null;
  },
) {
  if (input.surface !== "checkout" || !input.paymentSessionId) {
    return false;
  }

  const { data } = await client
    .from("sales_catalog_payment_sessions")
    .select("id, order_id")
    .eq("id", input.paymentSessionId)
    .eq("organization_id", input.organizationId)
    .maybeSingle<{ id: string; order_id: string | null }>();

  return Boolean(data?.id && (!input.orderId || data.order_id === input.orderId));
}

async function validateTrackedLinkCommerceAgentContext(
  client: SupabaseClient,
  input: {
    organizationId: string;
    trackingLinkId: string | null;
  },
) {
  if (!input.trackingLinkId) {
    return false;
  }

  const { data } = await client
    .from("intelligence_memory")
    .select("id")
    .eq("id", input.trackingLinkId)
    .eq("organization_id", input.organizationId)
    .eq("scope", "organization")
    .contains("tags", ["tracked_link_button"])
    .maybeSingle<{ id: string }>();

  return Boolean(data?.id);
}

async function loadCommerceAgent(client: SupabaseClient, organizationId: string, agentId: string | null) {
  let query = client
    .from("agent_registry")
    .select("id, name, persona_name, prompt, model_id, avatar_url, avatar_alt, metadata")
    .eq("organization_id", organizationId)
    .neq("status", "archived");

  query = agentId ? query.eq("id", agentId) : query.order("created_at", { ascending: true }).limit(1);

  const { data } = await query.maybeSingle<AgentRow>();
  return data ?? null;
}

async function loadGlobalCommerceAgent(client: SupabaseClient, organizationId: string) {
  const { data } = await client
    .from("agent_registry")
    .select("id, name, persona_name, prompt, model_id, avatar_url, avatar_alt, metadata")
    .eq("scope", "organization")
    .eq("organization_id", organizationId)
    .eq("agent_code", "agente-whatsapp-global")
    .maybeSingle<AgentRow>();

  return data ?? null;
}

function buildWhatsappHref(input: {
    organizationName: string;
    instance: WhatsappRow | null;
    agentName: string;
    leadName: string | null;
}) {
  const phone = normalizePhone(input.instance?.phone_number ?? null);

  if (!phone) {
    return null;
  }

  const greeting = input.leadName ? `${firstName(input.leadName)}, ` : "";
  const message = `${greeting}vim da loja ${input.organizationName} e quero continuar meu atendimento com ${input.agentName}.`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

async function loadAgentWhatsappInstance(
  client: SupabaseClient,
  organizationId: string,
  agentId: string | null,
) {
  if (!agentId) {
    return null;
  }

  const { data } = await client
    .from("whatsapp_instances")
    .select("phone_number, metadata")
    .eq("organization_id", organizationId)
    .eq("status", "connected")
    .not("phone_number", "is", null)
    .contains("metadata", { agent_id: agentId })
    .order("connected_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle<WhatsappRow>();

  return data ?? null;
}

async function loadFallbackWhatsappInstance(client: SupabaseClient, organizationId: string) {
  const { data } = await client
    .from("whatsapp_instances")
    .select("phone_number, metadata")
    .eq("organization_id", organizationId)
    .eq("status", "connected")
    .not("phone_number", "is", null)
    .order("connected_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle<WhatsappRow>();

  return data ?? null;
}

async function resolveContextualOffer(context: Extract<CommerceAgentResolvedContext, { ok: true }>) {
  const settings = context.settings;
  const manualBumps = settings.orderBumps.enabled
    ? settings.orderBumps.items.filter((item) => item.active).map((item) => item.productId)
    : [];
  const candidateIds = [...manualBumps, context.productId].filter((id): id is string => Boolean(id));
  const products = await loadOfferProducts(context.client, context.organization.id, candidateIds);

  for (const bumpId of manualBumps) {
    const product = products.find((item) => item.id === bumpId);
    if (product) return product;
  }

  const categoryHints = getPlaybookCategoryHints(settings.commerceAgent.verticalPlaybook);
  const fallbackProducts = products.length > 0
    ? products
    : await loadCatalogProducts(context.client, context.organization.id);

  return fallbackProducts.find((item) => (
    categoryHints.some((hint) => item.category?.toLowerCase().includes(hint))
    && item.id !== context.productId
  )) ?? fallbackProducts.find((item) => item.id !== context.productId) ?? null;
}

async function loadOfferProducts(client: SupabaseClient, organizationId: string, productIds: string[]) {
  if (productIds.length === 0) {
    return [];
  }

  const { data } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("organization_id", organizationId)
    .eq("memory_type", "sales_catalog_item")
    .in("id", Array.from(new Set(productIds)))
    .returns<Array<{
      id: string;
      organization_id: string | null;
      title: string;
      content: string;
      metadata: JsonRecord | null;
      created_at: string | null;
      updated_at: string | null;
    }>>();

  return (data ?? []).map(mapSalesCatalogItem).filter(isSalesCatalogDisplayableProduct).map(mapOfferProduct).filter(isOfferProduct);
}

async function loadCatalogProducts(client: SupabaseClient, organizationId: string) {
  const { data } = await client
    .from("intelligence_memory")
    .select("id, organization_id, title, content, metadata, created_at, updated_at")
    .eq("scope", "organization")
    .eq("organization_id", organizationId)
    .eq("memory_type", "sales_catalog_item")
    .filter("metadata->>status", "eq", "active")
    .order("updated_at", { ascending: false })
    .limit(40)
    .returns<Array<{
      id: string;
      organization_id: string | null;
      title: string;
      content: string;
      metadata: JsonRecord | null;
      created_at: string | null;
      updated_at: string | null;
    }>>();

  return (data ?? []).map(mapSalesCatalogItem).filter(isSalesCatalogDisplayableProduct).map(mapOfferProduct).filter(isOfferProduct);
}

function mapOfferProduct(item: ClientSalesCatalogItem) {
  if (item.status !== "active") {
    return null;
  }

  const price = normalizeCurrencyAmount(item.offer.salePrice) ?? normalizeCurrencyAmount(item.price);

  return {
    id: item.id,
    title: item.title,
    category: item.category,
    description: item.description,
    tag: item.tag,
    priceLabel: price !== null ? formatCurrency(price) : null,
  } satisfies OfferProduct;
}

function isOfferProduct(value: ReturnType<typeof mapOfferProduct>): value is NonNullable<ReturnType<typeof mapOfferProduct>> {
  return Boolean(value);
}

function buildCommerceAgentSystemInstruction(
  context: Extract<CommerceAgentResolvedContext, { ok: true }>,
  promptContext: CommerceAgentPromptContext,
) {
  const customGlobalPrompt = context.globalAgentPrompt?.trim();
  const shouldAppendCustomGlobalPrompt = Boolean(
    customGlobalPrompt && customGlobalPrompt !== defaultWhatsappGlobalPrompt,
  );

  return [
    defaultWhatsappGlobalPrompt,
    ...(shouldAppendCustomGlobalPrompt
      ? [
          "",
          "DIRETRIZES GLOBAIS DA EMPRESA:",
          customGlobalPrompt!,
        ]
      : []),
    "",
    "PROMPT DO AGENTE DA EMPRESA:",
    resolveCommerceRuntimeAgentPrompt(context, promptContext),
    "",
    "CANAL ATUAL: LOJA CONNECTYHUB",
    `- Voce e ${context.agentName}, o mesmo agente que atendeu este lead no WhatsApp.`,
    "- A conversa atual esta dentro da loja, produto, carrinho ou checkout. Continue o atendimento como continuidade real do WhatsApp.",
    "- Nao aja como robo de suporte e nao reinicie a conversa. Use o historico para responder como quem ja estava falando com a pessoa.",
    "- Pode mencionar de forma leve que viu a pessoa abrir uma pagina ou produto, mas nunca soe invasivo ou tecnico.",
    "- Nao diga que esta monitorando, rastreando, analisando eventos, usando cookie, banco, sistema ou memoria.",
    "- Se o lead mudou de produto, conecte com a conversa anterior: compare, complemente ou pergunte uma coisa simples.",
    "- Se estiver no checkout, ajude sem atrapalhar o pagamento. Seja curto e resolutivo.",
    "- Faca upsell, cross-sell ou order bump somente quando combinar com o pedido, produto atual ou configuracao da loja.",
    "- Nunca force venda. Uma sugestao por vez. Se a pessoa ignorar ou recusar, siga ajudando no pedido principal.",
    "- Se nao houver complemento claro, nao invente. Ajude a escolher, revisar ou finalizar.",
    "",
    "REGRAS DE RESPOSTA NA LOJA:",
    "- Responda em portugues do Brasil, com naturalidade de WhatsApp.",
    "- Use 1 a 3 blocos curtos separados por linha em branco. Nada de markdown, lista, bullet ou texto corporativo.",
    "- Nao repita a ultima resposta. Se o lead mandar 'ok', 'legal', 'sim' ou algo curto, avance a conversa de forma nova.",
    "- Chame pelo primeiro nome so quando soar natural. Nao repita o nome em toda mensagem.",
    "- Nao prometa desconto, estoque, prazo, resultado, entrega ou pagamento se isso nao estiver no contexto.",
    "- Nao diga 'estou aqui para ajudar' como resposta principal. Seja especifico ao produto, pedido ou duvida.",
    "",
    "CONFIGURACAO COMERCIAL DA LOJA:",
    `- Modo do agente na loja: ${context.settings.commerceAgent.mode}.`,
    `- Playbook: ${context.settings.commerceAgent.verticalPlaybook}.`,
    `- Maximo de ofertas por sessao: ${context.settings.commerceAgent.maxOffersPerSession ?? "sem limite definido"}.`,
    `- Order bumps configurados: ${context.settings.orderBumps.enabled ? "ativos" : "inativos"}.`,
    `- Pre-adicionar ao carrinho: ${context.settings.commerceAgent.allowAutoAddToCart ? "permitido pela configuracao" : "nao permitido"}.`,
    `- Checkout silencioso: ${context.settings.commerceAgent.checkoutQuietMode ? "sim" : "nao"}.`,
  ].join("\n");
}

function resolveCommerceRuntimeAgentPrompt(
  context: Extract<CommerceAgentResolvedContext, { ok: true }>,
  promptContext: CommerceAgentPromptContext,
) {
  const storedPrompt = context.agentPrompt?.trim();

  if (storedPrompt) {
    return storedPrompt;
  }

  const promptConfig = normalizeAgentPromptBuilderConfig(context.agentMetadata?.[promptBuilderMetadataKey]);

  return buildAgentPromptFromTemplate({
    config: promptConfig,
    companyName: context.organization.name,
    agentName: context.agentName,
    productCount: promptContext.catalogProducts.length,
    knowledgeFileCount: 0,
  }) || defaultWhatsappAgentPrompt;
}

function buildCommerceAgentTurnPrompt(
  context: Extract<CommerceAgentResolvedContext, { ok: true }>,
  message: string,
  promptContext: CommerceAgentPromptContext,
) {
  return [
    "CONTEXTO OPERACIONAL PARA ESTE TURNO",
    `Empresa: ${context.organization.name}`,
    `Agente: ${context.agentName}`,
    context.leadName ? `Lead: ${context.leadName}` : "Lead: nome pessoal nao confirmado",
    `Superficie atual: ${formatSurfaceForPrompt(context.surface)}`,
    context.pagePath ? `Pagina atual: ${context.pagePath}` : null,
    context.pageUrl ? `URL atual: ${context.pageUrl}` : null,
    "",
    "HISTORICO RECENTE DO WHATSAPP",
    formatWhatsappHistory(promptContext.whatsappMessages),
    "",
    "HISTORICO RECENTE DENTRO DA LOJA",
    formatCommerceMessageHistory(promptContext.commerceMessages),
    "",
    "NAVEGACAO RECENTE RASTREADA",
    formatCommerceEventHistory(promptContext.recentEvents),
    "",
    "PRODUTO/PAGINA ATUAL",
    formatProductContext(promptContext.currentProduct),
    "",
    "PEDIDO/CHECKOUT ATUAL",
    formatOrderContext(promptContext.orderItems),
    "",
    "OFERTA CONTEXTUAL POSSIVEL",
    formatOfferContext(promptContext.contextualOffer, context),
    "",
    "CATALOGO ATIVO PARA CONSULTA RAPIDA",
    formatCatalogContext(promptContext.catalogProducts, context.productId),
    "",
    "MENSAGEM ATUAL DO LEAD NA LOJA",
    message,
    "",
    "TAREFA",
    "Responda agora como o mesmo agente que vinha conversando no WhatsApp.",
    "Use o produto atual, o pedido atual e o historico para continuar a conversa sem parecer script.",
    "Se fizer sentido, sugira um complemento ou proximo passo. Se nao fizer, responda a duvida e reduza atrito.",
  ].filter((line): line is string => typeof line === "string").join("\n");
}

function buildWelcomeMessage(
  context: Extract<CommerceAgentResolvedContext, { ok: true }>,
  promptContext: CommerceAgentPromptContext,
) {
  const name = context.leadName ? `${firstName(context.leadName)}, ` : "";
  const agentIntro = name ? `sou ${context.agentName} e ` : `Sou ${context.agentName} e `;

  if (context.surface === "checkout") {
    const order = formatOrderItemsForSentence(promptContext.orderItems);

    if (order) {
      return `${name}${agentIntro}continuei contigo no checkout. Seu pedido esta com ${order}; se quiser ajustar algo antes de pagar, me chama.`;
    }

    return `${name}${agentIntro}fico por perto sem atrapalhar seu pagamento. Se pintar qualquer duvida, me chama.`;
  }

  if (context.surface === "product") {
    return promptContext.currentProduct
      ? `${name}${agentIntro}vi que voce abriu ${promptContext.currentProduct.title}. Se quiser, comparo com o que a gente estava vendo.`
      : `${name}${agentIntro}continuei contigo por aqui nesse produto.`;
  }

  if (context.surface === "cart") {
    return `${name}${agentIntro}posso revisar seu pedido antes de finalizar.`;
  }

  return `${name}${agentIntro}continuei por aqui para te ajudar a escolher.`;
}

function buildWhisperMessage(
  context: Extract<CommerceAgentResolvedContext, { ok: true }>,
  promptContext: CommerceAgentPromptContext,
) {
  const name = context.leadName ? `${firstName(context.leadName)}, ` : "";

  if (context.surface === "product" && promptContext.currentProduct) {
    return `${name}vi que voce abriu ${promptContext.currentProduct.title}. Clica na minha foto que eu continuo contigo por aqui.`;
  }

  if (context.surface === "checkout") {
    const order = formatOrderItemsForSentence(promptContext.orderItems);

    return order
      ? `${name}estou aqui no checkout com seu pedido de ${order}. Clica na minha foto se quiser revisar comigo.`
      : `${name}estou aqui no checkout. Se precisar de ajuda, clica na minha foto que eu continuo por aqui.`;
  }

  if (context.surface === "cart") {
    return `${name}estou vendo seu carrinho por aqui. Clica na minha foto que eu reviso contigo rapidinho.`;
  }

  if (context.surface === "store") {
    return `${name}vi que voce voltou para a loja. Se quiser escolher mais alguma coisa, clica na minha foto.`;
  }

  return `${name}estou aqui. Se precisar de ajuda, clica na minha foto que eu continuo por aqui.`;
}

function formatSurfaceForPrompt(surface: SalesCatalogCommerceAgentSurface | "unknown") {
  if (surface === "checkout") return "checkout/pagamento";
  if (surface === "product") return "pagina de produto";
  if (surface === "cart") return "carrinho";
  if (surface === "store") return "home/catalogo da loja";
  return "loja";
}

function formatWhatsappHistory(messages: WhatsappConversationMessageRow[]) {
  if (messages.length === 0) {
    return "- Sem mensagens recentes do WhatsApp carregadas.";
  }

  return messages
    .map((message) => {
      const speaker = message.direction === "inbound"
        ? "Lead no WhatsApp"
        : message.direction === "outbound"
          ? "Agente no WhatsApp"
          : "Sistema WhatsApp";
      const text = readWhatsappMessageText(message);

      return text ? `- ${speaker}: ${preview(text, 450)}` : null;
    })
    .filter((line): line is string => Boolean(line))
    .join("\n") || "- Sem texto legivel nas mensagens recentes do WhatsApp.";
}

function formatCommerceMessageHistory(messages: CommerceAgentMessageRow[]) {
  if (messages.length === 0) {
    return "- Sem mensagens recentes dentro da loja.";
  }

  return messages
    .map((message) => {
      const speaker = message.role === "lead"
        ? "Lead na loja"
        : message.role === "assistant"
          ? "Agente na loja"
          : "Contexto interno da loja";

      return `- ${speaker}: ${preview(message.content, 420)}`;
    })
    .join("\n");
}

function formatCommerceEventHistory(events: CommerceTrackingEventRow[]) {
  if (events.length === 0) {
    return "- Sem eventos recentes alem da pagina atual.";
  }

  return events
    .map((event) => {
      const payload = readRecord(event.payload);
      const pagePath = readString(payload?.page_path);
      const productId = readString(payload?.product_id) ?? readString(payload?.catalog_item_id);
      const summary = event.summary ?? event.title ?? event.event_type;

      return `- ${summary}${pagePath ? ` | pagina: ${pagePath}` : ""}${productId ? ` | produto: ${productId}` : ""}`;
    })
    .join("\n");
}

function formatProductContext(product: OfferProduct | null) {
  if (!product) {
    return "- Nenhum produto especifico identificado nesta pagina.";
  }

  return [
    `- Produto atual: ${product.title}`,
    product.priceLabel ? `- Preco: ${product.priceLabel}` : null,
    product.category ? `- Categoria: ${product.category}` : null,
    product.description ? `- Resumo: ${preview(product.description, 420)}` : null,
    product.tag ? `- Tag/catalogo: ${product.tag}` : null,
  ].filter((line): line is string => Boolean(line)).join("\n");
}

function formatOrderContext(items: CommerceOrderItem[]) {
  if (items.length === 0) {
    return "- Nenhum item de pedido carregado para esta pagina.";
  }

  return items
    .map((item) => `- ${formatQuantity(item.quantity)}x ${item.title}${item.totalLabel ? ` (${item.totalLabel})` : ""}${item.skuCode ? ` | SKU ${item.skuCode}` : ""}`)
    .join("\n");
}

function formatOfferContext(
  offer: OfferProduct | null,
  context: Extract<CommerceAgentResolvedContext, { ok: true }>,
) {
  if (!offer) {
    return "- Nenhuma oferta complementar segura foi encontrada. Nao invente complemento.";
  }

  const manualBump = context.settings.orderBumps.items.some((item) => item.active && item.productId === offer.id);

  return [
    `- Oferta candidata: ${offer.title}`,
    offer.priceLabel ? `- Preco: ${offer.priceLabel}` : null,
    offer.category ? `- Categoria: ${offer.category}` : null,
    manualBump ? "- Origem: order bump configurado no painel." : "- Origem: sugestao pelo catalogo/playbook.",
    "- Use esta oferta so se combinar com o pedido ou a duvida atual. Nao repita se ja foi oferecida recentemente.",
  ].filter((line): line is string => Boolean(line)).join("\n");
}

function formatCatalogContext(products: OfferProduct[], currentProductId: string | null) {
  const visible = products
    .filter((product) => product.id !== currentProductId)
    .slice(0, 14);

  if (visible.length === 0) {
    return "- Catalogo resumido indisponivel.";
  }

  return visible
    .map((product) => [
      `- ${product.title}`,
      product.priceLabel,
      product.category,
      product.description ? preview(product.description, 120) : null,
    ].filter(Boolean).join(" | "))
    .join("\n");
}

function readWhatsappMessageText(message: WhatsappConversationMessageRow) {
  const payload = readRecord(message.payload);

  return readString(message.text_content)
    ?? readString(payload?.text)
    ?? readString(payload?.body)
    ?? readString(payload?.caption)
    ?? readString(payload?.message);
}

function formatOrderItemsForSentence(items: CommerceOrderItem[]) {
  if (items.length === 0) {
    return null;
  }

  const labels = items
    .slice(0, 3)
    .map((item) => `${formatQuantity(item.quantity)}x ${item.title}`);
  const remaining = items.length - labels.length;

  return remaining > 0
    ? `${labels.join(", ")} e mais ${remaining} item${remaining > 1 ? "s" : ""}`
    : labels.join(", ");
}

function normalizeCommerceAssistantText(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/(?:\\n|\/n){2,}/gi, "\n\n")
    .replace(/(?:\\n|\/n)/gi, "\n")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/[(\[*](?:risada(?:\s+leve)?|risos?|sorriso|gargalhada|suspiro|pausa(?:\s+dramatica)?|tom\s+\w+|voz\s+\w+|rindo|sorrindo|sussurrando|gritando|pensando|respirando)[)\]*]/gi, "")
    .replace(/(?<=[.!?])(?=[A-Z])/g, " ")
    .trim()
    .slice(0, commerceAgentAssistantMaxLength);
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

function extractGeminiBlockReason(value: unknown): string | null {
  const root = readRecord(value);
  if (!root) return null;

  const promptFeedback = readRecord(root.promptFeedback);
  if (promptFeedback && typeof promptFeedback.blockReason === "string") {
    return `promptFeedback.blockReason=${promptFeedback.blockReason}`;
  }

  const candidates = root.candidates;
  if (!Array.isArray(candidates)) {
    return null;
  }

  for (const candidate of candidates) {
    const record = readRecord(candidate);
    const finishReason = readString(record?.finishReason);

    if (finishReason && finishReason !== "STOP") {
      return `finishReason=${finishReason}`;
    }
  }

  return null;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number, label: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`${label} excedeu ${Math.round(timeoutMs / 1000)}s.`);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} excedeu ${Math.round(timeoutMs / 1000)}s.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function readProviderResponse(response: Response) {
  const text = await response.text().catch(() => "");

  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
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

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : readRecord(error)?.name === "AbortError";
}

function buildCommerceAgentRequestId(
  context: Extract<CommerceAgentResolvedContext, { ok: true }>,
  message: string,
) {
  const base = [
    context.commerceSessionId ?? context.sessionId ?? context.visitorId ?? "session",
    context.surface,
    Date.now().toString(36),
    message.slice(0, 24).replace(/[^a-z0-9]+/gi, "_"),
  ].join(":");

  return `commerce-agent:${base}`.slice(0, 180);
}

function buildQuickActions(context: Extract<CommerceAgentResolvedContext, { ok: true }>) {
  if (context.settings.commerceAgent.mode === "observer") {
    return [];
  }

  if (context.surface === "checkout") {
    return [
      { id: "checkout_help", label: "Ajuda no pagamento", message: "Preciso de ajuda para finalizar o pagamento." },
      { id: "review_order", label: "Revisar pedido", message: "Revise meu pedido antes de eu pagar." },
    ];
  }

  return [
    { id: "suggest_offer", label: "Sugestoes", message: "O que combina com essa compra?" },
    { id: "review_order", label: "Revisar pedido", message: "Revise meu pedido comigo." },
  ];
}

function buildNoOfferMessage(context: Extract<CommerceAgentResolvedContext, { ok: true }>) {
  if (context.settings.commerceAgent.verticalPlaybook === "real_estate") {
    return "Nesse tipo de compra, o melhor proximo passo costuma ser visita, simulacao ou comparar opcoes parecidas.";
  }

  if (context.settings.commerceAgent.verticalPlaybook === "services") {
    return "Posso procurar um complemento de servico ou o melhor proximo passo para fechar com seguranca.";
  }

  return "Nao vou inventar oferta. Se a loja tiver um complemento cadastrado, eu te mostro; se nao, sigo te ajudando na escolha principal.";
}

function getPlaybookCategoryHints(playbook: ClientSalesCatalogSettings["commerceAgent"]["verticalPlaybook"]) {
  if (playbook === "food") return ["bebida", "sobremesa", "adicional", "combo"];
  if (playbook === "fashion") return ["acessorio", "calcado", "bolsa", "cinto", "meia"];
  if (playbook === "beauty") return ["combo", "tratamento", "hidratacao", "sobrancelha"];
  if (playbook === "services") return ["plano", "suporte", "instalacao", "manutencao"];
  if (playbook === "digital") return ["mentoria", "comunidade", "template", "bonus"];
  if (playbook === "physical") return ["acessorio", "kit", "reposicao", "garantia"];
  return ["acessorio", "combo", "kit", "oferta"];
}

function normalizeSurface(value: string | null): SalesCatalogCommerceAgentSurface | "unknown" {
  if (value === "store" || value === "product" || value === "cart" || value === "checkout") return value;
  return "unknown";
}

function inferSurface(pagePath: string | null) {
  const path = pagePath?.toLowerCase() ?? "";

  if (path.startsWith("/checkout/")) return "checkout";
  if (path.startsWith("/produto/") || path.includes("/produto/")) return "product";
  if (path.startsWith("/loja/") && path.includes("/carrinho")) return "cart";
  if (path.startsWith("/loja/")) return "store";
  return null;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatNullableCurrency(value: number | null) {
  return value === null ? null : formatCurrency(value);
}

function normalizeQuantity(value: unknown) {
  const number = readNumber(value);

  return number && number > 0 ? number : 1;
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString("pt-BR");
}

function preview(value: string | null | undefined, maxLength: number) {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

export function readCommerceAgentBody(value: unknown): CommerceAgentBody {
  return readRecord(value) ?? {};
}

export function readCommerceAgentMessage(body: CommerceAgentBody) {
  return readString(body.message)?.slice(0, 700) ?? null;
}

function normalizePhone(value: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length >= 10 ? digits : null;
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] ?? value;
}

function readUuid(value: unknown) {
  const text = readString(value);

  if (!text || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    return null;
  }

  return text;
}

function readRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.includes(",")
    ? value.replace(/\./g, "").replace(",", ".")
    : value;
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}
