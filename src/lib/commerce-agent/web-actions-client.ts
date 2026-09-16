"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { PublicStorefrontCartLine, PublicStorefrontProduct } from "@/components/checkout/public-storefront";
import { readWebAction, type WebAction } from "./web-actions";

type CartAdapter = { organizationId: string; run: (action: WebAction) => void };
let cartAdapter: CartAdapter | null = null;

/** Explicit page capability; never click purchase/payment controls or submit forms. */
export function useCommerceAgentCart(input: {
  organizationId: string; products: PublicStorefrontProduct[]; cart: PublicStorefrontCartLine[];
  setCart: Dispatch<SetStateAction<PublicStorefrontCartLine[]>>;
  setCartOpen: Dispatch<SetStateAction<boolean>>; ready: boolean;
}) {
  const { organizationId, products, cart, setCart, setCartOpen, ready } = input;
  useEffect(() => {
    const adapter: CartAdapter = { organizationId, run(action) {
      if (!ready) throw new Error("O carrinho ainda está carregando. Tente novamente.");
      if (action.kind === "add_to_cart_after_confirmation") {
        const product = products.find(item => item.id === action.productId);
        const next = addConfirmedCartItem(cart, product, action);
        // Persist before acknowledging. Storage failure must not report an addition.
        window.localStorage.setItem(`connecty-store-cart:${organizationId}`, JSON.stringify(next.map(line => ({
          productId: line.product.id, quantity: line.quantity, foodUnits: line.foodUnits,
        }))));
        setCart(next);
      } else if (action.kind !== "open_cart" && action.kind !== "open_checkout") throw new Error("Ação de carrinho inválida.");
      setCartOpen(true);
    } };
    cartAdapter = adapter;
    return () => { if (cartAdapter === adapter) cartAdapter = null; };
  }, [organizationId, products, cart, setCart, setCartOpen, ready]);
}

export function addConfirmedCartItem(cart: PublicStorefrontCartLine[], product: PublicStorefrontProduct | undefined, value: unknown) {
  const action = readWebAction(value);
  if (!action || action.kind !== "add_to_cart_after_confirmation" || !product || product.id !== action.productId
    || !product.canCheckout || product.foodComposition?.enabled) throw new Error("Configure este item pela página do produto.");
  const existing = cart.find(line => line.product.id === product.id);
  const quantity = (existing?.quantity ?? 0) + action.quantity!;
  if (quantity > 20) throw new Error("O carrinho permite até 20 unidades deste item.");
  return existing ? cart.map(line => line.product.id === product.id ? { ...line, quantity } : line)
    : [...cart, { product, quantity }];
}

export function executeWebAction(value: unknown, input: { organizationId: string; navigate: (path: string) => void; query: URLSearchParams }) {
  const action = readWebAction(value);
  const root = document.querySelector<HTMLElement>("[data-commerce-organization]");
  if (!action || !root || root.dataset.commerceOrganization !== input.organizationId
    || document.querySelector('[data-commerce-unavailable="true"]')
    || document.activeElement?.closest('[data-sensitive="payment"]')) throw new Error("Ação indisponível nesta página.");
  if (["open_cart", "open_checkout", "add_to_cart_after_confirmation"].includes(action.kind)) {
    if (!cartAdapter || cartAdapter.organizationId !== input.organizationId) throw new Error("Abra o carrinho pela loja para continuar.");
    cartAdapter.run(action);
    return;
  }
  if (["open_product", "highlight_product", "suggest_cart_item"].includes(action.kind)) {
    const target = root.dataset.commerceProduct === action.productId ? root
      : root.querySelector<HTMLElement>(`[data-commerce-product="${action.productId}"]`);
    if (target && root.contains(target)) { highlight(target); return; }
    if (action.kind === "highlight_product") throw new Error("O item não está visível nesta página. Peça para abrir o produto.");
    // Construct internal paths only. Tracking fields come from the current session, never the command.
    const query = input.query.toString();
    input.navigate(`/produto/${action.productId}${query ? `?${query}` : ""}`);
    return;
  }
  if (action.kind === "scroll_to_section") {
    const target = document.getElementById(action.section!);
    if (!target || !root.contains(target)) throw new Error("Essa seção não está disponível nesta página.");
    highlight(target);
    return;
  }
  throw new Error("Confirme o item antes de adicionar ao carrinho.");
}

function highlight(target: HTMLElement) {
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.animate([{ outline: "4px solid #059669", outlineOffset: "4px" }, { outline: "4px solid transparent", outlineOffset: "8px" }], { duration: 2800 });
}
