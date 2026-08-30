"use client";

import { useState } from "react";
import { Loader2, Minus, Plus, ShoppingBag } from "lucide-react";
import { publishCommerceAgentEvent } from "@/lib/commerce-agent/client-events";
import { cn } from "@/lib/utils";

type ProductCheckoutButtonProps = {
  productId: string;
  disabled?: boolean;
  quantity?: number;
  className?: string;
  label?: string;
  pendingLabel?: string;
};

type ProductPurchaseControlsProps = {
  productId: string;
  organizationId?: string;
  cartUrl?: string;
  disabled?: boolean;
  className?: string;
};

export const connectyStoreCartOpenEvent = "connectyhub-store-cart-open";

export type ConnectyStoreCartOpenEventDetail = {
  organizationId: string;
  productId: string;
  quantity: number;
};

export function ProductCheckoutButton({
  productId,
  disabled = false,
  quantity = 1,
  className,
  label = "Comprar agora",
  pendingLabel = "Abrindo checkout...",
}: ProductCheckoutButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    if (busy || disabled) return;

    setBusy(true);
    setError(null);
    publishCommerceAgentEvent("checkout_started", {
      source: "product_buy_button",
      product_id: productId,
      quantity,
    });

    try {
      const searchParams = new URLSearchParams(window.location.search);
      const response = await fetch(`/api/public/sales-catalog/products/${encodeURIComponent(productId)}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: searchParams.get("lead_id"),
          leadPhone: searchParams.get("lead_phone"),
          conversationId: searchParams.get("conversation_id"),
          agentId: searchParams.get("agent_id"),
          trackingLinkId: searchParams.get("tracking_link_id"),
          quantity,
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

      publishCommerceAgentEvent("checkout_created", {
        source: "product_buy_button",
        product_id: productId,
        quantity,
        checkout_url: payload.checkoutUrl,
      });
      window.location.href = payload.trackingUrl ?? payload.checkoutUrl;
    } catch (err) {
      publishCommerceAgentEvent("checkout_failed", {
        source: "product_buy_button",
        product_id: productId,
        quantity,
        reason: err instanceof Error ? err.message : "unknown_error",
      });
      setError(err instanceof Error ? err.message : "Nao foi possivel abrir o checkout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className={cn(
          "inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full border px-5 text-sm font-bold shadow-lg shadow-slate-950/20 transition brightness-100 hover:brightness-110 disabled:cursor-not-allowed disabled:border-slate-400 disabled:bg-slate-400 disabled:text-white",
          className,
        )}
        disabled={disabled || busy}
        data-track-event="sales_catalog_product_buy_clicked"
        data-track-label={label}
        onClick={handleCheckout}
        style={disabled || busy ? undefined : {
          backgroundColor: "var(--store-button, #063f2c)",
          borderColor: "var(--store-button-border, #063f2c)",
          color: "var(--store-button-text, #ffffff)",
        }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShoppingBag className="h-4 w-4" aria-hidden="true" />}
        {busy ? pendingLabel : label}
      </button>
      {error ? (
        <p className="mt-3 rounded-[8px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium leading-5 text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ProductPurchaseControls({
  cartUrl,
  disabled = false,
  className,
  organizationId,
  productId,
}: ProductPurchaseControlsProps) {
  const [quantity, setQuantity] = useState(1);

  return (
    <div className={cn("grid gap-3 border-y border-black/10 py-4", className)}>
      <div className="grid grid-cols-[128px_minmax(0,1fr)] gap-3">
        <QuantityStepper quantity={quantity} onChange={setQuantity} />
        <AddToCartButton
          cartUrl={cartUrl}
          disabled={disabled}
          organizationId={organizationId}
          productId={productId}
          quantity={quantity}
        />
      </div>
    </div>
  );
}

export function ProductMobileCheckoutBar({
  cartUrl,
  disabled = false,
  organizationId,
  productId,
}: ProductPurchaseControlsProps) {
  const [quantity, setQuantity] = useState(1);

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-[116px_minmax(0,1fr)] gap-3 border-t border-black/10 bg-white px-4 py-3 shadow-[0_-16px_40px_rgba(15,23,42,0.14)] sm:hidden">
      <QuantityStepper quantity={quantity} onChange={setQuantity} compact />
      <AddToCartButton
        cartUrl={cartUrl}
        productId={productId}
        organizationId={organizationId}
        disabled={disabled}
        quantity={quantity}
        className="min-h-11 px-3 text-xs shadow-none"
        label="Adicionar"
      />
    </div>
  );
}

function AddToCartButton({
  cartUrl,
  className,
  disabled,
  label = "Adicionar ao carrinho",
  organizationId,
  productId,
  quantity,
}: {
  cartUrl?: string;
  className?: string;
  disabled: boolean;
  label?: string;
  organizationId?: string;
  productId: string;
  quantity: number;
}) {
  const [busy, setBusy] = useState(false);

  function addToCart() {
    if (busy || disabled) return;

    if (!organizationId || !cartUrl) {
      return;
    }

    setBusy(true);
    const storageKey = `connecty-store-cart:${organizationId}`;
    const nextCart = mergeCartLine(storageKey, productId, quantity);
    window.localStorage.setItem(storageKey, JSON.stringify(nextCart));
    publishCommerceAgentEvent("cart_item_added", {
      source: "product_add_to_cart_button",
      product_id: productId,
      quantity,
      cart_lines: nextCart.length,
    });
    const event = new CustomEvent<ConnectyStoreCartOpenEventDetail>(connectyStoreCartOpenEvent, {
      cancelable: true,
      detail: { organizationId, productId, quantity },
    });
    const shouldOpenCartPage = window.dispatchEvent(event);

    if (shouldOpenCartPage) {
      window.location.href = cartUrl;
      return;
    }

    setBusy(false);
  }

  if (!organizationId || !cartUrl) {
    return (
      <ProductCheckoutButton
        productId={productId}
        disabled={disabled}
        quantity={quantity}
        className={className}
        label="Comprar agora"
      />
    );
  }

  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full border px-5 text-sm font-bold shadow-lg shadow-slate-950/20 transition brightness-100 hover:brightness-110 disabled:cursor-not-allowed disabled:border-slate-400 disabled:bg-slate-400 disabled:text-white",
        className,
      )}
      disabled={disabled || busy}
      data-track-event="sales_catalog_product_add_to_cart_clicked"
      data-track-label={label}
      onClick={addToCart}
      style={disabled || busy ? undefined : {
        backgroundColor: "var(--store-button, #063f2c)",
        borderColor: "var(--store-button-border, #063f2c)",
        color: "var(--store-button-text, #ffffff)",
      }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShoppingBag className="h-4 w-4" aria-hidden="true" />}
      {busy ? "Abrindo carrinho..." : label}
    </button>
  );
}

function mergeCartLine(storageKey: string, productId: string, quantity: number) {
  const stored = window.localStorage.getItem(storageKey);
  const parsed = safeParseCart(stored);
  const byProduct = new Map(parsed.map((line) => [line.productId, line.quantity]));
  byProduct.set(productId, Math.min(20, (byProduct.get(productId) ?? 0) + clampQuantity(quantity)));

  return Array.from(byProduct.entries()).map(([nextProductId, nextQuantity]) => ({
    productId: nextProductId,
    quantity: clampQuantity(nextQuantity),
  }));
}

function safeParseCart(value: string | null): Array<{ productId: string; quantity: number }> {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((line) => {
        if (!line || typeof line !== "object") return null;
        const productId = typeof line.productId === "string" ? line.productId : null;
        const quantity = clampQuantity(Number(line.quantity));

        return productId ? { productId, quantity } : null;
      })
      .filter((line): line is { productId: string; quantity: number } => Boolean(line));
  } catch {
    return [];
  }
}

function clampQuantity(value: number) {
  if (!Number.isFinite(value)) return 1;

  return Math.min(20, Math.max(1, Math.round(value)));
}

function QuantityStepper({
  compact = false,
  quantity,
  onChange,
}: {
  compact?: boolean;
  quantity: number;
  onChange: (quantity: number) => void;
}) {
  return (
    <div className={cn(
      "inline-grid grid-cols-3 items-center rounded-full bg-[#f0f0f0] text-black",
      compact ? "h-11" : "h-12",
    )}>
      <button
        type="button"
        className="grid h-full place-items-center rounded-l-full transition hover:bg-black/5"
        aria-label="Diminuir quantidade"
        onClick={() => onChange(Math.max(1, quantity - 1))}
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="text-center text-sm font-semibold">{quantity}</span>
      <button
        type="button"
        className="grid h-full place-items-center rounded-r-full transition hover:bg-black/5"
        aria-label="Aumentar quantidade"
        onClick={() => onChange(Math.min(20, quantity + 1))}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
