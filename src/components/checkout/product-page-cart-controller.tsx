"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartDrawer,
  type PublicStorefrontBranding,
  type PublicStorefrontCartLine,
  type PublicStorefrontProduct,
  type PublicStorefrontTrackingParams,
} from "@/components/checkout/public-storefront";
import {
  connectyStoreCartOpenEvent,
  type ConnectyStoreCartOpenEventDetail,
} from "@/components/checkout/sales-catalog-product-actions";

type ProductPageCartControllerProps = {
  branding: PublicStorefrontBranding;
  products: PublicStorefrontProduct[];
  storeSlug: string;
  tracking: PublicStorefrontTrackingParams;
};

export function ProductPageCartController({
  branding,
  products,
  storeSlug,
  tracking,
}: ProductPageCartControllerProps) {
  const storageKey = useMemo(() => `connecty-store-cart:${tracking.organizationId}`, [tracking.organizationId]);
  const [cart, setCart] = useState<PublicStorefrontCartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [customerName, setCustomerName] = useState(tracking.leadName ?? "");
  const [customerPhone, setCustomerPhone] = useState(tracking.leadPhone ?? "");
  const [customerEmail, setCustomerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readStoredCart = useCallback(() => readCartFromStorage(storageKey, products), [products, storageKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCart(readStoredCart());
      setCartLoaded(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [readStoredCart]);

  useEffect(() => {
    if (!cartLoaded) return;

    window.localStorage.setItem(
      storageKey,
      JSON.stringify(cart.map((line) => ({ productId: line.product.id, quantity: line.quantity }))),
    );
  }, [cart, cartLoaded, storageKey]);

  useEffect(() => {
    function handleCartOpen(event: Event) {
      const detail = (event as CustomEvent<ConnectyStoreCartOpenEventDetail>).detail;

      if (detail?.organizationId && detail.organizationId !== tracking.organizationId) return;

      event.preventDefault();
      setCart(readStoredCart());
      setCartLoaded(true);
      setCartOpen(true);
    }

    window.addEventListener(connectyStoreCartOpenEvent, handleCartOpen);

    return () => window.removeEventListener(connectyStoreCartOpenEvent, handleCartOpen);
  }, [readStoredCart, tracking.organizationId]);

  const totalCents = cart.reduce((total, line) => total + (line.product.priceCents ?? 0) * line.quantity, 0);
  const checkoutReady = cart.length > 0
    && cart.every((line) => line.product.canCheckout && typeof line.product.priceCents === "number");

  function updateQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      setCart((current) => current.filter((line) => line.product.id !== productId));
      return;
    }

    setCart((current) => current.map((line) => (
      line.product.id === productId ? { ...line, quantity: clampQuantity(quantity) } : line
    )));
  }

  async function createCheckout() {
    if (busy || !checkoutReady) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/public/sales-catalog/stores/${encodeURIComponent(storeSlug)}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          customerPhone,
          customerEmail,
          leadId: tracking.leadId,
          leadPhone: tracking.leadPhone,
          conversationId: tracking.conversationId,
          trackingLinkId: tracking.trackingLinkId,
          items: cart.map((line) => ({
            productId: line.product.id,
            quantity: line.quantity,
          })),
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        checkoutUrl?: string;
        trackingUrl?: string;
        error?: string;
      };

      if (!response.ok || !payload.checkoutUrl) {
        throw new Error(payload.error ?? "Não foi possível abrir o checkout.");
      }

      window.localStorage.removeItem(storageKey);
      window.location.href = payload.trackingUrl ?? payload.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível abrir o checkout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <CartDrawer
      branding={branding}
      busy={busy}
      cart={cart}
      checkoutReady={checkoutReady}
      customerEmail={customerEmail}
      customerName={customerName}
      customerPhone={customerPhone}
      error={error}
      leadContactPrefilled={Boolean(tracking.leadName && tracking.leadPhone)}
      open={cartOpen}
      setCustomerEmail={setCustomerEmail}
      setCustomerName={setCustomerName}
      setCustomerPhone={setCustomerPhone}
      totalCents={totalCents}
      onCheckout={createCheckout}
      onClose={() => setCartOpen(false)}
      onUpdateQuantity={updateQuantity}
    />
  );
}

function readCartFromStorage(storageKey: string, products: PublicStorefrontProduct[]): PublicStorefrontCartLine[] {
  const productById = new Map(products.map((product) => [product.id, product]));

  return safeParseCart(window.localStorage.getItem(storageKey))
    .map((line) => {
      const product = productById.get(line.productId);

      return product && product.canCheckout ? { product, quantity: clampQuantity(line.quantity) } : null;
    })
    .filter((line): line is PublicStorefrontCartLine => Boolean(line));
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
