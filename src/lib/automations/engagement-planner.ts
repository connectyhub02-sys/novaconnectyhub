import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { listOrganizationSalesCatalog } from "@/lib/client-os/sales-catalog";
import { nextContactWindow } from "./contact-window";
import { loadAutomationPolicy, persistFollowUpDispatch } from "./dispatch";
import { contactContext, relatedProductScore, sellableRecommendation } from "./relationship-profile";

type Row = Record<string, unknown>;
const hour = 3600_000;
const day = 24 * hour;
const read = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** What the lead was interested in during a store visit: the cart first, else the last product page. */
export function browseInterest(session: Row): { productId: string; kind: "cart" | "view" } | null {
  const metadata = (session.metadata ?? {}) as Row;
  const cart = (metadata.commerce_cart_snapshot ?? {}) as Row;
  const cartIds = Array.isArray(cart.product_ids) ? cart.product_ids.filter((id): id is string => typeof id === "string") : [];
  if (cartIds.length) return { productId: cartIds[0], kind: "cart" };
  const journey = Array.isArray(metadata.commerce_journey) ? metadata.commerce_journey as Row[] : [];
  const viewed = [...journey].reverse().find(entry => entry.surface === "product" && read(entry.product_id));
  return viewed ? { productId: viewed.product_id as string, kind: "view" } : null;
}

/**
 * Leads identified in the store (they came from WhatsApp) who looked at products or left a cart and did
 * not buy: one message 1 to 6 hours later, about one product, at most once per product every 14 days.
 * Orders already started are handled by the payment recovery; a lead chatting right now is left alone.
 */
export async function planBrowseFollowUps(client: SupabaseClient, now = new Date()) {
  const { data: sessions, error } = await client.from("commerce_sessions")
    .select("id,organization_id,lead_id,conversation_id,first_seen_at,last_seen_at,metadata")
    .not("lead_id", "is", null).gte("last_seen_at", new Date(now.getTime() - 6 * hour).toISOString())
    .lte("last_seen_at", new Date(now.getTime() - hour).toISOString()).limit(100);
  if (error) throw new Error(error.message);
  let planned = 0;
  for (const session of (sessions ?? []) as Row[]) {
    const organizationId = session.organization_id as string;
    const leadId = session.lead_id as string;
    const interest = browseInterest(session);
    if (!interest) continue;
    const policy = await loadAutomationPolicy(client, organizationId).catch(() => null);
    if (!policy?.follow_up_enabled) continue;
    const since = read(session.first_seen_at) ?? new Date(now.getTime() - 6 * hour).toISOString();
    const [orders, recentMessages, recentBrowse] = await Promise.all([
      client.from("sales_catalog_orders").select("id").eq("organization_id", organizationId).eq("lead_id", leadId).gte("created_at", since).limit(1),
      client.from("conversation_messages").select("id").eq("organization_id", organizationId).eq("lead_id", leadId)
        .gte("occurred_at", new Date(now.getTime() - hour).toISOString()).limit(1),
      client.from("automation_dispatches").select("id").eq("organization_id", organizationId).eq("lead_id", leadId)
        .eq("event_data->>browseProductId", interest.productId).gte("created_at", new Date(now.getTime() - 14 * day).toISOString()).limit(1),
    ]);
    if ((orders.data ?? []).length || (recentMessages.data ?? []).length || (recentBrowse.data ?? []).length) continue;
    const context = await contactContext(client, organizationId, leadId).catch(() => null);
    if (!context) continue;
    try {
      const task = await persistFollowUpDispatch(client, { ...context, browseSessionId: session.id as string, browseProductId: interest.productId, browseKind: interest.kind },
        nextContactWindow(now, policy.window_start, policy.window_end, policy.timezone));
      if (task.status === "pending") planned += 1;
    } catch {
      // Another follow-up is active for this lead; the store visit is not worth a second message.
    }
  }
  return { browse: planned };
}

/**
 * Leads who talked with the agent, did not buy and went quiet 30 to 45 days ago: one message a month
 * at most, preferably about something new related to what they asked; otherwise resuming the topic.
 */
export async function planReactivations(client: SupabaseClient, now = new Date()) {
  const { data: leads, error } = await client.from("leads").select("id,organization_id,status,metadata")
    .gte("last_message_at", new Date(now.getTime() - 45 * day).toISOString()).lte("last_message_at", new Date(now.getTime() - 30 * day).toISOString())
    .neq("status", "archived").limit(200);
  if (error) throw new Error(error.message);
  let planned = 0;
  for (const lead of (leads ?? []) as Row[]) {
    const metadata = (lead.metadata ?? {}) as Row;
    if (metadata.whatsapp_opt_out === true || (metadata.opt_out as Row | undefined)?.requested_at) continue;
    const organizationId = lead.organization_id as string;
    const leadId = lead.id as string;
    const policy = await loadAutomationPolicy(client, organizationId).catch(() => null);
    if (!policy?.follow_up_enabled) continue;
    const [paid, inbound, recent, returns] = await Promise.all([
      client.from("sales_catalog_orders").select("id").eq("organization_id", organizationId).eq("lead_id", leadId).eq("payment_status", "confirmed")
        .gte("created_at", new Date(now.getTime() - 60 * day).toISOString()).limit(1),
      client.from("conversation_messages").select("text_content").eq("organization_id", organizationId).eq("lead_id", leadId).eq("direction", "inbound").limit(50),
      client.from("automation_dispatches").select("id").eq("organization_id", organizationId).eq("lead_id", leadId)
        .eq("event_data->>reactivation", "true").gte("created_at", new Date(now.getTime() - 30 * day).toISOString()).limit(1),
      client.from("customer_lead_visits").select("id").eq("organization_id", organizationId).eq("lead_id", leadId).in("return_status", ["pending", "scheduled"]).limit(1),
    ]);
    if ((paid.data ?? []).length || (inbound.data ?? []).length < 2 || (recent.data ?? []).length || (returns.data ?? []).length) continue;
    const context = await contactContext(client, organizationId, leadId).catch(() => null);
    if (!context) continue;
    const reactivationProductId = await chooseNovelty(client, organizationId, (inbound.data ?? []).map(row => String(row.text_content ?? "")).join(" "), now);
    try {
      const task = await persistFollowUpDispatch(client, { ...context, reactivation: true, reactivationMonth: now.toISOString().slice(0, 7), reactivationProductId },
        nextContactWindow(now, policy.window_start, policy.window_end, policy.timezone));
      if (task.status === "pending") planned += 1;
    } catch {
      // Another follow-up is active for this lead; tried again on a later run while inside the window.
    }
  }
  return { reactivations: planned };
}

/** A product added in the last 30 days that relates to what the lead talked about, if any. */
async function chooseNovelty(client: SupabaseClient, organizationId: string, conversation: string, now: Date) {
  const catalog = await listOrganizationSalesCatalog(client, organizationId, 150).catch(() => []);
  const talkedAbout = { title: conversation.slice(0, 2000), category: "" };
  let best: { id: string; score: number } | null = null;
  for (const product of catalog) {
    if (!sellableRecommendation(product) || !product.createdAt || Date.parse(product.createdAt) < now.getTime() - 30 * day) continue;
    const score = relatedProductScore(talkedAbout, product);
    if (score >= 1 && (!best || score > best.score)) best = { id: product.id, score };
  }
  return best?.id;
}
