import { describe, expect, it } from "vitest";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import { correctFreeShippingClaim, readFreeShippingThresholds, readWrittenOrderTotal } from "../src/lib/whatsapp/shipping-claims";

describe("free-shipping promises are checked by the system", () => {
  const reply = "**Total das mercadorias:** R$ 503,80\nComo o valor passou de R$ 800, o frete é por nossa conta para sua região!\nQuer que eu envie esse combo?";

  it("replaces a promise below the configured threshold with how much is missing", () => {
    const corrected = correctFreeShippingClaim(reply, [800]);
    expect(corrected).not.toContain("por nossa conta");
    expect(corrected).toContain("faltam R$ 296,20");
    expect(corrected).toContain("Total das mercadorias:** R$ 503,80");
    expect(corrected).toContain("Quer que eu envie esse combo?");
  });

  it("uses the total written in the previous message when the promise comes alone", () => {
    expect(correctFreeShippingClaim("Frete grátis pra você!", [800], ["Total: R$ 503,80"])).toContain("faltam R$ 296,20");
  });

  it("keeps a true promise and removes one when there is no free shipping at all", () => {
    expect(correctFreeShippingClaim("Total: R$ 1.007,60. O frete é grátis!", [800])).toContain("O frete é grátis!");
    expect(correctFreeShippingClaim("Total: R$ 1.007,60. O frete é grátis!", [])).toContain("calculo certinho com o seu CEP");
  });

  it("reads totals and thresholds as the store writes them", () => {
    expect(readWrittenOrderTotal("Total do pedido: R$ 1.750,00")).toBe(1750);
    expect(readFreeShippingThresholds([{ active: true, freeShippingThreshold: "800" }, { active: false, freeShippingThreshold: "100" }, { active: true, freeShippingThreshold: "1.200,00" }])).toEqual([800, 1200]);
  });

  it("leaves messages without a shipping promise untouched", () => {
    expect(correctFreeShippingClaim("O frete eu calculo com seu CEP.", [800])).toBe("O frete eu calculo com seu CEP.");
  });
});

describe("image acknowledgement", () => {
  it("drops a cut-off generation so the ready-made acknowledgement is used", () => {
    const call = runtimeHarness();
    expect(call("normalizeMediaAcknowledgementText", "and")).toBe("");
    expect(call("normalizeMediaAcknowledgementText", "Vou dar")).toBe("");
    expect(call("normalizeMediaAcknowledgementText", "Recebi as fotos, já vou olhar!")).toBe("Recebi as fotos, já vou olhar!");
  });
});
