import { describe, expect, it } from "vitest";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";

type Event = { text: string; direction?: "inbound" | "outbound"; payload?: Record<string, unknown> };
const preview = "Antes de fechar, confirma se o pedido ficou assim:\n- 1x Camiseta azul - R$ 60,00\nFrete: R$ 10,00\nTotal: R$ 70,00\nPosso fechar seu pedido e gerar o pagamento?";
const checkout = "Perfeito, deixei um checkout seguro separado para concluir seu pedido.";
const out = (text: string, payload = {}): Event => ({ text, payload });
const inbound = (text: string): Event => ({ text, direction: "inbound" });

function confirmed(history: Event[], reply = "sim") {
  const messages = [...history, inbound(reply)].map((entry, index) => ({
    id: `message-${index}`, conversation_id: "conversation", whatsapp_instance_id: "instance", organization_id: "store",
    direction: entry.direction ?? "outbound", text_content: entry.text, payload: entry.payload ?? {}, message_type: "text",
    occurred_at: new Date(Date.now() - 60000 + index * 1000).toISOString(),
  }));
  const context = { messages, organization: { id: "store" }, conversationId: "conversation", instance: { id: "instance", metadata: {} },
    lead: { id: "lead", metadata: {} }, agent: { id: "agent", metadata: {} }, salesCatalogOrders: [], salesCatalog: [], behavior: {} };
  return runtimeHarness()<boolean>("hasRecentSalesCatalogCheckoutConfirmation", context, reply);
}

describe("fresh checkout confirmation must remain anchored to an unresolved preview", () => {
  it("accepts a genuine fresh preview as the positive control", () => {
    expect(confirmed([out(preview)])).toBe(true);
  });

  it("preserves the preview sent over several message bubbles", () => {
    expect(confirmed(preview.split("\n").map(text => out(text)))).toBe(true);
  });

  it.each([
    [checkout, { interactive_button: true }],
    ["", { provider_response: { delivery: "whatsapp_pix_copy_button", orderId: "order" } }],
    ["FAKE-NONPAYABLE-PIX", { provider_response: { delivery: "whatsapp_pix_code_separate_message", orderId: "order" } }],
    ["Finalizar pedido: https://loja.example/checkout/session", { button_fallback: true, provider_response: { reason: "payment_interactive_button_failed", checkoutUrl: "https://loja.example/checkout/session" } }],
    [checkout, {}],
  ] as const)("never consumes the old preview after a delivered payment: %s", (text, payload) => {
    expect(confirmed([out(preview), inbound("sim"), out(text, payload)])).toBe(false);
  });

  it("does not skip a farewell to consume a preview from before the delivered checkout", () => {
    expect(confirmed([out(preview), inbound("sim"), out(checkout, { interactive_button: true }), inbound("legal obrigado"),
      out("Disponha! Assim que concluir o pagamento no cartão, me avisa.")], "blz")).toBe(false);
  });

  it.each(["Nossa loja abre amanhã às nove horas.", "Quer receber o catálogo de novidades?", "Bom dia! Como posso ajudar?"])(
    "does not search behind an unrelated substantive assistant turn: %s", text => {
      expect(confirmed([out(preview), inbound("me explica outra coisa"), out(text)])).toBe(false);
    },
  );

  it.each(["Quer receber o catálogo de novidades?", "Posso te enviar o catálogo?"])(
    "does not bind a yes to the preview when another question follows in the same burst: %s", question => {
      expect(confirmed([out(preview), out(question)])).toBe(false);
    },
  );

  it("joins the actual confirmation question when the clone splits it across bubbles", () => {
    const fragments = preview.replace("Posso fechar seu pedido e gerar o pagamento?", "").split("\n").filter(Boolean).map(text => out(text));
    expect(confirmed([...fragments, out("Posso fechar seu pedido"), out("e gerar o pagamento?")])).toBe(true);
  });

  it("preserves an explicit return to checkout after explaining payment terms", () => {
    expect(confirmed([out(preview), inbound("Pix tem desconto?"), out("O valor é o mesmo no Pix e no cartão.")], "Pode continuar, Pix")).toBe(true);
  });

  it("preserves the payment-method question after the customer accepted the displayed total", () => {
    expect(confirmed([out(preview), inbound("sim"), out("Pedido confirmado. Qual forma de pagamento você prefere: Pix ou cartão?")], "Pix")).toBe(true);
  });

  it("allows a new preview and consent after a previous payment delivery", () => {
    expect(confirmed([out(preview), inbound("sim"), out(checkout, { interactive_button: true }), inbound("adicione um boné"), out(preview)])).toBe(true);
  });

  it("keeps a genuinely newer preview when it shares an outbound burst with an older payment delivery", () => {
    expect(confirmed([out(preview), inbound("sim"), out(checkout, { interactive_button: true }), out(preview)])).toBe(true);
  });

  it("does not mistake an unrelated product button for a delivered checkout", () => {
    expect(confirmed([out("Ver detalhes da camiseta", { interactive_button: true }), out(preview)])).toBe(true);
  });

  it("does not discard a preview because a technical media acknowledgment was emitted", () => {
    expect(confirmed([out(preview), inbound("áudio"), out("Estou ouvindo seu áudio.", {
      runtime_event: { type: "media_processing_acknowledgement" },
    })])).toBe(true);
  });
});
