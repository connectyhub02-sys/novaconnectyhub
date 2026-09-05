import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const openApiSpec = JSON.parse(readFileSync("src/lib/connectyhub-api/openapi.generated.json", "utf8"));

function providerPost(path: string) {
  return openApiSpec.paths?.[path]?.post;
}

function providerRequestExample(path: string) {
  return providerPost(path)?.requestBody?.content?.["application/json"]?.schema?.example;
}

describe("ConnectyHub API button documentation", () => {
  it("documents the validated WhatsApp button formats for customer integrations", () => {
    const menu = providerPost("/provider/send/menu");
    const menuExample = providerRequestExample("/provider/send/menu");
    const requestPayment = providerPost("/provider/send/request-payment");
    const requestPaymentExample = providerRequestExample("/provider/send/request-payment");
    const pixButtonExample = providerRequestExample("/provider/send/pix-button");
    const carouselExample = providerRequestExample("/provider/send/carousel");

    expect(menu?.description).toContain("Exemplos ConnectyHub validados");
    expect(menu?.description).toContain("Copiar codigo Pix|copy:TESTE-COPIAR-PIX-123");
    expect(menu?.description).toContain("Finalizar checkout|url:https://");
    expect(menu?.description).toContain("evite misturar botoes de resposta rapida");
    expect(menuExample.payload.choices).toContain("Finalizar checkout|https://www.connectyhub.com.br/checkout/pedido-123?payment_method=card");
    expect(menuExample.payload.choices).toContain("Copiar codigo Pix|copy:TESTE-COPIAR-PIX-123");

    expect(requestPayment?.description).toContain("pixCode");
    expect(requestPayment?.requestBody.content["application/json"].schema.properties.payload.properties.pixCode.example)
      .toBe("TESTE-COPIAR-PIX-123");
    expect(requestPaymentExample.payload.pixCode).toBe("TESTE-COPIAR-PIX-123");
    expect(requestPaymentExample.payload.paymentLink).toContain("payment_method=card");

    expect(pixButtonExample.payload.pixType).toBe("EVP");
    expect(pixButtonExample.payload.track_id).toBe("pedido_123_pix_button");
    expect(carouselExample.payload.carousel[0].buttons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "URL" }),
        expect.objectContaining({ type: "COPY" }),
      ]),
    );
  });
});
