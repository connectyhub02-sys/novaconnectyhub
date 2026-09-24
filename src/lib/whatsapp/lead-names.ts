export type WhatsappLeadNameKind = "unknown" | "person" | "business";

type LeadNameInput = {
  displayName?: string | null;
  metadata?: Record<string, unknown> | null;
};

const businessNamePattern =
  /\b(imobiliaria|imoveis|construtora|empreendimentos|empresa|loja|store|shop|comercio|comercial|vendas|atendimento|suporte|sac|consultoria|marketing|agencia|digital|sistema|sistemas|tech|tecnologia|solucao|solucoes|solutions|grupo|holding|oficial|clinica|estetica|studio|academia|fitness|suplemento|suplementos|nutricao|restaurante|pizzaria|barbearia|salao|moda|boutique|advocacia|advogado|advogados|contabilidade|financeira|credito|seguro|agro|delivery|buffalo|mass|connectyhub|ltda|eireli|mei|cnpj|industria|distribuidora|representacoes)\b/;

// Conversation snippets must never become a person's identity or block later name capture.
const conversationNamePattern = /^(?:(?:oi|ola|bom dia|boa tarde|boa noite|tudo bem|sim|nao|obrigad[oa]|valeu|ok|certo|perfeito|pix)(?:\s|$)|(?:qual|quais|quanto|quantos|quanto custa|como|onde|quando|quero|queria|gostaria|preciso|pode|podemos|manda|envia|me manda|me envia|voce|voces|vcs|vcs tem|tem como|tem algum|tem estoque|tem desconto|qualquer duvida)(?:\s|$)|(?:o|e o|me passa o) (?:valor|preco|frete)(?:\s|$)|(?:aguardando|pode fechar|pode gerar)(?:\s|$))/;

export function normalizeLeadNameCandidate(value: unknown, maxLength = 80) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : null;
}

export function classifyWhatsappLeadDisplayName(value: unknown): WhatsappLeadNameKind {
  const name = normalizeLeadNameCandidate(value);

  if (!name) {
    return "unknown";
  }

  if (/^\+?\d[\d\s().-]{6,}$/.test(name) || /[@:/\\]/.test(name)) {
    return "unknown";
  }

  const normalized = normalizeSearchText(name);

  if (!normalized || normalized.length <= 1) {
    return "unknown";
  }

  if (/[?!]/.test(name) || conversationNamePattern.test(normalized)) {
    return "unknown";
  }

  if (businessNamePattern.test(normalized) || /(?:^|\s)s\.\s*a\.?$/i.test(name)) {
    return "business";
  }

  if (/\d/.test(normalized)) {
    return "business";
  }

  const words = normalized.split(" ").filter(Boolean);

  if (words.length > 5) {
    return "business";
  }

  return "person";
}

export function isLikelyPersonalLeadName(value: unknown) {
  return classifyWhatsappLeadDisplayName(value) === "person";
}

export function isBusinessLikeWhatsappName(value: unknown) {
  return classifyWhatsappLeadDisplayName(value) === "business";
}

export function resolveLeadPersonalName(input: LeadNameInput) {
  const metadata = readRecord(input.metadata);
  const memory = readRecord(metadata?.lead_memory);
  const qualification = readRecord(metadata?.qualification);
  const evidence = readRecord(metadata?.lead_name_evidence);
  const inferredName = normalizeLeadNameCandidate(memory?.personName ?? memory?.person_name);
  const unconfirmedMemory = memory?.source === "whatsapp_agent_memory"
    && memory?.name_source !== "existing_record"
    && !(evidence?.source === "lead_message" && typeof evidence.name === "string"
      && normalizeSearchText(evidence.name) === normalizeSearchText(inferredName ?? ""));
  const suspectName = normalizeLeadNameCandidate(metadata?.lead_name_needs_confirmation);
  const candidates = [
    metadata?.person_name,
    metadata?.personal_name,
    metadata?.contact_name,
    metadata?.nome,
    metadata?.name,
    metadata?.lead_name,
    memory?.personName,
    memory?.person_name,
    qualification?.person_name,
    qualification?.contact_name,
    input.displayName,
  ];

  for (const candidate of candidates) {
    const name = normalizeLeadNameCandidate(candidate);

    if (name && isLikelyPersonalLeadName(name)
      && !(suspectName && normalizeSearchText(name) === normalizeSearchText(suspectName))
      && !(unconfirmedMemory && inferredName && normalizeSearchText(name) === normalizeSearchText(inferredName))) {
      return name;
    }
  }

  return null;
}

type IdentityMessage = { id?: string; direction: string; text_content?: string | null };

// An answer to "como posso te chamar?" that reads as a sentence ("então preciso
// mudar", "quero comprar") is not a name. Particles such as "da"/"dos" are allowed.
const sentenceWords = /\b(?:ele|ela|voce|aqui|ai|la|quero|queria|gostaria|procuro|procurando|buscando|busco|preciso|precisa|precisamos|mudar|comprar|vender|alugar|investir|morar|anunciar|falando|corretor|dentista|sou|estou|to|tenho|temos|prefiro|informar|dizer|passar|nao|sim|depois|entao|agora|hoje|amanha|ainda|tambem|mas|porque|so|apenas|isso|esse|essa|este|esta|pode|podemos|vou|vamos|oi|ola|ok|obrigado|obrigada|tudo|bem|certo|claro|beleza|imovel|casa|apartamento|terreno|lote|valor|preco|produto|pedido|quanto|qual|quando|onde|como)\b/;

// Names mentioned by the assistant, quoted third parties and greetings are not self-identification.
export function findLeadNameEvidence(messages: IdentityMessage[]) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.direction !== "inbound") continue;
    const text = (message.text_content ?? "").trim();
    // Spoken openings ("Aí, meu nome é…", "É, me chamo…") may precede the declaration.
    const declaration = text.match(/^(?:(?:oi|ol[aá]|bom dia|boa tarde|boa noite|a[ií]|ent[aã]o|opa|ah|[eé]|bom|fala|beleza)[,! .]+){0,3}(?:meu nome(?: completo)?\s*(?:[ée]|eh|:)\s*|(?:eu )?me chamo\s+|pode me chamar de\s+)([\p{L}][\p{L} '’-]{1,79})(?=[,.;!\n]|$)/iu);
    let declared = declaration?.[1];
    // "Magno, Magno Macedo": a repeated first name followed by the fuller name.
    const fuller = declaration ? text.slice(declaration[0].length).match(/^,\s*([\p{L}][\p{L} '’-]{1,79})(?=[,.;!\n]|$)/u)?.[1] : null;
    if (declared && fuller && normalizeSearchText(fuller).split(" ")[0] === normalizeSearchText(declared).split(" ")[0]
      && fuller.trim().split(/\s+/).length > declared.trim().split(/\s+/).length) declared = fuller;
    // A single response can be split across several outbound bubbles. Never cross
    // another inbound reply: a name request answered or declined is no longer current.
    // An empty inbound (an audio not yet transcribed) is not a reply.
    const requestParts: string[] = [];
    for (let prior = index - 1; prior >= 0 && requestParts.length < 8; prior--) {
      if (messages[prior].direction === "inbound" && !(messages[prior].text_content ?? "").trim()) continue;
      if (messages[prior].direction !== "outbound") break;
      requestParts.unshift(messages[prior].text_content ?? "");
    }
    const request = normalizeSearchText(requestParts.join(" "));
    const askedName = /\b(?:qual (?:e )?(?:o )?seu nome|como (?:posso|podemos|voce prefere que eu) (?:te |lhe |o |a )?chamar|(?:me (?:diga|informe)|preciso d[eo]) (?:o )?seu nome)\b/.test(request)
      || /\bcom quem (?:eu )?(?:falo|estou falando|tenho o prazer de falar)\b/.test(request)
      || /\bpara liberar o pagamento\b.{0,40}\bfaltam?\s+(?:o |seu )?nome completo\b/.test(request);
    const candidate = normalizeLeadNameCandidate(declared ?? (askedName && /^[\p{L}][\p{L} '\u2019-]{1,79}[.!]?$/u.test(text) ? text.replace(/[.!]$/, "") : null));
    if (candidate && isLikelyPersonalLeadName(candidate) && !sentenceWords.test(normalizeSearchText(candidate))) {
      return { name: candidate, messageId: message.id ?? null };
    }
  }
  return null;
}

// Profile names are only a display fallback, never a confirmed billing identity.
export function resolveLeadDisplayName(input: LeadNameInput) {
  const personalName = resolveLeadPersonalName(input);
  if (personalName) return personalName;
  const metadata = readRecord(input.metadata);
  for (const candidate of [metadata?.whatsapp_display_name, metadata?.last_provider_display_name]) {
    if (classifyWhatsappLeadDisplayName(candidate) !== "unknown") return normalizeLeadNameCandidate(candidate);
  }
  return null;
}

export function resolveNonPersonalWhatsappDisplayName(input: LeadNameInput) {
  const metadata = readRecord(input.metadata);
  const candidates = [
    input.displayName,
    metadata?.whatsapp_display_name,
    metadata?.last_display_name,
  ];

  for (const candidate of candidates) {
    const name = normalizeLeadNameCandidate(candidate);

    if (name && !isLikelyPersonalLeadName(name)) {
      return name;
    }
  }

  return null;
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
