import { describe, expect, it } from "vitest";
import { isHumanHandoffRequest } from "../src/lib/whatsapp/human-handoff";

describe("WhatsApp human handoff keyword detector", () => {
  it("does not treat clone/persona questions as human handoff requests", () => {
    expect(isHumanHandoffRequest(
      "Nao, eu tava pensando em clonar eu mesmo. Da para criar alguem virtual? Eu tenho so que clonar uma pessoa mesmo ou posso criar alguem virtual sem clonar ninguem?",
    )).toBe(false);

    expect(isHumanHandoffRequest("Posso criar uma pessoa virtual para atender ou precisa ser um clone real?")).toBe(false);
    expect(isHumanHandoffRequest("O agente consegue falar como humano no WhatsApp?")).toBe(false);
  });

  it("keeps explicit human handoff requests enabled", () => {
    expect(isHumanHandoffRequest("Quero falar com um atendente humano agora")).toBe(true);
    expect(isHumanHandoffRequest("Pode chamar alguem da equipe para continuar?")).toBe(true);
    expect(isHumanHandoffRequest("Me passa para um vendedor, por favor")).toBe(true);
    expect(isHumanHandoffRequest("Tem como conversar com suporte humano?")).toBe(true);
  });
});
