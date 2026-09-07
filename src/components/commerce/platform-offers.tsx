"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  campaignPriceNotice,
  intervalLabels,
  type CampaignPricing,
} from "@/lib/commerce/campaigns";
type Offer = {
  campaignId: string;
  optionId: string;
  name: string;
  description: string;
  endsAt: string;
  pricing: CampaignPricing;
};
export function PlatformOffers({
  planCode,
  subscriptionId,
}: {
  planCode: string;
  subscriptionId?: string;
}) {
  const router = useRouter(),
    [offers, setOffers] = useState<Offer[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(
      `/api/dashboard/billing/campaign-offers?plan=${encodeURIComponent(planCode)}${subscriptionId ? `&subscription=${encodeURIComponent(subscriptionId)}` : ""}`,
    )
      .then((r) => r.json())
      .then((d) => {
        if (live) setOffers(d.offers ?? []);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [planCode, subscriptionId]);
  async function choose(offer: Offer) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        subscriptionId
          ? "/api/dashboard/billing/campaign-offers"
          : /^[0-9a-f-]{36}$/i.test(planCode)
            ? "/api/dashboard/meus-produtos/comprar"
            : "/api/dashboard/billing/plan-intent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planCode,
            productId: planCode,
            subscriptionId,
            campaignId: offer.campaignId,
            optionId: offer.optionId,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.checkoutUrl) router.push(data.checkoutUrl);
      else router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível aplicar a oferta.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!offers.length) return null;
  return (
    <section className="my-4 space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-slate-950">
      <h3 className="font-bold">Ofertas disponíveis para você</h3>
      {offers.map((o) => (
        <div
          className="rounded-xl bg-white p-3"
          key={o.campaignId + o.optionId}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b className="text-sm">
              {o.name} · {intervalLabels[o.pricing.interval]}
            </b>
            <span className="font-bold text-emerald-700">
              {o.pricing.price_brl.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5">
            {campaignPriceNotice(o.pricing)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Oferta até{" "}
            {new Date(o.endsAt).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })}{" "}
            (Brasília).
          </p>
          <button
            disabled={busy}
            onClick={() => choose(o)}
            className="mt-3 min-h-11 w-full rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {busy ? "Conferindo…" : "Escolher esta oferta"}
          </button>
        </div>
      ))}
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
