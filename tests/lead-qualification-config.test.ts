import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLeadQualificationInstruction,
  defaultLeadQualificationConfig,
  defaultLeadQualificationQuestions,
  isLeadQualificationPlaybookActive,
  markLeadQualificationConfigConfigured,
  normalizeLeadQualificationConfig,
  type LeadQualificationConfig,
} from "@/lib/leads/qualification";

const clientWorkspaceSource = readFileSync("src/lib/whatsapp/client-workspace.ts", "utf8");
const adminConsoleSource = readFileSync("src/lib/admin/platform-whatsapp-console.ts", "utf8");
const whatsappConsoleSource = readFileSync("src/components/connectyhub-os/whatsapp-console.tsx", "utf8");
const runtimeSource = readFileSync("src/lib/whatsapp/agent-runtime.ts", "utf8");

const legacyDefaultCommercialObjective = "Entender a dor do lead, qualificar potencial de compra e conduzir para o proximo passo comercial.";
const oldImplicitDefaultQuestions = [
  {
    id: "main_need",
    label: "Necessidade",
    question: "O que você quer resolver ou comprar hoje?",
    crmField: "purpose",
    weight: 15,
    required: true,
  },
  {
    id: "main_pain",
    label: "Dor principal",
    question: "Qual problema mais te incomoda nesse assunto hoje?",
    crmField: "main_pain",
    weight: 20,
    required: true,
  },
  {
    id: "volume_or_context",
    label: "Volume ou contexto",
    question: "Qual é o tamanho da sua demanda ou do seu contexto atual?",
    crmField: "volume_or_context",
    weight: 10,
    required: false,
  },
  {
    id: "budget_or_ticket",
    label: "Valor ou orcamento",
    question: "Você já tem uma faixa de investimento ou valor esperado?",
    crmField: "budget",
    weight: 15,
    required: false,
  },
  {
    id: "urgency",
    label: "Prazo",
    question: "Você quer resolver isso agora, esta semana, este mês ou está apenas pesquisando?",
    crmField: "timeframe",
    weight: 15,
    required: true,
  },
  {
    id: "decision_authority",
    label: "Decisor",
    question: "Quem decide esse tipo de compra: você mesmo ou mais alguém participa?",
    crmField: "decision_authority",
    weight: 10,
    required: true,
  },
  {
    id: "objection",
    label: "Objecao",
    question: "Qual seria sua maior dúvida antes de avançar?",
    crmField: "objections",
    weight: 10,
    required: false,
  },
  {
    id: "next_step_acceptance",
    label: "Proximo passo",
    question: "Se fizer sentido, você toparia ver uma demonstração ou receber uma proposta objetiva?",
    crmField: "next_step_acceptance",
    weight: 5,
    required: true,
  },
];

describe("lead qualification configuration", () => {
  it("uses the global default playbook until the customer customizes qualification", () => {
    const normalized = normalizeLeadQualificationConfig(undefined);

    expect(normalized.enabled).toBe(true);
    expect(normalized.maxQuestionsPerConversation).toBe(4);
    expect(normalized.questions.map((question) => question.label)).toEqual([
      "Necessidade",
      "Contexto",
      "Prazo",
      "Objecao",
    ]);
    expect(defaultLeadQualificationQuestions).toHaveLength(4);
    expect(isLeadQualificationPlaybookActive(normalized)).toBe(true);
    expect(buildLeadQualificationInstruction(normalized).join("\n")).toContain("template global da ConnectyHub");
  });

  it("upgrades old unconfigured placeholders to the global default playbook", () => {
    const legacyImplicitDefault = {
      enabled: true,
      productName: "",
      commercialObjective: legacyDefaultCommercialObjective,
      qualifyThreshold: 70,
      vipThreshold: 85,
      maxQuestionsPerConversation: 6,
      askOneQuestionAtATime: true,
      questions: oldImplicitDefaultQuestions,
    };
    const previousDisabledDefault = {
      enabled: false,
      productName: "",
      commercialObjective: legacyDefaultCommercialObjective,
      qualifyThreshold: 70,
      vipThreshold: 85,
      maxQuestionsPerConversation: 6,
      askOneQuestionAtATime: true,
      questions: [],
    };

    const legacyNormalized = normalizeLeadQualificationConfig(legacyImplicitDefault, { persisted: true });
    const disabledNormalized = normalizeLeadQualificationConfig(previousDisabledDefault, { persisted: true });

    expect(legacyNormalized.enabled).toBe(true);
    expect(legacyNormalized.questions).toEqual(defaultLeadQualificationQuestions);
    expect(isLeadQualificationPlaybookActive(legacyNormalized)).toBe(true);
    expect(disabledNormalized.enabled).toBe(true);
    expect(disabledNormalized.questions).toEqual(defaultLeadQualificationQuestions);
    expect(isLeadQualificationPlaybookActive(disabledNormalized)).toBe(true);
  });

  it("keeps explicitly disabled panel playbooks paused", () => {
    const disabled = markLeadQualificationConfigConfigured({
      ...defaultLeadQualificationConfig,
      enabled: false,
      questions: [],
    }, "2026-09-04T12:00:00.000Z");
    const normalized = normalizeLeadQualificationConfig(disabled, { persisted: true });

    expect(normalized.configuredAt).toBe("2026-09-04T12:00:00.000Z");
    expect(normalized.enabled).toBe(false);
    expect(normalized.questions).toEqual([]);
    expect(isLeadQualificationPlaybookActive(normalized)).toBe(false);
  });

  it("keeps customer-configured panel playbooks active and humanized", () => {
    const configured = markLeadQualificationConfigConfigured({
      enabled: true,
      productName: "Plano premium",
      commercialObjective: "Entender se o lead quer contratar agora.",
      questions: [
        {
          id: "urgency",
          label: "Urgencia",
          question: "Você quer começar agora ou ainda está comparando?",
          crmField: "timeframe",
          weight: 20,
          required: true,
        },
      ],
    } satisfies Partial<LeadQualificationConfig>, "2026-09-04T12:00:00.000Z");
    const instructions = buildLeadQualificationInstruction(configured);

    expect(configured.configuredAt).toBe("2026-09-04T12:00:00.000Z");
    expect(isLeadQualificationPlaybookActive(configured)).toBe(true);
    expect(instructions.join("\n")).toContain("Use somente perguntas do playbook ativo");
    expect(instructions.join("\n")).toContain("nao bloqueie a venda por qualificacao");
  });

  it("only persists qualification when the panel sends an explicit qualification update", () => {
    expect(clientWorkspaceSource).toContain("markLeadQualificationConfigConfigured(input.qualificationConfig, now)");
    expect(clientWorkspaceSource).toContain("normalizeLeadQualificationConfig(readRecord(agent?.metadata)?.[leadQualificationConfigKey], { persisted: true })");
    expect(adminConsoleSource).toContain("markLeadQualificationConfigConfigured(input.qualificationConfig, now)");
    expect(adminConsoleSource).toContain("normalizeLeadQualificationConfig(readRecord(agent.metadata)?.[leadQualificationConfigKey], { persisted: true })");
    expect(whatsappConsoleSource).toContain("...(qualificationChanged ? { qualificationConfig: qualificationDraft } : {})");
  });

  it("uses an active playbook guard in the WhatsApp runtime", () => {
    expect(runtimeSource).toContain("isLeadQualificationPlaybookActive(context.qualification)");
    expect(runtimeSource).toContain("normalizeLeadQualificationConfig(readRecord(agent.metadata)?.[leadQualificationConfigKey], { persisted: true })");
    expect(runtimeSource).toContain("qualificationActive = isLeadQualificationPlaybookActive(qualification)");
  });
});
