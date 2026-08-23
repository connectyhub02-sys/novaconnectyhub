"use client";

import { useState } from "react";
import { Loader2, ShoppingBag } from "lucide-react";

type ProductCheckoutButtonProps = {
  productId: string;
  disabled?: boolean;
};

export function ProductCheckoutButton({ productId, disabled = false }: ProductCheckoutButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    if (busy || disabled) return;

    setBusy(true);
    setError(null);

    try {
      const searchParams = new URLSearchParams(window.location.search);
      const response = await fetch(`/api/public/sales-catalog/products/${encodeURIComponent(productId)}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: searchParams.get("lead_id"),
          leadPhone: searchParams.get("lead_phone"),
          conversationId: searchParams.get("conversation_id"),
          trackingLinkId: searchParams.get("tracking_link_id"),
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        checkoutUrl?: string;
        trackingUrl?: string;
        error?: string;
      };

      if (!response.ok || !payload.checkoutUrl) {
        throw new Error(payload.error ?? "Nao foi possivel abrir o checkout.");
      }

      window.location.href = payload.trackingUrl ?? payload.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel abrir o checkout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-blue-600 px-5 text-sm font-bold text-white shadow-lg shadow-blue-700/25 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-400"
        disabled={disabled || busy}
        data-track-event="sales_catalog_product_buy_clicked"
        data-track-label="Comprar agora"
        onClick={handleCheckout}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShoppingBag className="h-4 w-4" aria-hidden="true" />}
        {busy ? "Abrindo checkout..." : "Comprar agora"}
      </button>
      {error ? (
        <p className="mt-3 rounded-[8px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium leading-5 text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
