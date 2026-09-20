import { describe, expect, it } from "vitest";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import { commerceDatabase } from "./helpers/commerce-database";
import type { ProductComplianceRule } from "@/lib/compliance/product-compliance";

function fixture(complianceRules: ProductComplianceRule[], text = "quero comprar", phoneNumber = "5511999999999") {
  const product = {
    id: "product-1",
    title: "Testosterona medicamento",
    tag: "{{produto_testo}}",
    price: "150,00",
    currency: "BRL",
    status: "active",
    salesDestination: "connectyhub_checkout",
    productUrl: null,
    inventory: { status: "in_stock", allowBackorder: false },
    offer: { salePrice: null },
    skus: [],
    attributes: [],
    fulfillment: { mode: "delivery" },
    shipping: { profile: "default" },
    media: [],
    description: "Item em estoque",
    category: "Medicamentos",
  };

  const inbound = {
    id: "inbound",
    direction: "inbound",
    text_content: text,
    occurred_at: new Date().toISOString(),
    message_type: "text",
    payload: {},
  };

  const context = {
    messages: [inbound],
    salesCatalog: [product],
    salesCatalogOrders: [],
    salesCatalogShippingSettings: null,
    organization: { id: "store", name: "Empresa" },
    agent: {
      id: "agent",
      metadata: { prompt_builder_config: { templateId: "generic_sales", mode: "manual" } },
    },
    instance: { id: "instance", phone_number: phoneNumber, metadata: {} },
    conversationId: "conversation",
    conversationMetadata: {},
    run: { id: "run" },
    lead: { id: "lead", display_name: "Cliente", phone_number: phoneNumber, metadata: {} },
    behavior: { responseMode: "text", proactiveFollowUp: false, humanInterventionMinutes: 30 },
    linkButtons: [],
    salesCatalogSettings: null,
    credentials: { baseUrl: "https://whatsapp.invalid" },
    complianceRules,
  };

  const db = commerceDatabase({
    leads: [{ id: "lead", organization_id: "store", metadata: {} }],
    conversation_messages: [
      { ...inbound, conversation_id: "conversation", whatsapp_instance_id: "instance" },
    ],
  });

  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const call = runtimeHarness(
    {
      "@/lib/sales-catalog/public-urls": {
        buildLeadAwareSalesCatalogProductUrl: ({ productId }: { productId: string }) =>
          `https://store.example/produto/${productId}`,
      },
    },
    {
      fetch: async (url: string, init: { body: string }) => {
        requests.push({ url, body: JSON.parse(init.body) });
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ id: `sent-${requests.length}` }),
        };
      },
    }
  );

  const send = (response: string) =>
    call<Promise<unknown>>("sendAgentResponse", {
      client: db.client,
      context,
      token: "fake",
      phone: phoneNumber,
      text: response,
    });

  return { product, context, db, requests, call, send };
}

describe("Dynamic Admin Product Compliance Engine", () => {
  it("blocks anabolics and checkout when compliance rule is ENABLED for Brazil", async () => {
    const activeRule: ProductComplianceRule = {
      id: "rule-anabolics-br",
      name: "Anabolizantes e Esteroides",
      slug: "anabolizantes-esteroides-br",
      category: "health_controlled",
      country_code: "BR",
      keywords: ["anabolizante", "testosterona", "oxandrolona", "trembolona"],
      intent_keywords: ["recomenda", "ciclo", "ganhar massa"],
      action: "block_all",
      blocked_message: "Não posso vender esteroides anabolizantes.",
      is_enabled: true,
    };

    const { context, send, requests, call } = fixture([activeRule], "quero comprar testosterona");

    expect(call("runtimeAllowsCheckout", context)).toBe(false);

    await send("Aqui está a testosterona solicitada.");

    expect(JSON.stringify(requests)).toContain("Não posso vender esteroides anabolizantes.");
    expect(requests.some((r) => r.url.endsWith("/send/menu") || r.url.endsWith("/send/media"))).toBe(
      false
    );
  });

  it("ALLOWS recommendations and checkout when Admin DISABLES the rule (is_enabled: false)", async () => {
    const disabledRule: ProductComplianceRule = {
      id: "rule-anabolics-br",
      name: "Anabolizantes e Esteroides",
      slug: "anabolizantes-esteroides-br",
      category: "health_controlled",
      country_code: "BR",
      keywords: ["anabolizante", "testosterona", "oxandrolona", "trembolona"],
      intent_keywords: ["recomenda", "ciclo", "ganhar massa"],
      action: "block_all",
      blocked_message: "Não posso vender esteroides anabolizantes.",
      is_enabled: false, // <-- Admin disabled the rule!
    };

    const { context, send, requests, call } = fixture([disabledRule], "quero comprar testosterona");

    // Checkout must now be permitted!
    expect(call("runtimeAllowsCheckout", context)).toBe(true);

    // Agent response must not be blocked!
    await send("Testosterona disponível no catálogo para compra.");

    expect(JSON.stringify(requests)).not.toContain("Não posso vender esteroides anabolizantes.");
    expect(JSON.stringify(requests)).toContain("Testosterona disponível");
  });

  it("blocks custom illegal substances added by Admin (e.g. cocaína/drogas ilícitas)", async () => {
    const customDrugsRule: ProductComplianceRule = {
      id: "rule-illicit-drugs",
      name: "Drogas Ilícitas e Entorpecentes",
      slug: "drogas-ilicitas-global",
      category: "illicit_drugs",
      country_code: "ALL",
      keywords: ["cocaina", "pasta base", "entorpecente", "droga"],
      intent_keywords: ["comprar", "droga", "trafico"],
      action: "block_all",
      blocked_message:
        "A comercialização de substâncias ilícitas é terminantemente proibida na plataforma ConnectyHub.",
      is_enabled: true,
    };

    const { context, product, send, requests, call } = fixture(
      [customDrugsRule],
      "tem cocaina para vender?"
    );
    product.title = "Cocaina 1g";

    expect(call("runtimeAllowsCheckout", context)).toBe(false);

    await send("Temos cocaina disponível.");

    expect(JSON.stringify(requests)).toContain(
      "A comercialização de substâncias ilícitas é terminantemente proibida"
    );
  });

  it("permits harmless common products alongside restricted items", async () => {
    const activeRule: ProductComplianceRule = {
      id: "rule-anabolics-br",
      name: "Anabolizantes e Esteroides",
      slug: "anabolizantes-esteroides-br",
      category: "health_controlled",
      country_code: "BR",
      keywords: ["anabolizante", "testosterona"],
      intent_keywords: ["ciclo"],
      action: "block_all",
      blocked_message: "Não posso vender anabolizantes.",
      is_enabled: true,
    };

    const { context, product, send, requests, call } = fixture(
      [activeRule],
      "quero comprar Creatina Monohidratada"
    );
    product.title = "Creatina Monohidratada 300g";

    expect(call("runtimeAllowsCheckout", context)).toBe(true);

    await send("Creatina Monohidratada está disponível no estoque.");

    expect(JSON.stringify(requests)).not.toContain("Não posso vender anabolizantes.");
    expect(JSON.stringify(requests)).toContain("Creatina Monohidratada");
  });
});
