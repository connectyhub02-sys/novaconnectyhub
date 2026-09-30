import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";

describe("a simple greeting gets a human greeting back", () => {
  const runtime = runtimeHarness();

  it("recognizes messages that only greet", () => {
    for (const text of ["Oi", "oii", "Boa tarde", "Oi, boa tarde! Tudo bem?", "Olá", "e aí, beleza?", "Bom dia 😊"]) expect([text, runtime<boolean>("isGreetingOnlyMessage", text)]).toEqual([text, true]);
    for (const text of ["Oi, quanto tá a pizza grande?", "Boa noite, quero uma calabresa", "tem cardápio?", ""]) expect([text, runtime<boolean>("isGreetingOnlyMessage", text)]).toEqual([text, false]);
  });

  it("tells the agent to greet back and ask how to help, without qualifying or offering", () => {
    const lines = runtime<string[]>("buildGreetingOnlyInstruction", "Oi").join("\n");
    expect(lines).toContain("pergunte, de forma aberta, como pode ajudar");
    expect(lines).toContain("não faça pergunta de qualificação");
    expect(runtime<string[]>("buildGreetingOnlyInstruction", "quero uma pizza grande")).toEqual([]);
  });

  it("marks the activity example as a question for after the customer says what they want", () => {
    const profile = readFileSync("src/lib/whatsapp/activity-profile.ts", "utf8");
    expect(profile).toContain("Exemplo de pergunta para depois que o cliente disser o que procura (nunca como resposta a um simples cumprimento)");
    expect(profile).not.toContain("`Exemplo de abordagem:");
  });
});
