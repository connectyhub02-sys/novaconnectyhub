import { describe, expect, it } from "vitest";
import { asksForPersonalData, showsPurchaseIntent } from "../src/lib/whatsapp/group-rules";

describe("agent rules inside groups", () => {
  it("recognizes someone who wants to buy", () => {
    for (const text of ["como eu faço para comprar esses produtos", "qual o valor?", "quanto custa o turinabol", "vocês entregam em Joinville?", "quero esse"]) {
      expect(showsPurchaseIntent(text)).toBe(true);
    }
    expect(showsPurchaseIntent("qual produto eu uso para secar?")).toBe(false);
    expect(showsPurchaseIntent("boa tarde Luna")).toBe(false);
  });

  it("catches a reply that asks for personal or payment data", () => {
    expect(asksForPersonalData("me informa seu nome completo, e-mail, CPF e endereço com CEP")).toBe(true);
    expect(asksForPersonalData("Pode pagar com a chave pix que te passo")).toBe(true);
    expect(asksForPersonalData("O Turinabol ajuda a ganhar massa magra sem retenção.")).toBe(false);
  });
});

describe("consultative reply by activity", () => {
  it("never uses the real-estate wording for a store", async () => {
    const { buildConsultativeCommerceReply } = await import("../src/lib/whatsapp/commerce-conversation");
    expect(buildConsultativeCommerceReply("checkout", false)).not.toMatch(/im[óo]vel/);
    expect(buildConsultativeCommerceReply("property", false)).toMatch(/im[óo]vel/);
  });
});
