import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { applySalesCatalogOrderRevision, type SalesCatalogOrderRevisionRow } from "@/lib/sales-catalog/order-revision";
import { createSalesCatalogPixPaymentSession } from "@/lib/sales-catalog/payment-sessions";

export type RecoveryDiscount = { percent: number; discount: number; total: number };

const onceEveryMs = 30 * 86400000;
const requestPrefix = "recovery-discount:";

/** The owner's discount in Automações; null when empty or not available yet. */
export async function loadRecoveryDiscountPercent(client: SupabaseClient, organizationId: string) {
  const { data, error } = await client.from("automation_policies").select("recovery_discount_percent")
    .eq("organization_id", organizationId).maybeSingle<{ recovery_discount_percent: number | string | null }>();
  if (error || data?.recovery_discount_percent == null) return null;
  const percent = Number(data.recovery_discount_percent);
  return Number.isFinite(percent) && percent > 0 && percent <= 50 ? percent : null;
}

const money = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const clean = value.replace(/[^0-9,.-]/g, "");
  const parsed = Number(clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean);
  return Number.isFinite(parsed) ? parsed : null;
};
const cents = (value: number) => Math.round(value * 100) / 100;

type DiscountInput = { organizationId: string; leadId: string; conversationId: string; orderId: string };
export type RecoveryDiscountPlan = RecoveryDiscount & { applied: boolean; apply: () => Promise<void> };

/**
 * Plans the store's recovery discount for an unpaid order, once per lead every 30 days. Nothing changes
 * until `apply` runs, right before the message is sent: the same revision that retires the previous
 * charge, then a new checkout link that charges the provider only when the customer opens it.
 * Returns null (no discount) whenever the owner set none or any condition is not met; a retry returns
 * the discount already applied.
 */
export async function planRecoveryDiscount(client: SupabaseClient, input: DiscountInput): Promise<RecoveryDiscountPlan | null> {
  const percent = await loadRecoveryDiscountPercent(client, input.organizationId);
  if (!percent) return null;
  const { data: order } = await client.from("sales_catalog_orders")
    .select("id,status,payment_status,subtotal,discount_total,total,shipping_total,shipping_method,destination_cep,destination_address,checkout_revision,lead_id,conversation_id,latest_payment_session_id,metadata")
    .eq("organization_id", input.organizationId).eq("id", input.orderId).maybeSingle();
  if (!order || order.lead_id !== input.leadId || order.conversation_id !== input.conversationId) return null;
  const preferred = order.metadata?.preferred_payment_method === "card" ? "card" as const : "pix" as const;
  const newCheckout = (total: number) => createSalesCatalogPixPaymentSession({ client, organizationId: input.organizationId, orderId: order.id,
    amount: total, preferredMethod: preferred, deferProvider: true, deferReason: "recovery_discount", source: "whatsapp_agent", actorId: null });

  const applied = await client.from("sales_catalog_order_revisions").select("order_id")
    .eq("organization_id", input.organizationId).eq("order_id", order.id).eq("request_id", `${requestPrefix}${order.id}`).eq("state", "applied").limit(1);
  if (applied.error) return null;
  const currentDiscount = money(order.discount_total) ?? 0;
  if ((applied.data ?? []).length) {
    const total = money(order.total);
    if (!(currentDiscount > 0 && total)) return null;
    // A retry after the revision: only the checkout link may still be missing.
    return { percent, discount: currentDiscount, total, applied: true,
      apply: async () => { if (!order.latest_payment_session_id) await newCheckout(total); } };
  }
  // Never stacks on another discount, never touches subscriptions or orders already moving to payment.
  const cycles = (order.metadata?.billing_cycles ?? []) as unknown[];
  if (currentDiscount > 0 || !["draft", "pending_payment"].includes(order.status) || !["pending", "failed"].includes(order.payment_status)
    || cycles.some(cycle => cycle !== "one_time")) return null;

  const since = new Date(Date.now() - onceEveryMs).toISOString();
  const leadOrders = await client.from("sales_catalog_orders").select("id").eq("organization_id", input.organizationId).eq("lead_id", input.leadId)
    .gte("created_at", new Date(Date.now() - 2 * onceEveryMs).toISOString()).limit(50);
  if (leadOrders.error) return null;
  const recent = await client.from("sales_catalog_order_revisions").select("order_id").eq("organization_id", input.organizationId)
    .in("order_id", (leadOrders.data ?? []).map(row => row.id)).like("request_id", `${requestPrefix}%`).eq("state", "applied").gte("created_at", since).limit(1);
  if (recent.error || (recent.data ?? []).length) return null;

  const sessions = await client.from("sales_catalog_payment_sessions").select("provider").eq("organization_id", input.organizationId)
    .eq("order_id", order.id).order("created_at", { ascending: false }).limit(1);
  if (sessions.error || sessions.data?.[0]?.provider !== "asaas") return null;

  const items = await client.from("sales_catalog_order_items")
    .select("catalog_item_id,sku_id,sku_code,title,tag,quantity,unit_price,sale_price,total,attributes,fulfillment,metadata,product_origin_type,commercial_flow_type,revenue_owner_type,commission_eligible,platform_product_id")
    .eq("organization_id", input.organizationId).eq("order_id", order.id);
  if (items.error || !items.data?.length || items.data.some(row => !row.catalog_item_id)) return null;
  const rows = items.data as SalesCatalogOrderRevisionRow[];
  const subtotal = cents(rows.reduce((sum, row) => sum + (money(row.total) ?? NaN), 0));
  const shipping = money(order.shipping_total) ?? 0;
  const discount = cents(subtotal * percent / 100);
  const total = cents(subtotal - discount + shipping);
  if (!Number.isFinite(subtotal) || discount <= 0 || total <= 0) return null;

  return { percent, discount, total, applied: false, apply: async () => {
    await applySalesCatalogOrderRevision({
      client, organizationId: input.organizationId, leadId: input.leadId, conversationId: input.conversationId, orderId: order.id,
      expectedRevision: Number(order.checkout_revision ?? 0), requestId: `${requestPrefix}${order.id}`, rows,
      shipping: { total: shipping, method: order.shipping_method, destinationCep: order.destination_cep, destinationAddress: order.destination_address },
      expectedTotal: total, preferredPaymentMethod: preferred, discountTotal: discount,
    });
    await newCheckout(total);
  } };
}
