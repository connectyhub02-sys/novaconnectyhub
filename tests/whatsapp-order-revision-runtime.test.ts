import { describe, expect, it } from "vitest";
import { address, scenario, type Outbound, type Row } from "./helpers/order-revision-scenario";

describe("revising a persisted WhatsApp order", () => {
  it("keeps the audited compliment and doubt outside cart changes", async () => {
    const s=scenario();
    for(const text of ["Top parabens pelo atendimento", "me tira uma duvida antes de eu pagar"]){
      expect(await s.turn(text)).toBeNull();
    }
    expect(s.persistence).not.toHaveBeenCalled();expect(s.createPayment).not.toHaveBeenCalled();expect(s.draft()).toBeFalsy();
  });
  it("resolves an explicit add after the unique recommendation without accepting the new total", async () => {
    const s=scenario();s.assistant("Limonada, R$ 10,00. Posso incluir no seu pedido?");
    const result=await s.turn("sim inclua vou levar ele tambem");
    expect(result?.text).toContain("Limonada");
    expect(s.draft()?.items).toContainEqual(expect.objectContaining({id:"lemonade",quantity:1}));
    expect(s.persistence).not.toHaveBeenCalled();expect(s.createPayment).not.toHaveBeenCalled();
  });
  it("dismisses the denied old edit and records only the repeated Pix preference", async () => {
    const s=scenario();await s.turn("troca isso");
    await s.turn("não tem alteração nos produtos");
    expect(s.draft()).toBeNull();
    expect(await s.turn("Troca por pix, troca pra mim")).toBeNull();
    expect(s.ctx.lead.metadata.checkout_payment_preferences).toMatchObject({conversation:{preferred_payment_method:"pix",order_id:"order"}});
    expect(s.persistence).not.toHaveBeenCalled();expect(s.createPayment).not.toHaveBeenCalled();
  });
  it("interprets an unanswered inbound burst before accepting its final sim", async () => {
    const s = scenario();
    s.customer("adicione uma limonada");
    const preview = await s.turn("sim");
    expect(preview?.text).toContain("Limonada");
    expect(s.draft()?.items.map(item => [item.id, item.quantity])).toEqual([["pizza", 1], ["lemonade", 1]]);
    expect(s.persistence).not.toHaveBeenCalled();
    await s.turn("sim");
    expect(s.persistence).toHaveBeenCalledOnce();
  });
  it("adds the requested item, preserves delivery/payment, and updates the same order only after its preview is accepted", async () => {
    const s = scenario();
    const preview = await s.turn("top faz o seguinte adicione uma limonada");
    expect(preview?.text).toContain("Pizza de queijo");
    expect(preview?.text).toContain("Limonada");
    expect(preview?.text).toContain("80,00");
    expect(preview?.text).toContain("Rua das Flores");
    expect(s.draft()?.items.map(item => [item.id, item.quantity])).toEqual([["pizza", 1], ["lemonade", 1]]);
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
    await s.turn("sim");
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.persistence.mock.calls[0][0]).toMatchObject({ orderId: "order", expectedRevision: 0, expectedTotal: 80, preferredPaymentMethod: "card",
      shipping: { total: 10, destinationAddress: address, destinationCep: "88330786" } });
    expect(s.createPayment).toHaveBeenCalledOnce();
    expect(s.createPayment.mock.calls[0][0]).toMatchObject({ orderId: "order", amount: "80,00", preferredMethod: "card" });
    expect(s.db.tables.sales_catalog_orders).toHaveLength(1);
    expect(s.requests.at(-1)?.url).toContain("/send/menu");
    expect(s.requests.at(-1)?.body.choices).toEqual([expect.stringContaining("revised-session")]);
  });

  it.each([
    ["tire uma pizza de queijo", [["pizza", 2], ["lemonade", 1]], [["pizza", 1], ["lemonade", 1]], 80],
    ["retire a limonada", [["pizza", 1], ["lemonade", 2]], [["pizza", 1]], 70],
    ["aumente a pizza de queijo para 3", [["pizza", 1], ["lemonade", 1]], [["pizza", 3], ["lemonade", 1]], 190],
    ["reduza a pizza de queijo para 1", [["pizza", 3], ["lemonade", 1]], [["pizza", 1], ["lemonade", 1]], 80],
    ["troque a pizza de queijo pela pizza de tomate", [["pizza", 2], ["lemonade", 1]], [["lemonade", 1], ["tomato", 2]], 150],
  ] as [string, [string, number][], [string, number][], number][])("applies %s to the persisted lines and recalculates freight", async (text, quantities, expected, total) => {
    const s = scenario({ quantities });
    await s.turn(text);
    expect(s.draft()?.items.map(item => [item.id, item.quantity])).toEqual(expected);
    await s.turn("sim");
    expect(s.persistence).toHaveBeenCalledOnce();
    const applied = s.persistence.mock.calls[0][0];
    expect(applied.rows.map(item => [item.catalog_item_id, item.quantity])).toEqual(expected);
    expect(applied.expectedTotal).toBe(total);
    expect(applied.shipping.total).toBe(total >= 100 ? 0 : 10);
  });

  it("does not increment the cart or create a charge again on a retry or repeated confirmation", async () => {
    const s = scenario();
    await s.turn("adicione uma limonada");
    const requestId = s.draft()?.request_id;
    await s.turn("adicione uma limonada", true);
    expect(s.draft()?.request_id).toBe(requestId);
    expect(s.draft()?.items).toContainEqual(expect.objectContaining({ id: "lemonade", quantity: 1 }));
    await s.turn("sim");
    await s.turn("sim");
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.createPayment).toHaveBeenCalledOnce();
  });

  it("treats 'sim mas tira' as a further edit, never acceptance of the obsolete preview", async () => {
    const s = scenario();
    await s.turn("adicione uma limonada");
    await s.turn("sim mas tira a limonada");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.draft()).toBeNull();
    await s.turn("sim");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.db.tables.sales_catalog_order_items).toHaveLength(1);
  });

  it("requires a fresh preview after an unrelated assistant question", async () => {
    const s = scenario();
    await s.turn("adicione uma limonada");
    s.assistant("Você prefere conversar por aqui?");
    await s.turn("sim");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
    await s.turn("sim");
    expect(s.persistence).toHaveBeenCalledOnce();
  });

  it("asks for clarification instead of guessing a product shared by multiple variants", async () => {
    const s = scenario();
    const result = await s.turn("adicione uma pizza");
    expect(result?.text).toMatch(/nome completo|única opção/);
    expect(s.draft()?.ready).toBe(false);
    expect(s.persistence).not.toHaveBeenCalled();
    await s.turn("Pizza de tomate");
    expect(s.draft()?.items).toContainEqual(expect.objectContaining({ id: "tomato", quantity: 1 }));
    expect(s.persistence).not.toHaveBeenCalled();
  });

  it.each(["confirmed", "refunded"])("keeps a %s payment immutable", async paymentStatus => {
    const s = scenario({ paymentStatus });
    const result = await s.turn("adicione uma limonada");
    expect(result).not.toBeNull();
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
    expect(s.db.tables.sales_catalog_order_items).toHaveLength(1);
  });

  it("blocks a payment lock even when the order still appears pending", async () => {
    const s = scenario();
    s.ctx.salesCatalogOrders[0].checkoutPaymentLock = "processing";
    await s.turn("retire a pizza de queijo");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.draft()).toBeFalsy();
  });

  it("keeps the revision but gives a concrete next step when freight cannot be quoted", async () => {
    const s = scenario({ freightAvailable: false });
    const result = await s.turn("adicione uma limonada");
    expect(result?.text).toMatch(/tarifa|entrega/);
    expect(result?.text).not.toMatch(/confirma essa|posso fechar/i);
    expect(s.draft()?.ready).toBe(false);
    await s.turn("sim");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
  });

  it("recalculates and asks again when a catalog price changes after the displayed preview", async () => {
    const s = scenario();
    await s.turn("adicione uma limonada");
    s.ctx.salesCatalog[1].price = "15,00";
    const result = await s.turn("sim");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(result?.text).toContain("85,00");
    await s.turn("sim");
    expect(s.persistence.mock.calls[0][0].expectedTotal).toBe(85);
  });

  it("does not send a payment checkout when persistence rejects a concurrent or financial change", async () => {
    const s = scenario();
    s.persistence.mockRejectedValueOnce(new Error("CHECKOUT_REVISION_CONFLICT"));
    await s.turn("adicione uma limonada");
    const result = await s.turn("sim");
    expect(result?.text).toMatch(/não consegui|confer/i);
    expect(s.createPayment).not.toHaveBeenCalled();
    expect(s.requests.every(request => request.url.endsWith("/send/text"))).toBe(true);
    expect(s.db.tables.sales_catalog_order_items).toHaveLength(1);
  });

  it("requires a new preview for changed line prices even if their changes cancel out in the total", async () => {
    const s = scenario();
    await s.turn("adicione uma limonada");
    s.ctx.salesCatalog[0].price = "55,00";
    s.ctx.salesCatalog[1].price = "15,00";
    const result = await s.turn("sim");
    expect(result?.text).toContain("80,00");
    expect(s.persistence).not.toHaveBeenCalled();
    await s.turn("sim");
    expect(s.persistence.mock.calls[0][0].rows.map(row => row.unit_price)).toEqual(["55,00", "15,00"]);
  });

  it("asks for the new address and CEP instead of reusing the old address as the requested change", async () => {
    const s = scenario();
    const result = await s.turn("mude o endereço");
    expect(result?.text).toMatch(/novo endereço|endereço completo/);
    expect(s.draft()?.ready).toBe(false);
    expect(s.draft()?.address).toBe(address);
    expect(s.draft()?.cep).toBe("88330786");
    expect(s.draft()?.delivery_update).toEqual({ address: null, cep: null });
    await s.turn("sim");
    expect(s.persistence).not.toHaveBeenCalled();
    await s.turn("Rua das Rosas, numero 70, Centro, Balneario Camboriu, SC, CEP 88330786");
    expect(s.draft()?.ready).toBe(true);
    await s.turn("sim");
    expect(s.persistence.mock.calls[0][0].shipping.destinationAddress).toContain("Rua das Rosas");
  });

  it("repairs an old false revision without erasing the second item previously proposed", async () => {
    const s = scenario();
    s.legacyCart();
    s.corruptedRevision();
    const reply = await s.turn("pode fechar o pedido");
    expect(reply?.text).toContain("Limonada");
    expect(reply?.text).toContain(address);
    expect(reply?.text).toContain("80,00");
    expect(reply?.text).toContain("ainda não foram gravados");
    expect(s.draft()?.items.map(item => [item.id, item.quantity])).toEqual([["pizza", 1], ["lemonade", 1]]);
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.db.tables.sales_catalog_order_items).toHaveLength(1);
    await s.turn("sim");
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.persistence.mock.calls[0][0].rows).toHaveLength(2);
    expect(s.persistence.mock.calls[0][0].shipping.destinationAddress).toBe(address);
  });

  it("cancels an unresolved address change when the customer explicitly asks to keep the order", async () => {
    const s = scenario();
    await s.turn("mude o endereço");
    const reply = await s.turn("quero alterar nada não so estou agradecendo pelo frete gratis");
    expect(reply?.text).toContain("Não fiz nenhuma alteração");
    expect(s.draft()).toBeNull();
    expect(s.db.tables.sales_catalog_orders[0].destination_address).toBe(address);
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
  });

  it("does not accept a pending item proposal from a generic no-change declaration", async () => {
    const s = scenario();
    await s.turn("adicione uma limonada");
    const reply = await s.turn("não quero alterar nada só pode fechar");
    expect(reply?.text).toContain("Limonada");
    expect(reply?.text).toContain("Confirma essa alteração?");
    expect(s.persistence).not.toHaveBeenCalled();
    await s.turn("sim");
    expect(s.persistence).toHaveBeenCalledOnce();
  });

  it.each(["top pode fechar obrigado por tirar o frete pode fechar", "quero alterar nada não so estou agradecendo pelo frete gratis"])("does not create a product or address revision from courtesy: %s", async text => {
    const s = scenario();
    const reply = await s.turn(text);
    expect(reply).toBeNull();
    expect(s.draft()).toBeFalsy();
    expect(s.persistence).not.toHaveBeenCalled();
  });

  it("accumulates a replacement destination without overwriting the old one with only a CEP", async () => {
    const s = scenario();
    await s.turn("mude o endereço");
    await s.turn("88330800");
    expect(s.draft()?.address).toBe(address);
    expect(s.draft()?.cep).toBe("88330786");
    expect(s.draft()?.delivery_update).toEqual({ address: null, cep: "88330800" });
    expect(s.draft()?.ready).toBe(false);
    await s.turn("Rua das Rosas, numero 70, Centro, Balneario Camboriu, SC");
    expect(s.draft()?.address).toContain("Rua das Rosas");
    expect(s.draft()?.cep).toBe("88330800");
    expect(s.draft()?.delivery_update).toBeNull();
    expect(s.persistence).not.toHaveBeenCalled();
  });

  it("reconciles a scoped legacy cart as a new proposal, never as old consent", async () => {
    const s = scenario();
    s.legacyCart();
    const reply = await s.turn("sim");
    expect(reply?.text).toContain("Limonada");
    expect(reply?.text).toContain("Confirma essa alteração?");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
    await s.turn("sim");
    expect(s.persistence).toHaveBeenCalledOnce();
  });

  it.each(["no_preview", "conversation", "instance", "organization", "old", "unknown_product", "invalid_quantity"])("does not recover an unverified legacy cart: %s", invalid => {
    const s = scenario();
    s.legacyCart(invalid !== "no_preview");
    const draft = structuredClone(s.ctx.lead.metadata.checkout_cart_draft) as Row;
    if (["conversation", "instance", "organization"].includes(invalid)) draft[`${invalid}_id`] = "another";
    if (invalid === "old") draft.updated_at = s.db.tables.sales_catalog_orders[0].created_at;
    if (invalid === "unknown_product") draft.items = [{ id: "unknown", quantity: 1 }];
    if (invalid === "invalid_quantity") draft.items = [{ id: "pizza", quantity: "1" }, { id: "lemonade", quantity: "1" }];
    s.metadata({ checkout_cart_draft: draft });
    return s.turn("sim").then(reply => {
      expect(reply).toBeNull();
      expect(s.draft()).toBeFalsy();
      expect(s.persistence).not.toHaveBeenCalled();
    });
  });

  it("does not reintroduce a legacy item after the customer explicitly removed it from the revision", async () => {
    const s = scenario();
    s.legacyCart();
    await s.turn("sim");
    await s.turn("retire a limonada");
    expect(s.draft()).toBeNull();
    await s.turn("sim");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.db.tables.sales_catalog_order_items.map(item => item.catalog_item_id)).toEqual(["pizza"]);
  });

  it("does not revive a legacy proposal for an isolated sim answering a different conversation prompt", async () => {
    const s = scenario();
    s.legacyCart();
    s.customer("oi");
    s.assistant("Olá! Quer conversar por aqui?");
    expect(await s.turn("sim")).toBeNull();
    expect(s.draft()).toBeFalsy();
    expect(s.persistence).not.toHaveBeenCalled();
  });

  it("does not attach an earlier legacy cart to a new purchase journey", async () => {
    const s = scenario();
    s.legacyCart();
    s.customer("quero fazer um novo pedido");
    s.metadata({ checkout_journey: { organization_id: "store", conversation_id: "conversation", instance_id: "instance", started_at: s.ctx.messages.at(-1)!.occurred_at } });
    s.assistant("Qual pizza você quer para o novo pedido?");
    expect(await s.turn("pode fechar o pedido")).toBeNull();
    expect(s.draft()).toBeFalsy();
    expect(s.persistence).not.toHaveBeenCalled();
  });

  it("preserves a pending product choice through unrelated gratitude", async () => {
    const s = scenario();
    await s.turn("adicione uma pizza");
    expect(s.draft()?.pending_intent?.productText).toBe("pizza");
    const reply = await s.turn("obrigado");
    expect(reply).toBeNull();
    expect(s.draft()?.pending_intent?.productText).toBe("pizza");
    expect(s.draft()?.address).toBe(address);
    expect(s.persistence).not.toHaveBeenCalled();
  });

  it.each(["obrigado por não tirar a pizza de queijo", "obrigado por não tirar a pizza de queijo do pedido", "obrigado pelo frete da pizza de queijo", "qual é a pizza de queijo?"])("does not complete a pending removal from gratitude or a question: %s", async text => {
    const s = scenario();
    await s.turn("remova o item da promoção");
    expect(s.draft()?.pending_intent?.kind).toBe("remove");
    const reply = await s.turn(text);
    expect(reply).toBeNull();
    expect(s.draft()?.items).toEqual([expect.objectContaining({ id: "pizza", quantity: 1 })]);
    expect(s.draft()?.pending_intent?.kind).toBe("remove");
    expect(s.persistence).not.toHaveBeenCalled();
  });

  it("replaces the preview instead of accepting its old destination when sim includes a new address", async () => {
    const s = scenario();
    await s.turn("adicione uma limonada");
    const reply = await s.turn("sim, Rua dos Ipês, numero 30, Centro, Florianópolis, SC, CEP 88010000");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
    expect(reply?.text).toContain("Rua dos Ipês");
    expect(reply?.text).toContain("Confirma essa alteração?");
    expect(s.draft()?.cep).toBe("88010000");
    await s.turn("sim");
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.persistence.mock.calls[0][0].shipping.destinationCep).toBe("88010000");
  });

  it("can confirm the displayed proposal when the customer repeats the same saved destination", async () => {
    const s = scenario();
    await s.turn("adicione uma limonada");
    await s.turn(`sim, ${address}`);
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.persistence.mock.calls[0][0].shipping.destinationAddress).toBe(address);
  });

  it("requires the rest of the new destination when sim supplies only a different CEP", async () => {
    const s = scenario();
    await s.turn("adicione uma limonada");
    await s.turn("sim, CEP 88010000");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.draft()?.ready).toBe(false);
    expect(s.draft()?.address).toBe(address);
    expect(s.draft()?.delivery_update?.cep).toBe("88010000");
    expect(s.createPayment).not.toHaveBeenCalled();
  });

  it("updates payment preference within the revision without losing the newly added item", async () => {
    const s = scenario();
    await s.turn("adicione uma limonada");
    const result = await s.turn("muda o pagamento para Pix");
    expect(result?.text).toContain("Limonada");
    expect(result?.text).toContain("Pix");
    expect(s.persistence).not.toHaveBeenCalled();
    await s.turn("sim");
    expect(s.persistence.mock.calls[0][0]).toMatchObject({ preferredPaymentMethod: "pix", expectedTotal: 80 });
    expect(s.createPayment.mock.calls[0][0].preferredMethod).toBe("pix");
  });

  it("does not turn removal of the final item into a zero-value checkout", async () => {
    const s = scenario();
    const result = await s.turn("retire a pizza de queijo");
    expect(result?.text).toMatch(/sem itens/);
    expect(s.draft()?.ready).toBe(false);
    await s.turn("sim");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
  });

  it.each(["leadId", "companyId", "conversationId"] as const)("does not adopt an order from another %s", async field => {
    const s = scenario();
    s.ctx.salesCatalogOrders[0][field] = "other";
    await s.turn("adicione uma limonada");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
    expect(s.draft()).toBeFalsy();
  });

  it("retains the applied revision after uncertain button delivery and retries without another revision or charge", async () => {
    const s = scenario();
    await s.turn("adicione uma limonada");
    s.transport.menuStatus = 408;
    await expect(s.turn("sim")).rejects.toThrow();
    expect(s.draft()).toMatchObject({ applied: true });
    s.transport.menuStatus = 200;
    await s.turn("sim", true);
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.createPayment).toHaveBeenCalledOnce();
    expect(s.draft()).toBeNull();
  });

  it("normalizes a persisted CEP with a hyphen before quoting and committing a revision", async () => {
    const s = scenario();
    s.ctx.salesCatalogOrders[0].destinationCep = "88330-786";
    s.db.tables.sales_catalog_orders[0].destination_cep = "88330-786";
    const result = await s.turn("adicione uma limonada");
    expect(result?.text).toContain("80,00");
    await s.turn("sim");
    expect(s.persistence.mock.calls[0][0].shipping.destinationCep).toBe("88330786");
  });

  it("retains the committed proposal when the gateway is unavailable and retries only the payment step", async () => {
    const s = scenario();
    s.createPayment.mockImplementationOnce(async input => ({
      session: { id: "failed-session", organization_id: "store", order_id: input.orderId, provider: "asaas", method: input.preferredMethod,
        amount: input.amount, status: "error", providerStatus: "gateway_error", checkout_url: "https://loja.example/checkout/failed-session", pix_qr_code: null },
      checkoutUrl: "https://loja.example/checkout/failed-session", pixQrCode: null, gatewayUnavailable: true,
    }));
    await s.turn("adicione uma limonada");
    const proposal = s.draft()?.request_id;
    await s.turn("sim");
    expect(s.draft()).toMatchObject({ applied: true, request_id: proposal });
    expect(s.requests.some(request => request.url.endsWith("/send/menu"))).toBe(false);
    await s.turn("sim");
    expect(s.persistence).toHaveBeenCalledOnce();
    expect(s.createPayment).toHaveBeenCalledTimes(2);
    expect(s.draft()).toBeNull();
  });

  it("preserves another conversation's revision while creating and completing the current revision", async () => {
    const s = scenario();
    const other = { organization_id: "store", conversation_id: "other-conversation", instance_id: "other-instance", order_id: "other-order",
      request_id: "other-proposal", expected_revision: 4, items: [{ id: "lemonade", quantity: 2 }], ready: true };
    s.ctx.lead.metadata.checkout_order_revision = structuredClone(other);
    (s.db.tables.leads[0].metadata as Row).checkout_order_revision = structuredClone(other);
    await s.turn("adicione uma limonada");
    expect((s.ctx.lead.metadata.checkout_order_revisions as Row)["other-conversation"]).toEqual(other);
    await s.turn("sim");
    expect((s.ctx.lead.metadata.checkout_order_revisions as Row)["other-conversation"]).toEqual(other);
    expect((s.ctx.lead.metadata.checkout_order_revisions as Row).conversation).toBeUndefined();
  });
});

describe("continuing a revision without losing its operation or payment choice", () => {
  it("uses a clarified quantity instead of the original default addition", async () => {
    const s = scenario();
    await s.turn("adicione esse produto e gera novo pix");
    const preview = await s.turn("Pizza de tomate, duas unidades");
    expect(preview?.text).toContain("2x Pizza de tomate");
    expect(preview?.text).toContain("Total: R$ 200,00");
    expect(preview?.text).toContain("Frete: R$ 0,00");
    expect(preview?.text).toContain("Pagamento: Pix");
    expect(s.persistence).not.toHaveBeenCalled();
    await s.turn("sim");
    expect(s.persistence.mock.calls[0][0]).toMatchObject({ orderId: "order", expectedTotal: 200, preferredPaymentMethod: "pix" });
    expect(s.createPayment.mock.calls[0][0]).toMatchObject({ orderId: "order", amount: "200,00", preferredMethod: "pix" });
  });
  it("preserves a generic addition even when the first target is only isso", async () => {
    const s = scenario();
    await s.turn("adicione isso e gere Pix");
    await s.turn("sim");
    expect(s.draft()?.ready).toBe(false);
    expect(s.persistence).not.toHaveBeenCalled();
    const preview = await s.turn("limonada");
    expect(preview?.text).toContain("Limonada");
    expect(preview?.text).toContain("Pagamento: Pix");
  });
  it("accepts a final quantity after an excessive decrement without repeating the subtraction", async () => {
    const s = scenario();
    expect((await s.turn("retire três pizzas de queijo"))?.text).toContain("no total");
    expect(s.draft()?.ready).toBe(false);
    const preview = await s.turn("duas unidades no total");
    expect(preview?.text).toContain("2x Pizza de queijo");
    await s.turn("sim");
    expect(s.persistence.mock.calls[0][0].rows[0].quantity).toBe(2);
  });
  it("resolves only the replacement product while keeping the original source", async () => {
    const s = scenario({ quantities: [["lemonade", 2]] });
    await s.turn("troque a limonada pela pizza");
    const preview = await s.turn("Pizza de tomate, duas unidades");
    expect(preview?.text).toContain("2x Pizza de tomate");
    expect(preview?.text).not.toContain("Limonada");
    await s.turn("sim");
    expect(s.persistence.mock.calls[0][0].rows.map(row => [row.catalog_item_id, row.quantity])).toEqual([["tomato", 2]]);
  });
  it("does not revise or regenerate payment when the requested count is already saved", async () => {
    const s = scenario();
    const response = await s.turn("deixe a pizza de queijo para 1");
    expect(response?.text).toContain("já correspondem");
    expect(s.draft()).toBeNull();
    await s.turn("sim");
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
  });
  it("remembers an explicit method before a legacy cart is later reconciled", async () => {
    const s = scenario();
    s.ctx.salesCatalogOrders[0].preferredPaymentMethod = "pix";
    s.metadata({ checkout_runtime_state: { organization_id: "store", conversation_id: "conversation", instance_id: "instance", order_id: "order", preferred_payment_method: "pix" } });
    expect(await s.turn("muda pra pagamento em cartão")).toBeNull();
    expect(s.createPayment).not.toHaveBeenCalled();
    s.legacyCart();
    const preview = await s.turn("sim");
    expect(preview?.text).toContain("Limonada");
    expect(preview?.text).toContain("Pagamento: cartão");
    await s.turn("sim confirmado");
    expect(s.persistence.mock.calls[0][0].preferredPaymentMethod).toBe("card");
    expect(s.createPayment.mock.calls[0][0].preferredMethod).toBe("card");
  });
  it("blocks a model's false addition claim before generic checkout persistence", async () => {
    const s = scenario();
    await s.turn("adicione esse produto e gere Pix");
    s.customer("obrigado");
    s.db.tables.conversation_messages = [...s.ctx.messages];
    const sent = await s.call<Promise<Outbound[]>>("sendAgentResponse", { client: s.db.client, context: s.ctx, token: "fake", phone: "5500000000000",
      text: "Adicionei 2 pizzas de tomate. Total R$ 200,00. Posso fechar seu pedido e gerar o pagamento?" });
    expect(sent[0].text).toContain("alteração ainda está pendente");
    expect(sent[0].text).not.toContain("Adicionei");
    expect(sent[0].text).not.toContain("200,00");
    expect(s.ctx.lead.metadata.checkout_cart_draft).toBeUndefined();
    expect(s.draft()?.ready).toBe(false);
    expect(s.persistence).not.toHaveBeenCalled();
    expect(s.createPayment).not.toHaveBeenCalled();
  });
});
