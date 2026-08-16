import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const elianeAgentSource = readFileSync("src/lib/whatsapp/eliane-agent.ts", "utf8");
const agentRuntimeSource = readFileSync("src/lib/whatsapp/agent-runtime.ts", "utf8");

describe("Eliane self-service positioning", () => {
  it("guides leads to execute onboarding inside their own panel", () => {
    expect(elianeAgentSource).toContain("POSTURA DE AUTOATENDIMENTO GUIADO");
    expect(elianeAgentSource).toContain("voce cria/configura/importa no painel");
    expect(elianeAgentSource).toContain("Voce faz o cadastro e entra no painel");
    expect(elianeAgentSource).toContain("botao/link de cadastro");
  });

  it("keeps runtime guidance from promising manual setup by the ConnectyHub team", () => {
    expect(agentRuntimeSource).toContain("POSTURA COMERCIAL SELF-SERVICE DA ELIANE");
    expect(agentRuntimeSource).toContain("o usuario entra no painel e executa as etapas");
    expect(agentRuntimeSource).toContain("Evite 'a gente cria'");
    expect(agentRuntimeSource).toContain("botao/link de cadastro disponivel");
  });

  it("documents the correct wording for beginners in digital marketing", () => {
    expect(elianeAgentSource).toContain("Lead iniciante no marketing digital");
    expect(elianeAgentSource).toContain("cadastro > entrar no painel > criar empresa > criar agente clone");
    expect(elianeAgentSource).toContain("Exemplo correto: 'vc entra no painel");
    expect(elianeAgentSource).toContain("Exemplo proibido: 'a gente cria seu clone");
  });

  it("uses registered client context without exposing another user's data", () => {
    expect(agentRuntimeSource).toContain("CADASTRO CONNECTYHUB DO CONTATO");
    expect(agentRuntimeSource).toContain("O telefone do WhatsApp atual bate com um cadastro existente");
    expect(agentRuntimeSource).toContain("Nome parecido nao prova identidade");
    expect(agentRuntimeSource).toContain("Nao exponha email, telefone completo, ID");
    expect(elianeAgentSource).toContain("IDENTIFICACAO DE CADASTRO");
  });
});
