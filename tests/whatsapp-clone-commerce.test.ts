import { describe, expect, it, vi } from "vitest";
import { requiresCommerceConversationReply } from "@/lib/whatsapp/commerce-conversation";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import { commerceDatabase } from "./helpers/commerce-database";

const product = {
  id: "pizza", title: "Pizza Margherita", tag: "{{produto_pizza}}", price: "39,90", currency: "BRL",
  inventory: { status: "in_stock", allowBackorder: false }, status: "active", offer: {},
};
const msg = (direction: string, text_content: string, minute: number) => ({
  direction, text_content, occurred_at: new Date(Date.UTC(2026, 8, 5, 12, minute)).toISOString(),
});

describe("clone conversation and checkout boundaries", () => {
  it.each([
    "A Margherita tem manjericão fresco, sim.",
    "Boa escolha! Essa combina com o que você me contou.",
    "Pode deixar, sem pressa.",
    "Sim, o suco acompanha bem a pizza. Quer os dois?",
    "Para sua necessidade, prefiro essa opção por ser mais leve.",
  ])("preserves a natural short reply without adding products or a sales question: %s", text => {
    const call = runtimeHarness();
    expect(call("prepareSalesCatalogDeliveryText", { text, items: [product], hasOrderIntent: false })).toBe(text);
  });

  it.each([
    "Pix tem desconto?", "Sim, mas quanto tempo demora a entrega?", "Pode explicar como funciona?",
    "Quero saber se tem lactose", "Antes de pagar, me explica o produto", "Pode mandar, mas tira o suco",
    "Pix, mas também quero uma bebida", "Não quero pagar agora", "Quero falar com um atendente sobre o Pix",
    "Sim, só que sem cebola", "Quero mudar o endereço", "Como eu uso depois de pagar?",
  ])("answers or adjusts before charging: %s", async text => {
    expect(requiresCommerceConversationReply(text)).toBe(true);
    const call = runtimeHarness();
    expect(call("hasSalesCatalogOrderIntent", text)).toBe(false);
    expect(call("hasSalesCatalogCheckoutConfirmationIntent", text)).toBe(false);
    const latest = msg("inbound", text, 2);
    const messages = [msg("outbound", "Antes de fechar, confirma se o pedido ficou assim:\n- 1x Pizza Margherita\nTotal: R$ 39,90\nPosso fechar seu pedido e gerar o pagamento?", 1), latest];
    expect(call("hasRecentSalesCatalogCheckoutConfirmation", { messages }, text)).toBe(false);
    expect(call("isSalesCatalogPaymentLinkFollowUp", text, messages, latest)).toBe(false);
    // No database access, charge or WhatsApp request should happen on the payment shortcut.
    const from = vi.fn(() => { throw new Error("Unexpected checkout action"); });
    await expect(call<Promise<unknown>>("maybeSendExistingSalesCatalogCheckoutLink", {
      client: { from }, context: {}, userText: text, latestInbound: latest,
    })).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    "Sim", "Pix", "Pode mandar o Pix?", "Me envia o link de pagamento", "Mas eu já te passei",
    "Não recebi o código Pix", "Troca para Pix", "Muda do cartão para Pix", "Pode continuar", "Sim, Pix",
    "Maria Oliveira\ncliente@example.com\n12345678901",
  ])("allows explicit checkout progression or already supplied data: %s", text => {
    expect(requiresCommerceConversationReply(text)).toBe(false);
  });

  it("resumes the confirmed cart after answering an interruption", () => {
    const call = runtimeHarness();
    const messages = [
      msg("outbound", "Antes de fechar, confirma se o pedido ficou assim:\n- 1x Pizza Margherita\nTotal: R$ 39,90\nPosso fechar seu pedido e gerar o pagamento?", 0),
      msg("inbound", "Pix tem desconto?", 1),
      msg("outbound", "O valor é o mesmo no Pix e no cartão.", 2),
      msg("inbound", "Pode continuar, Pix", 3),
    ];
    expect(call("hasRecentSalesCatalogCheckoutConfirmation", { messages }, "Pode continuar, Pix")).toBe(true);
  });

  it.each(["Obrigado", "Vou pensar", "Bom dia", "Entendi"])("does not reuse a previous Pix choice as new consent: %s", text => {
    const call = runtimeHarness();
    const messages = [
      msg("outbound", "Antes de fechar, confirma se o pedido ficou assim:\n- 1x Pizza Margherita\nTotal: R$ 39,90\nPosso fechar seu pedido e gerar o pagamento?", 0),
      msg("inbound", "Sim", 1),
      msg("outbound", "Pedido confirmado. Qual forma de pagamento você prefere: Pix ou cartão?", 2),
      msg("inbound", "Pix", 3), msg("outbound", "Seu Pix está pronto.", 4), msg("inbound", text, 5),
    ];
    expect(call("hasRecentSalesCatalogCheckoutConfirmation", { messages }, text)).toBe(false);
  });

  it.each([
    ["Muda do cartão para Pix", "pix"], ["Troca do Pix para cartão", "card"],
    ["Quero Pix, não cartão", "pix"], ["Não quero Pix, quero cartão", "card"],
    ["Pix ou cartão", null],
  ])("honors the requested payment method in a complete sentence: %s", (text, expected) => {
    const call = runtimeHarness();
    expect(call("detectSalesCatalogPreferredPaymentMethod", text)).toBe(expected);
  });

  it("evaluates the actual WhatsApp reply and recognizes a delivered Pix button", async () => {
    const call = runtimeHarness();
    const db = commerceDatabase();
    const actual = "Seu Pix está pronto. Toque no botão para copiar o código.";
    await call("persistCloneRealTestTurn", db.client, {
      organization: { id: "store" }, agent: { id: "agent", metadata: {} }, lead: { id: "lead" },
      run: { id: "run" }, instance: { id: "instance" }, conversationId: "conversation", behavior: {}, messages: [],
    }, {
      userText: "Me manda o botão Pix", aiText: "Como posso ajudar?", latestInbound: null,
      outbound: [{ text: actual, mode: "text", interactiveButton: true, persisted: true }],
    });
    const payload = db.tables.intelligence_events[0].payload as Record<string, unknown>;
    expect(payload.outputPreview).toBe(actual);
    expect(payload.reviewFlags).not.toContain("generic_bot_phrase");
    expect(payload.reviewFlags).not.toContain("promised_link_without_link");
    expect(payload.reviewFlags).not.toContain("link_request_without_link");
    expect(payload.deliveredAction).toBe(true);
  });

  it("requests only the missing email when name and document are already captured", async () => {
    const db = commerceDatabase();
    const texts: string[] = [];
    const call = runtimeHarness({}, { fetch: async (_url: string, init: { body: string }) => {
      texts.push(JSON.parse(init.body).text);
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "fake-send" }) };
    } });
    await call("sendSalesCatalogPaymentDeferredWhatsapp", {
      client: db.client, token: "fake", phone: "5500000000000",
      context: {
        organization: { id: "store" }, agent: { id: "agent" }, run: { id: "run" }, instance: { id: "instance", metadata: {} },
        conversationId: "conversation", credentials: { baseUrl: "https://whatsapp.invalid" }, behavior: {}, messages: [],
        lead: { id: "lead", display_name: "Maria Oliveira", metadata: { person_name: "Maria Oliveira", customer_document: "12345678901" } },
        salesCatalogOrders: [], salesCatalogShippingSettings: null,
      },
      payment: { orderId: "order", provider: "asaas", paymentDeferred: true },
    });
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain("e-mail");
    expect(texts[0]).not.toMatch(/nome|CPF|CNPJ|endereço|confirma.*dados/i);
  });

  it("does not overwrite a customer's clone edits when delayed style learning finishes", async () => {
    const oldMetadata = { whatsapp_clone_profile: { enabled: true, tone: "Informal" } };
    const updatedMetadata = { whatsapp_clone_profile: { enabled: true, tone: "Calmo e acolhedor" }, prompt_builder_config: { templateId: "barbearia" } };
    const db = commerceDatabase({ agent_registry: [{ id: "agent", organization_id: "store", metadata: oldMetadata }] });
    const call = runtimeHarness({ "@/lib/billing/gemini-metering": { meterGeminiGenerationUsage: async () => null } }, {
      fetch: async () => {
        db.tables.agent_registry[0].metadata = updatedMetadata;
        db.tables.agent_registry[0].updated_at = "version-2";
        return { ok: true, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: "Tom comercial curto", phrasePatterns: ["Bora fechar"] }) }] } }] }) };
      },
    });
    await call("extractCloneMemory", db.client, {
      organization: { id: "store" }, agent: { id: "agent", organization_id: "store", metadata: oldMetadata },
      behavior: { cloneMemory: true }, messages: [msg("inbound", "Oi", 0), msg("outbound", "Olá", 1)],
      geminiCredentials: { apiKey: "fake", model: "fake" }, run: { id: "run" }, instance: { metadata: {} }, conversationId: "conversation",
    }, "Pix", "Seu Pix está pronto.");
    expect(db.tables.agent_registry[0].metadata).toEqual(updatedMetadata);
  });
});
