import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listOrganizationSalesCatalog } from "@/lib/client-os/sales-catalog";
import type { ClientSalesCatalogItem } from "@/lib/sales-catalog/shared";
import {
  observedContactWindow,
  observedPurchaseCadence,
  localContactTime,
  nextContactWindow,
  nextObservedWindow,
} from "./contact-window";
import { loadAutomationPolicy, persistFollowUpDispatch } from "./dispatch";
import type { WhatsappFollowUpEventData } from "@/lib/whatsapp/proactive-followup";
import { offlineReturnContext } from "./offline-return-context";

type Affinity = {
  productId: string;
  paidOrders: number;
  observedDays: number;
  lastPurchase: string | null;
  cadenceDays?: number | null;
};
export type RelationshipProfile = {
  contactWindow: ReturnType<typeof observedContactWindow>;
  affinities: Affinity[];
  inboundSamples: number;
  typicalMessageLength: number;
  projectedAt: string;
};
export function relatedProductScore(
  source: Pick<ClientSalesCatalogItem, "title" | "category">,
  candidate: Pick<ClientSalesCatalogItem, "title" | "category">,
) {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const words = (value: string) =>
    new Set(
      normalize(value)
        .split(/[^a-z]+/)
        .filter((word) => word.length >= 4),
    );
  const a = words(source.title),
    b = words(candidate.title);
  return (
    (source.category &&
    candidate.category &&
    normalize(source.category) === normalize(candidate.category)
      ? 3
      : 0) + [...a].filter((word) => b.has(word)).length
  );
}
export function sellableRecommendation(product: ClientSalesCatalogItem) {
  return (
    product.status === "active" &&
    product.inventory.status !== "out_of_stock" &&
    Boolean(product.price || product.offer.salePrice) &&
    product.salesDestination === "connectyhub_checkout"
  );
}

export async function projectLeadRelationship(
  client: SupabaseClient,
  org: string,
  leadId: string,
  timezone: string,
): Promise<RelationshipProfile> {
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const [messages, orders, views, identity] = await Promise.all([
    client
      .from("conversation_messages")
      .select("occurred_at,text_content")
      .eq("organization_id", org)
      .eq("lead_id", leadId)
      .eq("direction", "inbound")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(250),
    client
      .from("sales_catalog_orders")
      .select("id,created_at")
      .eq("organization_id", org)
      .eq("lead_id", leadId)
      .eq("payment_status", "confirmed")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50),
    client
      .from("intelligence_events")
      .select("occurred_at,payload")
      .eq("organization_id", org)
      .eq("source_type", "client_marketing_tracking")
      .eq("payload->>lead_id", leadId)
      .eq("payload->>tracking_consent", "granted")
      .eq(
        "payload->tracking_cookies->>consent",
        "connecty_tracking_explicit_consent",
      )
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(150),
    client
      .from("lead_web_identities")
      .select("identity_type,identity_value")
      .eq("organization_id", org)
      .eq("lead_id", leadId)
      .gte("confidence", 0.9)
      .limit(50),
  ]);
  if (messages.error || orders.error || views.error || identity.error)
    throw new Error("Não foi possível atualizar as evidências do lead.");
  const affinities = new Map<string, Affinity>(),
    orderDates = new Map(
      (orders.data ?? []).map((order) => [order.id, order.created_at]),
    );
  if (orderDates.size) {
    const items = await client
      .from("sales_catalog_order_items")
      .select("order_id,catalog_item_id")
      .eq("organization_id", org)
      .in("order_id", [...orderDates.keys()]);
    if (items.error) throw new Error(items.error.message);
    const seen = new Set<string>(),
      dates = new Map<string, string[]>();
    for (const item of items.data ?? []) {
      if (
        !item.catalog_item_id ||
        seen.has(`${item.order_id}:${item.catalog_item_id}`)
      )
        continue;
      seen.add(`${item.order_id}:${item.catalog_item_id}`);
      const affinity = affinities.get(item.catalog_item_id) ?? {
        productId: item.catalog_item_id,
        paidOrders: 0,
        observedDays: 0,
        lastPurchase: null,
      };
      affinity.paidOrders++;
      const at = orderDates.get(item.order_id)!;
      dates.set(item.catalog_item_id, [
        ...(dates.get(item.catalog_item_id) ?? []),
        at,
      ]);
      if (!affinity.lastPurchase || at > affinity.lastPurchase)
        affinity.lastPurchase = at;
      affinities.set(item.catalog_item_id, affinity);
    }
    for (const [id, values] of dates)
      affinities.get(id)!.cadenceDays = observedPurchaseCadence(values);
  }
  if (identity.data?.length) {
    const days = new Map<string, Set<string>>();
    for (const view of views.data ?? []) {
      if (
        !identity.data.some(
          (identity) =>
            identity.identity_value === view.payload?.visitor_cookie_id ||
            identity.identity_value === view.payload?.session_cookie_id,
        )
      )
        continue;
      const id = view.payload?.catalog_item_id ?? view.payload?.product_id;
      if (typeof id !== "string" || !view.occurred_at) continue;
      const observed = days.get(id) ?? new Set<string>();
      observed.add(localContactTime(new Date(view.occurred_at), timezone).day);
      days.set(id, observed);
    }
    for (const [id, observed] of days) {
      const affinity = affinities.get(id) ?? {
        productId: id,
        paidOrders: 0,
        observedDays: 0,
        lastPurchase: null,
      };
      affinity.observedDays = observed.size;
      affinities.set(id, affinity);
    }
  }
  const lengths = (messages.data ?? [])
    .map((message) => (message.text_content ?? "").length)
    .filter(Boolean)
    .sort((a, b) => a - b);
  const profile: RelationshipProfile = {
    contactWindow: observedContactWindow(
      (messages.data ?? []).map((message) => message.occurred_at),
      timezone,
    ),
    affinities: [...affinities.values()]
      .sort(
        (a, b) =>
          b.paidOrders * 4 +
          b.observedDays -
          (a.paidOrders * 4 + a.observedDays),
      )
      .slice(0, 12),
    inboundSamples: messages.data?.length ?? 0,
    typicalMessageLength: lengths[Math.floor(lengths.length / 2)] ?? 0,
    projectedAt: new Date().toISOString(),
  };
  const saved = await client.from("automation_lead_profiles").upsert({
    organization_id: org,
    lead_id: leadId,
    evidence: profile,
    next_review_at: new Date(Date.now() + 24 * 3600000).toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (saved.error) throw new Error(saved.error.message);
  return profile;
}

async function contactContext(
  client: SupabaseClient,
  org: string,
  leadId: string,
): Promise<WhatsappFollowUpEventData | null> {
  const lead = await client
    .from("leads")
    .select("status,metadata")
    .eq("organization_id", org)
    .eq("id", leadId)
    .single();
  if (lead.error) throw new Error(lead.error.message);
  if (
    lead.data.status === "archived" ||
    lead.data.metadata?.whatsapp_opt_out === true ||
    lead.data.metadata?.opt_out?.requested_at
  )
    return null;
  const conversation = await client
    .from("conversations")
    .select("id,whatsapp_instance_id,status")
    .eq("organization_id", org)
    .eq("lead_id", leadId)
    .eq("channel", "whatsapp")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (conversation.error) throw new Error(conversation.error.message);
  if (
    !conversation.data ||
    ["closed", "archived"].includes(conversation.data.status)
  )
    return null;
  const c = conversation.data;
  const message = await client
    .from("conversation_messages")
    .select("id,direction,payload")
    .eq("organization_id", org)
    .eq("conversation_id", c.id)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (message.error) throw new Error(message.error.message);
  if (message.data?.direction !== "outbound") return null;
  const run = await client
    .from("agent_runs")
    .select("id,agent_id")
    .eq("organization_id", org)
    .eq("metadata->>conversationId", c.id)
    .eq("run_status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (run.error) throw new Error(run.error.message);
  if (!run.data) return null;
  const instance = await client
    .from("whatsapp_instances")
    .select("metadata,status")
    .eq("organization_id", org)
    .eq("id", c.whatsapp_instance_id)
    .single();
  if (instance.error) throw new Error(instance.error.message);
  const agentId = run.data.agent_id;
  if (typeof agentId !== "string" || instance.data.metadata?.agent_id !== agentId || instance.data.status !== "connected")
    return null;
  return {
    organizationId: org,
    leadId,
    conversationId: c.id,
    whatsappInstanceId: c.whatsapp_instance_id,
    agentId,
    agentRunId: run.data.id,
    referenceMessageId: message.data.id,
  };
}

export async function planLeadRelationships(client: SupabaseClient) {
  const candidates = await client.rpc("automation_profile_candidates", {
    p_limit: 20,
  });
  if (candidates.error) throw new Error(candidates.error.message);
  let recommendations = 0,
    returns = 0;
  for (const row of candidates.data ?? []) {
    try {
      const policy = await loadAutomationPolicy(client, row.organization_id);
      if (!policy?.follow_up_enabled) continue;
      const profile = await projectLeadRelationship(
        client,
        row.organization_id,
        row.lead_id,
        policy.timezone,
      );
      if (!profile.contactWindow) continue;
      const context = await contactContext(
        client,
        row.organization_id,
        row.lead_id,
      );
      if (!context) continue;
      const recent = await client
        .from("automation_dispatches")
        .select("id")
        .eq("organization_id", row.organization_id)
        .eq("lead_id", row.lead_id)
        .in("journey", ["return", "recommendation"])
        .in("status", ["pending", "processing", "sending", "sent", "uncertain"])
        .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
        .limit(1);
      if (recent.error) throw new Error(recent.error.message);
      if (recent.data?.length) continue;
      const pendingOrder = await client
        .from("sales_catalog_orders")
        .select("id")
        .eq("organization_id", row.organization_id)
        .eq("lead_id", row.lead_id)
        .in("status", ["draft", "pending_payment"])
        .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
        .limit(1);
      if (pendingOrder.error) throw new Error(pendingOrder.error.message);
      if (pendingOrder.data?.length) continue;
      const catalog = await listOrganizationSalesCatalog(
        client,
        row.organization_id,
        150,
      );
      let best: { product: ClientSalesCatalogItem; score: number } | null =
        null;
      for (const affinity of profile.affinities) {
        if (affinity.paidOrders < 2 && affinity.observedDays < 3) continue;
        const source = catalog.find(
          (product) => product.id === affinity.productId,
        );
        if (!source) continue;
        for (const product of catalog) {
          if (
            product.id === source.id ||
            !sellableRecommendation(product) ||
            !product.createdAt ||
            Date.parse(product.createdAt) < Date.now() - 14 * 86400000
          )
            continue;
          const score = relatedProductScore(source, product);
          if (
            score < 3 ||
            profile.affinities.some(
              (a) => a.productId === product.id && a.lastPurchase,
            )
          )
            continue;
          if (!best || score > best.score) best = { product, score };
        }
      }
      if (!best) {
        for (const affinity of profile.affinities) {
          if (
            !affinity.cadenceDays ||
            !affinity.lastPurchase ||
            Date.parse(affinity.lastPurchase) +
              affinity.cadenceDays * 86400000 >
              Date.now()
          )
            continue;
          const product = catalog.find(
            (item) => item.id === affinity.productId,
          );
          if (product && sellableRecommendation(product)) {
            best = { product, score: 3 };
            break;
          }
        }
      }
      if (!best) continue;
      const planned = nextObservedWindow(
        new Date(),
        profile.contactWindow,
        policy.timezone,
      );
      const inBusinessWindow = nextContactWindow(
        planned,
        policy.window_start,
        policy.window_end,
        policy.timezone,
      );
      if (inBusinessWindow.getTime() !== planned.getTime()) continue;
      await persistFollowUpDispatch(
        client,
        {
          ...context,
          recommendationProductId: best.product.id,
          recommendationPeriod: String(Math.floor(Date.now() / (7 * 86400000))),
        },
        planned,
      );
      recommendations++;
    } catch (error) {
      console.error(
        "Relationship profile failed",
        row.lead_id,
        error instanceof Error ? error.message : "projection_failed",
      );
      await client.from("automation_lead_profiles").upsert({
        organization_id: row.organization_id,
        lead_id: row.lead_id,
        next_review_at: new Date(Date.now() + 3600000).toISOString(),
      });
    }
  }
  const enabledCompanies = await client
    .from("automation_policies")
    .select("organization_id")
    .eq("follow_up_enabled", true);
  if (enabledCompanies.error) throw new Error(enabledCompanies.error.message);
  if (!enabledCompanies.data?.length) return { recommendations, returns };
  const visits = await client
    .from("customer_lead_visits")
    .select("id,organization_id,lead_id,return_at,description")
    .in(
      "organization_id",
      enabledCompanies.data.map((company) => company.organization_id),
    )
    .eq("return_status", "pending")
    .lte("return_at", new Date(Date.now() + 3600000).toISOString())
    .gte("return_at", new Date(Date.now() - 30 * 86400000).toISOString())
    .order("return_at")
    .limit(100);
  if (visits.error) throw new Error(visits.error.message);
  for (const visit of visits.data ?? []) {
    const policy = await loadAutomationPolicy(client, visit.organization_id);
    if (!policy?.follow_up_enabled) continue;
    const context =
      (await contactContext(client, visit.organization_id, visit.lead_id)) ??
      (await offlineReturnContext(
        client,
        visit.organization_id,
        visit.lead_id,
        visit.id,
      ));
    if (!context) continue;
    const task = await persistFollowUpDispatch(
      client,
      { ...context, returnId: visit.id },
      nextContactWindow(
        new Date(Math.max(Date.now(), Date.parse(visit.return_at))),
        policy.window_start,
        policy.window_end,
        policy.timezone,
      ),
    );
    if (task.status === "pending") {
      await client
        .from("customer_lead_visits")
        .update({ return_status: "scheduled" })
        .eq("id", visit.id)
        .eq("return_status", "pending");
      returns++;
    }
  }
  return { recommendations, returns };
}
