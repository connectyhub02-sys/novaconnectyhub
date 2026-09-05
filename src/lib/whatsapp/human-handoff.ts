const handoffIntentPrefix = String.raw`\b(?:quero|preciso|gostaria|prefiro|pode|poderia|consegue|tem como)\b`;
const directHandoffIntentPrefix = String.raw`\b(?:quero|preciso|gostaria|prefiro)\b`;
const handoffAction = String.raw`(?:chama|chamar|aciona|acionar|passa|passar|transfere|transferir|transfira|encaminha|encaminhar)`;
const strongHumanTarget = String.raw`(?:humano|atendente|vendedor|consultor|pessoa real|pessoa de verdade)`;
const supportTeamTarget = String.raw`(?:suporte|pessoal|equipe|time)`;
const personTarget = String.raw`(?:alguem(?!\s+virtual))`;
const handoffTarget = String.raw`(?:${strongHumanTarget}|${supportTeamTarget}|${personTarget})`;
const salesGuidanceSignalPattern = /\b(?:orientacao|orientar|recomenda|recomendacao|recomendar|indica|indicacao|indicar|o que devo|o que eu devo|qual produto|quais produtos|melhor opcao|opcao melhor|protocolo|comprar|adquirir|disposto a comprar|nao quero errar)\b/;
const experiencedGuidancePattern = /\b(?:alguem|pessoa)\b.{0,90}\b(?:mais\s+)?(?:experiencia|experiente|entende|conhece|especialista)\b|\b(?:mais experiencia|mais experiente|entende mais|especialista no produto)\b/;
const explicitHumanRolePattern = /\b(?:atendente humano|suporte humano|humano|pessoa real|pessoa de verdade|equipe|time|vendedor)\b/;
const explicitTransferActionPattern = /\b(?:chama|chamar|aciona|acionar|passa|passar|transfere|transferir|transfira|encaminha|encaminhar)\b/;

const humanHandoffRequestPatterns = [
  new RegExp(String.raw`\b(?:atendimento|suporte)\s+humano\b`),
  new RegExp(String.raw`${handoffIntentPrefix}.{0,50}\b(?:falar|conversar)\b.{0,20}\bcom\s+(?:o\s+|a\s+|um\s+|uma\s+)?${handoffTarget}\b`),
  new RegExp(String.raw`\b(?:falar|fala|conversar|conversa)\b.{0,20}\bcom\s+(?:o\s+|a\s+|um\s+|uma\s+)?${handoffTarget}\b`),
  new RegExp(String.raw`\b${handoffAction}\b.{0,60}\b(?:para\s+|pra\s+|pro\s+|com\s+|um\s+|uma\s+)?${handoffTarget}\b`),
  new RegExp(String.raw`${directHandoffIntentPrefix}.{0,35}\b(?:de\s+)?(?:um\s+|uma\s+)?${strongHumanTarget}\b`),
  new RegExp(String.raw`\b${handoffTarget}\b.{0,60}\b(?:assumir|retornar|ligar|continuar|atender)\b`),
  /\b(?:me liga|me ligue|liga pra mim|ligacao|telefone de alguem|passar para alguem(?!\s+virtual)|passa para alguem(?!\s+virtual)|transferir atendimento|transfere o atendimento|transfira o atendimento)\b/,
];

export function isHumanHandoffRequest(value: string) {
  const normalized = normalizeHandoffSearch(value);

  if (!normalized) {
    return false;
  }

  if (isConsultativeSalesGuidanceRequest(value)) {
    return false;
  }

  return humanHandoffRequestPatterns.some((pattern) => pattern.test(normalized));
}

export function isConsultativeSalesGuidanceRequest(value: string) {
  const normalized = normalizeHandoffSearch(value);

  if (!normalized) {
    return false;
  }

  return Boolean(
    experiencedGuidancePattern.test(normalized)
    && salesGuidanceSignalPattern.test(normalized)
    && !explicitHumanRolePattern.test(normalized)
    && !explicitTransferActionPattern.test(normalized),
  );
}

function normalizeHandoffSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
