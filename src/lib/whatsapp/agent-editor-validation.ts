import type { LeadQualificationConfig } from "../leads/qualification";
import type { WhatsappBehaviorConfig, WhatsappCloneProfile } from "./agent-behavior";
import type { AgentPromptBuilderConfig } from "./agent-prompt-templates";

/** Validate completed drafts without rewriting text while the user is typing. */
export function getAgentEditorValidationError(input: {
  prompt: string;
  promptConfig: AgentPromptBuilderConfig;
  cloneProfile: WhatsappCloneProfile;
  qualification: LeadQualificationConfig;
  behavior: WhatsappBehaviorConfig;
}): string | null {
  if (!input.prompt.trim()) return "Prompt: preencha as instruções avançadas ou aplique o perfil da atividade.";
  if (input.prompt.length > 8000) return "Prompt: reduza as instruções para até 8.000 caracteres.";
  for (const key of ["tone", "objective", "audience", "salesRules", "fulfillmentRules", "humanHandoffRules", "neverRules", "companyComplement"] as const) {
    if (input.promptConfig[key].trim().length > 1600) return "Prompt: cada regra e o complemento aceitam até 1.600 caracteres. Reduza o texto para salvar sem cortes.";
  }
  const cloneLimits = { displayName: 80, roleIdentity: 700, tone: 700, vocabulary: 900, responseRhythm: 900, salesStyle: 900, objectionStyle: 900, closingStyle: 700, emojiStyle: 500, audioStyle: 700, forbiddenPatterns: 900, notes: 1200 } as const;
  for (const key of Object.keys(cloneLimits) as Array<keyof typeof cloneLimits>) {
    if (input.cloneProfile[key].trim().length > cloneLimits[key]) return `Personalidade: o campo ${cloneFieldLabels[key]} aceita até ${cloneLimits[key]} caracteres. Reduza o texto para salvar sem cortes.`;
  }
  const qualification = input.qualification;
  if (qualification.productName.trim().length > 120 || qualification.commercialObjective.trim().length > 600) return "Qualificação: use até 120 caracteres na oferta e 600 no objetivo comercial.";
  if (!qualification.commercialObjective.trim()) return "Qualificação: preencha o objetivo comercial.";
  if (qualification.vipThreshold < qualification.qualifyThreshold) return "Qualificação: o limite VIP deve ser igual ou maior que o limite de qualificado.";
  if (qualification.questions.length > 16) return "Qualificação: o limite é de 16 perguntas.";
  const crmFields = new Set<string>();
  for (const [index, question] of qualification.questions.entries()) {
    if (!question.label.trim() || !question.question.trim() || !question.crmField.trim()) return `Qualificação: preencha o rótulo, a pergunta e o campo CRM da pergunta ${index + 1}, ou exclua essa pergunta.`;
    if (question.label.trim().length > 80 || question.question.trim().length > 260 || question.crmField.trim().length > 80) return `Qualificação: a pergunta ${index + 1} aceita até 80 caracteres no rótulo/campo CRM e 260 no texto.`;
    const crmField = question.crmField.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
    if (!crmField) return `Qualificação: use letras ou números no campo CRM da pergunta ${index + 1}.`;
    if (crmFields.has(crmField)) return `Qualificação: o campo CRM da pergunta ${index + 1} já está em uso. Escolha um campo diferente.`;
    crmFields.add(crmField);
  }
  for (const list of [qualification.disqualifiers, qualification.handoffRules]) {
    const lines = list.map(line => line.trim()).filter(Boolean);
    if (lines.length > 8 || lines.some(line => line.length > 240)) return "Qualificação: cada lista aceita até 8 linhas de 240 caracteres. Reduza o conteúdo para salvar sem cortes.";
  }
  for (const key of ["followUpTimeWindowStart", "followUpTimeWindowEnd", "aiScheduleStart", "aiScheduleEnd"] as const) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.behavior[key].trim())) return "Comportamento: preencha os horários no formato HH:MM, de 00:00 a 23:59.";
  }
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: input.behavior.aiScheduleTimezone.trim() }).format();
  } catch {
    return "Comportamento: informe um fuso válido, como America/Sao_Paulo.";
  }
  return null;
}

const cloneFieldLabels = {
  displayName: "nome de assinatura", roleIdentity: "identidade", tone: "tom", vocabulary: "vocabulário",
  responseRhythm: "ritmo", salesStyle: "estilo de venda", objectionStyle: "objeções", closingStyle: "fechamento",
  emojiStyle: "emojis", audioStyle: "áudio", forbiddenPatterns: "padrões proibidos", notes: "notas livres",
};
