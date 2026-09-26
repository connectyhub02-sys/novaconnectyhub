import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { applySalesCatalogOrderRevision, type SalesCatalogOrderRevisionRow } from "@/lib/sales-catalog/order-revision";
import type { BirthdayGift } from "./birthday-gift";

export type LeadBenefit = {
  id: string; benefit_kind: "favorites_discount" | "order_discount" | "gift_product"; percent: number | null;
  product_ids: string[]; gift_product_id: string | null; valid_until: string; used_order_id: string | null;
};

const dayMs = 86400000;
const benefitValidityDays = 7;
const money = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const clean = value.replace(/[^0-9,.-]/g, "");
  const parsed = Number(clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean);
  return Number.isFinite(parsed) ? parsed : null;
};
const cents = (value: number) => Math.round(value * 100) / 100;

/** The products the lead buys most; without purchases, the ones the lead looked at or left in the cart. */
async function favoriteProducts(client: SupabaseClient, organizationId: string, leadId: string) {
  const orders = await client.from("sales_catalog_orders").select("id").eq("organization_id", organizationId).eq("lead_id", leadId).eq("payment_status", "confirmed").limit(50);
  const ids = (orders.data ?? []).map(order => order.id as string);
  const counts = new Map<string, number>();
  if (ids.length) {
    const lines = await client.from("sales_catalog_order_items").select("catalog_item_id,quantity").eq("organization_id", organizationId).in("order_id", ids);
    for (const line of lines.data ?? []) if (line.catalog_item_id) counts.set(line.catalog_item_id, (counts.get(line.catalog_item_id) ?? 0) + Number(line.quantity ?? 1));
  }
  if (!counts.size) {
    const sessions = await client.from("commerce_sessions").select("metadata").eq("organization_id", organizationId).eq("lead_id", leadId).limit(20);
    for (const session of sessions.data ?? []) {
      const metadata = (session.metadata ?? {}) as Record<string, unknown>;
      const cart = ((metadata.commerce_cart_snapshot as Record<string, unknown> | undefined)?.product_ids ?? []) as unknown[];
      const viewed = ((metadata.commerce_journey ?? []) as Array<Record<string, unknown>>).filter(entry => entry.surface === "product").map(entry => entry.product_id);
      for (const id of [...cart, ...viewed]) if (typeof id === "string") counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);
}

/** The lead's birthday present for this year, created once (idempotent). "Favorites" without any known favorite becomes a discount on the order. */
export async function ensureBirthdayBenefit(client: SupabaseClient, input: { organizationId: string; leadId: string; year: number; gift: BirthdayGift; now?: Date }) {
  const now = input.now ?? new Date();
  const favorites = input.gift.kind === "favorites_discount" ? await favoriteProducts(client, input.organizationId, input.leadId) : [];
  const kind = input.gift.kind === "favorites_discount" && !favorites.length ? "order_discount" : input.gift.kind;
  const row = {
    organization_id: input.organizationId, lead_id: input.leadId, source: "birthday", benefit_kind: kind,
    percent: kind === "gift_product" ? null : input.gift.percent, product_ids: kind === "favorites_discount" ? favorites : [],
    gift_product_id: kind === "gift_product" ? input.gift.productId : null,
    valid_from: now.toISOString(), valid_until: new Date(now.getTime() + benefitValidityDays * dayMs).toISOString(),
    request_key: `birthday:${input.leadId}:${input.year}`,
  };
  await client.from("lead_benefits").upsert(row, { onConflict: "organization_id,request_key", ignoreDuplicates: true });
  const { data } = await client.from("lead_benefits").select("id,benefit_kind,percent,product_ids,gift_product_id,valid_until,used_order_id")
    .eq("organization_id", input.organizationId).eq("request_key", row.request_key).maybeSingle<LeadBenefit>();
  return data ?? null;
}

export async function loadActiveBenefit(client: SupabaseClient, organizationId: string, leadId: string, now = new Date()) {
  const { data, error } = await client.from("lead_benefits").select("id,benefit_kind,percent,product_ids,gift_product_id,valid_until,used_order_id")
    .eq("organization_id", organizationId).eq("lead_id", leadId).is("used_order_id", null)
    .lte("valid_from", now.toISOString()).gte("valid_until", now.toISOString()).order("valid_until").limit(1);
  return error ? null : ((data ?? [])[0] as LeadBenefit | undefined) ?? null;
}

/** How the agent talks about the present: what it is, until when, and that it applies by itself. */
export function describeBenefit(benefit: LeadBenefit, titles: Map<string, string>, timezone = "America/Sao_Paulo") {
  const until = new Date(benefit.valid_until).toLocaleDateString("pt-BR", { timeZone: timezone, day: "2-digit", month: "2-digit" });
  const percent = `${Number(benefit.percent).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  const names = benefit.product_ids.map(id => titles.get(id)).filter(Boolean).join(", ");
  const what = benefit.benefit_kind === "gift_product"
    ? `ganha ${titles.get(benefit.gift_product_id ?? "") ?? "um brinde"} de presente na próxima compra (o brinde precisa estar no pedido)`
    : benefit.benefit_kind === "favorites_discount" && names ? `${percent} de desconto em ${names}` : `${percent} de desconto no próximo pedido`;
  return `Presente de aniversário do cliente: ${what}, válido até ${until}. É aplicado automaticamente quando ele fechar o pedido, sem cupom.`;
}

/**
 * Right before a payment is created: the lead's active present becomes the order discount, through the
 * same revision that retires any earlier charge. Never stacks on another discount; once per benefit.
 */
export async function applyLeadBenefitBeforePayment(client: SupabaseClient, organizationId: string, orderId: string, now = new Date()) {
  const { data: order } = await client.from("sales_catalog_orders")
    .select("id,lead_id,conversation_id,status,payment_status,discount_total,shipping_total,shipping_method,destination_cep,destination_address,checkout_revision,metadata")
    .eq("organization_id", organizationId).eq("id", orderId).maybeSingle();
  if (!order?.lead_id || (money(order.discount_total) ?? 0) > 0 || !["draft", "pending_payment"].includes(order.status)
    || !["pending", "failed"].includes(order.payment_status)) return null;
  const cycles = (order.metadata?.billing_cycles ?? []) as unknown[];
  if (cycles.some(cycle => cycle !== "one_time")) return null;
  const benefit = await loadActiveBenefit(client, organizationId, order.lead_id, now);
  if (!benefit) return null;
  const items = await client.from("sales_catalog_order_items")
    .select("catalog_item_id,sku_id,sku_code,title,tag,quantity,unit_price,sale_price,total,attributes,fulfillment,metadata,product_origin_type,commercial_flow_type,revenue_owner_type,commission_eligible,platform_product_id")
    .eq("organization_id", organizationId).eq("order_id", order.id);
  if (items.error || !items.data?.length) return null;
  const rows = items.data as SalesCatalogOrderRevisionRow[];
  const subtotal = cents(rows.reduce((sum, row) => sum + (money(row.total) ?? NaN), 0));
  if (!Number.isFinite(subtotal)) return null;
  const percent = Number(benefit.percent ?? 0) / 100;
  const discount = cents(benefit.benefit_kind === "order_discount" ? subtotal * percent
    : benefit.benefit_kind === "favorites_discount" ? rows.filter(row => benefit.product_ids.includes(row.catalog_item_id)).reduce((sum, row) => sum + (money(row.total) ?? 0), 0) * percent
    : (() => { const gift = rows.find(row => row.catalog_item_id === benefit.gift_product_id); return gift ? money(gift.sale_price ?? gift.unit_price) ?? 0 : 0; })());
  const shipping = money(order.shipping_total) ?? 0;
  const total = cents(subtotal - discount + shipping);
  if (discount <= 0 || total <= 0) return null;
  await applySalesCatalogOrderRevision({
    client, organizationId, leadId: order.lead_id, conversationId: order.conversation_id, orderId: order.id,
    expectedRevision: Number(order.checkout_revision ?? 0), requestId: `benefit:${benefit.id}:${order.id}`, rows,
    shipping: { total: shipping, method: order.shipping_method, destinationCep: order.destination_cep, destinationAddress: order.destination_address },
    expectedTotal: total, discountTotal: discount,
    preferredPaymentMethod: order.metadata?.preferred_payment_method === "card" ? "card" : order.metadata?.preferred_payment_method === "pix" ? "pix" : null,
  });
  await client.from("lead_benefits").update({ used_order_id: order.id, used_at: now.toISOString() }).eq("id", benefit.id).is("used_order_id", null);
  return { discount, total };
}
