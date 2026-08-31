import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getOrganizationSalesCatalogSettings,
  mapSalesCatalogItem,
} from "@/lib/client-os/sales-catalog";
import { normalizeCurrencyAmount } from "@/lib/sales-catalog/mercado-pago";
import {
  type ClientSalesCatalogItem,
  type ClientSalesCatalogSettings,
  type SalesCatalogCommerceAgentSurface,
} from "@/lib/sales-catalog/shared";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyOrganizationTrackingToken } from "@/lib/tracking/organization-attribution";
import { resolveLeadTrackingContext } from "@/lib/tracking/lead-context";
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
  avatar_url: string | null;
  avatar_alt: string | null;
  metadata: JsonRecord | null;
};

type WhatsappRow = {
  phone_number: string | null;
};

type CommerceSessionRow = {
  id: string;
};

type CommerceAgentMessageRow = {
  id: string;
  role: "lead" | "assistant" | "system" | "tool";
  content: string;
  created_at: string;
};

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
  const orderId = readUuid(body.order_id);
  const paymentSessionId = readUuid(body.payment_session_id);
  const trackingLinkId = readUuid(body.tracking_link_id);
  const client = createServiceClient();

  if (!organizationId) {
    return { ok: false, status: 403, error: "Contexto da loja nao autorizado." };
  }

  const hasValidTrackingToken = verifyOrganizationTrackingToken(organizationId, trackingToken);
  const hasValidCheckoutContext = hasValidTrackingToken
    ? false
    : await validateCheckoutCommerceAgentContext(client, {
        organizationId,
        surface,
        orderId,
        paymentSessionId,
      }).catch(() => false);
  const hasValidTrackedLinkContext = hasValidTrackingToken || hasValidCheckoutContext
    ? false
    : await validateTrackedLinkCommerceAgentContext(client, {
        organizationId,
        trackingLinkId,
      }).catch(() => false);

  if (!hasValidTrackingToken && !hasValidCheckoutContext && !hasValidTrackedLinkContext) {
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

  const leadContext = await resolveLeadTrackingContext(client, {
    organizationId: organization.id,
    leadId: readString(body.lead_id),
    conversationId: readString(body.conversation_id),
    leadPhone: readString(body.lead_phone),
  });
  const lead = leadContext.leadId
    ? await loadLead(client, organization.id, leadContext.leadId)
    : null;
  const leadName = lead
    ? resolveLeadPersonalName({ displayName: lead.display_name, metadata: lead.metadata })
    : null;
  const requestedAgentId = readUuid(body.agent_id) ?? readUuid(body.agentId);
  let agent = await loadCommerceAgent(
    client,
    organization.id,
    requestedAgentId ?? settings.automationSettings.defaultAgentId,
  );

  if (!agent && requestedAgentId) {
    agent = await loadCommerceAgent(client, organization.id, settings.automationSettings.defaultAgentId);
  }

  const agentName = readString(agent?.persona_name) ?? readString(agent?.name) ?? "Agente ConnectyHub";
  const whatsappHref = await loadWhatsappHref(client, {
    organizationId: organization.id,
    organizationName: organization.name,
    agentId: agent?.id ?? null,
    agentName,
    leadName,
  });
  const context = {
    ok: true,
    client,
    organization,
    settings,
    lead,
    leadId: leadContext.leadId,
    leadName,
    leadPhone: leadContext.leadPhone ?? normalizePhone(readString(lead?.phone_number)),
    conversationId: leadContext.conversationId,
    surface,
    commerceSessionId: readUuid(body.commerce_session_id),
    visitorId: readString(body.visitor_cookie_id),
    sessionId: readString(body.session_cookie_id),
    trackingLinkId,
    orderId,
    paymentSessionId,
    productId: readUuid(body.product_id) ?? readUuid(body.catalog_item_id),
    pagePath: readString(body.page_path),
    pageUrl: readString(body.page_url),
    agentId: agent?.id ?? null,
    agentName,
    agentAvatarUrl: readString(agent?.avatar_url),
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
  const messages = await loadRecentMessages(context).catch(() => []);
  const welcomeMessage = buildWelcomeMessage(context);

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
    whisperMessage: buildWhisperMessage(context),
    whatsappHref: context.whatsappHref,
    quickActions: buildQuickActions(context),
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role === "lead" || message.role === "assistant" || message.role === "system" ? message.role : "system",
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
  const text = input.message.toLowerCase();
  const offer = await resolveContextualOffer(input.context).catch(() => null);

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
    return offer
      ? `Estou aqui para ajudar sem atrapalhar o pagamento. Antes de concluir, ${offer.title} pode ser uma boa adicao ao pedido.`
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

async function loadCommerceSessionById(client: SupabaseClient, organizationId: string, sessionId: string) {
  const { data } = await client
    .from("commerce_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("organization_id", organizationId)
    .maybeSingle<CommerceSessionRow>();

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
    .select("id, role, content, created_at")
    .eq("organization_id", context.organization.id)
    .eq("commerce_session_id", context.commerceSessionId)
    .order("created_at", { ascending: true })
    .limit(20)
    .returns<CommerceAgentMessageRow[]>();

  return data ?? [];
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
    .select("id, name, persona_name, avatar_url, avatar_alt, metadata")
    .eq("organization_id", organizationId)
    .neq("status", "archived");

  query = agentId ? query.eq("id", agentId) : query.order("created_at", { ascending: true }).limit(1);

  const { data } = await query.maybeSingle<AgentRow>();
  return data ?? null;
}

async function loadWhatsappHref(
  client: SupabaseClient,
  input: {
    organizationId: string;
    organizationName: string;
    agentId: string | null;
    agentName: string;
    leadName: string | null;
  },
) {
  const instance = await loadAgentWhatsappInstance(client, input.organizationId, input.agentId)
    ?? await loadFallbackWhatsappInstance(client, input.organizationId);
  const phone = normalizePhone(instance?.phone_number ?? null);

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
    .select("phone_number")
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
    .select("phone_number")
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

  return (data ?? []).map(mapSalesCatalogItem).map(mapOfferProduct).filter(isOfferProduct);
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

  return (data ?? []).map(mapSalesCatalogItem).map(mapOfferProduct).filter(isOfferProduct);
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
    priceLabel: price !== null ? formatCurrency(price) : null,
  };
}

function isOfferProduct(value: ReturnType<typeof mapOfferProduct>): value is NonNullable<ReturnType<typeof mapOfferProduct>> {
  return Boolean(value);
}

function buildWelcomeMessage(context: Extract<CommerceAgentResolvedContext, { ok: true }>) {
  const name = context.leadName ? `${firstName(context.leadName)}, ` : "";
  const agentIntro = name ? `sou ${context.agentName} e ` : `Sou ${context.agentName} e `;

  if (context.surface === "checkout") {
    return `${name}${agentIntro}fico por perto sem atrapalhar seu pagamento. Se pintar qualquer duvida, me chama.`;
  }

  if (context.surface === "product") {
    return `${name}${agentIntro}continuei contigo por aqui nesse produto.`;
  }

  if (context.surface === "cart") {
    return `${name}${agentIntro}posso revisar seu pedido antes de finalizar.`;
  }

  return `${name}${agentIntro}continuei por aqui para te ajudar a escolher.`;
}

function buildWhisperMessage(context: Extract<CommerceAgentResolvedContext, { ok: true }>) {
  const name = context.leadName ? `${firstName(context.leadName)}, ` : "";

  if (context.surface === "checkout") {
    return `${name}${context.agentName} esta aqui se precisar de ajuda para concluir.`;
  }

  if (context.surface === "product") {
    return `${name}${context.agentName} continuou contigo nesse produto.`;
  }

  if (context.surface === "cart") {
    return `${name}${context.agentName} pode revisar seu pedido antes do checkout.`;
  }

  return `${name}${context.agentName} continuou contigo na loja.`;
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
