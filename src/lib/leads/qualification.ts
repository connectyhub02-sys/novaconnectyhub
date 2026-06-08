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

export const defaultLeadQualificationQuestions: LeadQualificationQuestion[] = [
  {
    id: "main_need",
    label: "Necessidade",
    question: "O que voce quer resolver ou comprar hoje?",
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
    question: "Qual e o tamanho da sua demanda ou do seu contexto atual?",
    crmField: "volume_or_context",
    weight: 10,
    required: false,
  },
  {
    id: "budget_or_ticket",
    label: "Valor ou orcamento",
    question: "Voce ja tem uma faixa de investimento ou valor esperado?",
    crmField: "budget",
    weight: 15,
    required: false,
  },
  {
    id: "urgency",
    label: "Prazo",
    question: "Voce quer resolver isso agora, esta semana, este mes ou esta apenas pesquisando?",
    crmField: "timeframe",
    weight: 15,
    required: true,
  },
  {
    id: "decision_authority",
    label: "Decisor",
    question: "Quem decide esse tipo de compra: voce mesmo ou mais alguem participa?",
    crmField: "decision_authority",
    weight: 10,
    required: true,
  },
  {
    id: "objection",
    label: "Objecao",
    question: "Qual seria sua maior duvida antes de avancar?",
    crmField: "objections",
    weight: 10,
    required: false,
  },
  {
    id: "next_step_acceptance",
    label: "Proximo passo",
    question: "Se fizer sentido, voce toparia ver uma demonstracao ou receber uma proposta objetiva?",
    crmField: "next_step_acceptance",
    weight: 5,
    required: true,
  },
];

export const defaultLeadQualificationConfig: LeadQualificationConfig = {
  enabled: true,
  productName: "",
  commercialObjective: "Entender a dor do lead, qualificar potencial de compra e conduzir para o proximo passo comercial.",
  qualifyThreshold: 70,
  vipThreshold: 85,
  maxQuestionsPerConversation: 6,
  askOneQuestionAtATime: true,
  questions: defaultLeadQualificationQuestions,
  disqualifiers: [
    "Lead nao tem dor clara nem objetivo definido.",
    "Lead informa que nao tem autoridade para decidir e nao quer envolver o decisor.",
    "Lead esta apenas pesquisando sem prazo, sem orcamento e sem interesse em proximo passo.",
  ],
  handoffRules: [
    "Score acima do limite VIP.",
    "Lead pediu proposta, demonstracao, contrato, preco final ou atendimento humano.",
    "Lead tem urgencia real e autoridade de decisao.",
  ],
};

const maxQuestions = 16;
const maxTextLength = 600;

export function normalizeLeadQualificationConfig(value: unknown): LeadQualificationConfig {
  const record = isRecord(value) ? value : {};
  const questions = normalizeQuestions(record.questions);

  return {
    enabled: readBoolean(record.enabled, defaultLeadQualificationConfig.enabled),
    productName: readText(record.productName, defaultLeadQualificationConfig.productName, 120),
    commercialObjective: readText(record.commercialObjective, defaultLeadQualificationConfig.commercialObjective, maxTextLength),
    qualifyThreshold: clampNumber(record.qualifyThreshold, 20, 100, defaultLeadQualificationConfig.qualifyThreshold),
    vipThreshold: clampNumber(record.vipThreshold, 30, 100, defaultLeadQualificationConfig.vipThreshold),
    maxQuestionsPerConversation: clampNumber(record.maxQuestionsPerConversation, 1, maxQuestions, defaultLeadQualificationConfig.maxQuestionsPerConversation),
    askOneQuestionAtATime: readBoolean(record.askOneQuestionAtATime, defaultLeadQualificationConfig.askOneQuestionAtATime),
    questions: questions.length ? questions : defaultLeadQualificationQuestions,
    disqualifiers: normalizeTextList(record.disqualifiers, defaultLeadQualificationConfig.disqualifiers),
    handoffRules: normalizeTextList(record.handoffRules, defaultLeadQualificationConfig.handoffRules),
  };
}

export function isLeadQualificationConfigEqual(left: LeadQualificationConfig, right: LeadQualificationConfig) {
  return JSON.stringify(normalizeLeadQualificationConfig(left)) === JSON.stringify(normalizeLeadQualificationConfig(right));
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

  if (!normalized.enabled) {
    return [];
  }

  const lines = [
    "",
    "PLAYBOOK DE QUALIFICACAO DO LEAD:",
    `- Produto/oferta configurado pelo cliente: ${normalized.productName || "produto ou servico da empresa"}.`,
    `- Objetivo comercial: ${normalized.commercialObjective}.`,
    `- Lead qualificado a partir de ${normalized.qualifyThreshold} pontos; VIP a partir de ${normalized.vipThreshold} pontos.`,
    `- Limite de perguntas de qualificacao por conversa: ${normalized.maxQuestionsPerConversation}.`,
    normalized.askOneQuestionAtATime
      ? "- Faca apenas uma pergunta de qualificacao por mensagem. Nao transforme a conversa em formulario."
      : "- Pode combinar perguntas quando o lead pedir objetividade, mas mantenha a conversa natural.",
    "- Primeiro entenda a dor e o contexto; depois fale de proposta, demonstracao ou preco.",
    "- Quando uma informacao for respondida, use-a no raciocinio e evite perguntar a mesma coisa de novo.",
    "- Perguntas configuradas pelo cliente:",
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
        main_pain: "texto curto",
        budget: "texto curto",
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
    "- Nao invente orcamento, prazo, autoridade ou dor.",
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
    return fallback;
  }

  const items = value
    .map((item) => readText(item, "", 240))
    .filter(Boolean)
    .slice(0, 8);

  return items.length ? items : fallback;
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
