const protectedTokenPrefix = "__CONNECTYHUB_PROTECTED_TEXT_";

const portugueseSignalPattern = /\b(?:voce|você|voces|vocês|vc|vcs|nao|não|tambem|também|tbm|tb|pq|qnd|oq|cmg|dps|td|mto|qto|vdd|pra|manda|mande|mandar|envia|enviar|quero|preciso|produto|agente|atendimento|cliente|pagamento|pix|cartao|cartão|credito|crédito|debito|débito|codigo|código|endereco|endereço|numero|número|confirmacao|confirmação|proximo|próximo|opcao|opção|opcoes|opções|preco|preço|orcamento|orçamento|duvida|dúvida)\b/i;
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
  [/\bcartao\b/gi, "cartão"],
  [/\bcartoes\b/gi, "cartões"],
  [/\bcredito\b/gi, "crédito"],
  [/\bcreditos\b/gi, "créditos"],
  [/\bdebito\b/gi, "débito"],
  [/\bdebitos\b/gi, "débitos"],
  [/\bcodigo\b/gi, "código"],
  [/\bcodigos\b/gi, "códigos"],
  [/\bendereco\b/gi, "endereço"],
  [/\benderecos\b/gi, "endereços"],
  [/\breferencia\b/gi, "referência"],
  [/\breferencias\b/gi, "referências"],
  [/\bconfirmacao\b/gi, "confirmação"],
  [/\bintencao\b/gi, "intenção"],
  [/\bobjecao\b/gi, "objeção"],
  [/\bobjecoes\b/gi, "objeções"],
  [/\borcamento\b/gi, "orçamento"],
  [/\bmetodo\b/gi, "método"],
  [/\bmetodos\b/gi, "métodos"],
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

const brazilianCurrencyWithCodePattern = /(?<![\p{L}\p{N}/])(?:R\$\s*)?((?:\d{1,3}(?:\.\d{3})+|\d+)(?:[,.]\d{1,2})?)\s*BRL\b/giu;
const brazilianCurrencyDisplayPattern = /R\$\s*((?:\d{1,3}(?:\.\d{3})+|\d+)(?:[,.]\d{1,2})?)/giu;

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
  "Português: escreva você, vocês, também, não, já, só, até, aí, áudio, mídia, botão, botões, cartão, crédito, débito, código, endereço, número, opção, opções, preço, orçamento, página, informações, porque, quando, comigo, depois, tudo, muito, quanto e para. Nunca use voce, voces, vc, vcs, tb, tbm, pq, qnd, oq, cmg, dps, td, mto, qto ou pra.",
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

  return restoreOutboundFragments(normalizeBrazilianCurrencyDisplay(expanded), protectedValues)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function normalizeOutboundSpeechText(value: string) {
  return normalizeOutboundLanguageText(value)
    .replace(brazilianCurrencyDisplayPattern, (_match, amount: string) => (
      formatBrazilianCurrencyForSpeech(amount) ?? `R$ ${amount}`
    ));
}

function normalizeBrazilianCurrencyDisplay(value: string) {
  return value.replace(brazilianCurrencyWithCodePattern, (_match, amount: string) => {
    return `R$ ${normalizeBrazilianCurrencyAmount(amount)}`;
  });
}

function normalizeBrazilianCurrencyAmount(value: string) {
  const trimmed = value.trim();
  const decimalMatch = trimmed.match(/^(.+)[,.](\d{1,2})$/);

  if (!decimalMatch) {
    return trimmed;
  }

  const whole = decimalMatch[1].replace(/[^\d.]/g, "") || "0";
  const cents = decimalMatch[2].padEnd(2, "0").slice(0, 2);

  return `${whole},${cents}`;
}

function formatBrazilianCurrencyForSpeech(value: string) {
  const amount = parseBrazilianCurrency(value);

  if (!amount) {
    return null;
  }

  const realLabel = amount.reais === 1 ? "real" : "reais";
  const centLabel = amount.centavos === 1 ? "centavo" : "centavos";

  if (amount.centavos <= 0) {
    return `${amount.reais} ${realLabel}`;
  }

  if (amount.reais <= 0) {
    return `${amount.centavos} ${centLabel}`;
  }

  return `${amount.reais} ${realLabel} e ${amount.centavos} ${centLabel}`;
}

function parseBrazilianCurrency(value: string) {
  const normalized = normalizeBrazilianCurrencyAmount(value);
  const numeric = Number(normalized.replace(/\./g, "").replace(",", "."));

  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  const centsTotal = Math.round(numeric * 100);
  return {
    reais: Math.floor(centsTotal / 100),
    centavos: centsTotal % 100,
  };
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
