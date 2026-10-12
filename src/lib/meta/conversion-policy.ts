import { createHash } from "node:crypto";

export function conversionOrigin(env: {NEXT_PUBLIC_APP_URL?:string;APP_URL?:string}=process.env) {
  for(const value of [env.NEXT_PUBLIC_APP_URL,env.APP_URL]) {
    try { const url=new URL(value||""); if(url.protocol==="https:"&&!/^(0\.0\.0\.0|localhost|127\.0\.0\.1)$/.test(url.hostname))return url.origin; } catch {}
  }
  return "https://www.connectyhub.com.br";
}

export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const conversionHash = (value: string) => createHash("sha256").update(value).digest("hex");
export function conversionUserData(organizationId: string, visitorId: string, userAgent: string, fbp?: unknown, fbc?: unknown) {
  const cookie = (v: unknown) => typeof v === "string" && /^fb\.\d\.\d{10,13}\.[A-Za-z0-9_-]{1,500}$/.test(v) ? v : undefined;
  return { external_id: [conversionHash(`${organizationId}:${visitorId}`)], client_user_agent: userAgent.slice(0,500),
    ...(cookie(fbp) ? {fbp:cookie(fbp)} : {}), ...(cookie(fbc) ? {fbc:cookie(fbc)} : {}) };
}
export function purchaseData(order: Record<string, unknown>, session: Record<string, unknown>) {
  const value = Number(order.total);
  // A generated Pix, a draft order or a client supplied "paid" flag is never a purchase.
  if (order.payment_status !== "confirmed" || session.status !== "approved" || !Number.isFinite(value) || value <= 0) return null;
  return { value, currency: String(session.currency || "BRL").toUpperCase(), order_id: String(order.id) };
}
export function canDeliverConversion(event: {pixel_id: string;revision: string;event_time: number}, config: {pixel_id: string;revision: string;enabled: boolean;ad_account_id: string}|null, accountId: string, consent: boolean, now = Date.now()) {
  return Boolean(config?.enabled && config.pixel_id === event.pixel_id && config.revision === event.revision
    && config.ad_account_id === accountId && consent && event.event_time >= Math.floor(now / 1000) - 6 * 86400);
}
