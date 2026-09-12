import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ retire: vi.fn() }));
vi.mock("@/lib/sales-catalog/transparent-checkout", () => ({ retireCheckoutPaymentsBeforeCartChange: mocks.retire }));
import { applySalesCatalogOrderRevision, SalesCatalogOrderRevisionError, type SalesCatalogOrderRevisionInput } from "@/lib/sales-catalog/order-revision";

beforeEach(() => { mocks.retire.mockReset(); mocks.retire.mockResolvedValue(undefined); });
function fixture() {
  const saved = { id: "order", checkout_revision: 4, total: "90" };
  const calls: string[] = [];
  const rpc = vi.fn(async (name: string) => {
    calls.push(name);
    return { data: name === "begin_sales_catalog_order_revision" ? { claimed: true, needs_retirement: true } : name === "finish_sales_catalog_order_revision" ? saved : null, error: null };
  });
  mocks.retire.mockImplementation(async () => { calls.push("retire"); });
  const input: SalesCatalogOrderRevisionInput = {
    client: { rpc } as unknown as SupabaseClient, organizationId: "org", leadId: "lead", conversationId: "conversation", orderId: "order", expectedRevision: 1, requestId: "confirmed-proposal",
    rows: [{ catalog_item_id: "pizza", quantity: 2, title: "Pizza", unit_price: "40", total: "80" }, { catalog_item_id: "lemonade", quantity: 1, title: "Limonada", unit_price: "5", total: "5" }],
    shipping: { total: 5, method: "Entrega local", destinationCep: "01001000", destinationAddress: "Rua das Pizzas, 20, Cidade Exemplo" }, expectedTotal: 90, preferredPaymentMethod: "card",
  };
  return { input, rpc, saved, calls };
}
describe("confirmed revision payment orchestration", () => {
  it("claims the exact scoped proposal before retiring payments, then commits once", async () => {
    const f = fixture();
    expect(await applySalesCatalogOrderRevision(f.input)).toEqual(f.saved);
    expect(f.calls).toEqual(["begin_sales_catalog_order_revision", "retire", "finish_sales_catalog_order_revision"]);
    expect(f.rpc).toHaveBeenNthCalledWith(1, "begin_sales_catalog_order_revision", expect.objectContaining({ p_order_id: "order", p_organization_id: "org", p_lead_id: "lead", p_conversation_id: "conversation", p_revision: 1, p_request_id: "confirmed-proposal", p_payload: expect.objectContaining({ expected_total: 90, rows: f.input.rows }) }));
    const claim = f.rpc.mock.calls[0] as unknown as [string, { p_claim_token: string }];
    expect(f.rpc).toHaveBeenNthCalledWith(2, "finish_sales_catalog_order_revision", expect.objectContaining({ p_claim_token: claim[1].p_claim_token }));
  });
  it("returns a completed replay without cancelling a newer payment or writing again", async () => {
    const f = fixture();
    f.rpc.mockResolvedValueOnce({ data: { replay: true, order: f.saved } as never, error: null });
    expect(await applySalesCatalogOrderRevision(f.input)).toEqual(f.saved);
    expect(f.rpc).toHaveBeenCalledOnce(); expect(mocks.retire).not.toHaveBeenCalled();
  });
  it("does not open the gateway for a checkout with no payable session", async () => {
    const f = fixture();
    f.rpc.mockResolvedValueOnce({ data: { claimed: true, needs_retirement: false }, error: null });
    await applySalesCatalogOrderRevision(f.input);
    expect(mocks.retire).not.toHaveBeenCalled();
  });
  it("accepts a formatted zero delivery price for pickup or free shipping", async () => {
    const f = fixture(); f.input.shipping.total = "R$ 0,00"; f.input.expectedTotal = 85;
    f.rpc.mockResolvedValueOnce({ data: { claimed: true, needs_retirement: false }, error: null });
    await applySalesCatalogOrderRevision(f.input);
    expect(f.rpc).toHaveBeenNthCalledWith(1, "begin_sales_catalog_order_revision", expect.objectContaining({ p_payload: expect.objectContaining({ shipping: expect.objectContaining({ total: 0 }) }) }));
  });
  it.each(["CHECKOUT_CHANGED", "CHECKOUT_PAYMENT_BUSY", "CHECKOUT_FINANCIAL_REVIEW", "CHECKOUT_CLOSED", "CHECKOUT_NOT_FOUND", "CHECKOUT_REVISION_CONFLICT"])("stops before retirement for %s", async code => {
    const f = fixture();
    f.rpc.mockResolvedValueOnce({ data: null as never, error: { message: code } as never });
    await expect(applySalesCatalogOrderRevision(f.input)).rejects.toMatchObject({ code });
    expect(mocks.retire).not.toHaveBeenCalled(); expect(f.rpc).toHaveBeenCalledOnce();
  });
  it("keeps an uncertain retirement blocked and never claims the cart was changed", async () => {
    const f = fixture(); mocks.retire.mockRejectedValue(new Error("gateway timeout with private provider detail"));
    const error = await applySalesCatalogOrderRevision(f.input).catch(error => error);
    expect(error).toBeInstanceOf(SalesCatalogOrderRevisionError);
    expect(error).toMatchObject({ code: "CHECKOUT_REVISION_BLOCKED" });
    expect(error.message).not.toContain("private");
    expect(f.calls).not.toContain("finish_sales_catalog_order_revision");
    expect(f.rpc).toHaveBeenLastCalledWith("fail_sales_catalog_order_revision", expect.objectContaining({ p_uncertain: true }));
  });
  it("does not unlock uncertainty after an ambiguous finish response", async () => {
    const f = fixture();
    f.rpc.mockResolvedValueOnce({ data: { claimed: true, needs_retirement: true }, error: null });
    f.rpc.mockResolvedValueOnce({ data: null as never, error: { message: "network timeout" } as never });
    await expect(applySalesCatalogOrderRevision(f.input)).rejects.toMatchObject({ code: "CHECKOUT_REVISION_BLOCKED" });
    expect(f.rpc).toHaveBeenLastCalledWith("fail_sales_catalog_order_revision", expect.objectContaining({ p_uncertain: true }));
  });
  it("releases a failed claim when no gateway retirement was attempted", async () => {
    const f = fixture();
    f.rpc.mockResolvedValueOnce({ data: { claimed: true, needs_retirement: false }, error: null });
    f.rpc.mockResolvedValueOnce({ data: null as never, error: { message: "CHECKOUT_CHANGED" } as never });
    await expect(applySalesCatalogOrderRevision(f.input)).rejects.toMatchObject({ code: "CHECKOUT_CHANGED" });
    expect(f.rpc).toHaveBeenLastCalledWith("fail_sales_catalog_order_revision", expect.objectContaining({ p_uncertain: false }));
  });
  it.each([0, -1, 1.5, 100001])("rejects invalid quantity %s before claiming or retiring", async quantity => {
    const f = fixture(); f.input.rows[0].quantity = quantity;
    await expect(applySalesCatalogOrderRevision(f.input)).rejects.toMatchObject({ code: "CHECKOUT_INVALID_CART" });
    expect(f.rpc).not.toHaveBeenCalled(); expect(mocks.retire).not.toHaveBeenCalled();
  });
});
