import { describe, expect, it } from "vitest";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import { commerceDatabase } from "./helpers/commerce-database";

function fixture(withPhoto: boolean) {
  const product = {
    id: "house", title: "Casa Ipiranga", tag: "{{produto_casa}}", price: "850.000,00", currency: "BRL", status: "active",
    salesDestination: "external_site", productUrl: "https://imoveis.example/casa",
    inventory: { status: "in_stock", allowBackorder: false }, offer: { salePrice: null },
    skus: [], attributes: [], fulfillment: { mode: "service" }, shipping: { profile: "default" },
    media: withPhoto ? [{ kind: "image", storageUrl: "https://media.example/store/house/cover.jpg", title: "Casa Ipiranga" }] : [],
    description: "Casa com jardim", category: "Imoveis",
  };
  const inbound = { id: "inbound", direction: "inbound", text_content: "Me manda uma foto da Casa Ipiranga e o link do site",
    occurred_at: new Date().toISOString(), message_type: "text", payload: {} };
  const context = {
    messages: [inbound], salesCatalog: [product], salesCatalogOrders: [], salesCatalogShippingSettings: null,
    organization: { id: "store", name: "Imobiliaria" }, agent: { id: "agent" }, instance: { id: "instance", metadata: {} },
    conversationId: "conversation", conversationMetadata: {}, run: { id: "run" },
    lead: { id: "lead", display_name: "Maria", phone_number: "5511999999999", metadata: {} },
    behavior: { proactiveFollowUp: false, humanInterventionMinutes: 30 }, linkButtons: [], salesCatalogSettings: null,
    credentials: { baseUrl: "https://whatsapp.invalid" },
  };
  const db = commerceDatabase({ leads: [{ id: "lead", organization_id: "store", metadata: {} }],
    conversation_messages: [{ ...inbound, conversation_id: "conversation", whatsapp_instance_id: "instance" }] });
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const call = runtimeHarness({}, { fetch: async (url: string, init: { body: string }) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, text: async () => JSON.stringify({ id: `sent-${requests.length}` }) };
  } });
  const send = (text: string) => call<Promise<unknown>>("sendAgentResponse", { client: db.client, context, token: "fake", phone: "5511999999999", text });
  return { product, db, requests, call, send };
}

describe("external catalog photos in WhatsApp replies", () => {
  it("sends the stored photo and external URL without creating a ConnectyHub checkout", async () => {
    const { send, requests, db } = fixture(true);
    await send("Esta é a Casa Ipiranga. Você pode consultar o imóvel em https://imoveis.example/casa {{produto_casa}}");
    expect(requests.filter(request => request.url.endsWith("/send/media"))).toEqual([
      expect.objectContaining({ body: expect.objectContaining({ type: "image", file: "https://media.example/store/house/cover.jpg" }) }),
    ]);
    expect(JSON.stringify(requests)).toContain("https://imoveis.example/casa");
    expect(db.tables.sales_catalog_orders ?? []).toHaveLength(0);
    expect(requests.every(request => request.url.startsWith("https://whatsapp.invalid/"))).toBe(true);
  });

  it("sends only the known link when the product has no photo, without fetching the external site", async () => {
    const { send, requests, db } = fixture(false);
    await send("Não tenho uma foto cadastrada da Casa Ipiranga. Você pode consultar o imóvel em https://imoveis.example/casa {{produto_casa}}");
    expect(requests.filter(request => request.url.endsWith("/send/media"))).toHaveLength(0);
    expect(JSON.stringify(requests)).toContain("https://imoveis.example/casa");
    expect(requests.every(request => request.url.startsWith("https://whatsapp.invalid/"))).toBe(true);
    expect(db.tables.sales_catalog_orders ?? []).toHaveLength(0);
  });

  it("gives the model the actual media availability and separate external purchase instructions", () => {
    const { call, product } = fixture(false);
    const instruction = call<string[]>("buildSalesCatalogLines", [product]).join("\n");
    expect(instruction).toContain("sem arquivo");
    expect(instruction).toContain("nao prometa enviar foto");
    expect(instruction).toContain("compra acontece em site externo");
    expect(instruction).toContain("nao gere pedido ou checkout ConnectyHub");
  });
});
