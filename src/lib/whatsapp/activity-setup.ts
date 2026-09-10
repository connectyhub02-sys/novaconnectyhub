import { defaultLeadQualificationConfig, normalizeLeadQualificationConfig, type LeadQualificationConfig } from "../leads/qualification";
import { activityPresetVersion } from "./activity-presets";
import { createActivityPromptConfig, getAgentActivityPreset, getAgentPromptTemplate, type AgentPromptBuilderConfig } from "./agent-prompt-templates";
import { defaultWhatsappBehaviorConfig, normalizeWhatsappBehaviorConfig, normalizeWhatsappCloneProfile, type WhatsappBehaviorConfig, type WhatsappCloneProfile } from "./agent-behavior";

export function createActivityCloneProfile(templateId: unknown, agentName: string): WhatsappCloneProfile {
  const template = getAgentPromptTemplate(templateId);
  const preset = getAgentActivityPreset(template.id);
  return {
    enabled: true, source: "activity", activityTemplateId: template.id, useAgentName: true,
    displayName: agentName.slice(0, 80), roleIdentity: preset.identity, tone: preset.tone,
    vocabulary: preset.vocabulary,
    responseRhythm: `Mensagens curtas, uma pergunta por vez. ${preset.playbook[0]} Não refaça perguntas já respondidas.`,
    salesStyle: preset.playbook.join("\n"), objectionStyle: preset.objection, closingStyle: preset.closing,
    emojiStyle: preset.style === "discreet" ? "Evite emojis em assuntos sensíveis. Quando permitidos nas preferências, use somente um símbolo discreto e útil, sem celebrações ou intimidade."
      : preset.style === "warm" ? "Use no máximo um emoji pertinente à mensagem, quando o cliente der abertura. Não substitua informações do pedido por emojis."
        : "Use emojis com moderação, quando ajudarem a organizar a conversa. Evite fogo, coração ou brincadeiras em negociações e reclamações.",
    audioStyle: `Se o modo de resposta permitir áudio e houver voz disponível, fale de forma clara e breve. ${preset.tone} Valores, endereços e condições importantes também precisam ficar claros em texto.`,
    forbiddenPatterns: preset.care,
    notes: `Referência de abordagem: ${preset.example} Adapte ao contexto; não repita como bordão.`,
  };
}

export function createActivityQualification(templateId: unknown): LeadQualificationConfig {
  const template = getAgentPromptTemplate(templateId);
  const preset = getAgentActivityPreset(template.id);
  const points = Math.floor(80 / preset.questions.length);
  return {
    ...defaultLeadQualificationConfig,
    activityTemplateId: template.id, activityVersion: activityPresetVersion, customized: false,
    commercialObjective: preset.objective,
    maxQuestionsPerConversation: preset.questions.length + 1,
    questions: [
      ...preset.questions.map(([id, label, question], index) => ({
        id, label, question, crmField: id,
        weight: points + (index === 0 ? 80 - points * preset.questions.length : 0), required: index < 2,
      })),
      { id: "objection", label: "Dúvidas e objeções", question: "Ficou alguma dúvida sobre o próximo passo?", crmField: "objections", weight: 20, required: false },
    ],
    disqualifiers: [], handoffRules: [preset.handoff],
  };
}

export function createActivityBehavior(templateId: unknown): WhatsappBehaviorConfig {
  const preset = getAgentActivityPreset(templateId);
  return normalizeWhatsappBehaviorConfig({
    ...defaultWhatsappBehaviorConfig,
    conversationStyle: preset.style, textEmojis: preset.style !== "discreet",
    emojiReactions: preset.style !== "discreet", reactionProbability: preset.style === "warm" ? 25 : 10,
    sendStickers: false, smallTalk: false, spontaneousAudio: false, responseMode: "text",
    interactiveMessages: true, qualityMetrics: true,
  });
}

/** Shared by the editor and server. Existing explicit customizations survive a profile change. */
export function applyActivitySetup(input: {
  config: AgentPromptBuilderConfig; agentName: string; previousTemplateId?: unknown;
  cloneProfile?: unknown; qualification?: unknown; behavior?: unknown;
}) {
  const defaults = createActivityCloneProfile(input.config.templateId, input.agentName);
  const previous = normalizeWhatsappCloneProfile(input.cloneProfile);
  let cloneProfile = defaults;
  if (previous.activityTemplateId) {
    const oldDefaults = createActivityCloneProfile(previous.activityTemplateId, previous.displayName);
    cloneProfile = { ...defaults, enabled: previous.enabled, source: previous.source, useAgentName: previous.useAgentName };
    const fields = ["roleIdentity", "tone", "vocabulary", "responseRhythm", "salesStyle", "objectionStyle", "closingStyle", "emojiStyle", "audioStyle", "forbiddenPatterns", "notes"] as const;
    for (const key of fields) if (previous[key] !== oldDefaults[key]) cloneProfile[key] = previous[key];
    if (previous.useAgentName === false) cloneProfile.displayName = previous.displayName;
  } else if (Object.entries(previous).some(([key, value]) => key !== "source" && typeof value === "string" && value.trim())) {
    cloneProfile = previous;
  }
  const previousQualification = normalizeLeadQualificationConfig(input.qualification);
  const isUnchangedGlobal = !previousQualification.configuredAt && !previousQualification.activityTemplateId
    && JSON.stringify(previousQualification) === JSON.stringify(defaultLeadQualificationConfig);
  const isUnchangedActivity = previousQualification.activityTemplateId && !previousQualification.customized
    && JSON.stringify({ ...previousQualification, configuredAt: null }) === JSON.stringify(normalizeLeadQualificationConfig(createActivityQualification(previousQualification.activityTemplateId)));
  const qualification = !input.qualification || isUnchangedGlobal || isUnchangedActivity
    ? createActivityQualification(input.config.templateId) : previousQualification;
  const behavior = input.behavior ? normalizeWhatsappBehaviorConfig(input.behavior) : createActivityBehavior(input.config.templateId);
  if (input.behavior) {
    const oldBehavior = input.previousTemplateId ? createActivityBehavior(input.previousTemplateId) : { ...behavior };
    const newBehavior = createActivityBehavior(input.config.templateId);
    const fields = ["conversationStyle", "textEmojis", "emojiReactions", "reactionProbability", "sendStickers", "smallTalk", "spontaneousAudio", "responseMode"] as const;
    for (const key of fields) {
      if (!behavior.customizedStyleFields?.includes(key) && behavior[key] === oldBehavior[key]) Object.assign(behavior, { [key]: newBehavior[key] });
    }
  }
  return { config: input.config, cloneProfile, qualification, behavior };
}

export function createActivitySetup(templateId: unknown, agentName: string) {
  return applyActivitySetup({ config: createActivityPromptConfig(templateId), agentName });
}

/** One precedence for dashboard and runtime; explicit agent settings beat global defaults. */
export function resolveWhatsappBehavior(input: { instance?: unknown; agent?: unknown; global?: unknown }) {
  return normalizeWhatsappBehaviorConfig(input.instance ?? input.agent ?? input.global);
}
