import { describe, expect, it } from "vitest";
import { requiresCommerceConversationReply } from "../src/lib/whatsapp/commerce-conversation";

describe("sentence boundaries in spoken payment requests", () => {
  it.each([
    "Cara, manda de novo pra mim aqui que eu não tô conseguindo não. Manda de novo o Pix pra mim aí, o botão do Pix",
    "Não chegou não! Manda o Pix de novo?",
    "O código não chegou não. Me manda o Pix.",
  ])("recognizes a resend after a complaint: %s", text => {
    expect(requiresCommerceConversationReply(text)).toBe(false);
  });
  it.each([
    "Não manda o Pix.", "Não, manda o Pix", "Não\nmanda o Pix", "Não envie. Vou pensar.",
    "Manda o Pix. Não quero mais.", "Manda o Pix, mas antes me explica a garantia.",
    "Não mande o Pix", "Manda de novo o Pix, mas quanto demora a entrega?",
  ])("preserves a real stop or question: %s", text => {
    expect(requiresCommerceConversationReply(text)).toBe(true);
  });
});
