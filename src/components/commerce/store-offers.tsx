"use client";
import { useEffect, useState } from "react";
import {
  campaignPriceNotice,
  type CampaignPricing,
} from "@/lib/commerce/campaigns";
type Offer = {
  campaignId: string;
  optionId: string;
  name: string;
  productTitle: string;
  quantity: number;
  operation?: string;
  pricing: CampaignPricing;
};
export function StoreOffers({
  sessionId,
  pricing,
}: {
  sessionId: string;
  pricing?: CampaignPricing | null;
}) {
  const [offers, setOffers] = useState<Offer[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (pricing?.campaign_id) return;
    let live = true;
    fetch(`/api/checkout/${sessionId}/campaigns`)
      .then((r) => r.json())
      .then((d) => {
        if (live) setOffers(d.offers ?? []);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [sessionId, pricing?.campaign_id]);
  async function choose(o: Offer) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/checkout/${sessionId}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: o.campaignId,
          optionId: o.optionId,
        }),
      });
      const d = await response.json();
      if (!response.ok) throw new Error(d.error);
      window.location.assign(d.checkoutUrl);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível aplicar a oferta.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (pricing)
    return (
      <div className="my-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-950">
        {campaignPriceNotice(pricing)}
        <p>
          Valores por unidade. Frete e adicionais são apresentados
          separadamente.
        </p>
        {!pricing.campaign_id && offers.length ? (
          <div className="mt-2 space-y-2">
            {offers.map((o) => (
              <button
                key={o.campaignId + o.optionId}
                disabled={busy}
                onClick={() => choose(o)}
                className="block w-full rounded-lg bg-emerald-700 p-3 font-bold text-white"
              >
                {o.name}
                <span className="mt-1 block text-xs font-normal">
                  {campaignPriceNotice(o.pricing)}
                </span>
              </button>
            ))}
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    );
  if (!offers.length) return null;
  return (
    <details
      className="my-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-slate-950"
      open
    >
      <summary className="cursor-pointer text-sm font-bold">
        Benefícios disponíveis
      </summary>
      <div className="mt-3 flex snap-x gap-3 overflow-x-auto">
        {offers.map((o) => (
          <div
            key={o.campaignId + o.optionId}
            className="min-w-[240px] max-w-full flex-1 snap-start rounded-xl bg-white p-3"
          >
            <b className="text-sm">{o.name}</b>
            <p className="mt-1 text-xs text-slate-500">
              {o.operation === "upgrade"
                ? "Troca de assinatura · "
                : o.operation === "renewal"
                  ? "Renovação · "
                  : ""}
              {o.productTitle} · {o.quantity} unidade(s)
            </p>
            <p className="mt-2 text-xs leading-5">
              {campaignPriceNotice(o.pricing)}
            </p>
            <button
              disabled={busy}
              onClick={() => choose(o)}
              className="mt-3 min-h-11 w-full rounded-lg bg-emerald-700 px-3 text-sm font-bold text-white"
            >
              {busy ? "Conferindo…" : "Aplicar benefício"}
            </button>
          </div>
        ))}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </details>
  );
}
