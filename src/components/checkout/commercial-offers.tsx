"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { commerceAgentTrackingEventName, publishCommerceAgentEvent } from "@/lib/commerce-agent/client-events";
import { publicTrackingContextUpdatedEventName, readPublicTrackingContext } from "@/lib/tracking/public-context";
import type { CommerceOffer, CommerceOfferSurface } from "@/lib/sales-catalog/commerce-offers";

type Props = { organizationId: string; surface: CommerceOfferSurface; currentProductIds?: string[]; onAdd?: (offer: CommerceOffer) => boolean | Promise<boolean>; title?: string; addLabel?: string; paymentSessionId?: string };
export function CommercialOffers({ organizationId, surface, currentProductIds = [], onAdd, title = "Combine com seu pedido", addLabel = "Adicionar", paymentSessionId }: Props) {
  const [campaigns,setCampaigns] = useState<{id:string;campaignId:string;optionId:string;productId:string;title:string;name:string;audience:string;conditions:string;productUrl:string}[]>([]);
  const [offers, setOffers] = useState<CommerceOffer[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const container = useRef<HTMLElement>(null);
  const shown = useRef(new Set<string>());
  const productKey = currentProductIds.join(",");
  useEffect(() => {
    const controller = new AbortController();
    let lastIdentity: string | null = null;
    async function load() {
      const context = readPublicTrackingContext();
      const identity = `${context?.organization_id ?? ""}:${context?.lead_id ?? ""}:${context?.payment_session_id ?? ""}`;
      if (identity === lastIdentity) return;
      lastIdentity = identity;
      const query = new URLSearchParams({ organization_id: organizationId, surface, products: productKey });
      if (context?.organization_id === organizationId) for (const key of ["lead_id", "tracking_token", "payment_session_id"] as const) { if (context[key]) query.set(key, context[key]!); }
      if (paymentSessionId) query.set("payment_session_id", paymentSessionId);
      const response = await fetch(`/api/public/sales-catalog/offers?${query}`, { signal: controller.signal, cache: "no-store" });
      const data = await response.json();
      if (!controller.signal.aborted) {setOffers(data.offers ?? []);setCampaigns(data.campaigns??[]);}
    }
    const refresh = () => { void load().catch(() => null); };
    const decision = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (["offer_declined", "offer_accepted"].includes(detail?.event_type) && typeof detail?.metadata?.offer_product_id === "string") setOffers(current => current.filter(offer => offer.productId !== detail.metadata.offer_product_id));
    };
    refresh();
    window.addEventListener(publicTrackingContextUpdatedEventName, refresh);
    window.addEventListener(commerceAgentTrackingEventName, decision);
    return () => { controller.abort(); window.removeEventListener(publicTrackingContextUpdatedEventName, refresh); window.removeEventListener(commerceAgentTrackingEventName, decision); };
  }, [organizationId, surface, productKey, paymentSessionId]);
  useEffect(() => {
    if (!container.current || (!offers.length&&!campaigns.length)) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      for (const offer of offers) if (!shown.current.has(offer.productId)) {
        shown.current.add(offer.productId);
        publishCommerceAgentEvent("offer_shown", { offer_product_id: offer.productId, surface, price: offer.price });
      }
      for(const campaign of campaigns) if(!shown.current.has(campaign.id)){shown.current.add(campaign.id);publishCommerceAgentEvent("campaign_offer_shown",{campaign_id:campaign.campaignId,option_id:campaign.optionId,offer_product_id:campaign.productId,surface,conditions:campaign.conditions});}
    }, { threshold: 0.3 });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [offers, campaigns, surface]);

  function dismiss(offer: CommerceOffer) {
    publishCommerceAgentEvent("offer_declined", { offer_product_id: offer.productId, surface });
    setOffers(current => current.filter(item => item.productId !== offer.productId));
  }
  async function add(offer: CommerceOffer) {
    if (!onAdd || busy) return;
    setBusy(offer.productId);
    setMessage(null);
    try {
      if (!await onAdd(offer)) { setMessage("Abra o produto para escolher as opções disponíveis."); return; }
      publishCommerceAgentEvent("offer_accepted", { offer_product_id: offer.productId, surface, price: offer.price });
      setOffers(current => current.filter(item => item.productId !== offer.productId));
    } catch { setMessage("Não foi possível adicionar a oferta. Tente novamente."); }
    finally { setBusy(null); }
  }
  if (!offers.length && !campaigns.length) return null;
  const campaignCards = campaigns.length ? <div className="mb-4 space-y-3"><h2 className="text-sm font-bold text-emerald-950">Campanhas da loja</h2><div className="flex snap-x gap-3 overflow-x-auto">{campaigns.map(c => <article key={c.id} className="w-72 shrink-0 snap-start rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-950"><b>{c.name} · {c.title}</b><p className="mt-1 font-semibold">{c.audience}</p><p className="mt-2">{c.conditions}</p><p className="mt-2">Valores por unidade. Frete e adicionais à parte. Escolha o benefício no checkout, após a conferência de elegibilidade.</p><a href={c.productUrl} onClick={()=>publishCommerceAgentEvent("campaign_offer_clicked",{campaign_id:c.campaignId,option_id:c.optionId,offer_product_id:c.productId,surface})} className="mt-2 flex min-h-11 items-center font-bold underline">Ver produto</a></article>)}</div></div> : null;
  return <section ref={container} className="my-5 rounded-xl border border-slate-200 bg-white p-4">{campaignCards}{offers.length ? <h2 className="text-sm font-bold text-slate-950">{title}</h2> : null}<div className="mt-3 grid gap-3 sm:grid-cols-2">{offers.map(offer => <article key={offer.productId} className="min-w-0 rounded-lg border border-slate-200 p-3"><div className="flex items-center gap-3">{offer.imageUrl ? <Image src={offer.imageUrl} alt="" width={52} height={52} unoptimized className="h-13 w-13 rounded-lg object-contain" /> : null}<div className="min-w-0"><a href={offer.productUrl} className="line-clamp-2 text-xs font-semibold text-slate-900">{offer.title}</a><p className="mt-1 text-sm font-bold text-slate-950">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(offer.price)}</p></div></div><div className="mt-3 flex flex-wrap items-center gap-2">{onAdd && offer.canAddDirectly ? <button type="button" disabled={Boolean(busy)} onClick={() => void add(offer)} className="flex min-h-11 items-center gap-1 rounded-lg bg-[color:var(--store-button,#1d4ed8)] px-3 text-xs font-semibold text-[color:var(--store-button-text,#fff)] disabled:opacity-50"><Plus className="h-3 w-3" />{busy === offer.productId ? "Preparando…" : addLabel}</button> : <a href={offer.productUrl} className="flex min-h-11 items-center rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white">Ver opções</a>}<button type="button" disabled={Boolean(busy)} onClick={() => dismiss(offer)} className="min-h-11 px-2 text-xs text-slate-600">Agora não</button></div></article>)}</div>{message ? <p role="status" className="mt-2 text-xs text-slate-600">{message}</p> : null}</section>;
}
