import { afterEach, describe, expect, it, vi } from "vitest";
import { executeWebAction } from "../src/lib/commerce-agent/web-actions-client";
import type { WebAction } from "../src/lib/commerce-agent/web-actions";

const organizationId = "11111111-1111-4111-a111-111111111111";
const productId = "22222222-2222-4222-a222-222222222222";
const action: WebAction = { id: "33333333-3333-4333-a333-333333333333", kind: "open_product", productId, productTitle: "Café", reason: "Lead pediu." };
function page() {
  const target = { scrollIntoView: vi.fn(), animate: vi.fn() };
  const root = { dataset: { commerceOrganization: organizationId, commerceProduct: "" }, contains: vi.fn(() => true), querySelector: vi.fn((): unknown => target) };
  const document = { querySelector: vi.fn((selector: string): unknown => selector === "[data-commerce-organization]" ? root : null), getElementById: vi.fn(() => target), activeElement: { closest: vi.fn((): unknown => null) } };
  vi.stubGlobal("document", document);
  const input = { organizationId, query: new URLSearchParams({ lead_id: "lead", agent_id: "agent" }), navigate: vi.fn() };
  return { target, root, document, input };
}
afterEach(() => vi.unstubAllGlobals());
describe("owned-page executor", () => {
  it("highlights a known product and scrolls only known sections", () => {
    const f = page(); executeWebAction(action, f.input);
    expect(f.target.scrollIntoView).toHaveBeenCalled();
    expect(f.target.animate).toHaveBeenCalled();
    expect(f.input.navigate).not.toHaveBeenCalled();
    executeWebAction({ id: action.id, kind: "scroll_to_section", section: "produtos", reason: "Pedido" }, f.input);
    expect(f.document.getElementById).toHaveBeenCalledWith("produtos");
  });
  it("constructs only an internal product path preserving the supplied session query", () => {
    const f = page(); f.root.querySelector.mockReturnValue(null);
    executeWebAction(action, f.input);
    expect(f.input.navigate).toHaveBeenCalledWith(`/produto/${productId}?lead_id=lead&agent_id=agent`);
    expect(() => executeWebAction({ ...action, url: "javascript:alert(1)" }, f.input)).toThrow();
  });
  it("does not act across organizations, outside the page root or during payment focus", () => {
    const f = page();
    expect(() => executeWebAction(action, { ...f.input, organizationId: "other" })).toThrow();
    f.document.activeElement.closest.mockReturnValue({});
    expect(() => executeWebAction(action, f.input)).toThrow();
    expect(f.target.animate).not.toHaveBeenCalled();
    f.document.activeElement.closest.mockReturnValue(null);
    f.root.contains.mockReturnValue(false);
    expect(() => executeWebAction({ ...action, kind: "highlight_product" }, f.input)).toThrow();
  });
  it("never executes a confirmation request or opens checkout through form submission", () => {
    const f = page();
    expect(() => executeWebAction({ ...action, kind: "request_add_to_cart_confirmation", quantity: 1 }, f.input)).toThrow("Confirme");
    expect(() => executeWebAction({ id: action.id, kind: "open_checkout", reason: "Lead pediu" }, f.input)).toThrow("carrinho");
    expect(f.input.navigate).not.toHaveBeenCalled();
  });
});
