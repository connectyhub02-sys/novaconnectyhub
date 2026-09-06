"use client";
import { useState } from "react";
import { CommercialOffers } from "./commercial-offers";

export function CheckoutUpsell({ organizationId, sessionId, productIds }: { organizationId: string; sessionId: string; productIds: string[] }) {
  const [error, setError] = useState<string | null>(null);
  return <div><CommercialOffers organizationId={organizationId} surface="confirmation" paymentSessionId={sessionId} currentProductIds={productIds} title="Quer aproveitar mais uma oferta?" addLabel="Conferir oferta" onAdd={async offer => {
    setError(null);
    const response = await fetch(`/api/checkout/${sessionId}/upsell`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: offer.productId }) });
    const data = await response.json();
    if (!response.ok || !data.checkoutUrl) { setError(data.error ?? "Não foi possível preparar esta oferta."); return false; }
    window.location.href = data.checkoutUrl;
    return true;
  }} />{error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}</div>;
}
