import { describe, expect, it } from "vitest";
import { activityPresets } from "../src/lib/whatsapp/activity-presets";
import { agentPromptTemplates, buildAgentPromptFromTemplate, createActivityPromptConfig, normalizeAgentPromptBuilderConfig, switchActivityPromptConfig } from "../src/lib/whatsapp/agent-prompt-templates";
import { applyActivityCloneProfile, applyActivityQualification, applyActivitySetup, createActivitySetup, resolveWhatsappBehavior, shouldApplyActivitySetup } from "../src/lib/whatsapp/activity-setup";
import { normalizeWhatsappBehaviorConfig, normalizeWhatsappCloneProfile } from "../src/lib/whatsapp/agent-behavior";
import { buildLeadQualificationAnalysisPrompt, buildLeadQualificationInstruction, defaultLeadQualificationConfig, markLeadQualificationConfigConfigured, normalizeLeadQualificationConfig } from "../src/lib/leads/qualification";
import { applyTextEmojiPreference, selectConversationReaction } from "../src/lib/whatsapp/conversation-style";
import * as setupModule from "../src/lib/whatsapp/activity-setup";
import * as templatesModule from "../src/lib/whatsapp/agent-prompt-templates";
import * as behaviorModule from "../src/lib/whatsapp/agent-behavior";
import * as qualificationModule from "../src/lib/leads/qualification";
import * as responsiblesModule from "../src/lib/agents/responsible-human";
import * as channelModule from "../src/lib/agents/multichannel";
import { commerceDatabase } from "./helpers/commerce-database";
import { serverModuleHarness } from "./helpers/server-module-harness";
import { runtimeHarness } from "./helpers/whatsapp-runtime-harness";

describe("activity-specific agent setup", () => {
  it.each(agentPromptTemplates)("replaces saved generic CRM questions with $label questions", ({ id }) => {
    const saved = markLeadQualificationConfigConfigured(defaultLeadQualificationConfig, "2026-09-11T12:00:00Z");
    const updated = applyActivityQualification(id, saved);
    expect(updated.activityTemplateId).toBe(id);
    expect(updated.questions.slice(0, -1).map(question => question.question)).toEqual(activityPresets[id].questions.map(([, , question]) => question));
    const instructions = buildLeadQualificationInstruction(updated).join("\n");
    const analysisPrompt = buildLeadQualificationAnalysisPrompt({ config: updated, organizationName: "Negócio", leadName: null, conversationText: "Conversa de teste", leadMetadata: null });
    for (const question of updated.questions) {
      expect(instructions).toContain(question.question);
      expect(analysisPrompt).toContain(`campo=${question.crmField}; peso=${question.weight}`);
    }
    expect(instructions).toContain(activityPresets[id].handoff);
    expect(saved).toEqual(markLeadQualificationConfigConfigured(defaultLeadQualificationConfig, "2026-09-11T12:00:00Z"));
  });
  it("applies profession qualification even when the technical prompt is manual", () => {
    const config = { ...createActivityPromptConfig("corretor_imoveis"), mode: "manual" as const };
    const saved = markLeadQualificationConfigConfigured(defaultLeadQualificationConfig);
    expect(applyActivitySetup({ config, agentName: "Corretor", qualification: saved }).qualification.activityTemplateId).toBe("corretor_imoveis");
  });
  it("migrates the screenshot's generic questions while keeping objection required across activity changes", () => {
    const saved = markLeadQualificationConfigConfigured({
      ...defaultLeadQualificationConfig,
      questions: defaultLeadQualificationConfig.questions.map(question => ({ ...question, required: true })),
    });
    const broker = applyActivityQualification("corretor_imoveis", saved);
    expect(broker.activityTemplateId).toBe("corretor_imoveis");
    expect(broker.questions.slice(0, -1).map(question => question.question)).toEqual(activityPresets.corretor_imoveis.questions.map(([, , question]) => question));
    expect(broker.questions.find(question => question.id === "objection")?.required).toBe(true);
    const lawyer = applyActivityQualification("advogado", markLeadQualificationConfigConfigured(broker));
    expect(lawyer.activityTemplateId).toBe("advogado");
    expect(lawyer.questions.find(question => question.id === "objection")?.required).toBe(true);
    const customized = { ...saved, questions: saved.questions.map(question => question.id === "objection" ? { ...question, question: "Existe alguma restrição para a visita?" } : question) };
    expect(applyActivityQualification("corretor_imoveis", customized)).toEqual(customized);
  });
  it("preserves genuine edits and disabled qualification in saved legacy profiles", () => {
    const saved = markLeadQualificationConfigConfigured(defaultLeadQualificationConfig);
    for (const value of [
      { ...saved, enabled: false },
      { ...saved, commercialObjective: "Atender exclusivamente locações comerciais" },
      { ...saved, questions: saved.questions.map((question, index) => index ? question : { ...question, question: "Qual imóvel você deseja anunciar?" }) },
      { ...saved, questions: [] },
    ]) expect(applyActivityQualification("corretor_imoveis", value)).toEqual(normalizeLeadQualificationConfig(value));
  });
  it.each(agentPromptTemplates)("prepares $label without freeform input and survives storage normalization", ({ id }) => {
    const setup = createActivitySetup(id, "Lia");
    const preset = activityPresets[id];
    const prompt = buildAgentPromptFromTemplate({ config: setup.config, agentName: "Lia", companyName: "Nome cadastrado" });
    expect(prompt.length).toBeLessThanOrEqual(8000);
    expect(prompt).toContain(preset.identity);
    expect(prompt).toContain(preset.objection);
    expect(prompt).toContain(preset.example);
    expect(setup.cloneProfile.enabled).toBe(true);
    expect(setup.cloneProfile.displayName).toBe("Lia");
    expect(setup.cloneProfile.vocabulary).toBe(preset.vocabulary);
    expect(normalizeWhatsappCloneProfile(JSON.parse(JSON.stringify(setup.cloneProfile)))).toEqual(setup.cloneProfile);
    expect(normalizeLeadQualificationConfig(JSON.parse(JSON.stringify(setup.qualification)), { persisted: true })).toEqual(setup.qualification);
    expect(setup.qualification.questions.map((question) => question.question)).toEqual([...preset.questions.map(([, , question]) => question), "Ficou alguma dúvida sobre o próximo passo?"]);
    expect(setup.qualification.questions.reduce((total, question) => total + question.weight, 0)).toBe(100);
    expect(setup.qualification.questions.find((question) => question.id === "objection")?.required).toBe(false);
    expect(setup.config.fulfillmentRules).toBe(preset.fulfillment);
    expect(setup.behavior.agentEnabled).toBe(true);
    expect(setup.behavior.responseMode).toBe("mirror");
  });

  it.each([
    ["corretor_imoveis", "imobiliaria"], ["advogado", "escritorio_advocacia"], ["contador", "escritorio_contabilidade"],
    ["dentista", "clinica_odontologica"], ["esteticista", "estetica_clinica"], ["personal_trainer", "academia_suplementos"],
    ["professor_particular", "educacao_cursos"], ["arquiteto", "escritorio_arquitetura"], ["corretor_seguros", "corretora_seguros"],
  ] as const)("distinguishes %s from %s beyond labels", (professional, company) => {
    const left = activityPresets[professional]; const right = activityPresets[company];
    expect(left.kind).toBe("professional"); expect(right.kind).toBe("company");
    for (const key of ["identity", "objective", "vocabulary", "playbook", "questions", "handoff", "objection", "closing", "example"] as const) expect(left[key]).not.toEqual(right[key]);
  });

  it("keeps legacy text in manual mode until the customer applies a profile", () => {
    expect(normalizeAgentPromptBuilderConfig({ templateId: "imobiliaria" }).mode).toBe("manual");
    expect(createActivityPromptConfig("corretor_imoveis").mode).toBe("automatic");
  });

  it.each(agentPromptTemplates)("fills a legacy empty personality for $label independently of manual prompt mode", ({ id }) => {
    const previous = normalizeAgentPromptBuilderConfig({ templateId: "imobiliaria" });
    const config = { ...switchActivityPromptConfig(previous, id), mode: "manual" as const };
    expect(shouldApplyActivitySetup(previous, config)).toBe(true);
    const next = applyActivitySetup({ config, agentName: "Renata Clone", cloneProfile: normalizeWhatsappCloneProfile({}) });
    expect(next.config.mode).toBe("manual");
    expect(next.cloneProfile).toEqual(createActivitySetup(id, "Renata Clone").cloneProfile);
    expect(next.cloneProfile.enabled).toBe(true);
  });

  it("changes personality from company to professional after a manual prompt was already saved", () => {
    const previous = createActivitySetup("imobiliaria", "Renata Clone");
    previous.config.mode = "manual";
    previous.cloneProfile.vocabulary = "Vocabulário escolhido pelo usuário";
    const config = { ...switchActivityPromptConfig(previous.config, "corretor_imoveis"), mode: "manual" as const };
    expect(shouldApplyActivitySetup(previous.config, config)).toBe(true);
    const next = applyActivitySetup({ config, agentName: "Renata Clone", cloneProfile: previous.cloneProfile });
    expect(next.config.mode).toBe("manual");
    expect(next.cloneProfile.roleIdentity).toBe(activityPresets.corretor_imoveis.identity);
    expect(next.cloneProfile.closingStyle).toBe(activityPresets.corretor_imoveis.closing);
    expect(next.cloneProfile.vocabulary).toBe(previous.cloneProfile.vocabulary);
  });

  it("fills only missing legacy fields while retaining custom content, signature and paused state", () => {
    const previous = normalizeWhatsappCloneProfile({ enabled: false, displayName: "Assinatura própria", vocabulary: "Expressões escolhidas" });
    const next = applyActivityCloneProfile("corretor_imoveis", "Renata Clone", previous);
    expect(next.enabled).toBe(false);
    expect(next.displayName).toBe(previous.displayName);
    expect(next.useAgentName).toBe(false);
    expect(next.vocabulary).toBe(previous.vocabulary);
    expect(next.roleIdentity).toBe(activityPresets.corretor_imoveis.identity);
    expect(next.activityTemplateId).toBe("corretor_imoveis");
    const switched = applyActivityCloneProfile("imobiliaria", "Renata Clone", next);
    expect(switched.roleIdentity).toBe(activityPresets.imobiliaria.identity);
    expect(switched.vocabulary).toBe(previous.vocabulary);
  });

  it("does not refill a field deliberately cleared after applying a profile", () => {
    const previous = createActivitySetup("corretor_imoveis", "Renata Clone").cloneProfile;
    previous.vocabulary = "";
    previous.enabled = false;
    const next = applyActivityCloneProfile("imobiliaria", "Renata Clone", previous);
    expect(next.vocabulary).toBe("");
    expect(next.enabled).toBe(false);
  });

  it("moves preset fields together while preserving user overrides, pauses and linked identity", () => {
    const previous = createActivitySetup("corretor_imoveis", "Lia");
    previous.cloneProfile.enabled = false;
    previous.cloneProfile.vocabulary = "Use somente expressões escolhidas pelo cliente.";
    previous.config.fulfillmentRules = "Atender visitas aos sábados quando confirmadas.";
    previous.behavior.agentEnabled = false;
    const next = applyActivitySetup({ config: switchActivityPromptConfig(previous.config, "imobiliaria"), previousTemplateId: "corretor_imoveis",
      agentName: "Ana", cloneProfile: previous.cloneProfile, qualification: previous.qualification, behavior: previous.behavior });
    expect(next.cloneProfile.enabled).toBe(false);
    expect(next.cloneProfile.displayName).toBe("Ana");
    expect(next.cloneProfile.vocabulary).toBe(previous.cloneProfile.vocabulary);
    expect(next.cloneProfile.roleIdentity).toBe(activityPresets.imobiliaria.identity);
    expect(next.config.fulfillmentRules).toBe(previous.config.fulfillmentRules);
    expect(next.qualification.activityTemplateId).toBe("imobiliaria");
    expect(next.behavior.agentEnabled).toBe(false);
  });

  it("preserves a custom signature and a deliberately disabled qualification", () => {
    const previous = createActivitySetup("contador", "Lia");
    previous.cloneProfile.useAgentName = false; previous.cloneProfile.displayName = "Atendimento pessoal";
    previous.qualification.customized = true; previous.qualification.enabled = false;
    const next = applyActivitySetup({ config: createActivityPromptConfig("escritorio_contabilidade"), agentName: "Ana",
      cloneProfile: previous.cloneProfile, qualification: previous.qualification });
    expect(next.cloneProfile.displayName).toBe("Atendimento pessoal");
    expect(next.qualification.enabled).toBe(false);
    expect(next.qualification).toEqual(previous.qualification);
  });

  it("does not overwrite a DNA imported from history", () => {
    const previous = normalizeWhatsappCloneProfile({ source: "history", enabled: false, vocabulary: "Expressões do histórico", displayName: "Nome próprio" });
    const next = applyActivitySetup({ config: createActivityPromptConfig("advogado"), agentName: "Lia", cloneProfile: previous });
    expect(next.cloneProfile).toEqual(previous);
  });

  it("preserves qualification edited through integrations even without a customized marker", () => {
    const previous = createActivitySetup("contador", "Lia");
    previous.qualification.questions[0].question = "Qual é a sua necessidade contábil específica?";
    const next = applyActivitySetup({ config: createActivityPromptConfig("escritorio_contabilidade"), agentName: "Lia", qualification: previous.qualification });
    expect(next.qualification).toEqual(previous.qualification);
  });

  it("respects explicit style choices across normalization and activity changes", () => {
    const previous = createActivitySetup("advogado", "Lia");
    const behavior = normalizeWhatsappBehaviorConfig({ ...previous.behavior, emojiReactions: false, reactionProbability: 0,
      spontaneousAudio: false, cloneMemory: false, qualityMetrics: false, customizedStyleFields: ["emojiReactions", "reactionProbability"] });
    expect(behavior.emojiReactions).toBe(false); expect(behavior.spontaneousAudio).toBe(false);
    expect(behavior.cloneMemory).toBe(false); expect(behavior.qualityMetrics).toBe(false);
    const next = applyActivitySetup({ config: createActivityPromptConfig("pizzaria_delivery"), previousTemplateId: "advogado", agentName: "Lia", behavior });
    expect(next.behavior.emojiReactions).toBe(false); expect(next.behavior.reactionProbability).toBe(0);
    expect(next.behavior.conversationStyle).toBe("warm");
  });

  it("uses the same behavior precedence with or without a connected instance", () => {
    expect(resolveWhatsappBehavior({ agent: { emojiReactions: false }, global: { emojiReactions: true } }).emojiReactions).toBe(false);
    expect(resolveWhatsappBehavior({ instance: { emojiReactions: false }, agent: { emojiReactions: true } }).emojiReactions).toBe(false);
  });

  it("filters emojis without losing numbers, currency or accents", () => {
    expect(applyTextEmojiPreference("Olá 👩🏽‍💻! R$ 150,00 ✅ nº 12 🇧🇷", { textEmojis: false })).toBe("Olá ! R$ 150,00 nº 12");
    expect(applyTextEmojiPreference("Olá 👋", { textEmojis: true })).toBe("Olá 👋");
  });

  it("does not react playfully to sensitive messages", () => {
    expect(selectConversationReaction("Obrigado, mas estou com dor", "warm")).toBeNull();
    expect(selectConversationReaction("Obrigado pelo atendimento", "discreet")).toBe("👍");
    expect(selectConversationReaction("top demais", "discreet")).toBeNull();
  });

  it("uses the current automatic activity prompt at runtime and preserves manual text", () => {
    const call = runtimeHarness();
    const context = { organization: { name: "Nome cadastrado" }, agent: { name: "Lia", prompt: "TEXTO ANTIGO DE OUTRA ATIVIDADE", metadata: { prompt_builder_config: createActivityPromptConfig("advogado") } }, knowledge: [], salesCatalog: [] };
    const prompt = call<string>("resolveRuntimeAgentPrompt", context);
    expect(prompt).toContain(activityPresets.advogado.identity);
    expect(prompt).not.toContain("TEXTO ANTIGO");
    context.agent.metadata.prompt_builder_config.mode = "manual";
    expect(call("resolveRuntimeAgentPrompt", context)).toBe("TEXTO ANTIGO DE OUTRA ATIVIDADE");
  });

  it.each([undefined, "Atenda exclusivamente conforme estas instruções personalizadas."])("persists the activity setup and respects an explicit prompt (%s)", async (customPrompt) => {
    const db = commerceDatabase({ agent_registry: [] });
    const api = serverModuleHarness<{ createClientAgent: (input: Record<string, unknown>) => Promise<unknown> }>("src/lib/client-os/agents.ts", {
      "@/lib/leads/qualification": qualificationModule,
      "@/lib/whatsapp/activity-setup": setupModule,
      "@/lib/whatsapp/agent-prompt-templates": templatesModule,
      "@/lib/whatsapp/agent-behavior": behaviorModule,
      "@/lib/agents/responsible-human": responsiblesModule,
      "@/lib/agents/multichannel": channelModule,
      "@/lib/billing/trial": { assertBillableAccess: async () => {}, getOrganizationPlanLimits: async () => ({ agentLimit: 10 }) },
      "./companies": { requireClientCompanyAccess: async () => ({ id: "company-1", name: "Nome do profissional" }) },
    });
    await api.createClientAgent({ client: db.client, userId: "owner", companyId: "company-1", name: "Lia", prompt: customPrompt, promptTemplateConfig: createActivityPromptConfig("contador"), responsibleHumans: [{ name: "Responsável", phone: "5511999999999" }] });
    expect(db.tables.agent_registry).toHaveLength(1);
    const row = db.tables.agent_registry[0];
    const metadata = row.metadata as Record<string, unknown>;
    if (customPrompt) expect(row.prompt).toBe(customPrompt);
    else expect(row.prompt).toContain(activityPresets.contador.identity);
    expect(normalizeAgentPromptBuilderConfig(metadata.prompt_builder_config).mode).toBe(customPrompt ? "manual" : "automatic");
    expect(normalizeWhatsappCloneProfile(metadata.whatsapp_clone_profile).enabled).toBe(true);
    expect(normalizeWhatsappCloneProfile(metadata.whatsapp_clone_profile).objectionStyle).toBe(activityPresets.contador.objection);
    expect(normalizeLeadQualificationConfig(metadata.lead_qualification_config, { persisted: true }).activityTemplateId).toBe("contador");
    expect(normalizeWhatsappBehaviorConfig(metadata.whatsapp_behavior_config).emojiReactions).toBe(true);
  });
});
