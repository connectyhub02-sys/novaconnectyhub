import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";

const source = readFileSync("src/lib/whatsapp/channel-operations.ts", "utf8");

describe("product posts in WhatsApp Channels", () => {
  it("send the product photo with the caption and the product link written, instead of dropping the button post to plain text", () => {
    const branch = source.slice(source.indexOf("if (interactiveMode === \"button\" && recipient.endsWith(\"@newsletter\"))"), source.indexOf("} else if (interactiveMode === \"button\") {"));
    expect(branch).toContain("asString(payload.image_button)");
    expect(branch).toContain("\"/send/media\"");
    expect(branch).toContain("type: \"image\"");
    expect(branch).toContain("Ver produto");
  });
});


describe("product button label", () => {
  const channel = serverModuleHarness<typeof import("../src/lib/whatsapp/channel-operations")>("src/lib/whatsapp/channel-operations.ts", {});

  it("never promises a private chat on a button that opens the product page", () => {
    for (const label of ["Chamar no privado", "Me chame no Whats", "Fale comigo", "Conversar"]) expect(channel.productLinkButtonLabel(label)).toBe("Ver produto");
    for (const label of ["Ver produto", "Comprar", "Garantir o meu"]) expect(channel.productLinkButtonLabel(label)).toBe(label);
  });

  it("ignores the model's button text and defaults to Ver produto", () => {
    expect(source).toContain("? userButtonLabel ?? productButtonDefaultLabel");
    expect(source).not.toContain("planItem.buttonLabel ??");
    expect(source).not.toContain("\"Comprar agora\"");
  });
});
