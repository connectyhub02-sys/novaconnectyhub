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

describe("lead qualification configuration", () => {
  it("keeps qualification disabled until the customer configures a playbook", () => {
    const normalized = normalizeLeadQualificationConfig(undefined);

    expect(normalized.enabled).toBe(false);
    expect(normalized.questions).toEqual([]);
    expect(isLeadQualificationPlaybookActive(normalized)).toBe(false);
    expect(buildLeadQualificationInstruction(normalized)).toEqual([]);
  });

  it("treats the old implicit default playbook as unconfigured when reading persisted agents", () => {
    const legacyImplicitDefault = {
      enabled: true,
      productName: "",
      commercialObjective: defaultLeadQualificationConfig.commercialObjective,
      qualifyThreshold: 70,
      vipThreshold: 85,
      maxQuestionsPerConversation: 6,
      askOneQuestionAtATime: true,
      questions: defaultLeadQualificationQuestions,
    };

    const normalized = normalizeLeadQualificationConfig(legacyImplicitDefault, { persisted: true });

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
    expect(instructions.join("\n")).toContain("Use somente perguntas configuradas pelo cliente no painel");
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
