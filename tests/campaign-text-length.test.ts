import { describe, expect, it } from "vitest";
import { serverModuleHarness } from "./helpers/server-module-harness";

type Channel = typeof import("../src/lib/whatsapp/channel-operations");

describe("written posts stay short", () => {
  const channel = serverModuleHarness<Channel>("src/lib/whatsapp/channel-operations.ts", {});
  const long = "Fala pessoal, tudo certo? Se você tá buscando aquela base sólida pro seu projeto, com foco em ganho de força e volume muscular constante, precisa conhecer o Enantato de Testosterona da Power Lab. Ele vem na concentração de 250mg por ml, tem liberação prolongada e entrega uma excelente estabilidade hormonal. O valor dele é R$ 269,99 a unidade de 10ml. Clica no botão abaixo!";

  it("keeps whole sentences within the phone-screen limit", () => {
    const short = channel.shortenAtSentence(long, channel.campaignTextMaxChars);
    expect(short.length).toBeLessThanOrEqual(280);
    expect(short).toMatch(/[.!?]$/);
    expect(short.startsWith("Fala pessoal, tudo certo?")).toBe(true);
  });

  it("lets the spoken audio go further than the written text", () => {
    expect(channel.campaignAudioMaxChars).toBeGreaterThan(channel.campaignTextMaxChars);
    expect(channel.shortenAtSentence(long, channel.campaignAudioMaxChars)).toBe(long);
  });
});
