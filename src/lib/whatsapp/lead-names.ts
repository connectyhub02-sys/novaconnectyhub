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

    if (name && isLikelyPersonalLeadName(name)) {
      return name;
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
