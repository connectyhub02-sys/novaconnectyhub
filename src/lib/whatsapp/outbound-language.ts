const protectedTokenPrefix = "__CONNECTYHUB_PROTECTED_TEXT_";

const portugueseSignalPattern = /\b(?:voce|voces|vc|vcs|nao|tambem|tbm|tb|pq|qnd|oq|cmg|dps|td|mto|qto|vdd|pra|manda|mande|mandar|envia|enviar|quero|preciso|produto|agente|atendimento|cliente)\b/i;
const englishSignalPattern = /\b(?:u|ur|pls|plz|thx|idk|btw)\b/i;
const spanishSignalPattern = /\b(?:xq|tmb|dnd|q)\b/i;

const portugueseAbbreviationRules: Array<[RegExp, string]> = [
  [/\bvoces\b/gi, "vocês"],
  [/\bvoce\b/gi, "você"],
  [/\bnao\b/gi, "não"],
  [/\bja\b/gi, "já"],
  [/\bso\b/gi, "só"],
  [/\bate\b/gi, "até"],
  [/\bai\b/gi, "aí"],
  [/\btambem\b/gi, "também"],
  [/\baudio\b/gi, "áudio"],
  [/\bmidia\b/gi, "mídia"],
  [/\bbotao\b/gi, "botão"],
  [/\bbotoes\b/gi, "botões"],
  [/\bopcoes\b/gi, "opções"],
  [/\bopcao\b/gi, "opção"],
  [/\bpagina\b/gi, "página"],
  [/\bpaginas\b/gi, "páginas"],
  [/\binformacoes\b/gi, "informações"],
  [/\binformacao\b/gi, "informação"],
  [/\bdemonstracao\b/gi, "demonstração"],
  [/\bduvida\b/gi, "dúvida"],
  [/\bduvidas\b/gi, "dúvidas"],
  [/\bnumero\b/gi, "número"],
  [/\bnumeros\b/gi, "números"],
  [/\bpropria\b/gi, "própria"],
  [/\bproprio\b/gi, "próprio"],
  [/\busuario\b/gi, "usuário"],
  [/\busuarios\b/gi, "usuários"],
  [/\bcomecar\b/gi, "começar"],
  [/\bpreco\b/gi, "preço"],
  [/\bprecos\b/gi, "preços"],
  [/\bseguranca\b/gi, "segurança"],
  [/\btecnico\b/gi, "técnico"],
  [/\btecnica\b/gi, "técnica"],
  [/\bnivel\b/gi, "nível"],
  [/\bproximo\b/gi, "próximo"],
  [/\bproximos\b/gi, "próximos"],
  [/\bproxima\b/gi, "próxima"],
  [/\bvcs\b/gi, "vocês"],
  [/\bvc\b/gi, "você"],
  [/\btbm\b/gi, "também"],
  [/\btb\b/gi, "também"],
  [/\bpq\b/gi, "porque"],
  [/\bqnd\b/gi, "quando"],
  [/\boq\b/gi, "o que"],
  [/\bcmg\b/gi, "comigo"],
  [/\bdps\b/gi, "depois"],
  [/\btd\b/gi, "tudo"],
  [/\bmto\b/gi, "muito"],
  [/\bqto\b/gi, "quanto"],
  [/\bvdd\b/gi, "verdade"],
  [/\bpra\b/gi, "para"],
];

const englishAbbreviationRules: Array<[RegExp, string]> = [
  [/\bu\b/g, "you"],
  [/\bU\b/g, "you"],
  [/\bur\b/gi, "your"],
  [/\bpls\b/gi, "please"],
  [/\bplz\b/gi, "please"],
  [/\bthx\b/gi, "thanks"],
  [/\bidk\b/gi, "I don't know"],
  [/\bbtw\b/gi, "by the way"],
];

const spanishAbbreviationRules: Array<[RegExp, string]> = [
  [/\btambien\b/gi, "también"],
  [/\binformacion\b/gi, "información"],
  [/\bopcion\b/gi, "opción"],
  [/\benvio\b/gi, "envío"],
  [/\bxq\b/gi, "porque"],
  [/\btmb\b/gi, "también"],
  [/\bdnd\b/gi, "dónde"],
  [/\bq\b/gi, "que"],
];

export const outboundLanguageQualityPromptLines = [
  "ORTOGRAFIA E IDIOMA",
  "Responda no mesmo idioma principal do lead quando ele escrever em português, inglês ou espanhol.",
  "Use ortografia correta, acentos e pontuação natural do idioma escolhido. Texto e áudio devem sair prontos para o cliente, sem aparência de rascunho.",
  "Português: escreva você, vocês, também, não, já, só, até, aí, áudio, mídia, botão, botões, opção, opções, página, informações, porque, quando, comigo, depois, tudo, muito, quanto e para. Nunca use voce, voces, vc, vcs, tb, tbm, pq, qnd, oq, cmg, dps, td, mto, qto ou pra.",
  "English: use standard spelling such as you, your, please, thanks and I don't know. Never use u, ur, pls, plz, thx, idk or btw.",
  "Español: use escritura completa y tildes cuando correspondan, como tú, usted, ustedes, también, porque, cuándo, cómo, dónde, información y opción. Nunca use xq, q, tmb, dnd o abreviaturas de chat.",
  "Não simule erro de digitação, autocorreção, palavra sem acento ou abreviação para parecer humano. Naturalidade não pode sacrificar clareza.",
];

export function normalizeOutboundLanguageText(value: string) {
  if (!value.trim()) {
    return value;
  }

  const { text, protectedValues } = protectOutboundFragments(value);
  const languageRules = [
    ...(portugueseSignalPattern.test(text) ? portugueseAbbreviationRules : []),
    ...(englishSignalPattern.test(text) ? englishAbbreviationRules : []),
    ...(spanishSignalPattern.test(text) ? spanishAbbreviationRules : []),
  ];
  const expanded = languageRules.reduce((current, [pattern, replacement]) => (
    current.replace(pattern, (match) => matchCase(match, replacement))
  ), text);

  return restoreOutboundFragments(expanded, protectedValues)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function protectOutboundFragments(value: string) {
  const protectedValues: string[] = [];
  const text = value.replace(/https?:\/\/\S+|\{\{[^{}]+?\}\}/gi, (match) => {
    const token = `${protectedTokenPrefix}${protectedValues.length}__`;
    protectedValues.push(match);
    return token;
  });

  return { text, protectedValues };
}

function restoreOutboundFragments(value: string, protectedValues: string[]) {
  return value.replace(new RegExp(`${protectedTokenPrefix}(\\d+)__`, "g"), (_match, index) => {
    const protectedValue = protectedValues[Number(index)];
    return protectedValue ?? "";
  });
}

function matchCase(match: string, replacement: string) {
  if (/^[A-Z][a-z]+$/.test(match)) {
    return capitalize(replacement);
  }

  return replacement;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
