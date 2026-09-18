export type LeadTemperature = "cold" | "warm" | "hot" | "vip";

export type LeadQualificationStatus = "new" | "active" | "qualified" | "won" | "lost" | "archived";

export type LeadQualificationQuestion = {
  id: string;
  label: string;
  question: string;
  crmField: string;
  weight: number;
  required: boolean;
  options?: LeadQualificationOption[];
};

export type LeadQualificationOption = { id: string; label: string; points: number; disqualifies: boolean };
export type LeadQualificationAnswer = {
  questionId: string; optionId: string; answer: string; question: string;
  optionLabel: string; points: number; disqualifies: boolean;
};

export type LeadQualificationConfig = {
  activityTemplateId?: string;
  activityVersion?: number;
  customized?: boolean;
  enabled: boolean;
  productName: string;
  commercialObjective: string;
  qualifyThreshold: number;
  vipThreshold: number;
  maxQuestionsPerConversation: number;
  askOneQuestionAtATime: boolean;
  questions: LeadQualificationQuestion[];
  disqualifiers: string[];
  handoffRules: string[];
  configuredAt?: string | null;
};

export type LeadQualificationAnalysis = {
  score: number;
  temperature: LeadTemperature;
  status: LeadQualificationStatus;
  answeredQuestionIds: string[];
  missingQuestionIds: string[];
  fields: Record<string, string>;
  summary: string;
  nextBestQuestion: string | null;
  nextBestAction: string;
  answers?: LeadQualificationAnswer[];
  rawScore?: number;
  maxScore?: number;
  disqualified?: boolean;
  disqualificationReasons?: string[];
  configFingerprint?: string;
};

export const leadQualificationConfigKey = "lead_qualification_config";

const legacyDefaultCommercialObjective = "Entender a dor do lead, qualificar potencial de compra e conduzir para o proximo passo comercial.";
const defaultGlobalCommercialObjective = "Entender necessidade, contexto, prazo e objecao para orientar o lead e conduzir o proximo passo comercial sem travar a venda.";

export const defaultLeadQualificationQuestions: LeadQualificationQuestion[] = [
  {
    id: "main_need",
    label: "Necessidade",
    question: "O que você está buscando resolver, comprar ou agendar hoje?",
    crmField: "purpose",
    weight: 30,
    required: true,
    options: qualificationOptions([["Necessidade definida e relacionada ao negócio", 30], ["Precisa de ajuda para definir a necessidade", 10], ["Demanda não relacionada ao negócio", 0]]),
  },
  {
    id: "context",
    label: "Contexto",
    question: "Você já conhece esse produto ou serviço ou quer uma ajuda rápida para escolher?",
    crmField: "volume_or_context",
    weight: 25,
    required: true,
    options: qualificationOptions([["Já conhece e sabe o que procura", 25], ["Quer orientação para escolher", 15], ["Ainda não sabe o que procura", 5]]),
  },
  {
    id: "urgency",
    label: "Prazo",
    question: "Você pretende resolver isso hoje, nos próximos dias ou está apenas pesquisando?",
    crmField: "timeframe",
    weight: 25,
    required: true,
    options: qualificationOptions([["Hoje ou nos próximos dias", 25], ["Tem uma data futura definida", 15], ["Apenas pesquisando, sem prazo", 5]]),
  },
  {
    id: "objection",
    label: "Objecao",
    question: "O que ainda falta para você decidir com segurança?",
    crmField: "objections",
    weight: 20,
    required: false,
    options: qualificationOptions([["Sem dúvidas e quer prosseguir", 20], ["Precisa esclarecer dúvidas antes de decidir", 10], ["Não quer prosseguir", 0]]),
  },
];

export const defaultLeadQualificationConfig: LeadQualificationConfig = {
  enabled: true,
  productName: "",
  commercialObjective: defaultGlobalCommercialObjective,
  qualifyThreshold: 70,
  vipThreshold: 85,
  maxQuestionsPerConversation: 4,
  askOneQuestionAtATime: true,
  questions: defaultLeadQualificationQuestions,
  disqualifiers: [],
  handoffRules: [],
  configuredAt: null,
};

const maxQuestions = 16;
const maxTextLength = 600;

type NormalizeLeadQualificationConfigOptions = {
  persisted?: boolean;
};

export function normalizeLeadQualificationConfig(value: unknown, options: NormalizeLeadQualificationConfigOptions = {}): LeadQualificationConfig {
  const record = isRecord(value) ? value : {};
  const questions = Array.isArray(record.questions)
    ? normalizeQuestions(record.questions)
    : cloneLeadQualificationQuestions(defaultLeadQualificationQuestions);

  const normalized = {
    ...(typeof record.activityTemplateId === "string" ? { activityTemplateId: record.activityTemplateId.slice(0, 80), activityVersion: Number(record.activityVersion) || 1, customized: record.customized === true } : {}),
    enabled: readBoolean(record.enabled, defaultLeadQualificationConfig.enabled),
    productName: readText(record.productName, defaultLeadQualificationConfig.productName, 120),
    commercialObjective: readText(record.commercialObjective, defaultLeadQualificationConfig.commercialObjective, maxTextLength),
    qualifyThreshold: clampNumber(record.qualifyThreshold, 20, 100, defaultLeadQualificationConfig.qualifyThreshold),
    vipThreshold: clampNumber(record.vipThreshold, 30, 100, defaultLeadQualificationConfig.vipThreshold),
    maxQuestionsPerConversation: clampNumber(record.maxQuestionsPerConversation, 1, maxQuestions, defaultLeadQualificationConfig.maxQuestionsPerConversation),
    askOneQuestionAtATime: readBoolean(record.askOneQuestionAtATime, defaultLeadQualificationConfig.askOneQuestionAtATime),
    questions,
    disqualifiers: normalizeTextList(record.disqualifiers, defaultLeadQualificationConfig.disqualifiers),
    handoffRules: normalizeTextList(record.handoffRules, defaultLeadQualificationConfig.handoffRules),
    configuredAt: readNullableText(record.configuredAt ?? record.configured_at, 80),
  };

  if (options.persisted && isPersistedUnconfiguredQualificationConfig(record, normalized)) {
    return cloneLeadQualificationConfig(defaultLeadQualificationConfig);
  }

  return normalized;
}

export function isLeadQualificationConfigEqual(left: LeadQualificationConfig, right: LeadQualificationConfig) {
  return JSON.stringify(normalizeLeadQualificationConfig(left)) === JSON.stringify(normalizeLeadQualificationConfig(right));
}

export function markLeadQualificationConfigConfigured(config: unknown, configuredAt = new Date().toISOString()) {
  const normalized = normalizeLeadQualificationConfig(config);
  const error = getLeadQualificationAnswerValidationError(normalized);
  if (error) throw new Error(error);
  return {
    ...normalized,
    configuredAt,
  };
}

export function getLeadQualificationAnswerValidationError(config: LeadQualificationConfig): string | null {
  const questionIds = new Set<string>();
  const fieldIds = new Set<string>();
  for (const [index, question] of config.questions.entries()) {
    if (questionIds.has(question.id) || fieldIds.has(question.crmField)) return "Qualificação: há perguntas duplicadas. Exclua a duplicata e adicione uma nova pergunta.";
    questionIds.add(question.id); fieldIds.add(question.crmField);
    if (!question.options) continue; // Legacy authored questions remain editable and unscored until configured.
    if (question.options.length < 1 || question.options.length > 12) return `Qualificação: adicione de 1 a 12 respostas à pergunta ${index + 1}, ou exclua a pergunta.`;
    const ids = new Set<string>(), labels = new Set<string>();
    for (const option of question.options) {
      const label = normalizeEvidence(option.label);
      if (!label || option.label.trim().length > 240) return `Qualificação: preencha cada resposta da pergunta ${index + 1} com até 240 caracteres.`;
      if (!option.id || ids.has(option.id) || labels.has(label)) return `Qualificação: as respostas da pergunta ${index + 1} precisam ser diferentes.`;
      if (!Number.isInteger(option.points) || option.points < 0 || option.points > 100) return `Qualificação: use pontos inteiros de 0 a 100 na pergunta ${index + 1}.`;
      ids.add(option.id); labels.add(label);
    }
  }
  return null;
}

export function isLeadQualificationPlaybookActive(config: LeadQualificationConfig) {
  const normalized = normalizeLeadQualificationConfig(config);
  return normalized.enabled && normalized.questions.length > 0;
}

export function getLeadTemperature(score: number, config: LeadQualificationConfig): LeadTemperature {
  const normalized = clampScore(score);

  if (normalized >= config.vipThreshold) return "vip";
  if (normalized >= config.qualifyThreshold) return "hot";
  if (normalized >= 40) return "warm";
  return "cold";
}

export function getLeadStatusFromScore(score: number, config: LeadQualificationConfig): LeadQualificationStatus {
  return score >= config.qualifyThreshold ? "qualified" : score >= 20 ? "active" : "new";
}

export function normalizeLeadQualificationAnalysis(value: unknown, config: LeadQualificationConfig, evidenceTexts?: string[]): LeadQualificationAnalysis {
  const record = isRecord(value) ? value : {};
  const normalized = normalizeLeadQualificationConfig(config);
  const candidates = normalized.enabled && Array.isArray(record.answers) ? record.answers.filter(isRecord) : [];
  const answers: LeadQualificationAnswer[] = [];
  for (const question of normalized.questions) {
    const matches = candidates.filter(answer => answer.questionId === question.id);
    // Duplicated or contradictory classifications require clarification, never extra points.
    if (matches.length !== 1) continue;
    const candidate = matches[0];
    const option = question.options?.find(item => item.id === candidate.optionId);
    const answer = readText(candidate.answer, "", 500);
    if (!option || !answer) continue;
    if (evidenceTexts && !evidenceTexts.some(text => normalizeEvidence(text).includes(normalizeEvidence(answer)))) continue;
    answers.push({ questionId: question.id, optionId: option.id, answer, question: question.question,
      optionLabel: option.label, points: option.disqualifies ? 0 : option.points, disqualifies: option.disqualifies });
  }
  const answeredQuestionIds = answers.map(answer => answer.questionId);
  const missingQuestionIds = getMissingQuestionIds(normalized, answeredQuestionIds);
  const rawScore = answers.reduce((sum, answer) => sum + answer.points, 0);
  const maxScore = getLeadQualificationMaxScore(normalized);
  const disqualificationReasons = answers.filter(answer => answer.disqualifies).map(answer => `${answer.question}: ${answer.optionLabel}`);
  const disqualified = disqualificationReasons.length > 0;
  const score = !normalized.enabled || disqualified || !maxScore ? 0 : clampScore(100 * rawScore / maxScore);
  const pending = normalized.questions.some(question => question.required && missingQuestionIds.includes(question.id)) || normalized.questions.some(question => !question.options?.length);
  const temperature = disqualified || !normalized.enabled ? "cold" : pending && score >= normalized.qualifyThreshold ? "warm" : getLeadTemperature(score, normalized);
  const status = disqualified ? "lost" : pending && score >= normalized.qualifyThreshold ? "active" : getLeadStatusFromScore(score, normalized);
  const allowedFields = new Set(normalized.questions.map(question => question.crmField));
  const fields = Object.fromEntries(Object.entries(normalizeFields(record.fields)).filter(([key]) => allowedFields.has(key)));
  for (const answer of answers) fields[normalized.questions.find(question => question.id === answer.questionId)!.crmField] = answer.answer;

  return {
    score,
    temperature,
    status,
    answeredQuestionIds,
    missingQuestionIds,
    answers, rawScore, maxScore, disqualified, disqualificationReasons,
    configFingerprint: getLeadQualificationFingerprint(normalized),
    fields,
    summary: readText(record.summary, "Lead em qualificacao.", maxTextLength),
    nextBestQuestion: disqualified ? null : normalized.questions.find(question => missingQuestionIds.includes(question.id))?.question ?? null,
    nextBestAction: disqualified ? "Lead desqualificado por uma resposta configurada. Encaminhar ao responsável sem avançar a proposta comercial."
      : pending ? "Continuar o atendimento e esclarecer a próxima resposta pendente, sem presumir a opção."
      : score >= normalized.qualifyThreshold ? "Lead qualificado; confirmar o próximo passo com o cliente."
      : "Respostas registradas; continuar orientando conforme o interesse e a pontuação do lead.",
  };
}

export function qualificationOptions(values: Array<[string, number, boolean?]>): LeadQualificationOption[] {
  return values.map(([label, points, disqualifies], index) => ({ id: `option_${index + 1}`, label, points, disqualifies: disqualifies === true }));
}

export function getLeadQualificationMaxScore(config: LeadQualificationConfig) {
  return config.questions.reduce((sum, question) => sum + Math.max(0, ...(question.options ?? []).filter(option => !option.disqualifies).map(option => option.points)), 0);
}

export function getLeadQualificationFingerprint(config: LeadQualificationConfig) {
  config = normalizeLeadQualificationConfig(config);
  const text = JSON.stringify([config.enabled, config.qualifyThreshold, config.vipThreshold, config.questions]);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return `answers-v2-${(hash >>> 0).toString(16)}`;
}

function normalizeEvidence(text: string) { return text.trim().replace(/\s+/g, " ").toLowerCase(); }

export function buildLeadQualificationInstruction(config: LeadQualificationConfig) {
  const normalized = normalizeLeadQualificationConfig(config);

  if (!isLeadQualificationPlaybookActive(normalized)) {
    return [];
  }

  const lines = [
    "",
    "PLAYBOOK DE QUALIFICACAO DO LEAD:",
    `- Produto/oferta configurado pelo cliente: ${normalized.productName || "produto ou servico da empresa"}.`,
    `- Objetivo comercial: ${normalized.commercialObjective}.`,
    `- Lead qualificado a partir de ${normalized.qualifyThreshold} pontos; VIP a partir de ${normalized.vipThreshold} pontos.`,
    `- Limite de perguntas de qualificacao por conversa: ${normalized.maxQuestionsPerConversation}.`,
    "- Use somente perguntas do playbook ativo: perfil da atividade escolhida, template global da ConnectyHub ou perguntas salvas pelo cliente no painel. Nao invente checklist proprio de qualificacao.",
    "- Quando o cliente alterar, desligar ou adicionar perguntas no painel, essa configuracao explicita vira a fonte da verdade.",
    normalized.askOneQuestionAtATime
      ? "- Faca apenas uma pergunta de qualificacao por mensagem. Nao transforme a conversa em formulario."
      : "- Pode combinar perguntas quando o lead pedir objetividade, mas mantenha a conversa natural.",
    "- Se o lead ignorar uma pergunta de qualificacao, nao repita imediatamente. Responda o assunto atual e retome depois somente se ficar natural.",
    "- Se o lead demonstrar intencao clara de comprar, nao bloqueie a venda por qualificacao incompleta. Respeite sempre as respostas desqualificadoras e os requisitos do atendimento; pontuação não autoriza venda nem substitui verificação documental.",
    "- Primeiro entenda a dor e o contexto; depois fale de proposta, demonstracao ou preco.",
    "- Quando uma informacao for respondida, use-a no raciocinio e evite perguntar a mesma coisa de novo.",
    "- Perguntas do playbook ativo:",
    ...normalized.questions.map((question, index) => {
      return `${index + 1}. [${question.id}] ${question.question} | campo CRM: ${question.crmField} | obrigatoria: ${question.required ? "sim" : "nao"}\n${describeOptions(question)}`;
    }),
  ];

  if (normalized.disqualifiers.length) {
    lines.push("- Sinais de baixa qualificacao:", ...normalized.disqualifiers.map((item) => `  - ${item}`));
  }

  if (normalized.handoffRules.length) {
    lines.push("- Acione humano ou proximo passo forte quando:", ...normalized.handoffRules.map((item) => `  - ${item}`));
  }

  return lines;
}

export function buildLeadQualificationAnalysisPrompt(input: {
  config: LeadQualificationConfig;
  organizationName: string;
  leadName: string | null;
  conversationText: string;
  leadMetadata: Record<string, unknown> | null;
}) {
  const config = normalizeLeadQualificationConfig(input.config);

  return [
    "Analise a conversa e atualize a qualificacao comercial do lead.",
    "Responda somente JSON valido, sem markdown e sem texto fora do JSON.",
    "Use apenas o playbook ativo, seja o perfil da atividade escolhida, o template global da ConnectyHub ou a configuracao salva pelo cliente no painel. Nao crie perguntas ou criterios que nao existam na configuracao.",
    "",
    `Empresa: ${input.organizationName}`,
    `Lead: ${input.leadName || "desconhecido"}`,
    `Produto/oferta: ${config.productName || "produto ou servico da empresa"}`,
    `Objetivo: ${config.commercialObjective}`,
    `Limite qualificado: ${config.qualifyThreshold}`,
    `Limite VIP: ${config.vipThreshold}`,
    "",
    "Perguntas, respostas possíveis e pontos (uma opção por pergunta):",
    ...config.questions.map((question) => {
      return `- id=${question.id}; campo=${question.crmField}; obrigatoria=${question.required ? "sim" : "nao"}; pergunta=${question.question}\n${describeOptions(question)}`;
    }),
    "",
    "JSON esperado:",
    JSON.stringify({
      answers: [{ questionId: config.questions[0]?.id ?? "id_da_pergunta", optionId: config.questions[0]?.options?.[0]?.id ?? "id_da_opcao", answer: "trecho literal da resposta do lead" }],
      fields: {
        purpose: "texto curto",
        volume_or_context: "texto curto",
        timeframe: "texto curto",
        objections: "texto curto",
      },
      summary: "resumo comercial curto do lead",
      nextBestQuestion: "proxima pergunta, se ainda faltar contexto",
      nextBestAction: "acao comercial recomendada",
    }),
    "",
    "Regras:",
    "- Use apenas informacoes presentes na conversa/metadados.",
    ...config.disqualifiers.map(item => `- Sinal de baixa qualificação configurado: ${item}. Considere somente se estiver comprovado na conversa.`),
    ...config.handoffRules.map(item => `- Regra configurada para o próximo passo: ${item}.`),
    "- Retorne answers com uma opção existente por pergunta, somente quando a resposta do lead corresponder claramente ao significado da opção. Inclua em answer um trecho literal do que o lead disse; nunca use a fala do agente como resposta do lead.",
    "- Resposta ambígua, contraditória ou fora das opções fica pendente: não inclua essa pergunta em answers. Não trate falta de resposta como não. Se o lead corrigiu uma resposta, use a correção mais recente.",
    "- Não calcule score, temperatura ou status. O servidor calcula a soma das opções, normaliza pelo máximo para 0–100 e aplica desqualificação antes dos limites. Uma resposta com zero pontos continua sendo respondida.",
    `- Configuração atual: ${getLeadQualificationFingerprint(config)}. Respostas anteriores só podem ser reutilizadas se lead_qualification.config_fingerprint for igual a este valor; inclua-as em answers com o trecho original. Correções mais recentes prevalecem.`,
    "- Nao invente necessidade, contexto, prazo, objecao, orcamento ou autoridade.",
    "- Se faltar contexto, deixe a resposta pendente e peça esclarecimento. Pontuação não é uma avaliação de saúde nem uma autorização de compra.",
    "",
    "Metadados atuais do lead:",
    JSON.stringify(input.leadMetadata ?? {}),
    "",
    "Conversa:",
    input.conversationText.slice(-8000),
  ].join("\n");
}

function normalizeQuestions(value: unknown): LeadQualificationQuestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => normalizeQuestion(item, index))
    .filter((item): item is LeadQualificationQuestion => Boolean(item))
    .slice(0, maxQuestions);
}

function normalizeQuestion(value: unknown, index: number): LeadQualificationQuestion | null {
  const record = isRecord(value) ? value : {};
  const id = readText(record.id, `question_${index + 1}`, 80)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    || `question_${index + 1}`;
  const question = readText(record.question, `Pergunta de qualificacao ${index + 1}`, 260);

  return {
    id,
    label: readText(record.label, `Pergunta ${index + 1}`, 80),
    question,
    crmField: readText(record.crmField, id, 80)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      || id,
    weight: clampNumber(record.weight, 0, 40, 10),
    required: readBoolean(record.required, index < 2),
    ...(Array.isArray(record.options) ? { options: record.options.filter(isRecord).slice(0, 12).map((option, optionIndex) => ({
      id: readText(option.id, `option_${optionIndex + 1}`, 80), label: readText(option.label, "", 240),
      points: clampNumber(option.points, 0, 100, 0), disqualifies: option.disqualifies === true,
    })) } : {}),
  };
}

function normalizeTextList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const items = value
    .map((item) => readText(item, "", 240))
    .filter(Boolean)
    .slice(0, 8);

  return items;
}

function normalizeFields(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, readText(item, "", 500)] as const)
      .filter(([, item]) => Boolean(item)),
  );
}

function getMissingQuestionIds(config: LeadQualificationConfig, answeredQuestionIds: string[]) {
  const answered = new Set(answeredQuestionIds);
  return config.questions.filter((question) => !answered.has(question.id)).map((question) => question.id);
}

function describeOptions(question: LeadQualificationQuestion) {
  return question.options?.length ? question.options.map(option => `  opção=${option.id}; resposta=${option.label}; ${option.disqualifies ? "DESQUALIFICA: interrompa o avanço comercial e encaminhe ao responsável" : `pontos=${option.points}`}`).join("\n")
    : "  Sem respostas pontuadas configuradas. Registre o contexto, mas não atribua pontos.";
}

function isPersistedUnconfiguredQualificationConfig(record: Record<string, unknown>, config: LeadQualificationConfig) {
  if (record.activityTemplateId) return false;
  if (config.configuredAt) {
    return false;
  }

  if (readText(record.productName, "", 120)) {
    return false;
  }

  const objective = readText(record.commercialObjective, "", maxTextLength);
  const hasImplicitObjective = !objective
    || objective === legacyDefaultCommercialObjective
    || objective === defaultGlobalCommercialObjective;

  if (!hasImplicitObjective) {
    return false;
  }

  if (record.enabled === false && config.questions.length === 0) {
    return true;
  }

  return true;
}

function cloneLeadQualificationConfig(config: LeadQualificationConfig): LeadQualificationConfig {
  return {
    ...config,
    questions: cloneLeadQualificationQuestions(config.questions),
    disqualifiers: [...config.disqualifiers],
    handoffRules: [...config.handoffRules],
  };
}

function cloneLeadQualificationQuestions(questions: LeadQualificationQuestion[]) {
  return questions.map((question) => ({ ...question, ...(question.options ? { options: question.options.map(option => ({ ...option })) } : {}) }));
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(number)));
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function readNullableText(value: unknown, maxLength: number) {
  const text = readText(value, "", maxLength);
  return text || null;
}

function readText(value: unknown, fallback: string, maxLength: number) {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return (text || fallback).slice(0, maxLength);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
