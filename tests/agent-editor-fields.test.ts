import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { createActivitySetup } from "../src/lib/whatsapp/activity-setup";
import * as templates from "../src/lib/whatsapp/agent-prompt-templates";
import * as behavior from "../src/lib/whatsapp/agent-behavior";
import * as qualification from "../src/lib/leads/qualification";
import { getAgentEditorValidationError } from "../src/lib/whatsapp/agent-editor-validation";

const setup = () => createActivitySetup("academia_suplementos", "Agente Teste");
const source = ts.createSourceFile("console.tsx", readFileSync("src/components/connectyhub-os/whatsapp-console.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers = new Map<string, string>();
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name) handlers.set(node.name.text, node.getText(source));
  ts.forEachChild(node, visit);
}
visit(source);

function editor() {
  const data = setup();
  const names = ["updatePromptTemplateDraft", "updateCloneProfileDraft", "updateQualificationDraft", "updateQualificationQuestion", "addQualificationQuestion", "removeQualificationQuestion", "updateBehavior", "updatePresenceMode", "updateQuoteReplyMode", "selectAudioVoice"];
  const code = `
    let promptTemplateDraft = initial.config;
    let cloneProfileDraft = initial.cloneProfile;
    let qualificationDraft = initial.qualification;
    let behaviorDraft = initial.behavior;
    const setPromptTemplateDraft = next => { promptTemplateDraft = typeof next === 'function' ? next(promptTemplateDraft) : next; };
    const applyProfileToDrafts = setPromptTemplateDraft;
    const setCloneProfileDraft = next => { cloneProfileDraft = next(cloneProfileDraft); };
    const setQualificationDraft = next => { qualificationDraft = next(qualificationDraft); };
    const setBehaviorDraft = next => { behaviorDraft = next(behaviorDraft); };
    ${names.map(name => handlers.get(name)).join("\n")}
    ({ ${names.join(",")}, get: () => ({ promptTemplateDraft, cloneProfileDraft, qualificationDraft, behaviorDraft }) });`;
  return runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
    { initial: data, ...templates, ...behavior, ...qualification, crypto: { randomUUID } }) as {
      updatePromptTemplateDraft: (patch: Partial<templates.AgentPromptBuilderConfig>) => void;
      updateCloneProfileDraft: (patch: Partial<behavior.WhatsappCloneProfile>) => void;
      updateQualificationDraft: (patch: Partial<qualification.LeadQualificationConfig>) => void;
      updateQualificationQuestion: (id: string, patch: Partial<qualification.LeadQualificationQuestion>) => void;
      addQualificationQuestion: () => void;
      removeQualificationQuestion: (id: string) => void;
      updateBehavior: <K extends keyof behavior.WhatsappBehaviorConfig>(key: K, value: behavior.WhatsappBehaviorConfig[K]) => void;
      updatePresenceMode: (value: behavior.WhatsappPresenceMode) => void;
      updateQuoteReplyMode: (value: behavior.WhatsappQuoteReplyMode) => void;
      selectAudioVoice: (voice: { voiceId: string; name: string; source: string; isDefault: boolean; publicOwnerId?: string }) => void;
      get: () => { promptTemplateDraft: templates.AgentPromptBuilderConfig; cloneProfileDraft: behavior.WhatsappCloneProfile; qualificationDraft: qualification.LeadQualificationConfig; behaviorDraft: behavior.WhatsappBehaviorConfig };
    };
}

const phrase = "Primeira frase. Segunda frase.\n\nNovo parágrafo. ";
describe("agent editor drafts", () => {
  it.each(["tone", "objective", "audience", "salesRules", "fulfillmentRules", "humanHandoffRules", "neverRules", "companyComplement"] as const)("clears and retypes prompt %s without eating spaces or newlines", key => {
    const ui = editor();
    ui.updatePromptTemplateDraft({ [key]: "" });
    expect(ui.get().promptTemplateDraft[key]).toBe("");
    for (const char of phrase) {
      const next = ui.get().promptTemplateDraft[key] + char;
      ui.updatePromptTemplateDraft({ [key]: next });
      expect(ui.get().promptTemplateDraft[key]).toBe(next);
    }
    ui.updatePromptTemplateDraft({ [key]: "" });
    expect(templates.normalizeAgentPromptBuilderConfig(ui.get().promptTemplateDraft)[key]).toBe("");
  });
  it.each(["displayName", "roleIdentity", "tone", "vocabulary", "responseRhythm", "salesStyle", "objectionStyle", "closingStyle", "emojiStyle", "audioStyle", "forbiddenPatterns", "notes"] as const)("preserves typing in personality %s even when toggling", key => {
    const ui = editor();
    ui.updateCloneProfileDraft({ [key]: "" });
    expect(ui.get().cloneProfileDraft[key]).toBe("");
    for (const char of phrase) ui.updateCloneProfileDraft({ [key]: ui.get().cloneProfileDraft[key] + char });
    ui.updateCloneProfileDraft({ enabled: false });
    expect(ui.get().cloneProfileDraft[key]).toBe(phrase);
  });
  it("keeps incomplete qualification edits through add/remove and toggles", () => {
    const ui = editor(), first = ui.get().qualificationDraft.questions[0].id;
    ui.updateQualificationQuestion(first, { label: "", question: "Como podemos ajudar? ", crmField: "campo_" });
    ui.updateQualificationDraft({ commercialObjective: "", productName: "Produto novo ", handoffRules: ["Primeira regra ", "", ""] });
    ui.addQualificationQuestion();
    ui.updateQualificationDraft({ enabled: false });
    ui.removeQualificationQuestion(ui.get().qualificationDraft.questions.at(-1)!.id);
    expect(ui.get().qualificationDraft.questions[0]).toMatchObject({ label: "", question: "Como podemos ajudar? ", crmField: "campo_" });
    expect(ui.get().qualificationDraft).toMatchObject({ commercialObjective: "", productName: "Produto novo ", handoffRules: ["Primeira regra ", "", ""] });
  });
  it("limits questions and avoids duplicate CRM fields after deleting and adding", () => {
    const ui = editor();
    ui.addQualificationQuestion(); ui.addQualificationQuestion();
    ui.removeQualificationQuestion(ui.get().qualificationDraft.questions.at(-2)!.id);
    for (let i = 0; i < 25; i++) ui.addQualificationQuestion();
    const questions = ui.get().qualificationDraft.questions;
    expect(questions).toHaveLength(16);
    expect(new Set(questions.map(q => q.id)).size).toBe(16);
    expect(new Set(questions.map(q => q.crmField)).size).toBe(16);
    for (const question of questions) ui.removeQualificationQuestion(question.id);
    expect(ui.get().qualificationDraft.questions).toHaveLength(0);
  });
  it("preserves partial schedules and preferences when toggling agent/presence/quotes", () => {
    const ui = editor();
    ui.updateBehavior("aiScheduleStart", "");
    ui.updateBehavior("followUpTimeWindowStart", "1");
    ui.updateBehavior("aiScheduleTimezone", "America/Sao_");
    ui.updateBehavior("agentEnabled", false);
    ui.updatePresenceMode("natural"); ui.updateQuoteReplyMode("off");
    expect(ui.get().behaviorDraft).toMatchObject({ aiScheduleStart: "", followUpTimeWindowStart: "1", aiScheduleTimezone: "America/Sao_", presenceMode: "natural", alwaysOnline: false, quoteReplyMode: "off", quotedReplyContext: false, agentEnabled: false });
  });
  it.each(["text", "mirror", "audio"] as const)("choosing a voice preserves %s mode, rapport and unrelated fields", mode => {
    const ui = editor();
    ui.updateBehavior("responseMode", mode);
    ui.updateBehavior("adaptiveRapportMode", "strong");
    ui.updateBehavior("aiScheduleStart", "1");
    const before = ui.get().behaviorDraft;
    ui.selectAudioVoice({ voiceId: "voice-test", name: "Voz de teste", source: "customer", isDefault: false });
    expect(ui.get().behaviorDraft).toEqual({ ...before, audioVoiceId: "voice-test", audioVoiceName: "Voz de teste", audioVoiceSource: "customer", audioVoicePublicOwnerId: "", audioModelId: "" });
    const after = ui.get().behaviorDraft;
    ui.selectAudioVoice({ voiceId: "platform-default", name: "Voz padrão", source: "gemini", isDefault: true });
    expect(ui.get().behaviorDraft).toEqual({ ...after, audioVoiceId: "", audioVoiceName: "Voz padrão", audioVoiceSource: "gemini", audioVoicePublicOwnerId: "", audioModelId: "" });
  });
  it("still supplies defaults when a prompt field is missing in legacy data", () => {
    expect(templates.normalizeAgentPromptBuilderConfig({ templateId: "academia_suplementos" }).tone).toBeTruthy();
    expect(templates.normalizeAgentPromptBuilderConfig({ templateId: "academia_suplementos", tone: "" }).tone).toBe("");
  });
  it("passes low-qualification signals and next-step rules to the CRM analysis", () => {
    const config = setup().qualification;
    config.disqualifiers = ["Busca uma modalidade que não oferecemos"];
    config.handoffRules = ["Pedido de visita deve ir para a recepção"];
    const prompt = qualification.buildLeadQualificationAnalysisPrompt({ config, organizationName: "Empresa", leadName: null, leadMetadata: null, conversationText: "Preciso de informações" });
    expect(prompt).toContain(config.disqualifiers[0]);
    expect(prompt).toContain(config.handoffRules[0]);
    expect(prompt).toContain("somente se estiver comprovado");
  });
});

function validInput() {
  const data = setup();
  return { prompt: "Instruções de teste.", promptConfig: data.config, cloneProfile: data.cloneProfile, qualification: data.qualification, behavior: data.behavior };
}
describe("agent editor save validation", () => {
  it.each(templates.agentPromptTemplates)("accepts the initial fields for $label", ({ id }) => {
    const data = createActivitySetup(id, "Agente Teste");
    const prompt = templates.buildAgentPromptFromTemplate({ config: data.config, companyName: "Empresa Teste", agentName: "Agente Teste" });
    expect(getAgentEditorValidationError({ prompt, promptConfig: data.config, cloneProfile: data.cloneProfile, qualification: data.qualification, behavior: data.behavior })).toBeNull();
  });
  it("accepts the activity defaults and explicitly cleared optional rules", () => {
    const input = validInput(); input.promptConfig.tone = ""; input.cloneProfile.notes = "";
    expect(getAgentEditorValidationError(input)).toBeNull();
  });
  it.each(["", "25:00", "12:60", "9:00", "abc"])("rejects unfinished/invalid schedule %s", value => {
    const input = validInput(); input.behavior.aiScheduleStart = value;
    expect(getAgentEditorValidationError(input)).toContain("horários");
  });
  it("accepts overnight windows and rejects an invalid timezone", () => {
    const input = validInput(); input.behavior.aiScheduleStart = "23:00"; input.behavior.aiScheduleEnd = "06:00";
    expect(getAgentEditorValidationError(input)).toBeNull();
    input.behavior.aiScheduleTimezone = "America/Invalid";
    expect(getAgentEditorValidationError(input)).toContain("fuso");
  });
  it("rejects VIP below qualified", () => {
    const input = validInput(); input.qualification.vipThreshold = 40;
    expect(getAgentEditorValidationError(input)).toContain("VIP");
  });
  it("rejects empty questions and duplicate normalized CRM keys", () => {
    const input = validInput(); input.qualification.questions[0].question = "";
    expect(getAgentEditorValidationError(input)).toContain("pergunta 1");
    input.qualification.questions[0].question = "Pergunta válida?";
    input.qualification.questions[0].crmField = "Área comercial";
    input.qualification.questions[1].crmField = "area_comercial";
    expect(getAgentEditorValidationError(input)).toContain("já está em uso");
  });
  it("warns instead of silently truncating text or list entries", () => {
    const input = validInput(); input.promptConfig.tone = "x".repeat(1601);
    expect(getAgentEditorValidationError(input)).toContain("sem cortes");
    input.promptConfig.tone = ""; input.qualification.handoffRules = Array.from({ length: 9 }, (_, i) => `Regra ${i}`);
    expect(getAgentEditorValidationError(input)).toContain("8 linhas");
  });
});
