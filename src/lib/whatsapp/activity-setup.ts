import { defaultLeadQualificationConfig, normalizeLeadQualificationConfig, type LeadQualificationConfig } from "../leads/qualification";
import { activityAnswerOptions } from "../leads/activity-answer-options";
import { fillMissingQualificationAnswers } from "../leads/qualification-answer-defaults";
import { activityClosing, activityExample, activityRepresentation } from "./activity-profile";
import { createActivityPromptConfig, getAgentActivityPreset, getAgentPromptTemplate, type AgentPromptBuilderConfig } from "./agent-prompt-templates";
import { defaultWhatsappBehaviorConfig, normalizeWhatsappBehaviorConfig, normalizeWhatsappBehaviorSettings, normalizeWhatsappCloneProfile, type WhatsappBehaviorConfig, type WhatsappCloneProfile } from "./agent-behavior";

export function createActivityCloneProfile(templateId: unknown, agentName: string): WhatsappCloneProfile {
  const template = getAgentPromptTemplate(templateId);
  const preset = getAgentActivityPreset(template.id);
  return {
    enabled: true, source: "activity", activityTemplateId: template.id, useAgentName: true,
    displayName: agentName.slice(0, 80), roleIdentity: activityRepresentation(template.id), tone: preset.tone,
    vocabulary: preset.vocabulary,
    responseRhythm: `Mensagens curtas, uma pergunta por vez. ${preset.playbook[0]} Não refaça perguntas já respondidas.`,
    salesStyle: preset.playbook.join("\n"), objectionStyle: preset.objection, closingStyle: activityClosing(template.id),
    emojiStyle: preset.style === "discreet" ? "Evite emojis em assuntos sensíveis. Quando permitidos nas preferências, use somente um símbolo discreto e útil, sem celebrações ou intimidade."
      : preset.style === "warm" ? "Use no máximo um emoji pertinente à mensagem, quando o cliente der abertura. Não substitua informações do pedido por emojis."
        : "Use emojis com moderação, quando ajudarem a organizar a conversa. Evite fogo, coração ou brincadeiras em negociações e reclamações.",
    audioStyle: `Se o modo de resposta permitir áudio e houver voz disponível, fale de forma clara e breve. ${preset.tone} Valores, endereços e condições importantes também precisam ficar claros em texto.`,
    forbiddenPatterns: preset.care,
    notes: `Referência de abordagem: ${activityExample(template.id)} Adapte ao contexto; não repita como bordão.`,
  };
}

export function createActivityQualification(templateId: unknown): LeadQualificationConfig {
  const template = getAgentPromptTemplate(templateId);
  const preset = getAgentActivityPreset(template.id);
  const questions = preset.questions.slice(0, 3);
  const points = Math.floor(80 / questions.length);
  return {
    ...defaultLeadQualificationConfig,
    activityTemplateId: template.id, activityVersion: 2, customized: false,
    commercialObjective: preset.objective,
    maxQuestionsPerConversation: 4,
    questions: [
      ...questions.map(([id, label, question], index) => ({
        id, label, question, crmField: id,
        weight: points + (index === 0 ? 80 - points * questions.length : 0), required: index < 2,
        options: activityAnswerOptions(template.id, id, label, points + (index === 0 ? 80 - points * questions.length : 0)),
      })),
      { id: "objection", label: "Dúvidas e objeções", question: "Ficou alguma dúvida sobre o próximo passo?", crmField: "objections", weight: 20, required: false,
        options: activityAnswerOptions(template.id, "objection", "Dúvidas e objeções", 20) },
    ],
    disqualifiers: [], handoffRules: [preset.handoff],
  };
}

export function createActivityBehavior(templateId: unknown): WhatsappBehaviorConfig {
  const preset = getAgentActivityPreset(templateId);
  return normalizeWhatsappBehaviorSettings({
    ...defaultWhatsappBehaviorConfig,
    conversationStyle: preset.style, textEmojis: true,
    emojiReactions: true, reactionProbability: preset.style === "warm" ? 25 : 10,
    spontaneousAudio: false,
    interactiveMessages: true, qualityMetrics: true,
  });
}

/** Personality follows the activity independently of how the technical prompt is edited. */
export function applyActivityCloneProfile(templateId: unknown, agentName: string, value?: unknown) {
  const defaults = createActivityCloneProfile(templateId, agentName);
  const previous = normalizeWhatsappCloneProfile(value);
  const fields = ["roleIdentity", "tone", "vocabulary", "responseRhythm", "salesStyle", "objectionStyle", "closingStyle", "emojiStyle", "audioStyle", "forbiddenPatterns", "notes"] as const;
  let cloneProfile = defaults;
  if (previous.activityTemplateId) {
    const oldDefaults = createActivityCloneProfile(previous.activityTemplateId, previous.displayName);
    cloneProfile = { ...defaults, enabled: previous.enabled, source: previous.source, useAgentName: previous.useAgentName };
    for (const key of fields) {
      const legacyIdentity = key === "roleIdentity" && previous[key] === getAgentActivityPreset(previous.activityTemplateId).identity;
      const oldPreset = getAgentActivityPreset(previous.activityTemplateId);
      const legacyClosing = key === "closingStyle" && previous[key] === oldPreset.closing;
      const legacyExample = key === "notes" && previous[key] === `Referência de abordagem: ${oldPreset.example} Adapte ao contexto; não repita como bordão.`;
      if (previous[key] !== oldDefaults[key] && !legacyIdentity && !legacyClosing && !legacyExample) cloneProfile[key] = previous[key];
    }
    if (previous.useAgentName === false) cloneProfile.displayName = previous.displayName;
  } else if (previous.source === "history") {
    return previous;
  } else if (previous.displayName.trim() || fields.some((key) => previous[key].trim())) {
    // Old records have no field provenance: keep authored content and fill only gaps.
    cloneProfile = { ...defaults, enabled: previous.enabled, source: previous.source };
    for (const key of fields) if (previous[key].trim()) cloneProfile[key] = previous[key];
    if (previous.useAgentName === false || (previous.displayName.trim() && previous.useAgentName !== true)) {
      cloneProfile.displayName = previous.displayName;
      cloneProfile.useAgentName = false;
    }
  }
  return cloneProfile;
}

export function shouldApplyActivitySetup(previous: AgentPromptBuilderConfig, next: AgentPromptBuilderConfig) {
  return previous.templateId !== next.templateId || !previous.profileVersion;
}

/** A save timestamp is not evidence that the generic questions were authored by the user. */
export function applyActivityQualification(templateId: unknown, value?: unknown): LeadQualificationConfig {
  const previous = normalizeLeadQualificationConfig(value);
  const matchesDefaults = (defaults: LeadQualificationConfig) => {
    const defaultObjection = defaults.questions.find(question => question.id === "objection");
    const comparable = {
      ...previous, configuredAt: null,
      questions: previous.questions.map(question => question.id === "objection" && defaultObjection
        ? { ...question, required: defaultObjection.required } : question),
    };
    const target = normalizeLeadQualificationConfig(defaults);
    // Upgrade only recognized old presets; keep authored questions, limits and pauses intact.
    if (previous.questions.every(question => question.options === undefined)) {
      target.questions = target.questions.map(question => { const copy = { ...question }; delete copy.options; return copy; });
      if (comparable.activityTemplateId) comparable.activityVersion = target.activityVersion;
    }
    return JSON.stringify(comparable) === JSON.stringify(target);
  };
  const isUnchangedGlobal = !previous.activityTemplateId
    && matchesDefaults(defaultLeadQualificationConfig);
  const isUnchangedActivity = previous.activityTemplateId && !previous.customized
    && (matchesDefaults(createActivityQualification(previous.activityTemplateId)) || matchesDefaults(legacyActivityQualification(previous.activityTemplateId)));
  if (value && !isUnchangedGlobal && !isUnchangedActivity) return fillMissingQualificationAnswers(previous, getAgentPromptTemplate(templateId).id);
  const next = createActivityQualification(templateId);
  const previousObjection = previous.questions.find(question => question.id === "objection");
  if (value && previousObjection) {
    next.questions = next.questions.map(question => question.id === "objection"
      ? { ...question, required: previousObjection.required } : question);
  }
  return next;
}

function legacyActivityQualification(templateId: string): LeadQualificationConfig {
  const current = createActivityQualification(templateId);
  const preset = getAgentActivityPreset(templateId);
  const points = Math.floor(80 / preset.questions.length);
  return { ...current, activityVersion: 1, maxQuestionsPerConversation: preset.questions.length + 1,
    questions: [...preset.questions.map(([id, label, question], index) => ({ id, label, question, crmField: id,
      weight: points + (index === 0 ? 80 - points * preset.questions.length : 0), required: index < 2 })),
    { id: "objection", label: "Dúvidas e objeções", question: "Ficou alguma dúvida sobre o próximo passo?", crmField: "objections", weight: 20, required: false }] };
}

/** Shared by the editor and server. Existing explicit customizations survive a profile change. */
export function applyActivitySetup(input: {
  config: AgentPromptBuilderConfig; agentName: string; previousTemplateId?: unknown;
  cloneProfile?: unknown; qualification?: unknown; behavior?: unknown;
}) {
  const cloneProfile = applyActivityCloneProfile(input.config.templateId, input.agentName, input.cloneProfile);
  const qualification = applyActivityQualification(input.config.templateId, input.qualification);
  const behavior = input.behavior ? normalizeWhatsappBehaviorSettings(input.behavior) : createActivityBehavior(input.config.templateId);
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

export function resolveWhatsappBehaviorSettings(input: { instance?: unknown; agent?: unknown; global?: unknown }) {
  return normalizeWhatsappBehaviorSettings(input.instance ?? input.agent ?? input.global);
}
