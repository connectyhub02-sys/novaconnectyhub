import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { listOrganizationSalesCatalog } from "@/lib/client-os/sales-catalog";
import { getOrganizationSalesCatalogSettings } from "@/lib/client-os/sales-catalog";
import { nextContactWindow } from "./contact-window";
import { loadAutomationPolicy, persistFollowUpDispatch } from "./dispatch";
import { contactContext, relatedProductScore, sellableRecommendation } from "./relationship-profile";
import { resolveProductReturnRule, returnRepeatLimit } from "./return-rules";

type Row = Record<string, unknown>;
const dayMs = 86400000;
const read = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** When the order was paid: the approved charge, else the order creation (both stable across runs). */
async function paidAtByOrder(client: SupabaseClient, orders: Row[]) {
  const ids = orders.map(order => order.id as string);
  const { data } = ids.length
    ? await client.from("sales_catalog_payment_sessions").select("order_id,paid_at").in("order_id", ids).eq("status", "approved")
    : { data: [] as Row[] };
  const paid = new Map<string, string>();
  for (const row of (data ?? []) as Row[]) if (read(row.paid_at)) paid.set(row.order_id as string, row.paid_at as string);
  return (order: Row) => paid.get(order.id as string) ?? (order.created_at as string);
}

async function storeActivity(client: SupabaseClient, organizationId: string, agentId: string | null) {
  let query = client.from("agent_registry").select("id,metadata").eq("organization_id", organizationId);
  if (agentId) query = query.eq("id", agentId);
  const { data } = await query.limit(5);
  for (const agent of (data ?? []) as Row[]) {
    const template = read(((agent.metadata as Row | null)?.prompt_builder_config as Row | undefined)?.templateId);
    if (template) return template;
  }
  return null;
}

/**
 * Paid orders become returns: each product with a return rule (its own days, or the default of its
 * activity) is registered once per order. A later purchase of the same product cancels the pending one.
 */
export async function planOrderReturns(client: SupabaseClient, now = new Date()) {
  const { data: orders, error } = await client.from("sales_catalog_orders").select("id,organization_id,lead_id,created_at,metadata")
    .eq("payment_status", "confirmed").gte("updated_at", new Date(now.getTime() - 3 * dayMs).toISOString()).not("lead_id", "is", null).limit(100);
  if (error) throw new Error(error.message);
  if (!orders?.length) return { returns: 0 };
  const paidAt = await paidAtByOrder(client, orders);
  let returns = 0;
  for (const order of orders as Row[]) {
    const organizationId = order.organization_id as string;
    const policy = await loadAutomationPolicy(client, organizationId).catch(() => null);
    if (policy?.returns_enabled === false) continue;
    const items = await client.from("sales_catalog_order_items").select("catalog_item_id,title").eq("organization_id", organizationId).eq("order_id", order.id);
    const ids = (items.data ?? []).map(item => item.catalog_item_id).filter(Boolean) as string[];
    if (!ids.length) continue;
    const products = await client.from("intelligence_memory").select("id,metadata").eq("organization_id", organizationId).in("id", ids);
    const activity = await storeActivity(client, organizationId, read((order.metadata as Row | null)?.agent_id));
    const occurred = paidAt(order);
    for (const item of (items.data ?? []) as Row[]) {
      const metadata = ((products.data ?? []) as Row[]).find(product => product.id === item.catalog_item_id)?.metadata as Row | undefined;
      const rule = resolveProductReturnRule(metadata, activity);
      if (!rule) continue;
      const service = read(metadata?.sales_destination) === "appointment";
      const result = await client.rpc("record_customer_visit_v2", {
        p_org: organizationId, p_lead: order.lead_id, p_description: String(item.title).slice(0, 300), p_kind: service ? "service" : "purchase",
        p_occurred: occurred, p_return: new Date(Date.parse(occurred) + rule.days * dayMs).toISOString(), p_key: `order-return:${order.id}:${item.catalog_item_id}`,
        p_actor: null, p_note: null, p_repeat_days: rule.repeat ? rule.days : null, p_repeat_remaining: rule.repeat ? returnRepeatLimit : 0,
        p_source: "product_rule", p_order: order.id, p_item: item.catalog_item_id,
      });
      if (!result.error) returns += 1;
    }
  }
  return { returns };
}

/** When to ask how it went: shipped orders after the usual transit, the others the next day. */
function checkinDue(order: Row, paidAt: string) {
  const shipped = /correios|sedex|pac|transportadora|frete/i.test(String(order.shipping_method ?? ""));
  return Date.parse(paidAt) + (shipped ? 7 : 1) * dayMs;
}
const crossSellAfterDays = 10;
const staleAfterMs = 3 * dayMs;

/**
 * Post-sale contacts for paid orders when they fall due: how it went, then one complementary product.
 * A return scheduled by the owner around the same days has priority, so the customer never gets both.
 */
export async function planPostSale(client: SupabaseClient, now = new Date()) {
  const { data: orders, error } = await client.from("sales_catalog_orders").select("id,organization_id,lead_id,created_at,shipping_method,metadata,status")
    .eq("payment_status", "confirmed").gte("created_at", new Date(now.getTime() - 20 * dayMs).toISOString()).not("lead_id", "is", null).limit(200);
  if (error) throw new Error(error.message);
  if (!orders?.length) return { postSale: 0 };
  const paidAt = await paidAtByOrder(client, orders);
  let planned = 0;
  for (const order of orders as Row[]) {
    if (["cancelled", "needs_human"].includes(String(order.status))) continue;
    const organizationId = order.organization_id as string;
    const leadId = order.lead_id as string;
    const policy = await loadAutomationPolicy(client, organizationId).catch(() => null);
    if (!policy?.follow_up_enabled) continue;
    const paid = paidAt(order);
    const due = [
      { kind: "checkin" as const, at: checkinDue(order, paid) },
      { kind: "crosssell" as const, at: Date.parse(paid) + crossSellAfterDays * dayMs },
    ].find(entry => entry.at <= now.getTime() && entry.at > now.getTime() - staleAfterMs);
    if (!due) continue;
    const around = [new Date(now.getTime() - 3 * dayMs).toISOString(), new Date(now.getTime() + 3 * dayMs).toISOString()];
    const [returns, recentReturns] = await Promise.all([
      client.from("customer_lead_visits").select("id").eq("organization_id", organizationId).eq("lead_id", leadId)
        .in("return_status", ["pending", "scheduled"]).gte("return_at", around[0]).lte("return_at", around[1]).limit(1),
      client.from("automation_dispatches").select("id").eq("organization_id", organizationId).eq("lead_id", leadId)
        .eq("journey", "return").eq("status", "sent").gte("sent_at", around[0]).limit(1),
    ]);
    if ((returns.data ?? []).length || (recentReturns.data ?? []).length) continue;
    const crossSellProductId = due.kind === "crosssell" ? await chooseCrossSell(client, organizationId, leadId) : undefined;
    if (due.kind === "crosssell" && !crossSellProductId) continue;
    const context = await contactContext(client, organizationId, leadId).catch(() => null);
    if (!context) continue;
    try {
      const task = await persistFollowUpDispatch(client, { ...context, postSaleKind: due.kind, postSaleOrderId: order.id as string, crossSellProductId },
        nextContactWindow(now, policy.window_start, policy.window_end, policy.timezone));
      if (task.status === "pending") planned += 1;
    } catch {
      // Another follow-up is active for this lead; this one is tried again on the next run while still due.
    }
  }
  return { postSale: planned };
}

/** One complementary product the lead has not bought: a configured cart offer first, else the closest match. */
async function chooseCrossSell(client: SupabaseClient, organizationId: string, leadId: string) {
  const paidOrders = await client.from("sales_catalog_orders").select("id").eq("organization_id", organizationId).eq("lead_id", leadId).eq("payment_status", "confirmed").limit(50);
  const ids = (paidOrders.data ?? []).map(order => order.id as string);
  if (!ids.length) return undefined;
  const lines = await client.from("sales_catalog_order_items").select("catalog_item_id").eq("organization_id", organizationId).in("order_id", ids);
  const bought = new Set((lines.data ?? []).map(line => line.catalog_item_id as string).filter(Boolean));
  const [catalog, settings] = await Promise.all([
    listOrganizationSalesCatalog(client, organizationId, 150),
    getOrganizationSalesCatalogSettings(client, organizationId).catch(() => null),
  ]);
  const sources = catalog.filter(product => bought.has(product.id));
  const offers = new Set((settings?.orderBumps.items ?? []).filter(item => item.active).map(item => item.productId));
  let best: { id: string; score: number } | null = null;
  for (const product of catalog) {
    if (bought.has(product.id) || !sellableRecommendation(product) || product.billingCycle !== "one_time") continue;
    const score = Math.max(0, ...sources.map(source => relatedProductScore(source, product))) + (offers.has(product.id) ? 5 : 0);
    if (score >= 3 && (!best || score > best.score)) best = { id: product.id, score };
  }
  return best?.id;
}

/** Birthday messages for today, in the company's timezone, once a year per lead. */
export async function planBirthdays(client: SupabaseClient, now = new Date()) {
  const { data: leads, error } = await client.from("leads").select("id,organization_id,metadata")
    .not("metadata->birthday", "is", null).neq("status", "archived").limit(500);
  if (error) throw new Error(error.message);
  let planned = 0;
  for (const lead of (leads ?? []) as Row[]) {
    const birthday = (lead.metadata as Row | null)?.birthday as Row | undefined;
    const day = Number(birthday?.day), month = Number(birthday?.month);
    if (!day || !month) continue;
    const organizationId = lead.organization_id as string;
    const policy = await loadAutomationPolicy(client, organizationId).catch(() => null);
    if (!policy?.follow_up_enabled) continue;
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: policy.timezone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
    const part = (type: string) => Number(parts.find(entry => entry.type === type)?.value);
    const year = part("year");
    const leap = new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1;
    const celebratedDay = month === 2 && day === 29 && !leap ? 28 : day;
    if (part("month") !== month || part("day") !== celebratedDay) continue;
    const context = await contactContext(client, organizationId, lead.id as string).catch(() => null);
    if (!context) continue;
    try {
      const task = await persistFollowUpDispatch(client, { ...context, birthdayYear: year }, nextContactWindow(now, policy.window_start, policy.window_end, policy.timezone));
      if (task.status === "pending") planned += 1;
    } catch {
      // Another follow-up is active for this lead; the birthday is tried again on the next run of the day.
    }
  }
  return { birthdays: planned };
}
