import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readFileSync } from "node:fs";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";
import { buildLeadQualificationInstruction } from "../src/lib/leads/qualification";
import { createProfessionalGuidanceQualification } from "../src/lib/leads/professional-guidance-qualification";
import { disabledAgendaTurn } from "../src/lib/automations/agenda-agent";

const outbound = (text: string) => ({ direction: "outbound", text_content: text });

describe("honest attendance: no invented services, no fake handoff", () => {
  const runtime = runtimeHarness();

  it("a yes to the agent's own offer to pass the conversation on becomes a real handoff", () => {
    const offer = [outbound("Gostaria que eu te encaminhe para o responsável para verificar os valores?")];
    for (const answer of ["Sim", "pode sim", "Quero", "ok, por favor"]) expect([answer, runtime<boolean>("acceptsOfferedHumanHandoff", offer, answer)]).toEqual([answer, true]);
    expect(runtime<boolean>("acceptsOfferedHumanHandoff", offer, "não, obrigado")).toBe(false);
    expect(runtime<boolean>("acceptsOfferedHumanHandoff", [outbound("Quer ver a Boldenona ou a Oxandrolona?")], "Sim")).toBe(false);
    expect(runtime<boolean>("acceptsOfferedHumanHandoff", [outbound("Te encaminhei os valores.")], "Sim")).toBe(false);
  });

  it("forbids claiming a handoff that did not happen and offering services that do not exist", () => {
    const source = readFileSync("src/lib/whatsapp/agent-runtime.ts", "utf8");
    expect(source).toContain("Nunca diga que avisou, encaminhou ou passou a conversa para o responsável");
    expect(source).toContain("Não ofereça serviço, profissional, especialista, avaliação ou consulta que a empresa não vende");
  });

  it("qualification questions about a professional refer to the customer's own professional, never an offer", () => {
    const lines = buildLeadQualificationInstruction(createProfessionalGuidanceQualification()).join("\n");
    expect(lines).toContain("nunca as transforme em oferta");
    expect(lines).toContain("profissional de saúde de sua confiança");
    expect(lines).not.toContain("estaria disposto a passar por avaliação profissional");
  });

  it("a company without scheduling never tells the customer that scheduling is disabled", () => {
    const turn = disabledAgendaTurn();
    expect(turn.fallback).not.toMatch(/agend|desativ|sistema/i);
    expect(turn.context).toContain("Nunca mencione agenda, sistema, configuração ou que algo está desativado");
  });
});
