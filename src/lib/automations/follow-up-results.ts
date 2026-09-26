import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
export type FollowUpKind = "recovery" | "conversation" | "return" | "post_sale" | "birthday" | "browse" | "reactivation" | "recommendation";
export type FollowUpResultRow = { kind: FollowUpKind; label: string; sent: number; replied: number; sales: number; revenue: number };

const labels: Record<FollowUpKind, string> = {
  recovery: "Pagamento pendente",
  conversation: "Retomada de conversa",
  return: "Retornos programados",
  post_sale: "Pós-venda",
  birthday: "Aniversário",
  browse: "Navegou e não comprou",
  reactivation: "Reativação",
  recommendation: "Recomendação",
};
const hour = 3600_000;
const replyWindowMs = 48 * hour;
const saleWindowMs = 7 * 24 * hour;
const money = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string" || !value.trim()) return 0;
  const clean = value.replace(/[^0-9,.-]/g, "");
  const parsed = Number(clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function followUpKind(dispatch: Row): FollowUpKind {
  const data = (dispatch.event_data ?? {}) as Row;
  if (dispatch.journey === "recommendation") return data.browseProductId ? "browse" : data.reactivation ? "reactivation" : "recommendation";
  return (dispatch.journey as FollowUpKind) ?? "conversation";
}

/**
 * What the follow-ups did in the period: messages accepted by WhatsApp, leads who answered within 48 h,
 * and paid orders credited to the last follow-up the lead received up to 7 days before paying
 * (a pending-payment recovery is credited to its own order).
 */
export function summarizeFollowUpResults(dispatches: Row[], inbound: Row[], orders: Row[]): { rows: FollowUpResultRow[]; revenue: number; sales: number } {
  const byKind = new Map<FollowUpKind, FollowUpResultRow>();
  const row = (kind: FollowUpKind) => {
    if (!byKind.has(kind)) byKind.set(kind, { kind, label: labels[kind], sent: 0, replied: 0, sales: 0, revenue: 0 });
    return byKind.get(kind)!;
  };
  const sent = dispatches.filter(dispatch => dispatch.status === "sent" && dispatch.sent_at)
    .map(dispatch => ({ lead_id: dispatch.lead_id as string, event_data: (dispatch.event_data ?? {}) as Row,
      at: Date.parse(dispatch.sent_at as string), kind: followUpKind(dispatch) }))
    .sort((a, b) => a.at - b.at);
  for (const dispatch of sent) {
    const entry = row(dispatch.kind);
    entry.sent += 1;
    const answered = inbound.some(message => message.lead_id === dispatch.lead_id
      && Date.parse(message.occurred_at as string) > dispatch.at && Date.parse(message.occurred_at as string) <= dispatch.at + replyWindowMs);
    if (answered) entry.replied += 1;
  }
  let revenue = 0;
  let sales = 0;
  for (const order of orders) {
    const paidAt = Date.parse((order.paid_at ?? order.updated_at ?? order.created_at) as string);
    const direct = sent.filter(dispatch => dispatch.kind === "recovery" && dispatch.event_data.salesCatalogOrderId === order.id && dispatch.at <= paidAt).at(-1);
    const touch = direct ?? sent.filter(dispatch => dispatch.lead_id === order.lead_id && dispatch.at <= paidAt && dispatch.at >= paidAt - saleWindowMs).at(-1);
    if (!touch) continue;
    const value = money(order.total);
    const entry = row(touch.kind);
    entry.sales += 1;
    entry.revenue = Math.round((entry.revenue + value) * 100) / 100;
    revenue = Math.round((revenue + value) * 100) / 100;
    sales += 1;
  }
  const order: FollowUpKind[] = ["recovery", "return", "post_sale", "browse", "reactivation", "birthday", "conversation", "recommendation"];
  return { rows: order.filter(kind => byKind.has(kind)).map(kind => byKind.get(kind)!), revenue, sales };
}

export async function loadFollowUpResults(client: SupabaseClient, organizationId: string, days = 30, now = new Date()) {
  const since = new Date(now.getTime() - days * 24 * hour).toISOString();
  const { data: dispatches, error } = await client.from("automation_dispatches").select("lead_id,journey,status,sent_at,event_data")
    .eq("organization_id", organizationId).eq("status", "sent").gte("sent_at", since).limit(2000);
  if (error) throw new Error("Não foi possível carregar os resultados.");
  const leads = [...new Set((dispatches ?? []).map(dispatch => dispatch.lead_id as string))];
  if (!leads.length) return { days, rows: [], revenue: 0, sales: 0 };
  const [inbound, orders] = await Promise.all([
    client.from("conversation_messages").select("lead_id,occurred_at").eq("organization_id", organizationId).eq("direction", "inbound")
      .in("lead_id", leads).gte("occurred_at", since).limit(5000),
    client.from("sales_catalog_orders").select("id,lead_id,total,created_at,updated_at").eq("organization_id", organizationId)
      .eq("payment_status", "confirmed").in("lead_id", leads).gte("updated_at", since).limit(2000),
  ]);
  const orderIds = (orders.data ?? []).map(order => order.id as string);
  const paid = orderIds.length
    ? await client.from("sales_catalog_payment_sessions").select("order_id,paid_at").in("order_id", orderIds).eq("status", "approved")
    : { data: [] as Row[] };
  const paidAt = new Map(((paid.data ?? []) as Row[]).map(session => [session.order_id as string, session.paid_at as string]));
  const withPaidAt = ((orders.data ?? []) as Row[]).map(order => ({ ...order, paid_at: paidAt.get(order.id as string) ?? null }));
  return { days, ...summarizeFollowUpResults((dispatches ?? []) as Row[], (inbound.data ?? []) as Row[], withPaidAt) };
}
