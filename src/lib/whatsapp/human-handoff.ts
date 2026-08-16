const handoffIntentPrefix = String.raw`\b(?:quero|preciso|gostaria|prefiro|pode|poderia|consegue|tem como)\b`;
const directHandoffIntentPrefix = String.raw`\b(?:quero|preciso|gostaria|prefiro)\b`;
const handoffAction = String.raw`(?:chama|chamar|aciona|acionar|passa|passar|transfere|transferir|transfira|encaminha|encaminhar)`;
const strongHumanTarget = String.raw`(?:humano|atendente|vendedor|consultor|pessoa real|pessoa de verdade)`;
const supportTeamTarget = String.raw`(?:suporte|pessoal|equipe|time)`;
const personTarget = String.raw`(?:alguem(?!\s+virtual))`;
const handoffTarget = String.raw`(?:${strongHumanTarget}|${supportTeamTarget}|${personTarget})`;

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

  return humanHandoffRequestPatterns.some((pattern) => pattern.test(normalized));
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
