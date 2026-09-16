import { describe, expect, it } from "vitest";
import { addConfirmedCartItem } from "../src/lib/commerce-agent/web-actions-client";
import { canRunWebActions, hasCartConfirmation, matchesWebActionPermit, planWebAction, readWebAction, type WebAction, type WebActionMode } from "../src/lib/commerce-agent/web-actions";
import type { PublicStorefrontProduct } from "../src/components/checkout/public-storefront";

const id = "11111111-1111-4111-a111-111111111111";
const productId = "22222222-2222-4222-a222-222222222222";
const product = { id: productId, title: "Café Especial", canAdd: true };
const confirmation: WebAction = { id, kind: "request_add_to_cart_confirmation", productId, productTitle: product.title, quantity: 2, reason: "Pedido do lead." };
const consent = { accepted: true, actionId: id, productId, quantity: 2 };
const plan = (message: string, products = [product]) => planWebAction({ message, products, mode: "assistant", surface: "store", currentProductId: productId });

describe("safe web action contract and intent", () => {
  it("rejects unknown modes and any change to the command that the lead confirmed", () => {
    expect(canRunWebActions("unexpected" as WebActionMode, "store")).toBe(false);
    const permit: WebAction = { ...confirmation, kind: "add_to_cart_after_confirmation" };
    expect(matchesWebActionPermit(confirmation, permit, true)).toBe(true);
    expect(matchesWebActionPermit(confirmation, permit, false)).toBe(false);
    for (const patch of [{ productId: id }, { quantity: 3 }, { id: productId }, { kind: "open_product" as const }, { productTitle: "Outro item" }]) {
      expect(matchesWebActionPermit(confirmation, { ...permit, ...patch }, true)).toBe(false);
    }
  });
  it.each(["Não encontro Café Especial", "Onde fica o Café Especial?", "Mostre Café Especial", "Quero ver Café Especial", "Não consigo achar Café Especial", "Não estou encontrando Café Especial", "Cadê Café Especial?"])("locates an item: %s", message => {
    expect(plan(message)).toMatchObject({ kind: "highlight_product", productId });
  });
  it("opens a different item and ignores description-only matches", () => {
    expect(planWebAction({ message: "não encontro Café Especial", products: [product], mode: "active_seller", surface: "store", currentProductId: null })).toMatchObject({ kind: "open_product" });
    expect(plan("não encontro leite")).toBeNull();
  });
  it("requests exact quantity confirmation and never infers consent from a request", () => {
    expect(plan("Adicione duas unidades de Café Especial ao carrinho")).toMatchObject({ kind: "request_add_to_cart_confirmation", quantity: 2 });
    expect(plan("Adicione 99 Café Especial ao carrinho")).toBeNull();
    expect(plan("sim")).toBeNull();
  });
  it.each(["Não quero adicionar Café Especial ao carrinho", "Não adicione Café Especial ao carrinho", "Talvez adicionar Café Especial ao carrinho", "Quanto custa Café Especial?", "Se eu adicionar Café Especial ao carrinho?", "Não mostre Café Especial", "Não encontro Café Especial, mas não precisa abrir", "Cancelar e abrir o carrinho"])("does not act on refusal/qualification: %s", message => expect(plan(message)).toBeNull());
  it("does not choose between ambiguous titles or add non-sale items", () => {
    expect(plan("mostre Café Especial", [product, { ...product, id }])).toBeNull();
    expect(plan("adicione Café Especial ao carrinho", [{ ...product, canAdd: false }])?.kind).toBe("highlight_product");
    expect(plan("mostre Café Especial e Bolo", [product, { id, title: "Bolo", canAdd: true }])).toBeNull();
    expect(plan("adicione quatro unidades de Café Especial ao carrinho")?.quantity).toBe(4);
  });
  it.each(["observer", "assistant", "active_seller"] as const)("preserves mode %s", mode => {
    expect(canRunWebActions(mode, "store")).toBe(mode !== "observer");
    expect(planWebAction({ message: "abra Café Especial", mode, surface: "product", products: [product], currentProductId: null }) !== null).toBe(mode !== "observer");
    expect(canRunWebActions(mode, "checkout")).toBe(false);
    expect(canRunWebActions(mode, "unknown")).toBe(false);
  });
  it("opens review only and restricts sections", () => {
    expect(plan("abrir checkout")).toMatchObject({ kind: "open_checkout" });
    expect(plan("mostre categorias")).toMatchObject({ section: "categorias" });
    expect(readWebAction({ id, kind: "scroll_to_section", section: "payment", reason: "test" })).toBeNull();
  });
  it.each([{ kind: "execute_js" }, { url: "https://evil.test" }, { selector: "button[type=submit]" }, { script: "alert(1)" }, { quantity: 0 }, { quantity: 1.5 }, { productId: "../other" }])("rejects unsafe or malformed fields: %j", patch => {
    expect(readWebAction({ ...confirmation, ...patch })).toBeNull();
  });
  it("requires affirmative structured consent bound to the exact proposal", () => {
    expect(hasCartConfirmation(confirmation, consent)).toBe(true);
    for (const value of [true, "sim", { ...consent, accepted: false }, { ...consent, actionId: productId }, { ...consent, productId: id }, { ...consent, quantity: 1 }]) expect(hasCartConfirmation(confirmation, value)).toBe(false);
  });
  it("cannot mutate a cart with a proposal and preserves existing lines on a valid addition", () => {
    const p = { id: productId, canCheckout: true } as PublicStorefrontProduct;
    expect(() => addConfirmedCartItem([], p, confirmation)).toThrow();
    const command = { ...confirmation, kind: "add_to_cart_after_confirmation" };
    expect(addConfirmedCartItem([{ product: p, quantity: 3 }], p, command)[0].quantity).toBe(5);
    expect(() => addConfirmedCartItem([{ product: p, quantity: 20 }], p, command)).toThrow();
    expect(() => addConfirmedCartItem([], { ...p, canCheckout: false }, command)).toThrow();
    expect(() => addConfirmedCartItem([], { ...p, foodComposition: { enabled: true } } as PublicStorefrontProduct, command)).toThrow();
  });
});
