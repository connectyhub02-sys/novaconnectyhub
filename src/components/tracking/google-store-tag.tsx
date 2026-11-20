"use client";
import { useEffect, useState } from "react";
import type { ConnectyPublicTrackingContext } from "@/lib/tracking/public-context";
import { commerceAgentTrackingEventName } from "@/lib/commerce-agent/client-events";
import { safeStoreLocation } from "@/lib/google/store-tag-policy";

type StoreTag = { active: true; measurementId: string | null; adsConversionId: string | null; leadSendTo: string | null };
type GtagWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; connectyGoogleStoreTags?: Set<string> };

function gtag(...args: unknown[]) {
  const win = window as GtagWindow;
  win.dataLayer = win.dataLayer || [];
  // gtag.js reads the arguments object, not an array.
  // eslint-disable-next-line prefer-rest-params
  win.gtag = win.gtag || function () { win.dataLayer!.push(arguments); };
  win.gtag(...args);
}

function load(tag: StoreTag) {
  const win = window as GtagWindow;
  const ids = [tag.measurementId, tag.adsConversionId].filter((id): id is string => Boolean(id));
  win.connectyGoogleStoreTags ??= new Set();
  if (!document.getElementById("connecty-google-store-tag")) {
    const script = document.createElement("script");
    script.id = "connecty-google-store-tag";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ids[0])}`;
    document.head.appendChild(script);
    gtag("js", new Date());
  }
  gtag("consent", "update", { ad_storage: "granted", analytics_storage: "granted", ad_user_data: "granted", ad_personalization: "denied" });
  const page_location = safeStoreLocation(location.origin, location.pathname);
  for (const id of ids) {
    if (win.connectyGoogleStoreTags.has(id)) continue;
    // Never let gtag read query strings or checkout tokens from the address bar.
    gtag("config", id, { send_page_view: false, page_location, page_referrer: "" });
    win.connectyGoogleStoreTags.add(id);
  }
  return ids;
}

/** GA4 and Google Ads tag for the client's store, only after the visitor agrees. */
export function GoogleStoreTag({ context }: { context: ConnectyPublicTrackingContext }) {
  const org = context.organization_id || "", token = context.tracking_token || "";
  const key = `connecty_google_consent_${org}`;
  const [tag, setTag] = useState<StoreTag | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!org || !token) return;
    let alive = true;
    fetch("/api/public/google-tag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: org, trackingToken: token }) })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!alive || !d?.active) return;
        setTag(d as StoreTag);
        try { setChoice(localStorage.getItem(key)); } catch { setChoice(null); }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [org, token, key]);

  useEffect(() => {
    if (!tag || choice !== "granted") return;
    const ids = load(tag);
    const page_location = safeStoreLocation(location.origin, location.pathname);
    const send = (name: string, params: Record<string, unknown> = {}) => gtag("event", name, { send_to: ids, page_location, ...params });
    send("page_view");
    const item = context.product_id || context.catalog_item_id;
    if (item) send("view_item", { items: [{ item_id: item }] });
    if (context.payment_session_id) {
      send("begin_checkout");
      // An order started in the store is the Google Ads conversion the client chose.
      if (tag.leadSendTo) gtag("event", "conversion", { send_to: tag.leadSendTo, page_location });
    }
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.event_type === "cart_item_added" && typeof detail.metadata?.product_id === "string") send("add_to_cart", { items: [{ item_id: detail.metadata.product_id }] });
    };
    window.addEventListener(commerceAgentTrackingEventName, handler);
    return () => window.removeEventListener(commerceAgentTrackingEventName, handler);
  }, [tag, choice, context.product_id, context.catalog_item_id, context.payment_session_id]);

  function choose(granted: boolean) {
    try { localStorage.setItem(key, granted ? "granted" : "denied"); } catch { /* choice lasts this visit only */ }
    if (!granted) gtag("consent", "update", { ad_storage: "denied", analytics_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    setChoice(granted ? "granted" : "denied");
    setOpen(false);
  }

  if (!tag) return null;
  return (
    <aside className="fixed bottom-3 right-3 z-50 max-w-sm rounded-xl border border-slate-200 bg-white p-3 text-slate-900 shadow-lg" aria-label="Medição do Google">
      {choice && !open ? (
        <button className="text-xs underline" onClick={() => setOpen(true)}>Google: preferências</button>
      ) : (
        <>
          <p className="text-sm">Permitir que esta loja use o Google para medir visitas e pedidos dos anúncios? Você pode recusar e continuar navegando normalmente.</p>
          <div className="mt-2 flex gap-2">
            <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white" onClick={() => choose(true)}>Permitir</button>
            <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs" onClick={() => choose(false)}>Recusar</button>
          </div>
        </>
      )}
    </aside>
  );
}
