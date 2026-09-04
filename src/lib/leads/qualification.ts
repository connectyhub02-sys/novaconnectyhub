export type LeadTemperature = "cold" | "warm" | "hot" | "vip";

export type LeadQualificationStatus = "new" | "active" | "qualified" | "won" | "lost" | "archived";

export type LeadQualificationQuestion = {
  id: string;
  label: string;
  question: string;
  crmField: string;
  weight: number;
  required: boolean;
};

export type LeadQualificationConfig = {
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
  },
  {
    id: "context",
    label: "Contexto",
    question: "Você já conhece esse produto ou serviço ou quer uma ajuda rápida para escolher?",
    crmField: "volume_or_context",
    weight: 25,
    required: true,
  },
  {
    id: "urgency",
    label: "Prazo",
    question: "Você pretende resolver isso hoje, nos próximos dias ou está apenas pesquisando?",
    crmField: "timeframe",
    weight: 25,
    required: true,
  },
  {
    id: "objection",
    label: "Objecao",
    question: "O que ainda falta para você decidir com segurança?",
    crmField: "objections",
    weight: 20,
    required: false,
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
  return {
    ...normalizeLeadQualificationConfig(config),
    configuredAt,
  };
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

export function normalizeLeadQualificationAnalysis(value: unknown, config: LeadQualificationConfig): LeadQualificationAnalysis {
  const record = isRecord(value) ? value : {};
  const answeredQuestionIds = normalizeIdList(record.answeredQuestionIds ?? record.answered_question_ids);
  const missingQuestionIds = normalizeIdList(record.missingQuestionIds ?? record.missing_question_ids);
  const fields = normalizeFields(record.fields);
  const scoreFromAnswerIds = calculateScoreFromAnswers(config, answeredQuestionIds);
  const score = clampNumber(record.score, 0, 100, scoreFromAnswerIds);
  const temperature = normalizeTemperature(record.temperature, getLeadTemperature(score, config));
  const status = normalizeStatus(record.status, getLeadStatusFromScore(score, config));

  return {
    score,
    temperature,
    status,
    answeredQuestionIds,
    missingQuestionIds: missingQuestionIds.length ? missingQuestionIds : getMissingQuestionIds(config, answeredQuestionIds),
    fields,
    summary: readText(record.summary, "Lead em qualificacao.", maxTextLength),
    nextBestQuestion: readNullableText(record.nextBestQuestion ?? record.next_best_question, 300),
    nextBestAction: readText(record.nextBestAction ?? record.next_best_action, "Continuar qualificando com uma pergunta objetiva.", 300),
  };
}

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
    "- Use somente perguntas do playbook ativo: template global da ConnectyHub ou perguntas salvas pelo cliente no painel. Nao invente checklist proprio de qualificacao.",
    "- Quando o cliente alterar, desligar ou adicionar perguntas no painel, essa configuracao explicita vira a fonte da verdade.",
    normalized.askOneQuestionAtATime
      ? "- Faca apenas uma pergunta de qualificacao por mensagem. Nao transforme a conversa em formulario."
      : "- Pode combinar perguntas quando o lead pedir objetividade, mas mantenha a conversa natural.",
    "- Se o lead ignorar uma pergunta de qualificacao, nao repita imediatamente. Responda o assunto atual e retome depois somente se ficar natural.",
    "- Se o lead demonstrar intencao clara de comprar, nao bloqueie a venda por qualificacao. Colete apenas os dados necessarios para pedido, entrega e pagamento.",
    "- Primeiro entenda a dor e o contexto; depois fale de proposta, demonstracao ou preco.",
    "- Quando uma informacao for respondida, use-a no raciocinio e evite perguntar a mesma coisa de novo.",
    "- Perguntas do playbook ativo:",
    ...normalized.questions.map((question, index) => {
      return `${index + 1}. [${question.id}] ${question.question} | campo CRM: ${question.crmField} | peso: ${question.weight} | obrigatoria: ${question.required ? "sim" : "nao"}`;
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
    "Use apenas o playbook ativo, seja o template global da ConnectyHub ou a configuracao salva pelo cliente no painel. Nao crie perguntas ou criterios que nao existam na configuracao.",
    "",
    `Empresa: ${input.organizationName}`,
    `Lead: ${input.leadName || "desconhecido"}`,
    `Produto/oferta: ${config.productName || "produto ou servico da empresa"}`,
    `Objetivo: ${config.commercialObjective}`,
    `Limite qualificado: ${config.qualifyThreshold}`,
    `Limite VIP: ${config.vipThreshold}`,
    "",
    "Perguntas e pesos:",
    ...config.questions.map((question) => {
      return `- id=${question.id}; campo=${question.crmField}; peso=${question.weight}; obrigatoria=${question.required ? "sim" : "nao"}; pergunta=${question.question}`;
    }),
    "",
    "JSON esperado:",
    JSON.stringify({
      score: 0,
      temperature: "cold",
      status: "active",
      answeredQuestionIds: ["main_need"],
      missingQuestionIds: ["urgency"],
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
    "- Marque uma pergunta como respondida quando a conversa trouxer resposta suficiente para aquele campo.",
    "- Nao invente necessidade, contexto, prazo, objecao, orcamento ou autoridade.",
    "- Se faltar contexto, reduza o score e informe a proxima pergunta.",
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

function normalizeIdList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => readText(item, "", 80)).filter(Boolean)
    : [];
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
  return config.questions.filter((question) => question.required && !answered.has(question.id)).map((question) => question.id);
}

function calculateScoreFromAnswers(config: LeadQualificationConfig, answeredQuestionIds: string[]) {
  const answered = new Set(answeredQuestionIds);
  return clampScore(config.questions.reduce((total, question) => total + (answered.has(question.id) ? question.weight : 0), 0));
}

function isPersistedUnconfiguredQualificationConfig(record: Record<string, unknown>, config: LeadQualificationConfig) {
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
  return questions.map((question) => ({ ...question }));
}

function normalizeTemperature(value: unknown, fallback: LeadTemperature): LeadTemperature {
  return value === "vip" || value === "hot" || value === "warm" || value === "cold" ? value : fallback;
}

function normalizeStatus(value: unknown, fallback: LeadQualificationStatus): LeadQualificationStatus {
  return value === "new" || value === "active" || value === "qualified" || value === "won" || value === "lost" || value === "archived"
    ? value
    : fallback;
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
